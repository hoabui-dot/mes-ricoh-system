using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using ND.Infrastructure.Messaging;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Infrastructure.Persistence;
using ND.UnifiedContracts.Events;
using System.Text.Json;

namespace ND.PrinterAdapter.Infrastructure.Messaging;

/// <summary>
/// Background service that polls printer health every 15 seconds
/// and publishes PrinterHealthChangedEvent to RabbitMQ.
/// </summary>
public sealed class PrinterHealthService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IPrinterDriverFactory _driverFactory;
    private readonly IRabbitMqPublisher _publisher;
    private readonly ILogger<PrinterHealthService> _logger;

    private const string Exchange = "station.events";
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(15);

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public PrinterHealthService(
        IServiceScopeFactory scopeFactory,
        IPrinterDriverFactory driverFactory,
        IRabbitMqPublisher publisher,
        ILogger<PrinterHealthService> logger)
    {
        _scopeFactory = scopeFactory;
        _driverFactory = driverFactory;
        _publisher = publisher;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("PrinterHealthService started (poll every {Interval}s)", PollInterval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PollAllPrintersAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "PrinterHealthService poll error");
            }

            await Task.Delay(PollInterval, stoppingToken);
        }
    }

    private async Task PollAllPrintersAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PrinterDbContext>();
        var printers = await db.Printers.ToListAsync(ct);

        foreach (var printer in printers)
        {
            try
            {
                var driver = _driverFactory.Resolve(printer);
                var status = await driver.GetStatusAsync(ct);
                var statusStr = status.ToString();

                // Update DB status
                printer.UpdateStatus(statusStr);

                var healthEvent = PrinterHealthChangedEvent.Create(
                    printer.PrinterCode,
                    printer.DriverType,
                    statusStr,
                    printer.CupsQueueName
                );

                var json = JsonSerializer.Serialize(healthEvent, JsonOptions);
                await _publisher.PublishAsync(Exchange, JobEventRoutingKeys.PrinterHealthChanged, json, ct);

                _logger.LogDebug("Printer {Code} health: {Status}", printer.PrinterCode, statusStr);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Health check failed for printer {Code}", printer.PrinterCode);
            }
        }

        await db.SaveChangesAsync(ct);
    }
}
