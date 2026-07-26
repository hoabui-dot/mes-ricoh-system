using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
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
/// Polls every 3 seconds for device heartbeat timeouts.
/// Rules:
///  1. Only raises alarms for devices while an active production job is running.
///  2. Deduplicates: one active alarm per device — subsequent timeouts bump repeat_count only.
///  3. No SignalR broadcast on repeat — only on the first alarm creation.
/// </summary>
public sealed class DeviceStatusPoller : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<ProductionHub> _hubContext;
    private readonly ILogger<DeviceStatusPoller> _logger;
    private readonly string _stationId;

    public DeviceStatusPoller(
        IServiceScopeFactory scopeFactory,
        IHubContext<ProductionHub> hubContext,
        IConfiguration configuration,
        ILogger<DeviceStatusPoller> logger)
    {
        _scopeFactory = scopeFactory;
        _hubContext = hubContext;
        _logger = logger;
        _stationId = configuration["STATION_ID"] ?? "STATION-01";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("DeviceStatusPoller starting. StationId={StationId}, interval=3s.", _stationId);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await MonitorHeartbeatTimeoutsAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error during device heartbeat timeout check");
            }

            await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
        }
    }

    private async Task MonitorHeartbeatTimeoutsAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var repo       = scope.ServiceProvider.GetRequiredService<IDeviceStatusRepository>();
        var alarmRepo  = scope.ServiceProvider.GetRequiredService<IAlarmRepository>();
        var productionRepo = scope.ServiceProvider.GetRequiredService<IProductionViewRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        // ── Req #1: Active production guard ────────────────────────────────────
        // Only raise device alarms when the station has an active job.
        var productionView = await productionRepo.GetByStationIdAsync(_stationId, ct);
        var activeStatuses = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "QUEUED", "PROCESSING", "PRINTING", "VERIFYING" };
        bool productionActive = productionView != null
            && activeStatuses.Contains(productionView.JobStatus);

        var devices = await repo.GetAllAsync(ct);
        var now = DateTime.UtcNow;
        var hasChanges = false;

        foreach (var device in devices)
        {
            if (!device.IsOnline) continue;
            if (!DateTime.TryParse(device.LastSeenAt, out var lastSeen)) continue;
            if ((now - lastSeen).TotalSeconds <= 10) continue;

            // Device timed out — mark offline
            _logger.LogWarning(
                "Device {DeviceId} heartbeat timeout (>10s). Marking Offline. ProductionActive={ProductionActive}",
                device.DeviceId, productionActive);

            device.UpdateStatus(false, device.LastSeenAt, "Offline");
            await repo.UpdateAsync(device, ct);
            hasChanges = true;

            // ── Req #1: Skip alarm if no active production ─────────────────────
            if (!productionActive)
            {
                _logger.LogInformation(
                    "Skipping alarm for idle device {DeviceId} — no active production job.", device.DeviceId);

                // Still push status update so UI reflects offline state
                var offlineDto = new DeviceStatusDto(
                    device.DeviceId, device.DeviceType, device.IsOnline, device.LastSeenAt, device.LifecycleState);
                await _hubContext.Clients.Group(_stationId).SendAsync("OnDeviceStatusUpdate", offlineDto, ct);
                continue;
            }

            // ── Req #2 & #3: Deduplication ─────────────────────────────────────
            bool isNewAlarm;
            try
            {
                var existingAlarm = await alarmRepo.GetActiveByGroupKeyAsync(device.DeviceId, ct);

                if (existingAlarm != null)
                {
                    // Already an active unacknowledged alarm for this device — just update repeat
                    existingAlarm.UpdateRepeat(now.ToString("o"));
                    await alarmRepo.UpdateAsync(existingAlarm, ct);
                    isNewAlarm = false;
                    _logger.LogDebug(
                        "Alarm dedup: updated existing alarm for {DeviceId}, RepeatCount={RepeatCount}",
                        device.DeviceId, existingAlarm.RepeatCount);
                }
                else
                {
                    // First timeout for this device — create new alarm
                    var alarm = Alarm.Create(
                        severity: "Critical",
                        source: "Device",
                        message: $"Thiết bị {device.DeviceId} ({device.DeviceType}) đã mất kết nối heartbeat!",
                        deviceId: device.DeviceId,
                        deviceName: device.DeviceType,
                        alarmType: "DeviceConnection",
                        alarmGroupKey: device.DeviceId,
                        productionOrderId: productionView?.JobId
                    );
                    await alarmRepo.AddAsync(alarm, ct);
                    isNewAlarm = true;
                    _logger.LogWarning(
                        "New alarm created for device {DeviceId}. AlarmId={AlarmId}", device.DeviceId, alarm.Id);

                    // ── Req #11: Only broadcast on NEW alarm ───────────────────
                    var alarmDto = ToDto(alarm);
                    await _hubContext.Clients.Group(_stationId).SendAsync("OnAlarmRaised", alarmDto, ct);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to process alarm for device {DeviceId}", device.DeviceId);
                isNewAlarm = false;
            }

            // Always push device status update
            var dto = new DeviceStatusDto(
                device.DeviceId, device.DeviceType, device.IsOnline, device.LastSeenAt, device.LifecycleState);
            await _hubContext.Clients.Group(_stationId).SendAsync("OnDeviceStatusUpdate", dto, ct);

            _ = isNewAlarm; // used for logging context above
        }

        if (hasChanges)
            await unitOfWork.SaveChangesAsync(ct);
    }

    private static AlarmDto ToDto(Alarm a) => new(
        a.Id, a.AlarmType, a.AlarmGroupKey, a.Severity, a.Source, a.Message,
        a.DeviceId, a.DeviceName, a.ProductionOrderId,
        a.IsAcknowledged, a.CurrentState,
        a.AcknowledgedBy, a.AcknowledgedAt,
        a.FirstOccurredAt, a.LastOccurredAt, a.RepeatCount, a.ResolvedAt, a.CreatedAt);
}
