using ND.SharedKernel.Primitives;

namespace ND.KioskUi.Domain.Entities;

public sealed class KioskPermission : Entity
{
    public string PermissionCode { get; private set; } = default!;
    public string Description { get; private set; } = default!;

    private KioskPermission() { }

    public static KioskPermission Create(string permissionCode, string description)
        => new() { PermissionCode = permissionCode, Description = description };
}

public static class PermissionCodes
{
    public const string JobView = "JOB_VIEW";
    public const string JobReprocess = "JOB_REPROCESS";
    public const string UserManage = "USER_MANAGE";
    public const string SystemAdmin = "SYSTEM_ADMIN";
    public const string AlarmView = "ALARM_VIEW";
    public const string AlarmAcknowledge = "ALARM_ACKNOWLEDGE";
    public const string AlarmAssign = "ALARM_ASSIGN";
    public const string AlarmAssignOthers = "ALARM_ASSIGN_OTHERS";
    public const string AlarmStartWork = "ALARM_START_WORK";
    public const string AlarmRetryDevice = "ALARM_RETRY_DEVICE";
    public const string AlarmRetryJob = "ALARM_RETRY_JOB";
    public const string AlarmClear = "ALARM_CLEAR";
    public const string AlarmClose = "ALARM_CLOSE";
    public const string AlarmSuppress = "ALARM_SUPPRESS";
    public const string AlarmEscalate = "ALARM_ESCALATE";
    public const string AlarmVisionBypass = "ALARM_VISION_BYPASS";
}
