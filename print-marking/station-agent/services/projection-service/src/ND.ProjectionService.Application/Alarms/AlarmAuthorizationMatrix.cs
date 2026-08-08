namespace ND.ProjectionService.Application.Alarms;

public static class AlarmAuthorizationMatrix
{
    private static readonly IReadOnlyDictionary<string, IReadOnlySet<string>> Permissions =
        new Dictionary<string, IReadOnlySet<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["OPERATOR"] = Set("ALARM_VIEW", "ALARM_ACKNOWLEDGE", "ALARM_ASSIGN",
                "ALARM_START_WORK", "ALARM_RETRY_DEVICE", "ALARM_RETRY_JOB"),
            ["SUPERVISOR"] = Set("ALARM_VIEW", "ALARM_ACKNOWLEDGE", "ALARM_ASSIGN",
                "ALARM_ASSIGN_OTHERS", "ALARM_START_WORK", "ALARM_RETRY_DEVICE", "ALARM_RETRY_JOB",
                "ALARM_CLEAR", "ALARM_CLOSE", "ALARM_SUPPRESS", "ALARM_ESCALATE", "ALARM_VISION_BYPASS"),
            ["MAINTENANCE"] = Set("ALARM_VIEW", "ALARM_ACKNOWLEDGE", "ALARM_ASSIGN",
                "ALARM_ASSIGN_OTHERS", "ALARM_START_WORK", "ALARM_RETRY_DEVICE", "ALARM_RETRY_JOB",
                "ALARM_CLEAR", "ALARM_CLOSE", "ALARM_SUPPRESS", "ALARM_ESCALATE"),
            ["SUPER_ADMIN"] = Set("*")
        };

    public static bool IsAllowed(string? role, string permission, IEnumerable<string>? directPermissions = null)
    {
        if (directPermissions?.Any(x => x is "SYSTEM_ADMIN" || x == permission) == true) return true;
        return role is not null && Permissions.TryGetValue(role, out var permissions) &&
            (permissions.Contains("*") || permissions.Contains(permission));
    }

    private static IReadOnlySet<string> Set(params string[] values) =>
        new HashSet<string>(values, StringComparer.Ordinal);
}
