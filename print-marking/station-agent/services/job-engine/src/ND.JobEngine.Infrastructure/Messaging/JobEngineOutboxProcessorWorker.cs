using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.JobEngine.Application.Interfaces;
using ND.SharedKernel.Abstractions;

namespace ND.JobEngine.Infrastructure.Messaging;

/// <summary>
/// Background worker that polls <c>job_engine_outbox_events</c> and publishes
/// each PENDING event to the RabbitMQ topic exchange <c>station.events</c>.
/// </summary>
public sealed class JobEngineOutboxProcessorWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqPublisher _rabbitMqPublisher;
    private readonly ILogger<JobEngineOutboxProcessorWorker> _logger;
    private readonly int _intervalSeconds;
    private readonly int _batchSize;

    private const string Exchange = "station.events";

    public JobEngineOutboxProcessorWorker(
        IServiceScopeFactory scopeFactory,
        IRabbitMqPublisher rabbitMqPublisher,
        IConfiguration configuration,
        ILogger<JobEngineOutboxProcessorWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _rabbitMqPublisher = rabbitMqPublisher;
        _logger = logger;

        _intervalSeconds = int.TryParse(configuration["JobEngine:OutboxIntervalSeconds"], out var valSec) ? valSec : 3;
        _batchSize = int.TryParse(configuration["JobEngine:OutboxBatchSize"], out var valBatch) ? valBatch : 10;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Job Engine Outbox processor started. Polling every {Interval}s → RabbitMQ exchange '{Exchange}'",
            _intervalSeconds, Exchange);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessBatchAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Unhandled error in Job Engine outbox processor batch. Will retry next cycle.");
            }

            await Task.Delay(
                TimeSpan.FromSeconds(_intervalSeconds),
                stoppingToken);
        }
    }

    private async Task ProcessBatchAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var outboxRepository = scope.ServiceProvider.GetRequiredService<IJobEngineOutboxRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var pending = await outboxRepository.GetPendingAsync(_batchSize, cancellationToken);

        if (pending.Count == 0)
            return;

        _logger.LogDebug("Job Engine outbox processor: processing {Count} pending event(s)", pending.Count);

        foreach (var outboxEvent in pending)
        {
            var routingKey = outboxEvent.RoutingKey;

            try
            {
                await _rabbitMqPublisher.PublishAsync(
                    exchange: Exchange,
                    routingKey: routingKey,
                    messageJson: outboxEvent.PayloadJson,
                    cancellationToken: cancellationToken);

                outboxEvent.MarkPublished();

                _logger.LogInformation(
                    "Job Engine outbox event published → exchange={Exchange} routingKey={RoutingKey} " +
                    "aggregateId={AggregateId}",
                    Exchange, routingKey, outboxEvent.AggregateId);
            }
            catch (Exception ex)
            {
                outboxEvent.MarkFailed();

                _logger.LogError(ex,
                    "Failed to publish Job Engine outbox event to RabbitMQ. " +
                    "routingKey={RoutingKey} retryCount={RetryCount} nextRetryAt={NextRetryAt}",
                    routingKey, outboxEvent.RetryCount, outboxEvent.NextRetryAt);
            }

            await outboxRepository.UpdateAsync(outboxEvent, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
