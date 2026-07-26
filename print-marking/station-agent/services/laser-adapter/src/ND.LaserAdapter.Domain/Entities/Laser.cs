using ND.SharedKernel.Primitives;

namespace ND.LaserAdapter.Domain.Entities;

public sealed class Laser : Entity
{
    public string LaserCode { get; private set; } = default!;
    public string DisplayName { get; private set; } = default!;
    public string ConnectionType { get; private set; } = "TCP";  // SDK / TCP / REST
    public string Endpoint { get; private set; } = default!;
    public string Vendor { get; private set; } = default!;
    public string Status { get; private set; } = "OFFLINE";
    public string? LastHeartbeatAt { get; private set; }

    private Laser() { }

    public static Laser Create(string laserCode, string displayName, string connectionType, string endpoint, string vendor)
    {
        return new Laser { LaserCode = laserCode, DisplayName = displayName, ConnectionType = connectionType, Endpoint = endpoint, Vendor = vendor };
    }

    public void SetOnline() { Status = "ONLINE"; LastHeartbeatAt = DateTime.UtcNow.ToString("o"); }
    public void SetOffline() => Status = "OFFLINE";
    public void SetError() => Status = "ERROR";
}
