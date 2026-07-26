using ND.SharedKernel.Primitives;

namespace ND.DeviceSimulator.Domain.Entities;

/// <summary>
/// Live cross-device event timeline entry.
/// Stages: GATEWAY_PUBLISHED / MQTT_RECEIVED / PRINTER_EXECUTED / LASER_EXECUTED / VISION_VERIFIED / PLC_UPDATED
/// Table: timeline_events
/// </summary>
public sealed class TimelineEvent : Entity
{
    public string Stage { get; private set; } = default!;
    public string Status { get; private set; } = default!;  // OK / FAILED / INFO
    public string Detail { get; private set; } = default!;
    public string OccurredAt { get; private set; } = default!;

    private TimelineEvent() { }

    public static TimelineEvent Create(string stage, string status, string detail)
        => new()
        {
            Stage = stage,
            Status = status,
            Detail = detail,
            OccurredAt = DateTime.UtcNow.ToString("o")
        };
}
