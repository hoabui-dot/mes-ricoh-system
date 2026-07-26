namespace ND.StationGateway.Domain.Exceptions;

public abstract class GatewayException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

public sealed class InvalidPayloadException(string reason)
    : GatewayException("INVALID_PAYLOAD", $"Gateway request payload is invalid: {reason}");

public sealed class DuplicateRequestException(string requestId)
    : GatewayException("DUPLICATE_REQUEST", $"Request '{requestId}' was already processed.");
