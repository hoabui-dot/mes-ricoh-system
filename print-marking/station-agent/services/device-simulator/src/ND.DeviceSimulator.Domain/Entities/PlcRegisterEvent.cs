using ND.SharedKernel.Primitives;

namespace ND.DeviceSimulator.Domain.Entities;

/// <summary>
/// Record of a PLC coil/register change (via Modbus TCP or API toggle).
/// Table: plc_register_events
/// </summary>
public sealed class PlcRegisterEvent : Entity
{
    public string RegisterName { get; private set; } = default!; // START_BUTTON / STOP_BUTTON / etc.
    public bool Value { get; private set; }
    public string Source { get; private set; } = default!;       // MODBUS / API / AUTO
    public string OccurredAt { get; private set; } = default!;

    private PlcRegisterEvent() { }

    public static PlcRegisterEvent Create(string registerName, bool value, string source)
        => new()
        {
            RegisterName = registerName,
            Value = value,
            Source = source,
            OccurredAt = DateTime.UtcNow.ToString("o")
        };
}
