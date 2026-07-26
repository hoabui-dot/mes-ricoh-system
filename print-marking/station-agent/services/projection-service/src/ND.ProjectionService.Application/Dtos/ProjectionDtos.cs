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

