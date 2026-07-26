using ND.SharedKernel.Primitives;

namespace ND.DeviceSimulator.Domain.Entities;

/// <summary>
/// Connection status snapshot for the dashboard connection panel.
/// Table: system_connections
/// </summary>
public sealed class SystemConnection : Entity
{
    public string ConnectionName { get; private set; } = default!; // MQTT / Redis / SQLite / Internet / FactoryGateway
    public string Status { get; private set; } = default!;          // GREEN / YELLOW / RED
    public string? Detail { get; private set; }
    public string CheckedAt { get; private set; } = DateTime.UtcNow.ToString("o");

    private SystemConnection() { }

    public static SystemConnection Create(string connectionName, string status, string? detail = null)
        => new() { ConnectionName = connectionName, Status = status, Detail = detail };
}
