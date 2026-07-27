using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Diagnostics;
using ND.Infrastructure.Messaging;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Infrastructure.Persistence;
using ND.UnifiedContracts.Events;

namespace ND.PrinterAdapter.Infrastructure.Messaging;

/// <summary>Publishes periodic heartbeats and status transitions without flooding the broker.</summary>
public sealed class PrinterHeartbeatPublisher : BackgroundService
{
    private const string Exchange = "station.events";
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IPrinterDriverFactory _drivers;
    private readonly IEventPublisher _publisher;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PrinterHeartbeatPublisher> _logger;
    private readonly string _adapterId;

    public PrinterHeartbeatPublisher(
        IServiceScopeFactory scopeFactory,
        IPrinterDriverFactory drivers,
        IEventPublisher publisher,
        IConfiguration configuration,
        ILogger<PrinterHeartbeatPublisher> logger)
    {
        _scopeFactory = scopeFactory;
        _drivers = drivers;
        _publisher = publisher;
        _configuration = configuration;
        _logger = logger;
        _adapterId = configuration["KAFKA_CONNECTION_NAME"]
                     ?? configuration["PrinterAdapter:AdapterId"]
                     ?? "PRINT-ADAPTER-01";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(_configuration.GetValue("PrinterAdapter:HeartbeatIntervalSeconds", 15));
        _logger.LogInformation(
            "[PRINTER-HEARTBEAT] started adapter={AdapterId} processId={ProcessId} intervalSeconds={IntervalSeconds}",
            _adapterId, Environment.ProcessId, interval.TotalSeconds);
        while (!stoppingToken.IsCancellationRequested)
        {
            var cycle = Stopwatch.StartNew();
            try { await PublishCycleAsync(stoppingToken); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            { _logger.LogWarning(ex, "[PRINTER-HEARTBEAT] cycle failed adapter={AdapterId} elapsedMs={ElapsedMs}; Kafka publisher will reconnect.", _adapterId, cycle.ElapsedMilliseconds); }

            _logger.LogInformation("[PRINTER-HEARTBEAT] cycle complete adapter={AdapterId} elapsedMs={ElapsedMs} nextCycleInSeconds={IntervalSeconds}",
                _adapterId, cycle.ElapsedMilliseconds, interval.TotalSeconds);

            await Task.Delay(interval, stoppingToken);
        }
    }

    private async Task PublishCycleAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PrinterDbContext>();
        var printers = await db.Printers.ToListAsync(ct);
        _logger.LogInformation("[PRINTER-HEARTBEAT] probing printerCount={PrinterCount}", printers.Count);

        foreach (var printer in printers)
        {
            var probe = Stopwatch.StartNew();
            var previous = printer.Status;
            string status;
            _logger.LogInformation("[PRINTER-PROBE] begin code={PrinterCode} driver={Driver} host={Host} port={Port} previousStatus={PreviousStatus}",
                printer.PrinterCode, printer.DriverType, printer.IpAddress, printer.Port, previous);
            try
            {
                var driverStatus = await _drivers.Resolve(printer).GetStatusAsync(ct);
                status = Normalize(driverStatus);
                _logger.LogInformation("[PRINTER-PROBE] result code={PrinterCode} driverStatus={DriverStatus} normalizedStatus={Status} previousStatus={PreviousStatus} changed={Changed} elapsedMs={ElapsedMs}",
                    printer.PrinterCode, driverStatus, status, previous,
                    !string.Equals(previous, status, StringComparison.OrdinalIgnoreCase), probe.ElapsedMilliseconds);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[PRINTER-PROBE] failed code={PrinterCode} driver={Driver} elapsedMs={ElapsedMs} result=OFFLINE",
                    printer.PrinterCode, printer.DriverType, probe.ElapsedMilliseconds);
                status = "OFFLINE";
            }

            var timestamp = DateTimeOffset.UtcNow.ToString("o");
            printer.UpdateStatus(status);
            var details = new { driver = printer.DriverType, host = printer.IpAddress, port = printer.Port };
            var heartbeat = new PrinterHeartbeatEvent
            {
                EventId = $"evt-printer-heartbeat-{Guid.NewGuid():N}",
                PrinterId = printer.Id,
                PrinterCode = printer.PrinterCode,
                AdapterId = _adapterId,
                Status = status,
                Timestamp = timestamp,
                Details = details
            };
            await _publisher.PublishAsync(Exchange, JobEventRoutingKeys.PrinterHeartbeat,
                JsonSerializer.Serialize(heartbeat));
            _logger.LogInformation("[PRINTER-EVENT] heartbeat published code={PrinterCode} status={Status} previousStatus={PreviousStatus} elapsedMs={ElapsedMs}",
                printer.PrinterCode, status, previous, probe.ElapsedMilliseconds);

            if (!string.Equals(previous, status, StringComparison.OrdinalIgnoreCase))
            {
                var statusEvent = new PrinterStatusChangedEvent
                {
                    EventId = $"evt-printer-status-{Guid.NewGuid():N}",
                    PrinterId = printer.Id,
                    PrinterCode = printer.PrinterCode,
                    AdapterId = _adapterId,
                    Status = status,
                    PreviousStatus = previous,
                    Timestamp = timestamp,
                    Details = details
                };
                await _publisher.PublishAsync(Exchange, JobEventRoutingKeys.PrinterStatusChanged,
                    JsonSerializer.Serialize(statusEvent));
                _logger.LogWarning("[PRINTER-EVENT] status changed code={PrinterCode} previousStatus={PreviousStatus} status={Status}",
                    printer.PrinterCode, previous, status);
            }
        }

        await db.SaveChangesAsync(ct);
    }

    private static string Normalize(PrinterDriverStatus status) => status switch
    {
        PrinterDriverStatus.Online or PrinterDriverStatus.Busy or PrinterDriverStatus.Printing or PrinterDriverStatus.Waiting => "ONLINE",
        PrinterDriverStatus.Warning or PrinterDriverStatus.PaperOut or PrinterDriverStatus.RibbonOut or PrinterDriverStatus.HeadOpen or PrinterDriverStatus.Error => "ERROR",
        _ => "OFFLINE"
    };
}
