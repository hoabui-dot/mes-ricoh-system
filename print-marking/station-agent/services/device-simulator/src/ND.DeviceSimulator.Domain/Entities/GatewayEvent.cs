using ND.SharedKernel.Primitives;

namespace ND.DeviceSimulator.Domain.Entities;

/// <summary>
/// Record of a Factory Gateway MQTT event (publish or receive).
/// Table: gateway_events
/// </summary>
public sealed class GatewayEvent : Entity
{
    public string Direction { get; private set; } = default!;   // PUBLISH / RECEIVE
    public string Topic { get; private set; } = default!;
    public string PayloadJson { get; private set; } = default!;
    public string OccurredAt { get; private set; } = default!;

    private GatewayEvent() { }

    public static GatewayEvent Create(string direction, string topic, string payloadJson)
        => new()
        {
            Direction = direction,
            Topic = topic,
            PayloadJson = payloadJson,
            OccurredAt = DateTime.UtcNow.ToString("o")
        };
}
