using FluentAssertions;
using ND.ProjectionService.Domain.Alarms;
using ND.ProjectionService.Domain.Entities;
using ND.ProjectionService.Application.Alarms;
using Xunit;

namespace ND.ProjectionService.Tests;

public sealed class AlarmDomainTests
{
    private static readonly DateTime Start = new(2026, 8, 5, 1, 0, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(AlarmState.Raised, AlarmState.Acknowledged)]
    [InlineData(AlarmState.Raised, AlarmState.InProgress)]
    [InlineData(AlarmState.Raised, AlarmState.Cleared)]
    [InlineData(AlarmState.Raised, AlarmState.Suppressed)]
    [InlineData(AlarmState.Acknowledged, AlarmState.InProgress)]
    [InlineData(AlarmState.Acknowledged, AlarmState.Cleared)]
    [InlineData(AlarmState.Acknowledged, AlarmState.Suppressed)]
    [InlineData(AlarmState.InProgress, AlarmState.Cleared)]
    [InlineData(AlarmState.InProgress, AlarmState.Suppressed)]
    [InlineData(AlarmState.Suppressed, AlarmState.Raised)]
    [InlineData(AlarmState.Suppressed, AlarmState.Cleared)]
    [InlineData(AlarmState.Cleared, AlarmState.Closed)]
    [InlineData(AlarmState.Cleared, AlarmState.Raised)]
    public void Allows_required_lifecycle_transitions(string from, string to)
    {
        var alarm = AtState(from);

        Apply(alarm, to);

        alarm.State.Should().Be(to);
    }

    [Theory]
    [InlineData(AlarmState.Closed, AlarmState.Acknowledged)]
    [InlineData(AlarmState.Closed, AlarmState.InProgress)]
    [InlineData(AlarmState.Raised, AlarmState.Closed)]
    public void Rejects_forbidden_lifecycle_transitions(string from, string to)
    {
        var alarm = AtState(from);

        var act = () => Apply(alarm, to);

        act.Should().Throw<AlarmLifecycleException>();
    }

    [Fact]
    public void Repeat_preserves_first_seen_and_increments_occurrence()
    {
        var alarm = NewAlarm();
        var first = alarm.FirstSeenAt;

        alarm.Repeat(Start.AddMinutes(1), "latest");

        alarm.FirstSeenAt.Should().Be(first);
        alarm.LastSeenAt.Should().Be(Start.AddMinutes(1).ToString("o"));
        alarm.OccurrenceCount.Should().Be(2);
        alarm.TechnicalMessage.Should().Be("latest");
    }

    [Fact]
    public void Suppression_requires_reason_and_future_expiration()
    {
        var alarm = NewAlarm();
        ((Action)(() => alarm.Suppress("", Start.AddHours(1), Start))).Should().Throw<AlarmLifecycleException>();
        ((Action)(() => alarm.Suppress("maintenance", Start, Start))).Should().Throw<AlarmLifecycleException>();
    }

    [Fact]
    public void Severity_only_escalates()
    {
        var alarm = NewAlarm(AlarmSeverity.Medium);
        alarm.EscalateSeverity(AlarmSeverity.Critical, Start).Should().BeTrue();
        alarm.EscalateSeverity(AlarmSeverity.Low, Start).Should().BeFalse();
        alarm.Severity.Should().Be(AlarmSeverity.Critical);
    }

    [Fact]
    public void Critical_alarm_cannot_be_suppressed()
    {
        var alarm = NewAlarm(AlarmSeverity.Critical);
        var act = () => alarm.Suppress("maintenance", Start.AddHours(1), Start);
        act.Should().Throw<AlarmLifecycleException>();
    }

    [Theory]
    [InlineData(AlarmSeverity.Critical, 1, 0)]
    [InlineData(AlarmSeverity.Critical, 2, 1)]
    [InlineData(AlarmSeverity.Critical, 10, 2)]
    [InlineData(AlarmSeverity.High, 29, 0)]
    [InlineData(AlarmSeverity.High, 30, 1)]
    public void Escalation_thresholds_are_deterministic(string severity, int ageMinutes, int expected)
    {
        var alarm = NewAlarm(severity);
        AlarmEscalationPolicy.RequiredLevel(alarm, Start.AddMinutes(ageMinutes)).Should().Be(expected);
    }

    [Theory]
    [InlineData("OPERATOR", "ALARM_ACKNOWLEDGE", true)]
    [InlineData("OPERATOR", "ALARM_CLEAR", false)]
    [InlineData("OPERATOR", "ALARM_ASSIGN_OTHERS", false)]
    [InlineData("SUPERVISOR", "ALARM_CLEAR", true)]
    [InlineData("SUPERVISOR", "ALARM_VISION_BYPASS", true)]
    [InlineData("MAINTENANCE", "ALARM_SUPPRESS", true)]
    [InlineData("MAINTENANCE", "ALARM_VISION_BYPASS", false)]
    [InlineData("SUPER_ADMIN", "ALARM_VISION_BYPASS", true)]
    [InlineData("MEMBER", "ALARM_VIEW", false)]
    public void Backend_role_matrix_is_enforced(string role, string permission, bool expected)
    {
        AlarmAuthorizationMatrix.IsAllowed(role, permission).Should().Be(expected);
    }

    private static Alarm NewAlarm(string severity = AlarmSeverity.High) => Alarm.Raise(
        "PRINTER_OFFLINE", "STATION-01:printer-01:PRINTER_OFFLINE", severity, AlarmCategory.Device,
        "STATION-01", "printer-adapter", "PRINTER", "printer-01", "alarm.printer.offline.title",
        "alarm.printer.offline.message", "{}", Start, deviceId: "printer-01", id: "alarm-test");

    private static Alarm AtState(string state)
    {
        var alarm = NewAlarm();
        if (state == AlarmState.Raised) return alarm;
        if (state == AlarmState.Acknowledged) { alarm.Acknowledge("operator", Start); return alarm; }
        if (state == AlarmState.InProgress) { alarm.StartWork("operator", Start); return alarm; }
        if (state == AlarmState.Suppressed) { alarm.Suppress("maintenance", Start.AddDays(1), Start); return alarm; }
        alarm.Clear("operator", AlarmResolution.ManualReset, "fixed", Start);
        if (state == AlarmState.Closed) alarm.Close("operator", Start);
        return alarm;
    }

    private static void Apply(Alarm alarm, string target)
    {
        switch (target)
        {
            case AlarmState.Acknowledged: alarm.Acknowledge("operator", Start); break;
            case AlarmState.InProgress: alarm.StartWork("operator", Start); break;
            case AlarmState.Cleared: alarm.Clear("operator", AlarmResolution.ManualReset, "fixed", Start); break;
            case AlarmState.Closed: alarm.Close("operator", Start); break;
            case AlarmState.Suppressed: alarm.Suppress("maintenance", Start.AddDays(1), Start); break;
            case AlarmState.Raised when alarm.State == AlarmState.Suppressed: alarm.Unsuppress(Start); break;
            case AlarmState.Raised: alarm.Reopen(Start); break;
            default: throw new InvalidOperationException(target);
        }
    }
}
