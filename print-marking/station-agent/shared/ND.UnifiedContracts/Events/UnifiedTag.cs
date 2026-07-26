using System.Text.Json.Serialization;

namespace ND.UnifiedContracts.Events;

/// <summary>
/// A single data tag within a UnifiedEvent.
/// </summary>
public sealed record UnifiedTag
{
    [JsonPropertyName("tag")]
    public required string Tag { get; init; }

    [JsonPropertyName("value")]
    public required object Value { get; init; }

    [JsonPropertyName("quality")]
    public required string Quality { get; init; }

    public static UnifiedTag Good(string tag, object value) =>
        new() { Tag = tag, Value = value, Quality = EventQuality.Good };

    public static UnifiedTag Bad(string tag, object value) =>
        new() { Tag = tag, Value = value, Quality = EventQuality.Bad };

    public static UnifiedTag Uncertain(string tag, object value) =>
        new() { Tag = tag, Value = value, Quality = EventQuality.Uncertain };
}
