namespace ND.UnifiedContracts.Events;

public sealed record DeviceStatusHeartbeat(
    string DeviceId,
    string DeviceType,
    bool IsOnline,
    string LifecycleState,
    string Timestamp,
    string? SerialNumber = null,
    long? LifetimePrintCounter = null,
    double? ThermalTemp = null,
    string? ConnectionDetails = null
);
