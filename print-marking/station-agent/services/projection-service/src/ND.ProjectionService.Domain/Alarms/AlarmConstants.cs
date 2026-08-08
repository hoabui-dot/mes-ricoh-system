namespace ND.ProjectionService.Domain.Alarms;

public static class AlarmSeverity
{
    public const string Critical = "CRITICAL";
    public const string High = "HIGH";
    public const string Medium = "MEDIUM";
    public const string Low = "LOW";
    public const string Info = "INFO";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
        { Critical, High, Medium, Low, Info };
}

public static class AlarmCategory
{
    public const string Device = "DEVICE";
    public const string Job = "JOB";
    public const string Quality = "QUALITY";
    public const string Network = "NETWORK";
    public const string System = "SYSTEM";
    public const string Security = "SECURITY";
    public const string Maintenance = "MAINTENANCE";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
        { Device, Job, Quality, Network, System, Security, Maintenance };
}

public static class AlarmState
{
    public const string Raised = "RAISED";
    public const string Acknowledged = "ACKNOWLEDGED";
    public const string InProgress = "IN_PROGRESS";
    public const string Cleared = "CLEARED";
    public const string Closed = "CLOSED";
    public const string Suppressed = "SUPPRESSED";

    public static bool IsActive(string state) => state is Raised or Acknowledged or InProgress or Suppressed;
}

public static class AlarmResolution
{
    public const string AutoRecovered = "AUTO_RECOVERED";
    public const string DeviceReconnected = "DEVICE_RECONNECTED";
    public const string MediaReplaced = "MEDIA_REPLACED";
    public const string JobRetried = "JOB_RETRIED";
    public const string ConfigurationFixed = "CONFIGURATION_FIXED";
    public const string ManualReset = "MANUAL_RESET";
    public const string FalsePositive = "FALSE_POSITIVE";
    public const string MaintenanceCompleted = "MAINTENANCE_COMPLETED";
    public const string BypassedBySupervisor = "BYPASSED_BY_SUPERVISOR";
    public const string Other = "OTHER";
}

public static class AlarmAction
{
    public const string Raised = "ALARM_RAISED";
    public const string Repeated = "ALARM_REPEATED";
    public const string Acknowledged = "ALARM_ACKNOWLEDGED";
    public const string Assigned = "ALARM_ASSIGNED";
    public const string WorkStarted = "ALARM_WORK_STARTED";
    public const string Cleared = "ALARM_CLEARED";
    public const string Closed = "ALARM_CLOSED";
    public const string Suppressed = "ALARM_SUPPRESSED";
    public const string Unsuppressed = "ALARM_UNSUPPRESSED";
    public const string DeviceRetryRequested = "ALARM_DEVICE_RETRY_REQUESTED";
    public const string JobRetryRequested = "ALARM_JOB_RETRY_REQUESTED";
    public const string Escalated = "ALARM_ESCALATED";
    public const string VisionBypassRequested = "ALARM_VISION_BYPASS_REQUESTED";
}
