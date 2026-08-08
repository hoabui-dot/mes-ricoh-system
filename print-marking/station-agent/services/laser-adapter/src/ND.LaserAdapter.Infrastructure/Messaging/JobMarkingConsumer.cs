using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.LaserAdapter.Application.Interfaces;
using ND.LaserAdapter.Domain.Entities;
using ND.LaserAdapter.Infrastructure.Persistence;
using ND.SharedKernel.Abstractions;
using ND.UnifiedContracts.Events;

namespace ND.LaserAdapter.Infrastructure.Messaging;

/// <summary>
/// Background service that consumes <c>job.processing</c> events from RabbitMQ,
/// filters for jobs that require laser marking (MARK_ONLY, LASER_MARK, PRINT_AND_MARK, REWORK, FULL_PROCESS),
/// sends the laser mark command to the virtual/physical laser device,
/// and publishes a <see cref="LaserMarkedEvent"/> back to RabbitMQ.
///
/// Subscription:
///   Exchange:    station.events
///   Queue:       laser-adapter.job-events
///   Pattern:     job.processing
/// </summary>
public sealed class JobMarkingConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqConsumer _consumer;
    private readonly ILaserAdapter _laserAdapter;
    private readonly IRabbitMqPublisher _publisher;
    private readonly ILogger<JobMarkingConsumer> _logger;

    private const string Exchange = "station.events";
    private const string Queue = "laser-adapter.job-events";
    private const string Pattern = "command.laser.mark";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public JobMarkingConsumer(
        IServiceScopeFactory scopeFactory,
        IRabbitMqConsumer consumer,
        ILaserAdapter laserAdapter,
        IRabbitMqPublisher publisher,
        ILogger<JobMarkingConsumer> logger)
    {
        _scopeFactory = scopeFactory;
        _consumer = consumer;
        _laserAdapter = laserAdapter;
        _publisher = publisher;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Laser Adapter Job Marking consumer starting...");

        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: Queue,
            routingKeyPattern: Pattern,
            onMessage: (routingKey, json) => HandleMessageAsync(json, stoppingToken),
            cancellationToken: stoppingToken);

        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
    }

    private async Task HandleMessageAsync(string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Laser Adapter received job.processing event.");

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LaserDbContext>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        JobProcessingEvent? evt;
        try
        {
            evt = JsonSerializer.Deserialize<JobProcessingEvent>(payloadJson, JsonOptions);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialise JobProcessingEvent payload");
            throw; // Nack
        }

        if (evt is null)
        {
            _logger.LogWarning("Received null JobProcessingEvent — skipping");
            return;
        }

        // Filter: only handle jobs that include a laser marking step
        var requiresMarking = evt.JobType.Equals("MARK_ONLY", StringComparison.OrdinalIgnoreCase) ||
                              evt.JobType.Equals("LASER_MARK", StringComparison.OrdinalIgnoreCase) ||
                              evt.JobType.Equals("PRINT_AND_MARK", StringComparison.OrdinalIgnoreCase) ||
                              evt.JobType.Equals("REWORK", StringComparison.OrdinalIgnoreCase) ||
                              evt.JobType.Equals("FULL_PROCESS", StringComparison.OrdinalIgnoreCase);

        if (!requiresMarking)
        {
            _logger.LogInformation("Job {JobNo} of type {JobType} does not require laser marking — skipping",
                evt.JobNo, evt.JobType);
            return;
        }

        // Fetch registered laser
        var laser = await db.Lasers.FirstOrDefaultAsync(l => l.LaserCode == "laser-01", cancellationToken);
        if (laser is null)
        {
            _logger.LogError("Default laser (laser-01) not found in database — cannot mark");
            return;
        }

        // Build mark content
        var markContent = $"JobNo:{evt.JobNo};SKU:{evt.ProductCode};Serial:{evt.ProductSerial ?? "N/A"}";
        var templateName = "STANDARD_MARK";

        var laserJob = LaserJob.Create(evt.JobId, evt.EventId, laser.Id, templateName, markContent);
        await db.LaserJobs.AddAsync(laserJob, cancellationToken);
        laserJob.MarkSent();
        await unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Sending laser MARK command to {Endpoint} for Job {JobNo}...",
            laser.Endpoint, evt.JobNo);

        var (success, durationMs, error) = await _laserAdapter.MarkAsync(
            laser.Endpoint, templateName, markContent, cancellationToken);

        if (success)
        {
            laserJob.MarkSuccess();
            _logger.LogInformation("Laser marking succeeded for Job {JobNo} in {Duration}ms.", evt.JobNo, durationMs);
        }
        else
        {
            laserJob.MarkFailed(error ?? "Laser command failed");
            _logger.LogError("Laser marking failed for Job {JobNo}: {Error}", evt.JobNo, error);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        // Publish LaserMarkedEvent to RabbitMQ
        var markedEvent = new LaserMarkedEvent
        {
            EventId = $"evt-laser-marked-{Guid.NewGuid():N}",
            JobId = evt.JobId,
            JobNo = evt.JobNo,
            LaserCode = laser.LaserCode,
            Success = success,
            ErrorMessage = success ? null : error,
            DurationMs = durationMs,
            Timestamp = DateTimeOffset.UtcNow.ToString("o")
        };

        try
        {
            var eventJson = JsonSerializer.Serialize(markedEvent, JsonOptions);
            await _publisher.PublishAsync(Exchange, JobEventRoutingKeys.LaserMarked, eventJson, cancellationToken);
            _logger.LogInformation(
                "Published LaserMarkedEvent for Job {JobNo} (Success={Success})",
                evt.JobNo, success);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish LaserMarkedEvent for Job {JobNo}", evt.JobNo);
        }
    }
}
