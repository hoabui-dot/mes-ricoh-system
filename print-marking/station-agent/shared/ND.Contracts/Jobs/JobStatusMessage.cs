namespace ND.Contracts.Jobs;

/// <summary>
/// MQTT outbound message for job status updates.
/// Published on topic: station/{stationId}/job/status
/// </summary>
public record JobStatusMessage
{
    public required string JobId { get; init; }
    public required string JobNo { get; init; }
    public required string Status { get; init; }
    public string? AttemptId { get; init; }
    public int AttemptNo { get; init; }
    public string? ErrorMessage { get; init; }
    public string OccurredAt { get; init; } = DateTime.UtcNow.ToString("o");
}
