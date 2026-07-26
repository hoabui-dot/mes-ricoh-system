using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

public sealed class DeviceStatusHistory : Entity
{
    public string DeviceId { get; private set; } = default!;
    public string LifecycleState { get; private set; } = default!;
    public bool IsOnline { get; private set; }
    public string Timestamp { get; private set; } = default!;

    private DeviceStatusHistory() { }

    public static DeviceStatusHistory Create(
        string deviceId,
        string lifecycleState,
        bool isOnline,
        string timestamp)
    {
        return new DeviceStatusHistory
        {
            Id = Guid.NewGuid().ToString("N"),
            DeviceId = deviceId,
            LifecycleState = lifecycleState,
            IsOnline = isOnline,
            Timestamp = timestamp
        };
    }
}
