using System.Text.Json;
using System.Text.Json.Serialization;

namespace ND.UnifiedContracts.Events;

public sealed record AlarmEvent
{
    [JsonPropertyName("event_type")] public required string EventType { get; init; }
    [JsonPropertyName("event_id")] public required string EventId { get; init; }
    [JsonPropertyName("alarm_id")] public required string AlarmId { get; init; }
    [JsonPropertyName("alarm_code")] public required string AlarmCode { get; init; }
    [JsonPropertyName("dedupe_key")] public required string DedupeKey { get; init; }
    [JsonPropertyName("severity")] public required string Severity { get; init; }
    [JsonPropertyName("category")] public required string Category { get; init; }
    [JsonPropertyName("state")] public required string State { get; init; }
    [JsonPropertyName("station_id")] public required string StationId { get; init; }
    [JsonPropertyName("source_service")] public required string SourceService { get; init; }
    [JsonPropertyName("source_type")] public required string SourceType { get; init; }
    [JsonPropertyName("source_id")] public required string SourceId { get; init; }
    [JsonPropertyName("device_id")] public string? DeviceId { get; init; }
    [JsonPropertyName("job_id")] public string? JobId { get; init; }
    [JsonPropertyName("work_order_no")] public string? WorkOrderNo { get; init; }
    [JsonPropertyName("product_code")] public string? ProductCode { get; init; }
    [JsonPropertyName("product_serial")] public string? ProductSerial { get; init; }
    [JsonPropertyName("title_key")] public required string TitleKey { get; init; }
    [JsonPropertyName("message_key")] public required string MessageKey { get; init; }
    [JsonPropertyName("message_params")] public JsonElement MessageParams { get; init; }
    [JsonPropertyName("technical_message")] public string? TechnicalMessage { get; init; }
    [JsonPropertyName("correlation_id")] public string? CorrelationId { get; init; }
    [JsonPropertyName("timestamp")] public required string Timestamp { get; init; }
    [JsonPropertyName("actor_user_id")] public string? ActorUserId { get; init; }
    [JsonPropertyName("actor_username")] public string? ActorUsername { get; init; }
    [JsonPropertyName("actor_role")] public string? ActorRole { get; init; }
}

public static class AlarmEventTypes
{
    public const string Raised = "AlarmRaised";
    public const string Repeated = "AlarmRepeated";
    public const string Acknowledged = "AlarmAcknowledged";
    public const string Assigned = "AlarmAssigned";
    public const string WorkStarted = "AlarmWorkStarted";
    public const string Cleared = "AlarmCleared";
    public const string Closed = "AlarmClosed";
    public const string Suppressed = "AlarmSuppressed";
    public const string Unsuppressed = "AlarmUnsuppressed";
    public const string Escalated = "AlarmEscalated";
    public const string ManualCommandRequested = "AlarmManualCommandRequested";
}

public sealed record AlarmManualCommandEvent
{
    [JsonPropertyName("event_type")] public string EventType { get; init; } = AlarmEventTypes.ManualCommandRequested;
    [JsonPropertyName("event_id")] public required string EventId { get; init; }
    [JsonPropertyName("alarm_id")] public required string AlarmId { get; init; }
    [JsonPropertyName("command_type")] public required string CommandType { get; init; }
    [JsonPropertyName("station_id")] public required string StationId { get; init; }
    [JsonPropertyName("device_id")] public string? DeviceId { get; init; }
    [JsonPropertyName("job_id")] public string? JobId { get; init; }
    [JsonPropertyName("reason")] public required string Reason { get; init; }
    [JsonPropertyName("actor_user_id")] public required string ActorUserId { get; init; }
    [JsonPropertyName("actor_username")] public required string ActorUsername { get; init; }
    [JsonPropertyName("actor_role")] public required string ActorRole { get; init; }
    [JsonPropertyName("correlation_id")] public required string CorrelationId { get; init; }
    [JsonPropertyName("idempotency_key")] public required string IdempotencyKey { get; init; }
    [JsonPropertyName("timestamp")] public required string Timestamp { get; init; }
}
