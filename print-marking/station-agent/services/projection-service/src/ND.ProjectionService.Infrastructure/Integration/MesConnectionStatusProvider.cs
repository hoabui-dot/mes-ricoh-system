using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using ND.ProjectionService.Application.Dtos;
using ND.ProjectionService.Application.Interfaces;

namespace ND.ProjectionService.Infrastructure.Integration;

public sealed class MesConnectionStatusProvider(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<MesConnectionStatusProvider> logger) : IMesConnectionStatusProvider
{
    private readonly string _gatewayUrl = (configuration["STATION_GATEWAY_URL"] ?? "http://station-gateway:5001").TrimEnd('/');

    public async Task<MesConnectionStatusDto> GetAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await httpClientFactory.CreateClient().GetAsync(
                $"{_gatewayUrl}/api/gateway/connection-status", cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                var payload = await response.Content.ReadFromJsonAsync<GatewayStatusPayload>(cancellationToken: cancellationToken);
                if (payload is not null) return payload.ToDto();
            }
            else logger.LogWarning("Station Gateway status returned HTTP {StatusCode}", response.StatusCode);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning("Station Gateway status unavailable at {GatewayUrl}: {Message}", _gatewayUrl, ex.Message);
        }

        return new MesConnectionStatusDto("MES", "OFFLINE", "HTTP", "UNAVAILABLE", "UNKNOWN", "UNKNOWN", "UNKNOWN",
            null, null, null, "Station Gateway status endpoint is unavailable.", 0, 0, 0, DateTimeOffset.UtcNow);
    }

    private sealed class GatewayStatusPayload
    {
        public string? Integration { get; set; }
        public string? Status { get; set; }
        public string? Protocol { get; set; }
        public GatewayDependencyPayload? StationGateway { get; set; }
        public DateTimeOffset? LastSuccessfulMesRequest { get; set; }
        public DateTimeOffset? LastMesRequest { get; set; }
        public GatewayErrorPayload? LastError { get; set; }
        public int RequestsLast24Hours { get; set; }
        public int SuccessfulRequestsLast24Hours { get; set; }
        public int FailedRequestsLast24Hours { get; set; }
        public DateTimeOffset ObservedAt { get; set; }

        public MesConnectionStatusDto ToDto() => new(
            Integration ?? "MES", Status ?? "UNKNOWN", Protocol ?? "HTTP",
            StationGateway?.Status ?? "UNKNOWN", StationGateway?.Database ?? "UNKNOWN",
            StationGateway?.Redis ?? "UNKNOWN", StationGateway?.Kafka ?? "UNKNOWN",
            LastSuccessfulMesRequest, LastMesRequest, LastError?.OccurredAt, LastError?.Message,
            RequestsLast24Hours, SuccessfulRequestsLast24Hours, FailedRequestsLast24Hours,
            ObservedAt == default ? DateTimeOffset.UtcNow : ObservedAt);
    }

    private sealed class GatewayDependencyPayload
    {
        public string? Status { get; set; }
        public string? Database { get; set; }
        public string? Redis { get; set; }
        public string? Kafka { get; set; }
    }

    private sealed class GatewayErrorPayload
    {
        public DateTimeOffset? OccurredAt { get; set; }
        public string? Message { get; set; }
    }
}
