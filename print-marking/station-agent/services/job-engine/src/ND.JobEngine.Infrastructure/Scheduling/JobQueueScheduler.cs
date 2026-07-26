using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Domain.Entities;
using ND.JobEngine.Domain.Enums;
using ND.SharedKernel.Abstractions;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Infrastructure.Scheduling;

public record PrinterDetailDto(
    string PrinterCode,
    string DisplayName,
    int Port,
    string IpAddress,
    string Status,
    bool IsActiveForWork);

/// <summary>
/// Polls the job queue every 1.5 s and dispatches pending Production Orders to the Printer Adapter
/// using the new batch-print pipeline:
///
///   QUEUED/WAITING jobs
///     → grouped by Production Order (JobNo)
///     → entire PO transitions to PREPARING
///     → ONE ProductionBatchPrintCommand published to RabbitMQ (command.printer.print.batch)
///     → Printer Adapter renders ALL ZPL in one pass, sends ONE TCP/CUPS request
///
/// Single-label manual reprints still flow through ProcessJobHandler / command.printer.print.
/// </summary>
public sealed class JobQueueScheduler : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<JobQueueScheduler> _logger;
    private readonly HttpClient _httpClient;

    // Configurable via appsettings PrintBatch:ChunkSize (default 100 labels per ZPL chunk)
    private int _chunkSize = 100;

    public JobQueueScheduler(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<JobQueueScheduler> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
        _httpClient = new HttpClient();
        _chunkSize = configuration.GetValue<int>("PrintBatch:ChunkSize", 100);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Job Queue Scheduler starting (batch-print mode, chunk={Chunk})...", _chunkSize);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessQueueAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error processing job queue scheduler loop");
            }

            await Task.Delay(1500, stoppingToken);
        }
    }

    private async Task ProcessQueueAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var jobRepository       = scope.ServiceProvider.GetRequiredService<IJobRepository>();
        var itemRepository      = scope.ServiceProvider.GetRequiredService<IProductionItemRepository>();
        var historyRepository   = scope.ServiceProvider.GetRequiredService<IJobHistoryRepository>();
        var transitionRepository = scope.ServiceProvider.GetRequiredService<IJobStateTransitionRepository>();
        var outboxRepository    = scope.ServiceProvider.GetRequiredService<IJobEngineOutboxRepository>();
        var unitOfWork          = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        // ── 1. Fetch QUEUED and WAITING jobs ────────────────────────────────────
        var queuedJobs  = await jobRepository.GetByStatusAsync(JobStatus.Queued,  cancellationToken);
        var waitingJobs = await jobRepository.GetByStatusAsync(JobStatus.Waiting, cancellationToken);
        var allPendingJobs = queuedJobs.Concat(waitingJobs)
            .OrderBy(j => j.CreatedAt)
            .ThenByDescending(j => j.Priority)
            .ToList();

        if (!allPendingJobs.Any()) return;

        // ── 2. Timeout check: fail any job queued/waiting > 60 s ────────────────
        var now = DateTime.UtcNow;
        var timeoutJobs   = new List<Job>();
        var remainingJobs = new List<Job>();

        foreach (var job in allPendingJobs)
        {
            if (DateTime.TryParse(job.CreatedAt, out var createdAt) &&
                (now - createdAt).TotalSeconds > 60)
            {
                timeoutJobs.Add(job);
            }
            else
            {
                remainingJobs.Add(job);
            }
        }

        foreach (var job in timeoutJobs)
        {
            _logger.LogWarning("Job {JobId} ({JobNo}) timed out in queue (>60 s). Marking FAILED.", job.Id, job.JobNo);
            var oldStatus = job.CurrentStatus;
            job.Fail("QUEUE_TIMEOUT", "Yêu cầu trong hàng đợi quá 60 giây (lỗi timeout).");
            await jobRepository.UpdateAsync(job, cancellationToken);

            await historyRepository.AddAsync(JobHistory.Record(
                job.Id, oldStatus, JobStatus.Failed, "TIMEOUT_IN_QUEUE",
                performedBy: "system",
                note: "Yêu cầu trong hàng đợi quá 60 giây (lỗi timeout)."), cancellationToken);

            await transitionRepository.AddAsync(
                JobStateTransition.Record(job.Id, oldStatus, JobStatus.Failed, "TIMEOUT_IN_QUEUE"),
                cancellationToken);
        }

        if (timeoutJobs.Any())
            await unitOfWork.SaveChangesAsync(cancellationToken);

        if (!remainingJobs.Any()) return;

        // ── 3. Discover active printers ──────────────────────────────────────────
        var adapterUrl = _configuration["PRINTER_ADAPTER_URL"] ?? "http://printer-adapter:5003";
        List<PrinterDetailDto>? activePrinters = null;
        try
        {
            activePrinters = await _httpClient.GetFromJsonAsync<List<PrinterDetailDto>>(
                $"{adapterUrl}/api/printers/active", cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Failed to fetch active printers from printer-adapter: {Message}", ex.Message);
        }

        // ── 4. No active printers → fail all pending jobs ────────────────────────
        if (activePrinters == null || !activePrinters.Any())
        {
            _logger.LogWarning("No active printer devices found. Failing all pending jobs.");
            foreach (var job in remainingJobs)
            {
                var oldStatus = job.CurrentStatus;
                job.Fail("NO_ACTIVE_PRINTER", "Không có thiết bị máy in nào được kích hoạt trong hệ thống.");
                await jobRepository.UpdateAsync(job, cancellationToken);

                await historyRepository.AddAsync(JobHistory.Record(
                    job.Id, oldStatus, JobStatus.Failed, "NO_ACTIVE_PRINTER",
                    performedBy: "system",
                    note: "Không có thiết bị máy in nào được kích hoạt."), cancellationToken);

                await transitionRepository.AddAsync(
                    JobStateTransition.Record(job.Id, oldStatus, JobStatus.Failed, "NO_ACTIVE_PRINTER"),
                    cancellationToken);
            }
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return;
        }

        // ── 5. Find idle printers ────────────────────────────────────────────────
        // A printer is busy if ANY job is currently PROCESSING or PREPARING on it.
        var preparingJobs  = await jobRepository.GetByStatusAsync(JobStatus.Preparing,  cancellationToken);
        var processingJobs = await jobRepository.GetByStatusAsync(JobStatus.Processing, cancellationToken);
        var busyPrinterCodes = preparingJobs.Concat(processingJobs)
            .Select(j => j.AssignedPrinter)
            .Where(p => p != null)
            .ToHashSet();

        var idlePrinters = activePrinters
            .Where(p => p.Status.Equals("ONLINE", StringComparison.OrdinalIgnoreCase)
                     && !busyPrinterCodes.Contains(p.PrinterCode))
            .ToList();

        // ── 6. All printers busy → move QUEUED → WAITING ─────────────────────────
        if (!idlePrinters.Any())
        {
            _logger.LogInformation("All active printers are busy. Moving QUEUED jobs to WAITING.");
            foreach (var job in remainingJobs.Where(j => j.CurrentStatus == JobStatus.Queued))
            {
                job.SetWaiting();
                await jobRepository.UpdateAsync(job, cancellationToken);

                await historyRepository.AddAsync(JobHistory.Record(
                    job.Id, JobStatus.Queued, JobStatus.Waiting, "MARK_WAITING",
                    performedBy: "system",
                    note: "Tất cả máy in bận. Chuyển sang trạng thái chờ."), cancellationToken);

                await transitionRepository.AddAsync(
                    JobStateTransition.Record(job.Id, JobStatus.Queued, JobStatus.Waiting, "MARK_WAITING"),
                    cancellationToken);
            }
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return;
        }

        // ── 7. Dispatch batch per Production Order ────────────────────────────────
        // Group all pending jobs by JobNo (Production Order).
        // Each group is dispatched as ONE ProductionBatchPrintCommand to an idle printer.
        var jobsByOrder = remainingJobs
            .GroupBy(j => j.JobNo)
            .OrderBy(g => g.Min(j => j.CreatedAt))
            .ToList();

        int printerIndex = 0;
        foreach (var orderGroup in jobsByOrder)
        {
            if (printerIndex >= idlePrinters.Count) break;

            var printer   = idlePrinters[printerIndex++];
            var orderJobs = orderGroup.ToList();
            var jobNo     = orderGroup.Key;

            _logger.LogInformation(
                "Scheduler: Dispatching Production Order {OrderNo} ({Count} labels) as batch to printer {Printer}",
                jobNo, orderJobs.Count, printer.PrinterCode);

            // a) Assign printer + transition all jobs → PREPARING
            foreach (var job in orderJobs)
            {
                var oldStatus = job.CurrentStatus;
                job.AssignPrinter(printer.PrinterCode);
                job.SetPreparing();
                await jobRepository.UpdateAsync(job, cancellationToken);

                await historyRepository.AddAsync(JobHistory.Record(
                    job.Id, oldStatus, JobStatus.Preparing, "BATCH_PREPARING",
                    performedBy: "system",
                    note: $"Chuẩn bị in hàng loạt — {orderJobs.Count} nhãn cho đơn {jobNo}."),
                    cancellationToken);

                await transitionRepository.AddAsync(
                    JobStateTransition.Record(job.Id, oldStatus, JobStatus.Preparing, "BATCH_PREPARING"),
                    cancellationToken);

                // Update production item status
                var items = await itemRepository.GetByOrderNoAsync(job.JobNo, cancellationToken);
                var item = items.FirstOrDefault(i => i.CurrentJobId == job.Id);
                if (item != null)
                {
                    item.StartProcessing();
                    await itemRepository.UpdateAsync(item, cancellationToken);
                }
            }

            // b) Publish ProductionPreparingEvent via outbox
            var preparingEvent = ProductionPreparingEvent.Create(jobNo, orderJobs[0].ProductCode, orderJobs.Count);
            var preparingOutbox = JobEngineOutboxEvent.Create(
                nameof(ProductionPreparingEvent),
                jobNo,
                preparingEvent.EventType,
                JobEventRoutingKeys.Preparing,
                JsonSerializer.Serialize(preparingEvent));
            await outboxRepository.AddAsync(preparingOutbox, cancellationToken);

            // c) Determine dispatch target from first job's payload
            var dispatchTarget = ExtractDispatchTarget(orderJobs[0].PayloadJson) ?? "simulation";

            // d) Build label items list (sequence = position in the order)
            var labelItems = orderJobs
                .Select((j, idx) => new BatchLabelItem
                {
                    JobId = j.Id,
                    ProductSerial = j.ProductSerial,
                    Sequence = idx + 1
                })
                .ToList();

            // e) Publish ProductionBatchPrintCommand via outbox
            var batchCmd = ProductionBatchPrintCommand.Create(
                productionOrderNo: jobNo,
                jobType: orderJobs[0].JobType,
                productCode: orderJobs[0].ProductCode,
                payloadJson: orderJobs[0].PayloadJson,
                targetPrinter: printer.PrinterCode,
                dispatchTarget: dispatchTarget,
                labelItems: labelItems,
                batchSize: _chunkSize);

            var batchOutbox = JobEngineOutboxEvent.Create(
                nameof(ProductionBatchPrintCommand),
                jobNo,
                batchCmd.EventType,
                JobEventRoutingKeys.BatchPrint,
                JsonSerializer.Serialize(batchCmd));
            await outboxRepository.AddAsync(batchOutbox, cancellationToken);

            _logger.LogInformation(
                "Scheduler: ProductionBatchPrintCommand queued for {OrderNo} — {Count} labels → printer {Printer}",
                jobNo, labelItems.Count, printer.PrinterCode);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static string? ExtractDispatchTarget(string? payloadJson)
    {
        if (string.IsNullOrEmpty(payloadJson)) return null;
        try
        {
            using var doc  = JsonDocument.Parse(payloadJson);
            var root = doc.RootElement;
            if (root.TryGetProperty("data", out var dataArr) && dataArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in dataArr.EnumerateArray())
                {
                    var tag = item.TryGetProperty("tag", out var tProp) ? tProp.GetString() : null;
                    var val = item.TryGetProperty("value", out var vProp) ? vProp.GetString() : null;
                    if (string.Equals(tag, "dispatch_target", StringComparison.OrdinalIgnoreCase))
                        return val;
                }
            }
        }
        catch { /* ignore */ }
        return null;
    }
}
