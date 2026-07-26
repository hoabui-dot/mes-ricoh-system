using ND.SharedKernel.Primitives;

namespace ND.LaserAdapter.Domain.Entities;

public sealed class LaserEvent : Entity
{
    public string LaserId { get; private set; } = default!;
    public string EventType { get; private set; } = default!;
    public string? EventData { get; private set; }
    public string OccurredAt { get; private set; } = DateTime.UtcNow.ToString("o");

    private LaserEvent() { }

    public static LaserEvent Create(string laserId, string eventType, string? eventData = null)
        => new() { LaserId = laserId, EventType = eventType, EventData = eventData };
}
