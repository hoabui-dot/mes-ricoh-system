using ND.SharedKernel.Primitives;

namespace ND.JobEngine.Domain.Entities;

/// <summary>
/// Outbox pattern entity for Job Engine domain events.
/// Events written here are picked up by <c>JobEngineOutboxProcessorWorker</c>
/// and published to RabbitMQ exchange <c>station.events</c>.
///
/// Table: job_engine_outbox_events
/// </summary>
public sealed class JobEngineOutboxEvent : Entity
{
    public string AggregateType { get; private set; } = default!;
    public string AggregateId { get; private set; } = default!;
    public string EventType { get; private set; } = default!;
    public string RoutingKey { get; private set; } = default!;
    public string PayloadJson { get; private set; } = default!;
    public string Status { get; private set; } = "PENDING";   // PENDING / PUBLISHED / FAILED
    public int RetryCount { get; private set; } = 0;
    public string? NextRetryAt { get; private set; }
    public string? PublishedAt { get; private set; }

    private JobEngineOutboxEvent() { }

    public static JobEngineOutboxEvent Create(
        string aggregateType,
        string aggregateId,
        string eventType,
        string routingKey,
        string payloadJson)
    {
        return new JobEngineOutboxEvent
        {
            AggregateType = aggregateType,
            AggregateId = aggregateId,
            EventType = eventType,
            RoutingKey = routingKey,
            PayloadJson = payloadJson
        };
    }

    public void MarkPublished()
    {
        Status = "PUBLISHED";
        PublishedAt = DateTime.UtcNow.ToString("o");
    }

    public void MarkFailed(int maxRetryDelaySec = 30)
    {
        RetryCount++;
        Status = RetryCount >= 5 ? "FAILED" : "PENDING";
        var delaySeconds = Math.Min(maxRetryDelaySec * RetryCount, 300);
        NextRetryAt = DateTime.UtcNow.AddSeconds(delaySeconds).ToString("o");
    }
}
