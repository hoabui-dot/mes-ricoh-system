namespace ND.JobEngine.Application.Dtos;

public record JobDto(
    string Id,
    string JobNo,
    string SourceSystem,
    string JobType,
    string CurrentStatus,
    string ProductCode,
    string? ProductSerial,
    int Priority,
    string CreatedAt,
    string? CompletedAt,
    string? ParentJobId = null,
    string? RootJobId = null,
    int RetrySequence = 0,
    string? ExecutionType = "OriginalProduction",
    string? TriggeredByUserId = null,
    string? ReasonCode = null,
    string? ReasonDescription = null,
    string PayloadJson = "{}"
);

public record JobAttemptDto(
    string Id,
    string JobId,
    int AttemptNo,
    string TriggerType,
    string? TriggeredByUserId,
    string ResultStatus,
    string StartedAt,
    string? FinishedAt,
    string? ErrorMessage,
    string? ParentAttemptId = null,
    int RetrySequence = 0,
    string? ReasonCode = null,
    string? ReasonDescription = null
);

public record JobStepDto(
    string Id,
    string AttemptId,
    string StepName,
    int StepOrder,
    string Status,
    string? StartedAt,
    string? FinishedAt,
    string? ErrorMessage,
    string? ResultJson,
    int ExecutionDurationMs = 0,
    int RetryCount = 0,
    string? PayloadJsonStep = null,
    string? AssignedDeviceId = null,
    string? ExecutionResult = null
);

public record JobHistoryDto(
    string Id,
    string JobId,
    string? AttemptId,
    string OldStatus,
    string NewStatus,
    string ActionName,
    string PerformedBy,
    string? Note,
    string CreatedAt
);

public record OverwriteRequestDto(
    string Id,
    string JobId,
    string OverwriteType,
    string Reason,
    string RequestedBy,
    string? ApprovedBy,
    string Status,
    string RequestedAt,
    string? ResolvedAt
);
