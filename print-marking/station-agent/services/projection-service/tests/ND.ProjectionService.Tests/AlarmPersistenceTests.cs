using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using ND.ProjectionService.Application.Alarms;
using ND.ProjectionService.Domain.Alarms;
using ND.ProjectionService.Infrastructure.Persistence;
using ND.ProjectionService.Infrastructure.Repositories;
using ND.Testing.Fixtures;
using Xunit;
using ND.Infrastructure.SQLite;

namespace ND.ProjectionService.Tests;

public sealed class AlarmPersistenceTests
{
    [Fact]
    public void Non_writable_database_directory_uses_temp_fallback()
    {
        var resolved = SqlitePathHelper.ResolveWritableDbPath("/proc/nd-station-agent/alarm.db");

        resolved.Should().StartWith(Path.GetTempPath()).And.EndWith("alarm.db");
    }

    [Fact]
    public async Task Command_commits_alarm_timeline_and_outbox_atomically()
    {
        await using var fixture = new SqliteFixture<ProjectionDbContext>(o => new ProjectionDbContext(o));
        var clock = new TestClock(new DateTime(2026, 8, 5, 2, 0, 0, DateTimeKind.Utc));
        var service = new AlarmCommandService(new AlarmRepository(fixture.Context),
            new AlarmTimelineRepository(fixture.Context), new AlarmOutboxRepository(fixture.Context),
            fixture.Context, clock);

        var alarm = await service.RaiseAsync(new RaiseAlarmCommand(
            "VISION_OCR_MISMATCH", "STATION-01:camera-01:VISION_OCR_MISMATCH",
            AlarmSeverity.High, AlarmCategory.Quality, "STATION-01", "vision-service", "CAMERA",
            "camera-01", "alarm.vision.ocr.title", "alarm.vision.ocr.message"), AlarmActor.System);

        (await fixture.Context.Alarms.CountAsync()).Should().Be(1);
        (await fixture.Context.AlarmTimelineEvents.SingleAsync()).AlarmId.Should().Be(alarm.Id);
        (await fixture.Context.AlarmOutboxEvents.SingleAsync()).Status.Should().Be("PENDING");
    }

    [Fact]
    public async Task Active_dedupe_index_is_race_safe()
    {
        await using var fixture = new SqliteFixture<ProjectionDbContext>(o => new ProjectionDbContext(o));
        var first = TestAlarm("one"); var second = TestAlarm("two");
        await fixture.Context.Alarms.AddAsync(first); await fixture.Context.SaveChangesAsync();
        await fixture.Context.Alarms.AddAsync(second);

        var act = () => fixture.Context.SaveChangesAsync();

        await act.Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    public async Task Manual_retry_writes_audit_and_command_outbox_without_cross_service_mutation()
    {
        await using var fixture = new SqliteFixture<ProjectionDbContext>(o => new ProjectionDbContext(o));
        var clock = new TestClock(new DateTime(2026, 8, 5, 2, 0, 0, DateTimeKind.Utc));
        var service = new AlarmCommandService(new AlarmRepository(fixture.Context),
            new AlarmTimelineRepository(fixture.Context), new AlarmOutboxRepository(fixture.Context),
            fixture.Context, clock);
        var alarm = TestAlarm("retry-alarm");
        await fixture.Context.Alarms.AddAsync(alarm); await fixture.Context.SaveChangesAsync();

        await service.RequestManualCommandAsync(alarm.Id, "RETRY_DEVICE", "Operator verified device",
            "retry-key-1", new AlarmActor("user-1", "operator.seed", "OPERATOR"));

        var timeline = await fixture.Context.AlarmTimelineEvents.SingleAsync();
        var outbox = await fixture.Context.AlarmOutboxEvents.SingleAsync();
        timeline.ActionType.Should().Be(AlarmAction.DeviceRetryRequested);
        outbox.RoutingKey.Should().Be("station.manual-overrides");
        outbox.PayloadJson.Should().Contain("retry-key-1").And.Contain("operator.seed");
        alarm.State.Should().Be(AlarmState.Raised);
    }

    [Fact]
    public async Task Advanced_query_filters_and_summary_are_stable()
    {
        await using var fixture = new SqliteFixture<ProjectionDbContext>(o => new ProjectionDbContext(o));
        var repository = new AlarmRepository(fixture.Context);
        await repository.AddAsync(TestAlarm("query-one"));
        var closed = ND.ProjectionService.Domain.Entities.Alarm.Raise("JOB_FAILED", "closed-key",
            AlarmSeverity.High, AlarmCategory.Job, "STATION-01", "job-engine", "JOB", "job-1",
            "title", "message", "{}", DateTime.UtcNow, id: "query-two");
        closed.Clear("system", AlarmResolution.JobRetried, "retried"); closed.Close("system");
        await repository.AddAsync(closed); await fixture.Context.SaveChangesAsync();

        var (items, total) = await repository.GetAdvancedPagedAsync(1, 10,
            stationId: "STATION-01", state: AlarmState.Raised, severity: AlarmSeverity.Critical);
        var summary = await repository.GetSummaryAsync("STATION-01");

        total.Should().Be(1); items.Single().Id.Should().Be("query-one");
        summary.ActiveCount.Should().Be(1); summary.UnacknowledgedCount.Should().Be(1);
        summary.CriticalCount.Should().Be(1);
    }

    private static ND.ProjectionService.Domain.Entities.Alarm TestAlarm(string id) =>
        ND.ProjectionService.Domain.Entities.Alarm.Raise("PRINTER_OFFLINE", "same-active-key",
            AlarmSeverity.Critical, AlarmCategory.Device, "STATION-01", "printer-adapter", "PRINTER",
            "printer-01", "title", "message", "{}", DateTime.UtcNow, id: id);
}
