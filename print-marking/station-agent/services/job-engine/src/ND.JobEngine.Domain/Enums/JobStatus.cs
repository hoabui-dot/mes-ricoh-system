namespace ND.JobEngine.Domain.Enums;

public static class JobStatus
{
    public const string Created = "CREATED";
    public const string Queued = "QUEUED";
    public const string Waiting = "WAITING";
    public const string Preparing = "PREPARING";
    public const string Processing = "PROCESSING";
    public const string WaitRework = "WAIT_REWORK";
    public const string Completed = "COMPLETED";
    public const string Failed = "FAILED";
    public const string Cancelled = "CANCELLED";
}

public static class AttemptStatus
{
    public const string Success = "COMPLETED";  // Normalized: aligns with JobStatus.Completed / StepStatus.Completed
    public const string Failed = "FAILED";
    public const string Cancelled = "CANCELLED";
}

public static class StepStatus
{
    public const string Pending = "PENDING";
    public const string Running = "RUNNING";
    public const string Completed = "COMPLETED";
    public const string Failed = "FAILED";
    public const string Skipped = "SKIPPED";
}

public static class OverwriteStatus
{
    public const string Pending = "PENDING";
    public const string Approved = "APPROVED";
    public const string Rejected = "REJECTED";
}

public static class TriggerType
{
    public const string Auto = "AUTO";
    public const string ManualRetry = "MANUAL_RETRY";
    public const string Overwrite = "OVERWRITE";
}

public static class OverwriteType
{
    public const string ForcePass = "FORCE_PASS";
    public const string Reprint = "REPRINT";
    public const string Relaser = "RELASER";
    public const string ForceComplete = "FORCE_COMPLETE";
}
