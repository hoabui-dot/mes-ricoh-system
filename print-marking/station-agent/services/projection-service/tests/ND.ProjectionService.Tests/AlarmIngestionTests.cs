using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using ND.ProjectionService.Application.Alarms;
using ND.ProjectionService.Domain.Alarms;
using ND.ProjectionService.Infrastructure.Messaging;
using ND.ProjectionService.Infrastructure.Persistence;
using ND.ProjectionService.Infrastructure.Repositories;
using ND.Testing.Fixtures;
using Xunit;

namespace ND.ProjectionService.Tests;

public sealed class AlarmIngestionTests
{
    [Theory]
    [InlineData("PRINTER_OFFLINE", "PRINTER_CONNECTION_LOST", AlarmCategory.Device)]
    [InlineData("PRINTER_PAPER_OUT", "PRINTER_PAPER_OUT", AlarmCategory.Device)]
    [InlineData("LASER_OFFLINE", "LASER_CONNECTION_FAILURE", AlarmCategory.Device)]
    [InlineData("VISION_OCR_MISMATCH", "VISION_OCR_MISMATCH", AlarmCategory.Quality)]
    [InlineData("VISION_RETRY_EXHAUSTED", "VISION_RETRY_EXHAUSTED", AlarmCategory.Quality)]
    [InlineData("PLC_OFFLINE", "PLC_COMMUNICATION_FAILURE", AlarmCategory.Device)]
    [InlineData("JOB_FAILED", "JOB_FAILED", AlarmCategory.Job)]
    [InlineData("OUTBOX_DELAY", "OUTBOX_DELIVERY_DELAYED", AlarmCategory.Network)]
    public void Central_rules_map_source_conditions(string condition, string code, string category)
    {
        var mapper = new AlarmRuleMapper();
        var (rule, command) = mapper.Map(Condition(condition));

        rule.AlarmCode.Should().Be(code);
        command.Category.Should().Be(category);
        command.DedupeKey.Should().Be($"STATION-01:DEVICE-01:{code}");
    }

    [Fact]
    public void Active_job_escalates_high_device_alarm_to_critical()
    {
        var (_, command) = new AlarmRuleMapper().Map(Condition("PRINTER_OFFLINE") with { BlocksActiveJob = true });
        command.Severity.Should().Be(AlarmSeverity.Critical);
    }

    [Fact]
    public async Task Inbox_deduplicates_delivery_but_distinct_events_repeat_and_recovery_clears()
    {
        await using var fixture = new SqliteFixture<ProjectionDbContext>(o => new ProjectionDbContext(o));
        var clock = new TestClock(new DateTime(2026, 8, 5, 3, 0, 0, DateTimeKind.Utc));
        var alarmRepo = new AlarmRepository(fixture.Context);
        var inboxRepo = new AlarmInboxRepository(fixture.Context);
        var commandService = new AlarmCommandService(alarmRepo, new AlarmTimelineRepository(fixture.Context),
            new AlarmOutboxRepository(fixture.Context), fixture.Context, clock);
        var ingestion = new AlarmEventIngestionService(fixture.Context, inboxRepo, alarmRepo,
            commandService, new AlarmRuleMapper(), clock, NullLogger<AlarmEventIngestionService>.Instance);

        await ingestion.ProcessAsync("consumer", "event-1", Condition("PRINTER_OFFLINE"));
        (await ingestion.ProcessAsync("consumer", "event-1", Condition("PRINTER_OFFLINE"))).Should().BeNull();
        clock.Advance(TimeSpan.FromMinutes(1));
        await ingestion.ProcessAsync("consumer", "event-2", Condition("PRINTER_OFFLINE"));

        var alarm = await fixture.Context.Alarms.SingleAsync();
        alarm.OccurrenceCount.Should().Be(2);
        (await fixture.Context.AlarmInboxMessages.CountAsync()).Should().Be(2);

        clock.Advance(TimeSpan.FromMinutes(1));
        await ingestion.ProcessAsync("consumer", "event-3", Condition("PRINTER_OFFLINE"), recovered: true);
        alarm.State.Should().Be(AlarmState.Cleared);
        (await fixture.Context.AlarmTimelineEvents.CountAsync()).Should().Be(3);
        (await fixture.Context.AlarmOutboxEvents.CountAsync()).Should().Be(3);
    }

    private static AlarmCondition Condition(string condition) => new(condition, "STATION-01",
        "test-source", "DEVICE", "device-01", DeviceId: "device-01");
}
