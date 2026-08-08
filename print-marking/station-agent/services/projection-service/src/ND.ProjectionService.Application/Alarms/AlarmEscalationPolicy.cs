using ND.ProjectionService.Domain.Alarms;
using ND.ProjectionService.Domain.Entities;

namespace ND.ProjectionService.Application.Alarms;

public static class AlarmEscalationPolicy
{
    public static int RequiredLevel(Alarm alarm, DateTime now)
    {
        if (!AlarmState.IsActive(alarm.State) || alarm.State == AlarmState.Suppressed ||
            !DateTime.TryParse(alarm.FirstSeenAt, out var firstSeen)) return 0;
        var age = now.ToUniversalTime() - firstSeen.ToUniversalTime();
        if (alarm.Severity == AlarmSeverity.Critical && age >= TimeSpan.FromMinutes(10)) return 2;
        if (alarm.Severity == AlarmSeverity.Critical && alarm.State == AlarmState.Raised && age >= TimeSpan.FromMinutes(2)) return 1;
        if (alarm.Severity == AlarmSeverity.High && age >= TimeSpan.FromMinutes(30)) return 1;
        return 0;
    }
}
