namespace ND.ProjectionService.Application.Dtos;

public record ProductionViewDto(
    string StationId,
    string JobId,
    string WorkOrderNo,
    string ProductCode,
    string? ProductSerial,
    string JobStatus,
    string UpdatedAt);

public record ActivityLogDto(
    string Id,
    string EventType,
    string JobId,
    string JobNo,
    string ProductCode,
    string Status,
    string Message,
    string OccurredAt);

public record DeviceStatusDto(
    string DeviceId,
    string DeviceType,
    bool IsOnline,
    string LastSeenAt,
    string LifecycleState = "Offline");

public record ProductionRecordDto(
    string Id,
    string JobId,
    string JobNo,
    string ProductCode,
    string? ProductSerial,
    string JobType,
    string CurrentStatus,
    string StationId,
    string CreatedAt,
    string UpdatedAt);

public record PrintDashboardDto(
    string StationId,
    string WorkOrderId,
    string WorkOrderCode,
    string WorkOrderStatus,
    string ProductCode,
    string? ProductName,
    string? OperationCode,
    string? OperationName,
    string? WorkstationCode,
    string? PrintStationCode,
    string? PrinterCode,
    decimal RequestedQuantity,
    decimal RequiredLabelQuantity,
    decimal TotalLabelCount,
    decimal QueuedLabelCount,
    decimal PrintedLabelCount,
    decimal FailedLabelCount,
    decimal RemainingLabelCount,
    string? PrintJobId,
    string PrintJobStatus,
    int BatchSize,
    int TotalBatches,
    int CompletedBatches,
    string? LastKafkaEventId,
    string? LastKafkaEventType,
    string? LastKafkaEventAt,
    string? LastPrinterResultAt,
    string UpdatedAt);

public record PagedResult<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Page,
    int PageSize)
{
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
}
public record AlarmDto(
    string Id,
    string AlarmType,
    string AlarmGroupKey,
    string Severity,
    string Source,
    string Message,
    string? DeviceId,
    string? DeviceName,
    string? ProductionOrderId,
    bool IsAcknowledged,
    string CurrentState,
    string? AcknowledgedBy,
    string? AcknowledgedAt,
    string FirstOccurredAt,
    string LastOccurredAt,
    int RepeatCount,
    string? ResolvedAt,
    string CreatedAt);

public record PagedAlarmResult(
    IReadOnlyList<AlarmDto> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages,
    int ActiveCount);
