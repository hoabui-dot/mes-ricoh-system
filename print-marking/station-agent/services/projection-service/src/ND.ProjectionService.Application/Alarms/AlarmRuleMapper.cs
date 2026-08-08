using System.Text.Json;
using ND.ProjectionService.Domain.Alarms;

namespace ND.ProjectionService.Application.Alarms;

public sealed record AlarmCondition(
    string Condition, string StationId, string SourceService, string SourceType, string SourceId,
    bool BlocksActiveJob = false, string? DeviceId = null, string? JobId = null,
    string? WorkOrderNo = null, string? ProductCode = null, string? ProductSerial = null,
    string? TechnicalMessage = null, string? CorrelationId = null);

public sealed record AlarmRuleDefinition(
    string AlarmCode, string Severity, string Category, string TitleKey, string MessageKey,
    string OperatorGuidanceKey, bool AutoClear, string ProductionImpact);

public interface IAlarmRuleMapper
{
    (AlarmRuleDefinition Rule, RaiseAlarmCommand Command) Map(AlarmCondition condition);
    string BuildDedupeKey(AlarmCondition condition, string alarmCode);
}

public sealed class AlarmRuleMapper : IAlarmRuleMapper
{
    private static readonly IReadOnlyDictionary<string, AlarmRuleDefinition> Rules =
        new Dictionary<string, AlarmRuleDefinition>(StringComparer.OrdinalIgnoreCase)
        {
            ["PRINTER_OFFLINE"] = Rule("PRINTER_CONNECTION_LOST", AlarmSeverity.High, AlarmCategory.Device, true, "BLOCKS_PRINT"),
            ["PRINTER_PAPER_OUT"] = Rule("PRINTER_PAPER_OUT", AlarmSeverity.High, AlarmCategory.Device, true, "BLOCKS_PRINT"),
            ["PRINTER_RIBBON_OUT"] = Rule("PRINTER_RIBBON_OUT", AlarmSeverity.High, AlarmCategory.Device, true, "BLOCKS_PRINT"),
            ["PRINTER_HEAD_OPEN"] = Rule("PRINTER_HEAD_OPEN", AlarmSeverity.High, AlarmCategory.Device, true, "BLOCKS_PRINT"),
            ["LASER_OFFLINE"] = Rule("LASER_CONNECTION_FAILURE", AlarmSeverity.High, AlarmCategory.Device, true, "BLOCKS_MARK"),
            ["LASER_EXECUTION_FAILED"] = Rule("LASER_EXECUTION_FAILED", AlarmSeverity.Critical, AlarmCategory.Job, false, "FAILS_JOB"),
            ["VISION_OCR_MISMATCH"] = Rule("VISION_OCR_MISMATCH", AlarmSeverity.High, AlarmCategory.Quality, false, "BLOCKS_QC"),
            ["VISION_RETRY_EXHAUSTED"] = Rule("VISION_RETRY_EXHAUSTED", AlarmSeverity.Critical, AlarmCategory.Quality, false, "BLOCKS_QC"),
            ["PLC_OFFLINE"] = Rule("PLC_COMMUNICATION_FAILURE", AlarmSeverity.High, AlarmCategory.Device, true, "BLOCKS_LINE"),
            ["DEVICE_OFFLINE"] = Rule("DEVICE_CONNECTION_LOST", AlarmSeverity.High, AlarmCategory.Device, true, "BLOCKS_OPERATION"),
            ["JOB_FAILED"] = Rule("JOB_FAILED", AlarmSeverity.High, AlarmCategory.Job, false, "FAILS_JOB"),
            ["JOB_RETRY_EXHAUSTED"] = Rule("JOB_RETRY_EXHAUSTED", AlarmSeverity.Critical, AlarmCategory.Job, false, "FAILS_JOB"),
            ["OUTBOX_DELAY"] = Rule("OUTBOX_DELIVERY_DELAYED", AlarmSeverity.Medium, AlarmCategory.Network, true, "DELAYS_SYNC"),
            ["PROJECTION_LAG"] = Rule("PROJECTION_LAG_DETECTED", AlarmSeverity.Medium, AlarmCategory.System, true, "STALE_UI"),
            ["DISK_WRITE_FAILURE"] = Rule("DISK_WRITE_FAILURE", AlarmSeverity.Critical, AlarmCategory.System, false, "STOPS_PERSISTENCE")
        };

    public (AlarmRuleDefinition Rule, RaiseAlarmCommand Command) Map(AlarmCondition condition)
    {
        if (!Rules.TryGetValue(condition.Condition, out var baseRule))
            throw new ArgumentException($"Unknown alarm condition '{condition.Condition}'.", nameof(condition));
        var severity = condition.BlocksActiveJob && baseRule.Severity == AlarmSeverity.High
            ? AlarmSeverity.Critical : baseRule.Severity;
        var rule = baseRule with { Severity = severity };
        var parameters = JsonSerializer.Serialize(new Dictionary<string, string?>
        {
            ["sourceId"] = condition.SourceId, ["deviceId"] = condition.DeviceId,
            ["jobId"] = condition.JobId, ["workOrderNo"] = condition.WorkOrderNo
        });
        return (rule, new RaiseAlarmCommand(rule.AlarmCode, BuildDedupeKey(condition, rule.AlarmCode),
            rule.Severity, rule.Category, condition.StationId, condition.SourceService,
            condition.SourceType, condition.SourceId, rule.TitleKey, rule.MessageKey, parameters,
            condition.TechnicalMessage, condition.CorrelationId, condition.DeviceId, condition.JobId,
            condition.WorkOrderNo, condition.ProductCode, condition.ProductSerial, rule.ProductionImpact));
    }

    public string BuildDedupeKey(AlarmCondition condition, string alarmCode) =>
        $"{condition.StationId}:{condition.DeviceId ?? condition.JobId ?? condition.SourceId}:{alarmCode}".ToUpperInvariant();

    private static AlarmRuleDefinition Rule(string code, string severity, string category, bool autoClear, string impact) =>
        new(code, severity, category, $"alarm.{code.ToLowerInvariant()}.title",
            $"alarm.{code.ToLowerInvariant()}.message", $"alarm.{code.ToLowerInvariant()}.guidance", autoClear, impact);
}
