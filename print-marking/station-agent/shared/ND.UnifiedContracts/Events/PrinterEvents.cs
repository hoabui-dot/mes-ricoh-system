using System.Text.Json.Serialization;

namespace ND.UnifiedContracts.Events;

public sealed record PrinterStatusChangedEvent
{
    [JsonPropertyName("event_type")] public string EventType { get; init; } = "PrinterStatusChanged";
    [JsonPropertyName("event_id")] public required string EventId { get; init; }
    [JsonPropertyName("printer_id")] public required string PrinterId { get; init; }
    [JsonPropertyName("printer_code")] public required string PrinterCode { get; init; }
    [JsonPropertyName("adapter_id")] public required string AdapterId { get; init; }
    [JsonPropertyName("status")] public required string Status { get; init; }
    [JsonPropertyName("previous_status")] public string? PreviousStatus { get; init; }
    [JsonPropertyName("timestamp")] public required string Timestamp { get; init; }
    [JsonPropertyName("details")] public object? Details { get; init; }
}

public sealed record PrinterHeartbeatEvent
{
    [JsonPropertyName("event_type")] public string EventType { get; init; } = "PrinterHeartbeat";
    [JsonPropertyName("event_id")] public required string EventId { get; init; }
    [JsonPropertyName("printer_id")] public required string PrinterId { get; init; }
    [JsonPropertyName("printer_code")] public required string PrinterCode { get; init; }
    [JsonPropertyName("adapter_id")] public required string AdapterId { get; init; }
    [JsonPropertyName("status")] public required string Status { get; init; }
    [JsonPropertyName("timestamp")] public required string Timestamp { get; init; }
    [JsonPropertyName("details")] public object? Details { get; init; }
}

public sealed record PrinterErrorEvent
{
    [JsonPropertyName("event_type")] public string EventType { get; init; } = "PrinterError";
    [JsonPropertyName("event_id")] public required string EventId { get; init; }
    [JsonPropertyName("printer_id")] public required string PrinterId { get; init; }
    [JsonPropertyName("printer_code")] public required string PrinterCode { get; init; }
    [JsonPropertyName("adapter_id")] public required string AdapterId { get; init; }
    [JsonPropertyName("error_message")] public required string ErrorMessage { get; init; }
    [JsonPropertyName("timestamp")] public required string Timestamp { get; init; }
}
