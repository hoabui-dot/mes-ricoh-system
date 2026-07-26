using ND.SharedKernel.Primitives;

namespace ND.PlcAdapter.Domain.Entities;

public sealed class PlcDevice : Entity
{
    public string PlcCode { get; private set; } = default!;
    public string DisplayName { get; private set; } = default!;
    public string Protocol { get; private set; } = "MODBUS_TCP"; // MODBUS_TCP / OPC_UA
    public string IpAddress { get; private set; } = default!;
    public int Port { get; private set; } = 502;
    public string Status { get; private set; } = "OFFLINE";
    public string? LastHeartbeatAt { get; private set; }

    private PlcDevice() { }

    public static PlcDevice Create(string plcCode, string displayName, string protocol, string ipAddress, int port)
        => new() { PlcCode = plcCode, DisplayName = displayName, Protocol = protocol, IpAddress = ipAddress, Port = port };

    public void SetOnline() { Status = "ONLINE"; LastHeartbeatAt = DateTime.UtcNow.ToString("o"); }
    public void SetOffline() => Status = "OFFLINE";
    public void SetError() => Status = "ERROR";
}
