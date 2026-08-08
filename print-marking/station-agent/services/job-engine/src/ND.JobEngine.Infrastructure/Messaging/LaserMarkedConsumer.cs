using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.JobEngine.Application.Commands;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Infrastructure.Messaging;

/// <summary>
/// Background service that consumes <c>LaserMarkedEvent</c> events from RabbitMQ
/// and dispatches a command to complete/fail the LASER_MARK step in the Job Engine.
///
/// Subscription:
///   Exchange:    station.events
///   Queue:       job-engine.laser-marked-events
///   Pattern:     laser.marked
/// </summary>
public sealed class LaserMarkedConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqConsumer _consumer;
    private readonly ILogger<LaserMarkedConsumer> _logger;

    private const string Exchange = "station.events";
    private const string Queue = "job-engine.laser-marked-events";
    private const string Pattern = "laser.marked";

    public LaserMarkedConsumer(
        IServiceScopeFactory scopeFactory,
        IRabbitMqConsumer consumer,
        ILogger<LaserMarkedConsumer> logger)
    {
        _scopeFactory = scopeFactory;
        _consumer = consumer;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Job Engine LaserMarked consumer starting. exchange={Exchange} queue={Queue} pattern={Pattern}",
            Exchange, Queue, Pattern);

        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: Queue,
            routingKeyPattern: Pattern,
            onMessage: (routingKey, json) => HandleMessageAsync(json, stoppingToken),
            cancellationToken: stoppingToken);

        // Keep alive until cancellation
        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
    }

    private async Task HandleMessageAsync(string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Job Engine received laser marked event. Processing...");

        using var scope = _scopeFactory.CreateScope();

        LaserMarkedEvent? markedEvent;
        try
        {
            markedEvent = JsonSerializer.Deserialize<LaserMarkedEvent>(payloadJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialise LaserMarkedEvent payload from RabbitMQ message");
            throw; // Nack — invalid JSON should not be requeued
        }

        if (markedEvent is null)
        {
            _logger.LogWarning("Received null LaserMarkedEvent from RabbitMQ — skipping");
            return;
        }

        var command = new CompleteJobStepCommand(
            JobId: markedEvent.JobId,
            StepName: "LASER_MARK",
            Success: markedEvent.Success,
            ErrorMessage: markedEvent.ErrorMessage);

        var handler = scope.ServiceProvider.GetRequiredService<CompleteJobStepHandler>();
        try
        {
            await handler.HandleAsync(command, cancellationToken);
            _logger.LogInformation(
                "Job {JobId} step LASER_MARK completion status handled successfully (Success={Success})",
                markedEvent.JobId, markedEvent.Success);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle LASER_MARK step completion for Job {JobId}", markedEvent.JobId);
            throw;
        }
    }
}
