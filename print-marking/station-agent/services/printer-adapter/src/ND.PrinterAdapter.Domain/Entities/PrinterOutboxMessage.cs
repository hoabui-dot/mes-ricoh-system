using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

public sealed class PrinterOutboxMessage : Entity
{
    public string EventType { get; private set; } = default!;
    public string AggregateId { get; private set; } = default!;
    public string Payload { get; private set; } = default!;
    public string Status { get; private set; } = "PENDING";
    public string? PublishedAt { get; private set; }

    private PrinterOutboxMessage() { }
    public static PrinterOutboxMessage Create(string eventType, string aggregateId, string payload) => new()
    { EventType = eventType, AggregateId = aggregateId, Payload = payload };
    public void MarkPublished() { Status = "PUBLISHED"; PublishedAt = DateTime.UtcNow.ToString("o"); }
}
