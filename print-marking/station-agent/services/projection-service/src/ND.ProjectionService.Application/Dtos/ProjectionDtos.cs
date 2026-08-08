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

public record AlarmV2Dto(
    string AlarmId, string AlarmCode, string DedupeKey, string Severity, string Category,
    string State, string StationId, string SourceService, string SourceType, string SourceId,
    string? DeviceId, string? JobId, string? WorkOrderNo, string? ProductCode, string? ProductSerial,
    string TitleKey, string MessageKey, object MessageParams, string? TechnicalMessage,
    string? ProductionImpact, string FirstSeenAt, string LastSeenAt, int OccurrenceCount,
    string? AcknowledgedBy, string? AcknowledgedAt, string? AssignedTo, string? AssignedAt,
    string? ResolvedBy, string? ResolvedAt, string? ResolutionCode, string? ResolutionComment,
    string? SuppressedUntil, string? SuppressionReason, int EscalationLevel, string? EscalatedAt,
    string UpdatedAt, long RowVersion);

public record AlarmTimelineDto(string Id, string AlarmId, string ActionType, string? PreviousState,
    string NewState, string? ActorUserId, string ActorUsername, string ActorRole, string? Comment,
    object Metadata, string OccurredAt, string? CorrelationId);
