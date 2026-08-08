using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ND.ProjectionService.Application.Alarms;
using ND.ProjectionService.Application.Interfaces;
using ND.ProjectionService.Domain.Alarms;
using ND.ProjectionService.Domain.Entities;
using ND.ProjectionService.Infrastructure.Persistence;
using ND.SharedKernel.Time;

namespace ND.ProjectionService.Infrastructure.Messaging;

public interface IAlarmEventIngestionService
{
    Task<Alarm?> ProcessAsync(string consumerName, string eventId, AlarmCondition condition,
        bool recovered = false, CancellationToken ct = default);
}

public sealed class AlarmEventIngestionService : IAlarmEventIngestionService
{
    private readonly ProjectionDbContext _db;
    private readonly IAlarmInboxRepository _inbox;
    private readonly IAlarmRepository _alarms;
    private readonly IAlarmCommandService _commands;
    private readonly IAlarmRuleMapper _rules;
    private readonly ISystemClock _clock;
    private readonly ILogger<AlarmEventIngestionService> _logger;

    public AlarmEventIngestionService(ProjectionDbContext db, IAlarmInboxRepository inbox,
        IAlarmRepository alarms, IAlarmCommandService commands, IAlarmRuleMapper rules,
        ISystemClock clock, ILogger<AlarmEventIngestionService> logger)
    {
        _db = db; _inbox = inbox; _alarms = alarms; _commands = commands;
        _rules = rules; _clock = clock; _logger = logger;
    }

    public async Task<Alarm?> ProcessAsync(string consumerName, string eventId, AlarmCondition condition,
        bool recovered = false, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(eventId)) throw new ArgumentException("eventId is required.", nameof(eventId));
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        if (await _inbox.ExistsAsync(consumerName, eventId, ct))
        {
            _logger.LogInformation("Duplicate alarm source event ignored: consumer={ConsumerName} event_id={EventId}", consumerName, eventId);
            await transaction.RollbackAsync(ct);
            return null;
        }

        var (rule, command) = _rules.Map(condition);
        Alarm? alarm;
        if (recovered)
        {
            alarm = await _alarms.GetActiveByGroupKeyAsync(command.DedupeKey, ct);
            if (alarm is not null && rule.AutoClear)
                alarm = await _commands.ClearAsync(alarm.Id, AlarmResolution.DeviceReconnected,
                    "Condition recovered from source event.", AlarmActor.System, ct);
        }
        else
        {
            alarm = await _commands.RaiseAsync(command, AlarmActor.System, ct);
        }

        await _inbox.AddAsync(AlarmInboxMessage.Create(consumerName, eventId, _clock.UtcNow, condition.CorrelationId), ct);
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return alarm;
    }
}
