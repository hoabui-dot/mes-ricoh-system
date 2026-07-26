using ND.SharedKernel.Primitives;

namespace ND.VisionService.Domain.Entities;

public sealed class Camera : Entity
{
    public string CameraCode { get; private set; } = default!;
    public string DisplayName { get; private set; } = default!;
    public string ConnectionType { get; private set; } = "USB"; // USB / GigE / RTSP
    public string? Endpoint { get; private set; }
    public string Status { get; private set; } = "OFFLINE";
    public string? LastHeartbeatAt { get; private set; }

    private Camera() { }

    public static Camera Create(string cameraCode, string displayName, string connectionType, string? endpoint = null)
        => new() { CameraCode = cameraCode, DisplayName = displayName, ConnectionType = connectionType, Endpoint = endpoint };

    public void SetOnline() { Status = "ONLINE"; LastHeartbeatAt = DateTime.UtcNow.ToString("o"); }
    public void SetOffline() => Status = "OFFLINE";
    public void SetError() => Status = "ERROR";
}
