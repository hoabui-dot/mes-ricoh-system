using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

public sealed class DeviceStatus : Entity
{
    public string DeviceId { get; private set; } = default!;
    public string DeviceType { get; private set; } = default!;
    public bool IsOnline { get; private set; }
    public string LastSeenAt { get; private set; } = default!;
    public string LifecycleState { get; private set; } = "Offline";
    public string? SerialNumber { get; private set; }
    public long? LifetimePrintCounter { get; private set; }
    public double? ThermalTemp { get; private set; }
    public string? ConnectionDetails { get; private set; }

    private DeviceStatus() { }

    public static DeviceStatus Create(
        string deviceId,
        string deviceType,
        bool isOnline,
        string lastSeenAt,
        string lifecycleState = "Offline",
        string? serialNumber = null,
        long? lifetimePrintCounter = null,
        double? thermalTemp = null,
        string? connectionDetails = null)
    {
        return new DeviceStatus
        {
            Id = deviceId,
            DeviceId = deviceId,
            DeviceType = deviceType,
            IsOnline = isOnline,
            LastSeenAt = lastSeenAt,
            LifecycleState = lifecycleState,
            SerialNumber = serialNumber,
            LifetimePrintCounter = lifetimePrintCounter,
            ThermalTemp = thermalTemp,
            ConnectionDetails = connectionDetails
        };
    }

    public void UpdateStatus(
        bool isOnline,
        string lastSeenAt,
        string lifecycleState,
        string? serialNumber = null,
        long? lifetimePrintCounter = null,
        double? thermalTemp = null,
        string? connectionDetails = null)
    {
        IsOnline = isOnline;
        LastSeenAt = lastSeenAt;
        LifecycleState = lifecycleState;
        if (serialNumber != null) SerialNumber = serialNumber;
        if (lifetimePrintCounter != null) LifetimePrintCounter = lifetimePrintCounter;
        if (thermalTemp != null) ThermalTemp = thermalTemp;
        if (connectionDetails != null) ConnectionDetails = connectionDetails;
    }
}
