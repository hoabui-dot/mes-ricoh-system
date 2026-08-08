using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.ProjectionService.Application.Dtos;
using ND.ProjectionService.Application.Interfaces;
using ND.ProjectionService.Domain.Entities;
using ND.ProjectionService.Infrastructure.SignalR;
using ND.SharedKernel.Abstractions;

namespace ND.ProjectionService.Infrastructure.BackgroundServices;

/// <summary>
/// One-shot hosted service that runs once ~5s after startup.
/// Scans all device records and raises Warning alarms for any that are
/// already offline — ensuring the Alarm Center reflects real state
/// immediately on service restart, without waiting for new heartbeat timeouts.
/// </summary>
public sealed class StartupAlarmScanService : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<ProductionHub> _hubContext;
    private readonly ILogger<StartupAlarmScanService> _logger;
    private readonly string _stationId;

    public StartupAlarmScanService(
        IServiceScopeFactory scopeFactory,
        IHubContext<ProductionHub> hubContext,
        Microsoft.Extensions.Configuration.IConfiguration configuration,
        ILogger<StartupAlarmScanService> logger)
    {
        _scopeFactory = scopeFactory;
        _hubContext = hubContext;
        _logger = logger;
        _stationId = configuration["STATION_ID"] ?? "STATION-01";
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        // Fire-and-forget with a short startup delay so the DB is ready
        _ = RunScanAsync(cancellationToken);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task RunScanAsync(CancellationToken ct)
    {
        try
        {
            // Wait 5 seconds for DB migrations and connections to settle
            await Task.Delay(TimeSpan.FromSeconds(5), ct);

            _logger.LogInformation("StartupAlarmScanService: scanning for offline devices at startup...");

            await using var scope = _scopeFactory.CreateAsyncScope();
            var deviceRepo  = scope.ServiceProvider.GetRequiredService<IDeviceStatusRepository>();
            var alarmRepo   = scope.ServiceProvider.GetRequiredService<IAlarmRepository>();
            var unitOfWork  = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            var devices    = await deviceRepo.GetAllAsync(ct);
            var offlineDevices = devices.Where(d => !d.IsOnline).ToList();

            if (offlineDevices.Count == 0)
            {
                _logger.LogInformation("StartupAlarmScanService: all devices online — no startup alarms needed.");
                return;
            }

            int created = 0;
            int skipped = 0;
            var now = DateTime.UtcNow;

            foreach (var device in offlineDevices)
            {
                try
                {
                    // Dedup — skip if there is already an active unacknowledged alarm for this device
                    var existing = await alarmRepo.GetActiveByGroupKeyAsync(device.DeviceId, ct);
                    if (existing != null)
                    {
                        skipped++;
                        _logger.LogDebug(
                            "StartupAlarmScanService: skipping {DeviceId} — active alarm {AlarmId} already exists.",
                            device.DeviceId, existing.Id);
                        continue;
                    }

                    var alarm = Alarm.Create(
                        severity: "Warning",
                        source: "System",
                        message: $"[Khởi động] Thiết bị {device.DeviceId} ({device.DeviceType}) đang offline khi hệ thống khởi động.",
                        deviceId: device.DeviceId,
                        deviceName: device.DeviceType,
                        alarmType: "DeviceConnection",
                        alarmGroupKey: device.DeviceId,
                        productionOrderId: null
                    );

                    await alarmRepo.AddAsync(alarm, ct);
                    created++;

                    _logger.LogWarning(
                        "StartupAlarmScanService: created startup alarm for offline device {DeviceId}. AlarmId={AlarmId}",
                        device.DeviceId, alarm.Id);

                    // Push to SignalR so the kiosk UI Alarm Center updates immediately
                    var dto = ToDto(alarm);
                    await _hubContext.Clients.Group(_stationId).SendAsync("OnAlarmRaised", dto, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "StartupAlarmScanService: failed to process device {DeviceId}", device.DeviceId);
                }
            }

            await unitOfWork.SaveChangesAsync(ct);

            _logger.LogInformation(
                "StartupAlarmScanService: scan complete. Offline={OfflineCount}, AlarmsCreated={Created}, Skipped={Skipped}.",
                offlineDevices.Count, created, skipped);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("StartupAlarmScanService: cancelled during startup scan.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "StartupAlarmScanService: unexpected error during startup scan.");
        }
    }

    private static AlarmDto ToDto(Alarm a) => new(
        a.Id, a.AlarmType, a.AlarmGroupKey, a.Severity, a.Source, a.Message,
        a.DeviceId, a.DeviceName, a.ProductionOrderId,
        a.IsAcknowledged, a.CurrentState,
        a.AcknowledgedBy, a.AcknowledgedAt,
        a.FirstOccurredAt, a.LastOccurredAt, a.RepeatCount, a.ResolvedAt, a.CreatedAt);
}
