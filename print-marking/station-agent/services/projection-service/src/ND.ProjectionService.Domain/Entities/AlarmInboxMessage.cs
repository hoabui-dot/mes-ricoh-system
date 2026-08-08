using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

public sealed class AlarmInboxMessage : Entity
{
    public string ConsumerName { get; private set; } = default!;
    public string EventId { get; private set; } = default!;
    public string ProcessedAt { get; private set; } = default!;
    public string? CorrelationId { get; private set; }

    private AlarmInboxMessage() { }

    public static AlarmInboxMessage Create(string consumerName, string eventId, DateTime processedAt,
        string? correlationId = null) => new()
    {
        Id = Guid.NewGuid().ToString("N"), ConsumerName = consumerName, EventId = eventId,
        ProcessedAt = processedAt.ToUniversalTime().ToString("o"), CorrelationId = correlationId,
        CreatedAt = processedAt.ToUniversalTime().ToString("o")
    };
}
