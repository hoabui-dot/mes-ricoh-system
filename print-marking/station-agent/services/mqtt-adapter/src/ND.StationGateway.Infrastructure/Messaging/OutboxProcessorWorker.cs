using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ND.Infrastructure.Messaging;
using ND.StationGateway.Application.Interfaces;
using ND.StationGateway.Infrastructure.Options;
using ND.SharedKernel.Abstractions;

namespace ND.StationGateway.Infrastructure.Messaging;

/// <summary>
/// Background worker that polls <c>gateway_outbox_events</c> and publishes
/// each PENDING event to the RabbitMQ topic exchange.
///
/// Exchange:    station.events  (topic exchange, durable)
/// Routing key: mqtt.MqttMessage.MqttMessageReceived
///              (kept for backward-compat — Job Engine consumers still receive events)
/// </summary>
public sealed class OutboxProcessorWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqPublisher _rabbitMqPublisher;
    private readonly GatewayOptions _options;
    private readonly ILogger<OutboxProcessorWorker> _logger;

    private const string Exchange = "station.events";

    public OutboxProcessorWorker(
        IServiceScopeFactory scopeFactory,
        IRabbitMqPublisher rabbitMqPublisher,
        IOptions<GatewayOptions> options,
        ILogger<OutboxProcessorWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _rabbitMqPublisher = rabbitMqPublisher;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Outbox processor started. Polling every {Interval}s → RabbitMQ exchange '{Exchange}'",
            _options.OutboxIntervalSeconds, Exchange);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessBatchAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Unhandled error in outbox processor batch. Will retry next cycle.");
            }

            await Task.Delay(TimeSpan.FromSeconds(_options.OutboxIntervalSeconds), stoppingToken);
        }
    }

    private async Task ProcessBatchAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var outboxRepository = scope.ServiceProvider.GetRequiredService<IGatewayOutboxRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var pending = await outboxRepository.GetPendingAsync(_options.OutboxBatchSize, cancellationToken);

        if (pending.Count == 0) return;

        _logger.LogDebug("Outbox processor: processing {Count} pending event(s)", pending.Count);

        foreach (var outboxEvent in pending)
        {
            // Use RoutingKeyHint set by the handler (backward-compat with Job Engine)
            var routingKey = outboxEvent.RoutingKeyHint;

            try
            {
                await _rabbitMqPublisher.PublishAsync(
                    exchange: Exchange,
                    routingKey: routingKey,
                    messageJson: outboxEvent.PayloadJson,
                    cancellationToken: cancellationToken);

                outboxEvent.MarkPublished();

                _logger.LogInformation(
                    "Outbox event published → exchange={Exchange} routingKey={RoutingKey} aggregateId={AggregateId}",
                    Exchange, routingKey, outboxEvent.AggregateId);
            }
            catch (Exception ex)
            {
                outboxEvent.MarkFailed();
                _logger.LogError(ex,
                    "Failed to publish outbox event to RabbitMQ. routingKey={RoutingKey} retryCount={RetryCount}",
                    routingKey, outboxEvent.RetryCount);
            }

            await outboxRepository.UpdateAsync(outboxEvent, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
