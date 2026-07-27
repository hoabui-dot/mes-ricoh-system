namespace ND.ProjectionService.Application.Dtos;

public sealed record MesConnectionStatusDto(
    string Integration,
    string Status,
    string Protocol,
    string StationGatewayStatus,
    string DatabaseStatus,
    string RedisStatus,
    string KafkaStatus,
    DateTimeOffset? LastSuccessfulMesRequest,
    DateTimeOffset? LastMesRequest,
    DateTimeOffset? LastErrorAt,
    string? LastErrorMessage,
    int RequestsLast24Hours,
    int SuccessfulRequestsLast24Hours,
    int FailedRequestsLast24Hours,
    DateTimeOffset ObservedAt);
