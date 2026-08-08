using ND.ProjectionService.Domain.Alarms;
using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

public sealed class Alarm : Entity
{
    public string AlarmCode { get; private set; } = default!;
    public string DedupeKey { get; private set; } = default!;
    public string Severity { get; private set; } = AlarmSeverity.Medium;
    public string Category { get; private set; } = AlarmCategory.System;
    public string State { get; private set; } = AlarmState.Raised;
    public string StationId { get; private set; } = default!;
    public string SourceService { get; private set; } = default!;
    public string SourceType { get; private set; } = default!;
    public string SourceId { get; private set; } = default!;
    public string? DeviceId { get; private set; }
    public string? JobId { get; private set; }
    public string? WorkOrderNo { get; private set; }
    public string? ProductCode { get; private set; }
    public string? ProductSerial { get; private set; }
    public string? ProductionImpact { get; private set; }
    public string TitleKey { get; private set; } = default!;
    public string MessageKey { get; private set; } = default!;
    public string MessageParamsJson { get; private set; } = "{}";
    public string? TechnicalMessage { get; private set; }
    public string? CorrelationId { get; private set; }
    public string FirstSeenAt { get; private set; } = default!;
    public string LastSeenAt { get; private set; } = default!;
    public int OccurrenceCount { get; private set; } = 1;
    public string? AcknowledgedBy { get; private set; }
    public string? AcknowledgedAt { get; private set; }
    public string? AssignedTo { get; private set; }
    public string? AssignedAt { get; private set; }
    public string? ResolvedBy { get; private set; }
    public string? ResolvedAt { get; private set; }
    public string? ResolutionCode { get; private set; }
    public string? ResolutionComment { get; private set; }
    public string? SuppressedUntil { get; private set; }
    public string? SuppressionReason { get; private set; }
    public int EscalationLevel { get; private set; }
    public string? EscalatedAt { get; private set; }
    public string UpdatedAt { get; private set; } = default!;
    public long RowVersion { get; private set; } = 1;

    // Legacy read-contract aliases retained while the Kiosk moves to the v2 fields.
    public string AlarmType => Category == AlarmCategory.Device ? "DeviceConnection" : "ProductionError";
    public string AlarmGroupKey => DedupeKey;
    public string Source => SourceType;
    public string Message => TechnicalMessage ?? MessageKey;
    public string? DeviceName => SourceType;
    public string? ProductionOrderId => JobId;
    public bool IsAcknowledged => State != AlarmState.Raised;
    public string CurrentState => State switch
    {
        AlarmState.Raised => "Active",
        AlarmState.Acknowledged or AlarmState.InProgress => "Acknowledged",
        AlarmState.Cleared or AlarmState.Closed => "Resolved",
        _ => "Active"
    };
    public string FirstOccurredAt => FirstSeenAt;
    public string LastOccurredAt => LastSeenAt;
    public int RepeatCount => Math.Max(0, OccurrenceCount - 1);

    private Alarm() { }

    public static Alarm Raise(
        string alarmCode, string dedupeKey, string severity, string category,
        string stationId, string sourceService, string sourceType, string sourceId,
        string titleKey, string messageKey, string messageParamsJson,
        DateTime occurredAt, string? technicalMessage = null, string? correlationId = null,
        string? deviceId = null, string? jobId = null, string? workOrderNo = null,
        string? productCode = null, string? productSerial = null, string? id = null,
        string? productionImpact = null)
    {
        Require(alarmCode, nameof(alarmCode));
        Require(dedupeKey, nameof(dedupeKey));
        Require(stationId, nameof(stationId));
        if (!AlarmSeverity.All.Contains(severity)) throw new AlarmLifecycleException($"Unknown severity '{severity}'.");
        if (!AlarmCategory.All.Contains(category)) throw new AlarmLifecycleException($"Unknown category '{category}'.");
        var at = occurredAt.ToUniversalTime().ToString("o");
        return new Alarm
        {
            Id = id ?? Guid.NewGuid().ToString("N"), AlarmCode = alarmCode, DedupeKey = dedupeKey,
            Severity = severity, Category = category, State = AlarmState.Raised, StationId = stationId,
            SourceService = sourceService, SourceType = sourceType, SourceId = sourceId,
            DeviceId = deviceId, JobId = jobId, WorkOrderNo = workOrderNo, ProductCode = productCode,
            ProductSerial = productSerial, TitleKey = titleKey, MessageKey = messageKey,
            ProductionImpact = productionImpact,
            MessageParamsJson = string.IsNullOrWhiteSpace(messageParamsJson) ? "{}" : messageParamsJson,
            TechnicalMessage = technicalMessage, CorrelationId = correlationId,
            FirstSeenAt = at, LastSeenAt = at, CreatedAt = at, UpdatedAt = at
        };
    }

    public static Alarm Create(string severity, string source, string message, string? deviceId = null,
        string? deviceName = null, string alarmType = "ProductionError", string? alarmGroupKey = null,
        string? productionOrderId = null)
    {
        var normalizedSeverity = severity.ToUpperInvariant() switch
        {
            "CRITICAL" => AlarmSeverity.Critical, "ERROR" => AlarmSeverity.High,
            "WARNING" => AlarmSeverity.Medium, "LOW" => AlarmSeverity.Low, _ => AlarmSeverity.Info
        };
        var key = alarmGroupKey ?? deviceId ?? Guid.NewGuid().ToString("N");
        return Raise(
            alarmType == "DeviceConnection" ? "DEVICE_CONNECTION_LOST" : "JOB_FAILED",
            key, normalizedSeverity,
            alarmType == "DeviceConnection" ? AlarmCategory.Device : AlarmCategory.Job,
            "STATION-01", "projection-service", source, deviceId ?? productionOrderId ?? key,
            "alarm.legacy.title", "alarm.legacy.message", "{}", DateTime.UtcNow,
            message, deviceId: deviceId, jobId: productionOrderId);
    }

    public void Repeat(DateTime occurredAt, string? technicalMessage = null)
    {
        if (State == AlarmState.Closed) throw new AlarmLifecycleException("A closed alarm must be reopened, not repeated.");
        OccurrenceCount++;
        LastSeenAt = occurredAt.ToUniversalTime().ToString("o");
        if (!string.IsNullOrWhiteSpace(technicalMessage)) TechnicalMessage = technicalMessage;
        Touch(occurredAt);
    }

    public bool EscalateSeverity(string severity, DateTime? at = null)
    {
        if (!AlarmSeverity.All.Contains(severity)) throw new AlarmLifecycleException($"Unknown severity '{severity}'.");
        static int Rank(string value) => value switch
        {
            AlarmSeverity.Critical => 5, AlarmSeverity.High => 4, AlarmSeverity.Medium => 3,
            AlarmSeverity.Low => 2, _ => 1
        };
        if (Rank(severity) <= Rank(Severity)) return false;
        Severity = severity;
        Touch(at);
        return true;
    }

    public void UpdateRepeat(string? timestamp = null) =>
        Repeat(DateTime.TryParse(timestamp, out var parsed) ? parsed : DateTime.UtcNow);

    public void Acknowledge(string user, DateTime? at = null)
    {
        TransitionTo(AlarmState.Acknowledged, AlarmState.Raised);
        AcknowledgedBy = Required(user, nameof(user));
        AcknowledgedAt = Iso(at);
        Touch(at);
    }

    public void Assign(string user, DateTime? at = null)
    {
        EnsureNotTerminal();
        AssignedTo = Required(user, nameof(user));
        AssignedAt = Iso(at);
        Touch(at);
    }

    public void StartWork(string user, DateTime? at = null)
    {
        TransitionTo(AlarmState.InProgress, AlarmState.Raised, AlarmState.Acknowledged);
        AssignedTo ??= Required(user, nameof(user));
        AssignedAt ??= Iso(at);
        Touch(at);
    }

    public void Clear(string resolvedBy, string resolutionCode, string resolutionComment, DateTime? at = null)
    {
        TransitionTo(AlarmState.Cleared, AlarmState.Raised, AlarmState.Acknowledged, AlarmState.InProgress, AlarmState.Suppressed);
        ResolvedBy = Required(resolvedBy, nameof(resolvedBy));
        ResolutionCode = Required(resolutionCode, nameof(resolutionCode));
        ResolutionComment = Required(resolutionComment, nameof(resolutionComment));
        ResolvedAt = Iso(at);
        SuppressedUntil = null;
        SuppressionReason = null;
        Touch(at);
    }

    public void Close(string user, DateTime? at = null)
    {
        if (Severity == AlarmSeverity.Critical && (string.IsNullOrWhiteSpace(ResolutionCode) || string.IsNullOrWhiteSpace(ResolutionComment)))
            throw new AlarmLifecycleException("A critical alarm requires resolution details before closing.");
        TransitionTo(AlarmState.Closed, AlarmState.Cleared);
        ResolvedBy ??= Required(user, nameof(user));
        Touch(at);
    }

    public void Suppress(string reason, DateTime until, DateTime? at = null)
    {
        if (Severity == AlarmSeverity.Critical)
            throw new AlarmLifecycleException("Critical alarms cannot be suppressed.");
        if (until.ToUniversalTime() <= (at ?? DateTime.UtcNow).ToUniversalTime())
            throw new AlarmLifecycleException("Suppression expiration must be in the future.");
        TransitionTo(AlarmState.Suppressed, AlarmState.Raised, AlarmState.Acknowledged, AlarmState.InProgress);
        SuppressionReason = Required(reason, nameof(reason));
        SuppressedUntil = until.ToUniversalTime().ToString("o");
        Touch(at);
    }

    public void Escalate(int level, DateTime? at = null)
    {
        if (level <= EscalationLevel) throw new AlarmLifecycleException("Alarm escalation was already applied.");
        EnsureNotTerminal();
        EscalationLevel = level;
        EscalatedAt = Iso(at);
        Touch(at);
    }

    public void Unsuppress(DateTime? at = null)
    {
        TransitionTo(AlarmState.Raised, AlarmState.Suppressed);
        SuppressionReason = null;
        SuppressedUntil = null;
        Touch(at);
    }

    public void Reopen(DateTime occurredAt)
    {
        TransitionTo(AlarmState.Raised, AlarmState.Cleared);
        ResolvedBy = null; ResolvedAt = null; ResolutionCode = null; ResolutionComment = null;
        Repeat(occurredAt);
    }

    public void Resolve(string? resolvedBy = null) =>
        Clear(resolvedBy ?? "System", AlarmResolution.AutoRecovered, "Condition recovered automatically.");

    private void TransitionTo(string target, params string[] allowed)
    {
        if (!allowed.Contains(State, StringComparer.Ordinal))
            throw new AlarmLifecycleException($"Transition {State} -> {target} is not allowed.");
        State = target;
    }

    private void EnsureNotTerminal()
    {
        if (State is AlarmState.Cleared or AlarmState.Closed)
            throw new AlarmLifecycleException($"Alarm in state {State} cannot be assigned.");
    }

    private void Touch(DateTime? at) { UpdatedAt = Iso(at); RowVersion++; }
    private static string Iso(DateTime? at) => (at ?? DateTime.UtcNow).ToUniversalTime().ToString("o");
    private static string Required(string value, string name) { Require(value, name); return value.Trim(); }
    private static void Require(string value, string name)
    {
        if (string.IsNullOrWhiteSpace(value)) throw new AlarmLifecycleException($"{name} is required.");
    }
}
