using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

public sealed class AlarmOutboxEvent : Entity
{
    public string EventId { get; private set; } = default!;
    public string AlarmId { get; private set; } = default!;
    public string EventType { get; private set; } = default!;
    public string PayloadJson { get; private set; } = default!;
    public string RoutingKey { get; private set; } = default!;
    public string Status { get; private set; } = "PENDING";
    public int RetryCount { get; private set; }
    public string? NextRetryAt { get; private set; }
    public string? PublishedAt { get; private set; }
    public string? LastError { get; private set; }

    private AlarmOutboxEvent() { }

    public static AlarmOutboxEvent Pending(string eventId, string alarmId, string eventType,
        string payloadJson, string routingKey, DateTime createdAt) => new()
    {
        Id = Guid.NewGuid().ToString("N"), EventId = eventId, AlarmId = alarmId,
        EventType = eventType, PayloadJson = payloadJson, RoutingKey = routingKey,
        CreatedAt = createdAt.ToUniversalTime().ToString("o")
    };

    public void MarkPublished(DateTime at)
    {
        Status = "PUBLISHED"; PublishedAt = at.ToUniversalTime().ToString("o");
        NextRetryAt = null; LastError = null;
    }

    public void MarkFailed(string error, DateTime nextRetryAt)
    {
        Status = "PENDING"; RetryCount++; LastError = error;
        NextRetryAt = nextRetryAt.ToUniversalTime().ToString("o");
    }
}
