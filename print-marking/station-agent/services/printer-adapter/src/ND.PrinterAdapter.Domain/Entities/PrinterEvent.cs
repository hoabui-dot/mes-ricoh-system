using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

/// <summary>
/// Event emitted by a printer device.
/// Table: printer_events
/// </summary>
public sealed class PrinterEvent : Entity
{
    public string PrinterId { get; private set; } = default!;
    public string EventType { get; private set; } = default!;
    public string? EventData { get; private set; }
    public string OccurredAt { get; private set; } = DateTime.UtcNow.ToString("o");

    private PrinterEvent() { }

    public static PrinterEvent Create(string printerId, string eventType, string? eventData = null)
    {
        return new PrinterEvent
        {
            PrinterId = printerId,
            EventType = eventType,
            EventData = eventData,
            OccurredAt = DateTime.UtcNow.ToString("o")
        };
    }
}
