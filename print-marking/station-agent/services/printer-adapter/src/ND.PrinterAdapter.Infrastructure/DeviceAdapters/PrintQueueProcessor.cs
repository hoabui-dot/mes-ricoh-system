using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Infrastructure.Persistence;

namespace ND.PrinterAdapter.Infrastructure.DeviceAdapters;

public sealed class PrintQueueProcessor : BackgroundService
{
    private readonly PrintQueue _queue;
    private readonly IPrinterDriverFactory _driverFactory;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PrintQueueProcessor> _logger;

    public PrintQueueProcessor(
        IPrintQueue queue,
        IPrinterDriverFactory driverFactory,
        IServiceScopeFactory scopeFactory,
        ILogger<PrintQueueProcessor> logger)
    {
        _queue = (PrintQueue)queue;
        _driverFactory = driverFactory;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Print Queue Processor starting...");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var job = await _queue.Reader.ReadAsync(stoppingToken);
                await ProcessPrintJobAsync(job, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Print Queue Processor loop.");
            }
        }

        _logger.LogInformation("Print Queue Processor stopped.");
    }

    private async Task ProcessPrintJobAsync(PrintJob job, CancellationToken ct)
    {
        _logger.LogInformation(
            "Processing print job — Printer={PrinterCode}, Driver={DriverType}, JobId={JobId}",
            job.PrinterCode, job.DriverType ?? "simulation", job.JobId);

        // Resolve the correct driver for this job
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PrinterDbContext>();
        var printer = await db.Printers.FirstOrDefaultAsync(
            p => p.PrinterCode == job.PrinterCode, ct);

        IPrinterDriver driver;
        if (printer is not null)
        {
            driver = _driverFactory.Resolve(printer);
        }
        else
        {
            // Fallback: use driver type from the job itself
            driver = _driverFactory.ResolveByType(
                job.DriverType ?? "simulation",
                job.IpAddress,
                job.Port,
                job.CupsQueueName);
        }

        const int MaxRetries = 3;
        var attempt = 0;
        PrintResult? lastResult = null;

        while (attempt <= MaxRetries && !ct.IsCancellationRequested)
        {
            var status = await driver.GetStatusAsync(ct);

            // Phase 8: Non-retryable hardware conditions (operator intervention required)
            if (status == PrinterDriverStatus.PaperOut)
            {
                lastResult = PrintResult.Fail("PAPER_OUT", "Media/paper is out. Operator intervention required.", isRecoverable: false, isRetryable: false);
                break;
            }
            if (status == PrinterDriverStatus.RibbonOut)
            {
                lastResult = PrintResult.Fail("RIBBON_OUT", "Ribbon is out. Operator intervention required.", isRecoverable: false, isRetryable: false);
                break;
            }
            if (status == PrinterDriverStatus.HeadOpen)
            {
                lastResult = PrintResult.Fail("HEAD_OPEN", "Print head is open. Close the head before continuing.", isRecoverable: false, isRetryable: false);
                break;
            }

            // Phase 8: Thermal Warning logic — pause/delay printing until status cools down
            if (status == PrinterDriverStatus.ThermalWarning)
            {
                _logger.LogWarning("Printer {Code} is overheating (Thermal Warning). Pausing print thread...", job.PrinterCode);
                await Task.Delay(2000, ct);
                continue; // Do not increment attempt count, check status again
            }

            if (attempt > 0)
            {
                _logger.LogInformation("Retry {Attempt}/{Max} for printer {Code}", attempt, MaxRetries, job.PrinterCode);
                
                // Phase 8: Buffer Full — retry quickly at 500ms
                if (status == PrinterDriverStatus.BufferFull)
                {
                    _logger.LogWarning("Printer {Code} reports Buffer Full. Retrying in 500ms...", job.PrinterCode);
                    await Task.Delay(500, ct);
                }
                else
                {
                    await Task.Delay(1000 * attempt, ct);
                }
            }

            try
            {
                lastResult = await driver.PrintAsync(job.Content, ct);
                if (lastResult.Success)
                    break;

                // Non-retryable: bail out immediately
                if (!lastResult.IsRetryable)
                {
                    _logger.LogError("Non-retryable print error [{Code}]: {Msg}", lastResult.ErrorCode, lastResult.ErrorMessage);
                    break;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Exception on attempt {Attempt} for {Code}", attempt, job.PrinterCode);
                lastResult = PrintResult.Fail("EXCEPTION", ex.Message, isRecoverable: true, isRetryable: true);
            }

            attempt++;
        }

        var success = lastResult?.Success ?? false;

        if (success)
        {
            _logger.LogInformation("Print job succeeded for {Code} in {Ms}ms", job.PrinterCode, lastResult!.DurationMs);
            job.CompletionSource.TrySetResult(true);
        }
        else
        {
            _logger.LogError("Print job failed for {Code} after {Attempts} attempts. Error: [{Code2}] {Msg}",
                job.PrinterCode, attempt, lastResult?.ErrorCode, lastResult?.ErrorMessage);
            job.CompletionSource.TrySetResult(false);
        }
    }
}
