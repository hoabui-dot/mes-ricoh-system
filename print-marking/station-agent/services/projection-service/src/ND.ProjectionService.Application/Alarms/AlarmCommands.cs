using System.Text.Json;
using ND.ProjectionService.Application.Interfaces;
using ND.ProjectionService.Domain.Alarms;
using ND.ProjectionService.Domain.Entities;
using ND.SharedKernel.Abstractions;
using ND.SharedKernel.Exceptions;
using ND.SharedKernel.Time;
using ND.UnifiedContracts.Events;

namespace ND.ProjectionService.Application.Alarms;

public sealed record AlarmActor(string? UserId, string Username, string Role)
{
    public static readonly AlarmActor System = new(null, "system", "SYSTEM");
}

public sealed record RaiseAlarmCommand(
    string AlarmCode, string DedupeKey, string Severity, string Category, string StationId,
    string SourceService, string SourceType, string SourceId, string TitleKey, string MessageKey,
    string MessageParamsJson = "{}", string? TechnicalMessage = null, string? CorrelationId = null,
    string? DeviceId = null, string? JobId = null, string? WorkOrderNo = null,
    string? ProductCode = null, string? ProductSerial = null, string? ProductionImpact = null);

public interface IAlarmCommandService
{
    Task<Alarm> RaiseAsync(RaiseAlarmCommand command, AlarmActor actor, CancellationToken ct = default);
    Task<Alarm> RepeatAsync(string id, string? technicalMessage, AlarmActor actor, CancellationToken ct = default);
    Task<Alarm> AcknowledgeAsync(string id, AlarmActor actor, CancellationToken ct = default);
    Task<Alarm> AssignAsync(string id, string assignedTo, AlarmActor actor, CancellationToken ct = default);
    Task<Alarm> StartWorkAsync(string id, AlarmActor actor, CancellationToken ct = default);
    Task<Alarm> ClearAsync(string id, string resolutionCode, string comment, AlarmActor actor, CancellationToken ct = default);
    Task<Alarm> CloseAsync(string id, AlarmActor actor, CancellationToken ct = default);
    Task<Alarm> SuppressAsync(string id, string reason, DateTime until, AlarmActor actor, CancellationToken ct = default);
    Task<Alarm> UnsuppressAsync(string id, AlarmActor actor, CancellationToken ct = default);
    Task<Alarm> EscalateAsync(string id, int level, AlarmActor actor, CancellationToken ct = default);
    Task<Alarm> RequestManualCommandAsync(string id, string commandType, string reason,
        string idempotencyKey, AlarmActor actor, CancellationToken ct = default);
}

public sealed class AlarmCommandService : IAlarmCommandService
{
    private readonly IAlarmRepository _alarms;
    private readonly IAlarmTimelineRepository _timeline;
    private readonly IAlarmOutboxRepository _outbox;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ISystemClock _clock;

    public AlarmCommandService(IAlarmRepository alarms, IAlarmTimelineRepository timeline,
        IAlarmOutboxRepository outbox, IUnitOfWork unitOfWork, ISystemClock clock)
    {
        _alarms = alarms; _timeline = timeline; _outbox = outbox;
        _unitOfWork = unitOfWork; _clock = clock;
    }

    public async Task<Alarm> RaiseAsync(RaiseAlarmCommand command, AlarmActor actor, CancellationToken ct = default)
    {
        var existing = await _alarms.GetActiveByGroupKeyAsync(command.DedupeKey, ct);
        if (existing is not null)
        {
            existing.EscalateSeverity(command.Severity, _clock.UtcNow);
            return await RepeatInternalAsync(existing, command.TechnicalMessage, actor, ct);
        }

        var alarm = Alarm.Raise(command.AlarmCode, command.DedupeKey, command.Severity, command.Category,
            command.StationId, command.SourceService, command.SourceType, command.SourceId,
            command.TitleKey, command.MessageKey, command.MessageParamsJson, _clock.UtcNow,
            command.TechnicalMessage, command.CorrelationId, command.DeviceId, command.JobId,
            command.WorkOrderNo, command.ProductCode, command.ProductSerial, productionImpact: command.ProductionImpact);
        await _alarms.AddAsync(alarm, ct);
        await AddAuditAndOutboxAsync(alarm, AlarmAction.Raised, AlarmEventTypes.Raised, null, actor, null, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return alarm;
    }

    public async Task<Alarm> RepeatAsync(string id, string? message, AlarmActor actor, CancellationToken ct = default)
        => await RepeatInternalAsync(await GetAsync(id, ct), message, actor, ct);

    public Task<Alarm> AcknowledgeAsync(string id, AlarmActor actor, CancellationToken ct = default) =>
        ChangeAsync(id, AlarmAction.Acknowledged, AlarmEventTypes.Acknowledged, actor, null, a => a.Acknowledge(actor.Username, _clock.UtcNow), ct);

    public Task<Alarm> AssignAsync(string id, string assignedTo, AlarmActor actor, CancellationToken ct = default) =>
        ChangeAsync(id, AlarmAction.Assigned, AlarmEventTypes.Assigned, actor, assignedTo, a => a.Assign(assignedTo, _clock.UtcNow), ct);

    public Task<Alarm> StartWorkAsync(string id, AlarmActor actor, CancellationToken ct = default) =>
        ChangeAsync(id, AlarmAction.WorkStarted, AlarmEventTypes.WorkStarted, actor, null, a => a.StartWork(actor.Username, _clock.UtcNow), ct);

    public Task<Alarm> ClearAsync(string id, string code, string comment, AlarmActor actor, CancellationToken ct = default) =>
        ChangeAsync(id, AlarmAction.Cleared, AlarmEventTypes.Cleared, actor, comment, a => a.Clear(actor.Username, code, comment, _clock.UtcNow), ct);

    public Task<Alarm> CloseAsync(string id, AlarmActor actor, CancellationToken ct = default) =>
        ChangeAsync(id, AlarmAction.Closed, AlarmEventTypes.Closed, actor, null, a => a.Close(actor.Username, _clock.UtcNow), ct);

    public Task<Alarm> SuppressAsync(string id, string reason, DateTime until, AlarmActor actor, CancellationToken ct = default) =>
        ChangeAsync(id, AlarmAction.Suppressed, AlarmEventTypes.Suppressed, actor, reason, a => a.Suppress(reason, until, _clock.UtcNow), ct);

    public Task<Alarm> UnsuppressAsync(string id, AlarmActor actor, CancellationToken ct = default) =>
        ChangeAsync(id, AlarmAction.Unsuppressed, AlarmEventTypes.Unsuppressed, actor, null, a => a.Unsuppress(_clock.UtcNow), ct);

    public Task<Alarm> EscalateAsync(string id, int level, AlarmActor actor, CancellationToken ct = default) =>
        ChangeAsync(id, AlarmAction.Escalated, AlarmEventTypes.Escalated, actor, $"LEVEL_{level}", a => a.Escalate(level, _clock.UtcNow), ct);

    public async Task<Alarm> RequestManualCommandAsync(string id, string commandType, string reason,
        string idempotencyKey, AlarmActor actor, CancellationToken ct = default)
    {
        var alarm = await GetAsync(id, ct);
        var now = _clock.UtcNow;
        var eventId = $"evt-alarm-command-{Guid.NewGuid():N}";
        var correlationId = alarm.CorrelationId ?? Guid.NewGuid().ToString("N");
        var commandEvent = new AlarmManualCommandEvent
        {
            EventId = eventId, AlarmId = alarm.Id, CommandType = commandType,
            StationId = alarm.StationId, DeviceId = alarm.DeviceId, JobId = alarm.JobId,
            Reason = reason, ActorUserId = actor.UserId ?? "unknown", ActorUsername = actor.Username,
            ActorRole = actor.Role, CorrelationId = correlationId, IdempotencyKey = idempotencyKey,
            Timestamp = now.ToUniversalTime().ToString("o")
        };
        var action = commandType switch
        {
            "RETRY_DEVICE" => AlarmAction.DeviceRetryRequested,
            "VISION_BYPASS" => AlarmAction.VisionBypassRequested,
            _ => AlarmAction.JobRetryRequested
        };
        await _timeline.AddAsync(AlarmTimelineEvent.Create(alarm.Id, action, alarm.State, alarm.State,
            actor.UserId, actor.Username, actor.Role, reason,
            JsonSerializer.Serialize(new { commandType, idempotencyKey, alarm.DeviceId, alarm.JobId }), now, correlationId), ct);
        await _outbox.AddAsync(AlarmOutboxEvent.Pending(eventId, alarm.Id, AlarmEventTypes.ManualCommandRequested,
            JsonSerializer.Serialize(commandEvent), "station.manual-overrides", now), ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return alarm;
    }

    private async Task<Alarm> RepeatInternalAsync(Alarm alarm, string? message, AlarmActor actor, CancellationToken ct)
    {
        var previous = alarm.State; alarm.Repeat(_clock.UtcNow, message); await _alarms.UpdateAsync(alarm, ct);
        await AddAuditAndOutboxAsync(alarm, AlarmAction.Repeated, AlarmEventTypes.Repeated, previous, actor, message, ct);
        await _unitOfWork.SaveChangesAsync(ct); return alarm;
    }

    private async Task<Alarm> ChangeAsync(string id, string action, string eventType, AlarmActor actor,
        string? comment, Action<Alarm> mutate, CancellationToken ct)
    {
        var alarm = await GetAsync(id, ct); var previous = alarm.State; mutate(alarm);
        await _alarms.UpdateAsync(alarm, ct);
        await AddAuditAndOutboxAsync(alarm, action, eventType, previous, actor, comment, ct);
        await _unitOfWork.SaveChangesAsync(ct); return alarm;
    }

    private async Task<Alarm> GetAsync(string id, CancellationToken ct) =>
        await _alarms.GetByIdAsync(id, ct) ?? throw new NotFoundException("Alarm", id);

    private async Task AddAuditAndOutboxAsync(Alarm alarm, string action, string eventType,
        string? previous, AlarmActor actor, string? comment, CancellationToken ct)
    {
        var now = _clock.UtcNow;
        await _timeline.AddAsync(AlarmTimelineEvent.Create(alarm.Id, action, previous, alarm.State,
            actor.UserId, actor.Username, actor.Role, comment, "{}", now, alarm.CorrelationId), ct);
        using var paramsDoc = JsonDocument.Parse(alarm.MessageParamsJson);
        var eventId = $"evt-alarm-{Guid.NewGuid():N}";
        var domainEvent = new AlarmEvent
        {
            EventType = eventType, EventId = eventId, AlarmId = alarm.Id, AlarmCode = alarm.AlarmCode,
            DedupeKey = alarm.DedupeKey, Severity = alarm.Severity, Category = alarm.Category,
            State = alarm.State, StationId = alarm.StationId, SourceService = alarm.SourceService,
            SourceType = alarm.SourceType, SourceId = alarm.SourceId, DeviceId = alarm.DeviceId,
            JobId = alarm.JobId, WorkOrderNo = alarm.WorkOrderNo, ProductCode = alarm.ProductCode,
            ProductSerial = alarm.ProductSerial, TitleKey = alarm.TitleKey, MessageKey = alarm.MessageKey,
            MessageParams = paramsDoc.RootElement.Clone(), TechnicalMessage = alarm.TechnicalMessage,
            CorrelationId = alarm.CorrelationId, Timestamp = now.ToUniversalTime().ToString("o"),
            ActorUserId = actor.UserId, ActorUsername = actor.Username, ActorRole = actor.Role
        };
        await _outbox.AddAsync(AlarmOutboxEvent.Pending(eventId, alarm.Id, eventType,
            JsonSerializer.Serialize(domainEvent), "event.alarm.changed", now), ct);
    }
}
