using ND.SharedKernel.Primitives;

namespace ND.PlcAdapter.Domain.Entities;

public sealed class PlcEvent : Entity
{
    public string PlcId { get; private set; } = default!;
    public string EventType { get; private set; } = default!;
    public string? EventData { get; private set; }
    public string OccurredAt { get; private set; } = DateTime.UtcNow.ToString("o");

    private PlcEvent() { }

    public static PlcEvent Create(string plcId, string eventType, string? eventData = null)
        => new() { PlcId = plcId, EventType = eventType, EventData = eventData };
}
