using ND.SharedKernel.Primitives;

namespace ND.DeviceSimulator.Domain.Entities;

/// <summary>
/// Runtime-editable configuration values for the simulator.
/// Displayed and editable in the Environment panel of the dashboard.
/// Table: configuration_values
/// </summary>
public sealed class ConfigurationValue : AuditableEntity
{
    public string Key { get; private set; } = default!;
    public string Value { get; private set; } = default!;
    public string? Description { get; private set; }
    public bool IsEditable { get; private set; } = true;

    private ConfigurationValue() { }

    public static ConfigurationValue Create(string key, string value, string? description = null, bool isEditable = true)
        => new() { Key = key, Value = value, Description = description, IsEditable = isEditable };

    public void UpdateValue(string newValue)
    {
        Value = newValue;
        Touch();
    }
}
