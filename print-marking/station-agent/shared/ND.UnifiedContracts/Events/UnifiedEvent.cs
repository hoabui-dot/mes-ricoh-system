using System.Text.Json.Serialization;

namespace ND.UnifiedContracts.Events;

/// <summary>
/// ND Unified Event Protocol — all outbound MQTT events MUST follow this schema exactly.
///
/// Example:
/// {
///   "site": "NMDDuongDuong",
///   "area": "Assembly_Section",
///   "line": "Chuyen03",
///   "machine": "Laser-Marking-03",
///   "edge_id": "edge-ipc-l3-marking",
///   "timestamp": "2026-06-16T15:30:00+07:00",
///   "event_id": "evt-mark-20260616-9921",
///   "data": [
///     { "tag": "marking.type", "value": "LASER_ETCHING", "quality": "GOOD" }
///   ]
/// }
/// </summary>
public sealed record UnifiedEvent
{
    [JsonPropertyName("site")]
    public required string Site { get; init; }

    [JsonPropertyName("area")]
    public required string Area { get; init; }

    [JsonPropertyName("line")]
    public required string Line { get; init; }

    [JsonPropertyName("machine")]
    public required string Machine { get; init; }

    [JsonPropertyName("edge_id")]
    public required string EdgeId { get; init; }

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("data")]
    public required IReadOnlyList<UnifiedTag> Data { get; init; }

    /// <summary>
    /// Factory method — creates a valid UnifiedEvent with auto-generated event_id and timestamp.
    /// </summary>
    public static UnifiedEvent Create(
        string site,
        string area,
        string line,
        string machine,
        string edgeId,
        IReadOnlyList<UnifiedTag> data,
        string? eventId = null)
    {
        return new UnifiedEvent
        {
            Site = site,
            Area = area,
            Line = line,
            Machine = machine,
            EdgeId = edgeId,
            Timestamp = DateTimeOffset.UtcNow.ToString("o"),
            EventId = eventId ?? $"evt-{Guid.NewGuid()}",
            Data = data
        };
    }
}
