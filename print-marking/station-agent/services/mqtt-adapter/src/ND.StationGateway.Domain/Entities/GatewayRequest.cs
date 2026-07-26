using ND.SharedKernel.Primitives;

namespace ND.StationGateway.Domain.Entities;

/// <summary>
/// Represents an inbound production order request received from Factory Gateway via HTTP.
/// Persisted to <c>gateway_requests</c> for audit and deduplication.
/// </summary>
public sealed class GatewayRequest : AuditableEntity
{
    public string RequestId { get; private set; } = default!;
    public string Source { get; private set; } = default!;  // e.g. "FACTORY_GATEWAY"
    public string PayloadJson { get; private set; } = default!;
    public string Status { get; private set; } = default!;  // RECEIVED, PROCESSED, FAILED
    public string ReceivedAt { get; private set; } = default!;
    public string? ProcessedAt { get; private set; }
    public string? ErrorMessage { get; private set; }

    private GatewayRequest() { }

    public static GatewayRequest Create(string requestId, string source, string payloadJson)
    {
        return new GatewayRequest
        {
            RequestId = requestId,
            Source = source,
            PayloadJson = payloadJson,
            Status = "RECEIVED",
            ReceivedAt = DateTimeOffset.UtcNow.ToString("o")
        };
    }

    public void MarkProcessed()
    {
        Status = "PROCESSED";
        ProcessedAt = DateTimeOffset.UtcNow.ToString("o");
        Touch();
    }

    public void MarkFailed(string error)
    {
        Status = "FAILED";
        ErrorMessage = error;
        ProcessedAt = DateTimeOffset.UtcNow.ToString("o");
        Touch();
    }
}
