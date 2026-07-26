using System;
using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

public sealed class Alarm : Entity
{
    // ── Core ───────────────────────────────────────────────────────────────────
    /// <summary>"DeviceConnection" or "ProductionError" — controls which UI tab this alarm appears in.</summary>
    public string AlarmType { get; private set; } = "ProductionError";

    /// <summary>Dedup key: deviceId for device alarms, jobId for workflow alarms.</summary>
    public string AlarmGroupKey { get; private set; } = default!;

    public string Severity { get; private set; } = "Warning"; // Warning | Error | Critical
    public string Source { get; private set; } = default!;    // Device | Workflow | Infrastructure
    public string Message { get; private set; } = default!;
    public string? DeviceId { get; private set; }
    public string? DeviceName { get; private set; }
    public string? ProductionOrderId { get; private set; }

    // ── Aggregation ────────────────────────────────────────────────────────────
    /// <summary>"Active" | "Acknowledged" | "Resolved"</summary>
    public string CurrentState { get; private set; } = "Active";
    public string FirstOccurredAt { get; private set; } = default!;
    public string LastOccurredAt { get; private set; } = default!;
    public int RepeatCount { get; private set; } = 0;
    public string? ResolvedAt { get; private set; }

    // ── Acknowledge (backward-compat) ──────────────────────────────────────────
    public bool IsAcknowledged { get; private set; } = false;
    public string? AcknowledgedBy { get; private set; }
    public string? AcknowledgedAt { get; private set; }

    private Alarm() { }

    // ── Factory ────────────────────────────────────────────────────────────────
    public static Alarm Create(
        string severity,
        string source,
        string message,
        string? deviceId = null,
        string? deviceName = null,
        string alarmType = "ProductionError",
        string? alarmGroupKey = null,
        string? productionOrderId = null)
    {
        var now = DateTime.UtcNow.ToString("o");
        var groupKey = alarmGroupKey ?? deviceId ?? Guid.NewGuid().ToString("N");
        return new Alarm
        {
            Id = Guid.NewGuid().ToString("N"),
            AlarmType = alarmType,
            AlarmGroupKey = groupKey,
            Severity = severity,
            Source = source,
            Message = message,
            DeviceId = deviceId,
            DeviceName = deviceName,
            ProductionOrderId = productionOrderId,
            CurrentState = "Active",
            FirstOccurredAt = now,
            LastOccurredAt = now,
            RepeatCount = 0,
            IsAcknowledged = false
        };
    }

    // ── Behavior ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Duplicate event for same device/job — bump repeat count and timestamp only.
    /// Caller must NOT broadcast SignalR after calling this.
    /// </summary>
    public void UpdateRepeat(string? timestamp = null)
    {
        LastOccurredAt = timestamp ?? DateTime.UtcNow.ToString("o");
        RepeatCount++;
    }

    /// <summary>Operator acknowledges. Sets CurrentState = Acknowledged.</summary>
    public void Acknowledge(string user)
    {
        IsAcknowledged = true;
        CurrentState = "Acknowledged";
        AcknowledgedBy = user;
        AcknowledgedAt = DateTime.UtcNow.ToString("o");
    }

    /// <summary>System auto-resolves (e.g. device came back online).</summary>
    public void Resolve(string? resolvedBy = null)
    {
        CurrentState = "Resolved";
        ResolvedAt = DateTime.UtcNow.ToString("o");
        if (!IsAcknowledged)
        {
            IsAcknowledged = true;
            AcknowledgedBy = resolvedBy ?? "System";
            AcknowledgedAt = ResolvedAt;
        }
    }
}
