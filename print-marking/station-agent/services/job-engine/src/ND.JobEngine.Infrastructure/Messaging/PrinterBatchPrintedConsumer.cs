using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Domain.Entities;
using ND.JobEngine.Domain.Enums;
using ND.SharedKernel.Abstractions;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Infrastructure.Messaging;

/// <summary>
/// Consumes <see cref="ProductionBatchPrintedEvent"/> from the Printer Adapter
/// and marks every job in the batch as COMPLETED (or FAILED on partial failure).
///
/// This is the batch-path counterpart of <see cref="PrinterPrintedConsumer"/>,
/// which handles single-label manual reprints.
///
/// Exchange:    station.events
/// Queue:       job-engine.batch-printed-events
/// Pattern:     printer.batch.printed
/// </summary>
public sealed class PrinterBatchPrintedConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqConsumer _consumer;
    private readonly ILogger<PrinterBatchPrintedConsumer> _logger;

    private const string Exchange = "station.events";
    private const string Queue   = "job-engine.batch-printed-events";
    private const string Pattern = "printer.batch.printed";

    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNameCaseInsensitive = true };

    public PrinterBatchPrintedConsumer(
        IServiceScopeFactory scopeFactory,
        IRabbitMqConsumer consumer,
        ILogger<PrinterBatchPrintedConsumer> logger)
    {
        _scopeFactory = scopeFactory;
        _consumer     = consumer;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "PrinterBatchPrintedConsumer starting. exchange={Exchange} queue={Queue} pattern={Pattern}",
            Exchange, Queue, Pattern);

        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: Queue,
            routingKeyPattern: Pattern,
            onMessage: (_, json) => HandleMessageAsync(json, stoppingToken),
            cancellationToken: stoppingToken);

        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
    }

    private async Task HandleMessageAsync(string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Job Engine received batch-printed event.");

        ProductionBatchPrintedEvent? evt;
        try
        {
            evt = JsonSerializer.Deserialize<ProductionBatchPrintedEvent>(payloadJson, JsonOpts);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialise ProductionBatchPrintedEvent");
            throw;
        }

        if (evt is null)
        {
            _logger.LogWarning("Received null ProductionBatchPrintedEvent — skipping.");
            return;
        }

        _logger.LogInformation(
            "Processing batch result: PO={OrderNo} Succeeded={Succeeded} Failed={Failed}",
            evt.ProductionOrderNo, evt.SucceededJobIds.Count, evt.FailedJobIds.Count);

        using var scope = _scopeFactory.CreateScope();
        var jobRepo         = scope.ServiceProvider.GetRequiredService<IJobRepository>();
        var historyRepo     = scope.ServiceProvider.GetRequiredService<IJobHistoryRepository>();
        var transitionRepo  = scope.ServiceProvider.GetRequiredService<IJobStateTransitionRepository>();
        var outboxRepo      = scope.ServiceProvider.GetRequiredService<IJobEngineOutboxRepository>();
        var itemRepo        = scope.ServiceProvider.GetRequiredService<IProductionItemRepository>();
        var orderRepo       = scope.ServiceProvider.GetRequiredService<IProductionOrderRepository>();
        var unitOfWork      = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var distLock        = scope.ServiceProvider.GetRequiredService<IDistributedLock>();

        // ── Process each succeeded job ───────────────────────────────────────────
        foreach (var jobId in evt.SucceededJobIds)
        {
            await CompleteJobAsync(
                jobId, evt.ProductionOrderNo,
                jobRepo, historyRepo, transitionRepo, outboxRepo, itemRepo,
                distLock, cancellationToken);
        }

        // ── Process each failed job ──────────────────────────────────────────────
        foreach (var jobId in evt.FailedJobIds)
        {
            await FailJobAsync(
                jobId, evt.ProductionOrderNo, evt.ErrorMessage,
                jobRepo, historyRepo, transitionRepo, outboxRepo, itemRepo,
                distLock, cancellationToken);
        }

        // ── Check production order completion ────────────────────────────────────
        await CheckOrderCompletionAsync(
            evt.ProductionOrderNo, itemRepo, orderRepo, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Batch-print result applied for PO={OrderNo}.", evt.ProductionOrderNo);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private async Task CompleteJobAsync(
        string jobId,
        string jobNo,
        IJobRepository jobRepo,
        IJobHistoryRepository historyRepo,
        IJobStateTransitionRepository transitionRepo,
        IJobEngineOutboxRepository outboxRepo,
        IProductionItemRepository itemRepo,
        IDistributedLock distLock,
        CancellationToken ct)
    {
        await using var lk = await distLock.TryAcquireAsync($"lock:job:{jobId}", TimeSpan.FromSeconds(30), ct);
        if (lk is null)
        {
            _logger.LogWarning("Could not acquire lock for job {JobId} — skipping completion.", jobId);
            return;
        }

        var job = await jobRepo.GetByIdAsync(jobId, ct);
        if (job is null)
        {
            _logger.LogWarning("Job {JobId} not found — skipping completion.", jobId);
            return;
        }

        if (job.CurrentStatus == JobStatus.Completed || job.CurrentStatus == JobStatus.Failed)
        {
            _logger.LogInformation("Job {JobId} already in terminal state {Status}.", jobId, job.CurrentStatus);
            return;
        }

        var oldStatus = job.CurrentStatus;

        // Batch jobs go PREPARING → COMPLETED directly (no interim PROCESSING needed)
        if (job.CurrentStatus == JobStatus.Preparing)
        {
            // Directly set to completed via domain object
            job.Complete();
        }
        else
        {
            // Fallback: use StartProcessing → Complete for any edge case
            if (job.CurrentStatus != JobStatus.Processing)
                job.StartProcessing();
            job.Complete();
        }

        await jobRepo.UpdateAsync(job, ct);

        await historyRepo.AddAsync(JobHistory.Record(
            job.Id, oldStatus, JobStatus.Completed, "BATCH_PRINT_COMPLETED",
            performedBy: "printer-adapter",
            note: "Nhãn đã in thành công trong lô."), ct);

        await transitionRepo.AddAsync(
            JobStateTransition.Record(job.Id, oldStatus, JobStatus.Completed, "BATCH_PRINT_COMPLETED"), ct);

        // Publish job.completed outbox event
        var completedEvent = JobCompletedEvent.From(
            job.Id, job.JobNo, job.JobType, job.ProductCode, job.ProductSerial, job.SourceSystem);

        await outboxRepo.AddAsync(JobEngineOutboxEvent.Create(
            nameof(Job), job.Id,
            completedEvent.EventType,
            JobEventRoutingKeys.Completed,
            JsonSerializer.Serialize(completedEvent)), ct);

        // Update production item
        var items = await itemRepo.GetByOrderNoAsync(jobNo, ct);
        var item  = items.FirstOrDefault(i => i.CurrentJobId == jobId);
        if (item is not null)
        {
            item.Complete();
            await itemRepo.UpdateAsync(item, ct);
        }

        _logger.LogInformation("Job {JobId} marked COMPLETED (batch).", jobId);
    }

    private async Task FailJobAsync(
        string jobId,
        string jobNo,
        string? errorMessage,
        IJobRepository jobRepo,
        IJobHistoryRepository historyRepo,
        IJobStateTransitionRepository transitionRepo,
        IJobEngineOutboxRepository outboxRepo,
        IProductionItemRepository itemRepo,
        IDistributedLock distLock,
        CancellationToken ct)
    {
        await using var lk = await distLock.TryAcquireAsync($"lock:job:{jobId}", TimeSpan.FromSeconds(30), ct);
        if (lk is null)
        {
            _logger.LogWarning("Could not acquire lock for job {JobId} — skipping failure.", jobId);
            return;
        }

        var job = await jobRepo.GetByIdAsync(jobId, ct);
        if (job is null)
        {
            _logger.LogWarning("Job {JobId} not found — skipping failure.", jobId);
            return;
        }

        if (job.CurrentStatus == JobStatus.Completed || job.CurrentStatus == JobStatus.Failed)
        {
            _logger.LogInformation("Job {JobId} already in terminal state {Status}.", jobId, job.CurrentStatus);
            return;
        }

        var oldStatus = job.CurrentStatus;
        job.Fail("BATCH_PRINT_FAILED", errorMessage ?? "Lô in thất bại.");
        await jobRepo.UpdateAsync(job, ct);

        await historyRepo.AddAsync(JobHistory.Record(
            job.Id, oldStatus, JobStatus.Failed, "BATCH_PRINT_FAILED",
            performedBy: "printer-adapter",
            note: errorMessage ?? "Lô in thất bại."), ct);

        await transitionRepo.AddAsync(
            JobStateTransition.Record(job.Id, oldStatus, JobStatus.Failed, "BATCH_PRINT_FAILED"), ct);

        var failedEvent = JobFailedEvent.From(
            job.Id, job.JobNo, job.JobType, job.ProductCode, job.ProductSerial,
            job.SourceSystem, errorMessage);

        await outboxRepo.AddAsync(JobEngineOutboxEvent.Create(
            nameof(Job), job.Id,
            failedEvent.EventType,
            JobEventRoutingKeys.Failed,
            JsonSerializer.Serialize(failedEvent)), ct);

        var items = await itemRepo.GetByOrderNoAsync(jobNo, ct);
        var item  = items.FirstOrDefault(i => i.CurrentJobId == jobId);
        if (item is not null)
        {
            item.Fail();
            await itemRepo.UpdateAsync(item, ct);
        }

        _logger.LogWarning("Job {JobId} marked FAILED (batch). Error={Error}", jobId, errorMessage);
    }

    private static async Task CheckOrderCompletionAsync(
        string jobNo,
        IProductionItemRepository itemRepo,
        IProductionOrderRepository orderRepo,
        CancellationToken ct)
    {
        var allItems = await itemRepo.GetByOrderNoAsync(jobNo, ct);
        var order    = await orderRepo.GetByOrderNoAsync(jobNo, ct);
        if (order is null) return;

        if (allItems.All(i => i.Status == "COMPLETED") && order.Status != "COMPLETED")
        {
            order.Complete();
            await orderRepo.UpdateAsync(order, ct);
        }
    }
}
