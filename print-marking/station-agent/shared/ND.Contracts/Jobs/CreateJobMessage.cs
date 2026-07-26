namespace ND.Contracts.Jobs;

/// <summary>
/// MQTT inbound message payload for creating a new job.
/// Received on topic: station/{stationId}/job/create
/// </summary>
public record CreateJobMessage
{
    public required string MessageId { get; init; }
    public required string JobNo { get; init; }
    public required string JobType { get; init; }
    public required string SourceSystem { get; init; }
    public required string ProductCode { get; init; }
    public string? ProductSerial { get; init; }
    public int Priority { get; init; } = 0;
    public Dictionary<string, object>? Metadata { get; init; }
    public string SentAt { get; init; } = DateTime.UtcNow.ToString("o");
}
