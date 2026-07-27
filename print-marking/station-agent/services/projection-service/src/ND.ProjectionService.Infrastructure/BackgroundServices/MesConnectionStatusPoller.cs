using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.ProjectionService.Application.Interfaces;
using ND.ProjectionService.Infrastructure.SignalR;

namespace ND.ProjectionService.Infrastructure.BackgroundServices;

public sealed class MesConnectionStatusPoller(
    IMesConnectionStatusProvider provider,
    IHubContext<ProductionHub> hubContext,
    IConfiguration configuration,
    ILogger<MesConnectionStatusPoller> logger) : BackgroundService
{
    private readonly string _stationId = configuration["STATION_ID"] ?? string.Empty;
    private string? _lastFingerprint;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var status = await provider.GetAsync(stoppingToken);
                var fingerprint = JsonSerializer.Serialize(new
                {
                    status.Status, status.StationGatewayStatus, status.DatabaseStatus,
                    status.RedisStatus, status.KafkaStatus, status.LastSuccessfulMesRequest,
                    status.LastErrorAt, status.LastErrorMessage
                });
                if (_lastFingerprint != fingerprint)
                {
                    _lastFingerprint = fingerprint;
                    await hubContext.Clients.Group(_stationId)
                        .SendAsync("OnMesConnectionStatusChanged", status, stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "MES connection status poll failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
    }
}
