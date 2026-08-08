using ND.SharedKernel.Primitives;

namespace ND.StationGateway.Domain.Entities;

/// <summary>
/// Outbox event queued for async publishing to RabbitMQ.
/// The OutboxProcessorWorker polls this table and publishes to station.events exchange.
/// Routing key: gateway.{AggregateType}.{EventType}
/// </summary>
public sealed class GatewayOutboxEvent : AuditableEntity
{
    public string AggregateType { get; private set; } = default!;
    public string AggregateId { get; private set; } = default!;
    public string EventType { get; private set; } = default!;
    public string PayloadJson { get; private set; } = default!;
    public string RoutingKeyHint { get; private set; } = default!;  // e.g. "mqtt.MqttMessage.MqttMessageReceived" for backward compat
    public string Status { get; private set; } = default!;          // PENDING, PUBLISHED, FAILED
    public int RetryCount { get; private set; }
    public string? NextRetryAt { get; private set; }
    public string? PublishedAt { get; private set; }

    private GatewayOutboxEvent() { }

    public static GatewayOutboxEvent Create(
        string aggregateType,
        string aggregateId,
        string eventType,
        string payloadJson,
        string routingKeyHint)
    {
        return new GatewayOutboxEvent
        {
            AggregateType = aggregateType,
            AggregateId = aggregateId,
            EventType = eventType,
            PayloadJson = payloadJson,
            RoutingKeyHint = routingKeyHint,
            Status = "PENDING",
            RetryCount = 0
        };
    }

    public void MarkPublished()
    {
        Status = "PUBLISHED";
        PublishedAt = DateTimeOffset.UtcNow.ToString("o");
        Touch();
    }

    public void MarkFailed()
    {
        Status = RetryCount < 3 ? "PENDING" : "FAILED";
        RetryCount++;
        NextRetryAt = DateTimeOffset.UtcNow.AddSeconds(RetryCount * 5).ToString("o");
        Touch();
    }
}
