using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Domain.Entities;
using ND.PrinterAdapter.Infrastructure.Persistence;
using ND.SharedKernel.Abstractions;
using ND.UnifiedContracts.Events;

namespace ND.PrinterAdapter.Infrastructure.Messaging;

/// <summary>
/// Executes <see cref="ProductionBatchPrintCommand"/> requests from the Job Engine and:
/// <list type="number">
///   <item>Resolves the label template (once for the entire Production Order)</item>
///   <item>Renders ZPL for every label item</item>
///   <item>Concatenates them into one ZPL document (chunked by <c>PrintBatch:ChunkSize</c>)</item>
///   <item>Sends ONE print request per chunk to the physical printer / simulator</item>
///   <item>Returns <see cref="ProductionBatchPrintedEvent"/> to the transport adapter</item>
/// </list>
///
/// </summary>
public sealed class BatchPrintService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IPrintQueue _printQueue;
    private readonly ILabelRenderer _labelRenderer;
    private readonly IConfiguration _configuration;
    private readonly ILogger<BatchPrintService> _logger;

    public BatchPrintService(
        IServiceScopeFactory scopeFactory,
        IPrintQueue printQueue,
        ILabelRenderer labelRenderer,
        IConfiguration configuration,
        ILogger<BatchPrintService> logger)
    {
        _scopeFactory  = scopeFactory;
        _printQueue    = printQueue;
        _labelRenderer = labelRenderer;
        _configuration = configuration;
        _logger        = logger;
    }

    public async Task<ProductionBatchPrintedEvent?> HandleCommandAsync(
        ProductionBatchPrintCommand cmd,
        CancellationToken ct,
        string source = "KAFKA")
    {
        _logger.LogInformation(
            "Batch command: PO={OrderNo} Labels={Count} Printer={Printer} DispatchTarget={Target}",
            cmd.ProductionOrderNo, cmd.LabelItems.Count, cmd.TargetPrinter, cmd.DispatchTarget);

        using var scope     = _scopeFactory.CreateScope();
        var db              = scope.ServiceProvider.GetRequiredService<PrinterDbContext>();
        var unitOfWork      = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        // Reserve the command before touching a physical printer. A redelivery
        // returns the stored result, while a command already being processed is
        // acknowledged by the caller without printing a second time.
        var existingExecution = await db.PrinterCommandExecutions
            .SingleOrDefaultAsync(x => x.CommandId == cmd.EventId, ct);
        if (existingExecution is not null)
        {
            if (existingExecution.Status == "COMPLETED" && !string.IsNullOrWhiteSpace(existingExecution.ResultJson))
            {
                return JsonSerializer.Deserialize<ProductionBatchPrintedEvent>(
                    existingExecution.ResultJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }

            _logger.LogWarning(
                "Ignoring duplicate in-flight print command {CommandId} from {Source}; physical print is already reserved.",
                cmd.EventId, source);
            return null;
        }

        var execution = PrinterCommandExecution.Start(cmd.EventId, cmd.EventType);
        db.PrinterCommandExecutions.Add(execution);
        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Another consumer instance won the unique command_id race.
            var winner = await db.PrinterCommandExecutions
                .AsNoTracking()
                .SingleOrDefaultAsync(x => x.CommandId == cmd.EventId, ct);
            if (winner?.Status == "COMPLETED" && !string.IsNullOrWhiteSpace(winner.ResultJson))
            {
                return JsonSerializer.Deserialize<ProductionBatchPrintedEvent>(
                    winner.ResultJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }

            return null;
        }

        // ── 1. Resolve printer ───────────────────────────────────────────────────
        var isPhysical = string.Equals(cmd.DispatchTarget, "production-printer",
            StringComparison.OrdinalIgnoreCase);

        Domain.Entities.Printer? printer;
        if (isPhysical)
        {
            printer = await db.Printers.FirstOrDefaultAsync(p => p.DriverType == "cups", ct)
                   ?? await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == "Zebra-GK420t-CUPS", ct);
            _logger.LogInformation("[Batch] Using CUPS printer: {Code}", printer?.PrinterCode ?? "none");
        }
        else
        {
            var targetCode = cmd.TargetPrinter;
            if (string.IsNullOrWhiteSpace(targetCode))
            {
                return await CompleteAsync(execution, db, unitOfWork, CreateBatchResult(cmd, "unknown",
                    succeededIds: [], failedIds: cmd.LabelItems.Select(i => i.JobId).ToList(),
                    error: "A target physical printer is required."), ct);
            }
            printer = await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == targetCode, ct);
            _logger.LogInformation("[Batch] Using requested physical printer: {Code}", printer?.PrinterCode ?? targetCode);
        }

        if (printer is null)
        {
            _logger.LogError("[Batch] No printer found for dispatch_target={Target} — failing batch.", cmd.DispatchTarget);
            return await CompleteAsync(execution, db, unitOfWork, CreateBatchResult(cmd, printer?.PrinterCode ?? "unknown",
                succeededIds: [], failedIds: cmd.LabelItems.Select(i => i.JobId).ToList(),
                error: "No printer configured."), ct);
        }

        // ── 2. Resolve template (once for the whole batch) ───────────────────────
        Domain.Entities.LabelTemplate template;
        try
        {
            template = await EnsureDefaultTemplateAsync(db, printer.PrinterCode, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Batch] No label template found — failing batch.");
            return await CompleteAsync(execution, db, unitOfWork, CreateBatchResult(cmd, printer.PrinterCode,
                succeededIds: [], failedIds: cmd.LabelItems.Select(i => i.JobId).ToList(),
                error: ex.Message), ct);
        }

        // ── 3. Build shared base variables from PO payload ───────────────────────
        var baseVars = BuildBaseVariables(cmd);

        // ── 4. Announce Printing heartbeat ───────────────────────────────────────
        // ── 5. Render ALL ZPL in memory → collect per-label ZPL strings ──────────
        var effectiveChunkSize = _configuration.GetValue<int>("PrintBatch:ChunkSize", cmd.BatchSize);

        var succeededIds = new List<string>();
        var failedIds    = new List<string>();
        string? batchError = null;

        // Split into chunks so huge orders don't exhaust memory
        var chunks = cmd.LabelItems
            .Select((item, i) => (item, i))
            .GroupBy(x => x.i / effectiveChunkSize)
            .Select(g => g.Select(x => x.item).ToList())
            .ToList();

        _logger.LogInformation(
            "[Batch] Rendering {Total} labels in {Chunks} chunk(s) of up to {ChunkSize} each.",
            cmd.LabelItems.Count, chunks.Count, effectiveChunkSize);

        foreach (var chunk in chunks)
        {
            // a) Render each label ZPL
            var zplParts = new List<string>(chunk.Count);
            foreach (var item in chunk)
            {
                try
                {
                    var vars = BuildLabelVariables(baseVars, item, cmd);
                    var zpl  = _labelRenderer.Render(template.GetTemplateJsonWithLayout(), vars);
                    zplParts.Add(zpl);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Batch] Failed to render ZPL for job {JobId}", item.JobId);
                    // Individual render failure → mark this item failed, continue
                    failedIds.Add(item.JobId);
                }
            }

            if (!zplParts.Any()) continue;

            // b) Concatenate into one ZPL document
            var concatenatedZpl = string.Join("\n", zplParts);

            // c) Send the entire chunk as ONE printer request
            _logger.LogInformation(
                "[Batch] Sending chunk of {Count} labels ({Bytes} bytes) to printer {Code}.",
                zplParts.Count, Encoding.UTF8.GetByteCount(concatenatedZpl), printer.PrinterCode);

            var tcs = new TaskCompletionSource<bool>();
            var chunkJob = new PrintJob(
                PrinterCode: printer.PrinterCode,
                IpAddress: printer.IpAddress,
                Port: printer.Port,
                Content: concatenatedZpl,
                JobId: $"batch-{cmd.ProductionOrderNo}-chunk",
                AttemptId: cmd.EventId,
                LabelTemplate: template.Name,
                Copies: 1,
                TraceId: Guid.NewGuid().ToString("N"),
                CorrelationId: Guid.NewGuid().ToString("N"),
                CompletionSource: tcs,
                DriverType: printer.DriverType,
                CupsQueueName: printer.CupsQueueName,
                DispatchTarget: cmd.DispatchTarget);

            await _printQueue.QueuePrintJobAsync(chunkJob);
            var chunkSuccess = await tcs.Task;

            if (chunkSuccess)
            {
                // Map successful chunk labels by position (rendered items only)
                var renderedItems = chunk
                    .Where(i => !failedIds.Contains(i.JobId))
                    .ToList();
                succeededIds.AddRange(renderedItems.Select(i => i.JobId));
                _logger.LogInformation("[Batch] Chunk of {Count} labels printed successfully.", zplParts.Count);
            }
            else
            {
                // Whole chunk failed — mark all (that aren't already failed) as failed
                var chunkFailed = chunk
                    .Select(i => i.JobId)
                    .Where(id => !succeededIds.Contains(id) && !failedIds.Contains(id))
                    .ToList();
                failedIds.AddRange(chunkFailed);
                batchError ??= "Printer communication failed on one or more chunks.";
                _logger.LogError("[Batch] Chunk print FAILED. {Count} labels marked failed.", chunkFailed.Count);
            }

            // Persist audit per chunk
            await PersistPrintAuditAsync(
                db, unitOfWork, template, printer, cmd, chunk, concatenatedZpl, chunkSuccess, ct);
        }

        // ── 6. Recovery heartbeat ────────────────────────────────────────────────
        // ── 7. Publish batch result ───────────────────────────────────────────────
        var result = CreateBatchResult(cmd, printer.PrinterCode, succeededIds, failedIds, batchError);
        await CompleteAsync(execution, db, unitOfWork, result, ct);

        _logger.LogInformation(
            "[Batch] PO={OrderNo} complete. Succeeded={S} Failed={F}",
            cmd.ProductionOrderNo, succeededIds.Count, failedIds.Count);
        return result;
    }

    private static async Task<ProductionBatchPrintedEvent> CompleteAsync(
        PrinterCommandExecution execution,
        PrinterDbContext db,
        IUnitOfWork unitOfWork,
        ProductionBatchPrintedEvent result,
        CancellationToken ct)
    {
        execution.Complete(JsonSerializer.Serialize(result));
        await unitOfWork.SaveChangesAsync(ct);
        return result;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Resolves the label template for a printer using the same priority chain as
    /// <see cref="JobProcessingConsumer"/>: printer-specific → system default → any published.
    /// </summary>
    private async Task<Domain.Entities.LabelTemplate> EnsureDefaultTemplateAsync(
        PrinterDbContext db, string printerCode, CancellationToken ct)
    {
        var assignment = await db.PrinterTemplateAssignments
            .FirstOrDefaultAsync(a => a.PrinterCode == printerCode, ct);

        if (assignment is not null)
        {
            var assigned = await db.LabelTemplates
                .FirstOrDefaultAsync(t => t.Id == assignment.TemplateId && t.IsActive && t.Status == "published", ct);
            if (assigned is not null) return assigned;
        }

        var def = await db.LabelTemplates
            .FirstOrDefaultAsync(t => t.IsDefault && t.IsActive && t.Status == "published", ct);
        if (def is not null) return def;

        var fallback = await db.LabelTemplates
            .Where(t => t.IsActive && t.Status == "published")
            .OrderByDescending(t => t.UpdatedAt)
            .FirstOrDefaultAsync(ct);

        return fallback
            ?? throw new InvalidOperationException("No published label template found.");
    }

    /// <summary>
    /// Builds the base variable dictionary from the Production Order payload JSON.
    /// This is computed once for the entire batch.
    /// </summary>
    private static Dictionary<string, string> BuildBaseVariables(ProductionBatchPrintCommand cmd)
    {
        var variables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(cmd.PayloadJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(cmd.PayloadJson);
                var root = doc.RootElement;

                if (root.TryGetProperty("event_id", out var evId))
                    variables["trace_id"] = evId.GetString() ?? "";

                if (root.TryGetProperty("data", out var dataArr) &&
                    dataArr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in dataArr.EnumerateArray())
                    {
                        var tag = item.TryGetProperty("tag", out var t) ? t.GetString() : null;
                        var val = item.TryGetProperty("value", out var v) ? v.GetString() : null;
                        if (!string.IsNullOrEmpty(tag))
                        {
                            variables[tag] = val ?? "";
                            var simple = tag.Split('.').Last();
                            variables.TryAdd(simple, val ?? "");
                        }
                    }
                }
            }
            catch { /* ignore parse errors */ }
        }

        // Resolved defaults
        var resolved = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["production_order"] = cmd.ProductionOrderNo,
            ["workflow"]         = "Default Workflow",
            ["operation"]        = cmd.JobType,
            ["station"]          = "STATION-01",
            ["team"]             = "Team A",
            ["operator"]         = "admin.operator",
            ["product_name"]     = cmd.ProductCode + " Industrial Part",
            ["product_code"]     = cmd.ProductCode,
            ["revision"]         = "Rev A",
            ["customer"]         = "Won Seal Tech",
            ["material"]         = "NBR-70",
            ["rubber_type"]      = "Synthetic Rubber",
            ["lot_number"]       = "LOT-2026-07-A",
            ["batch_number"]     = "BATCH-01",
            ["manufacture_date"] = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            ["expiry_date"]      = DateTime.UtcNow.AddYears(2).ToString("yyyy-MM-dd"),
            ["country"]          = "Vietnam",
            ["trace_id"]         = cmd.EventId
        };

        foreach (var kvp in variables)
        {
            var simple = kvp.Key.Split('.').Last();
            resolved[kvp.Key] = kvp.Value;
            resolved[simple]  = kvp.Value;
        }

        // Standard overrides
        if (variables.TryGetValue("production.order_number", out var po))   resolved["production_order"]  = po;
        if (variables.TryGetValue("production.workflow",     out var wf))   resolved["workflow"]          = wf;
        if (variables.TryGetValue("product.name",            out var pn))   resolved["product_name"]      = pn;
        if (variables.TryGetValue("product.revision",        out var rv))   resolved["revision"]          = rv;
        if (variables.TryGetValue("customer.name",           out var cu))   resolved["customer"]          = cu;
        if (variables.TryGetValue("product.material",        out var ma))   resolved["material"]          = ma;
        if (variables.TryGetValue("product.rubber_type",     out var rt))   resolved["rubber_type"]       = rt;
        if (variables.TryGetValue("product.lot",             out var lot))  resolved["lot_number"]        = lot;
        if (variables.TryGetValue("product.batch",           out var bat))  resolved["batch_number"]      = bat;
        if (variables.TryGetValue("product.mfg_date",        out var mfg))  resolved["manufacture_date"]  = mfg;
        if (variables.TryGetValue("product.exp_date",        out var exp))  resolved["expiry_date"]       = exp;
        if (variables.TryGetValue("product.country",         out var cnt))  resolved["country"]           = cnt;

        return resolved;
    }

    /// <summary>
    /// Clones the base variable dictionary and overrides per-label fields
    /// (serial number, sequence, work_order).
    /// </summary>
    private static Dictionary<string, string> BuildLabelVariables(
        Dictionary<string, string> baseVars,
        BatchLabelItem item,
        ProductionBatchPrintCommand cmd)
    {
        var vars = new Dictionary<string, string>(baseVars, StringComparer.OrdinalIgnoreCase)
        {
            ["serial_number"] = item.ProductSerial ?? $"{cmd.ProductCode}-{item.Sequence}",
            ["work_order"]    = item.ProductSerial ?? $"{cmd.ProductCode}-{item.Sequence}",
            ["trace_id"]      = item.JobId
        };

        if (baseVars.TryGetValue("marking.serial", out var ms))
            vars["serial_number"] = ms;

        return vars;
    }

    private async Task PersistPrintAuditAsync(
        PrinterDbContext db,
        IUnitOfWork unitOfWork,
        Domain.Entities.LabelTemplate template,
        Domain.Entities.Printer printer,
        ProductionBatchPrintCommand cmd,
        IEnumerable<BatchLabelItem> chunkItems,
        string concatenatedZpl,
        bool success,
        CancellationToken ct)
    {
        try
        {
            var runtimeJson = JsonSerializer.Serialize(new
            {
                production_order = cmd.ProductionOrderNo,
                product_code     = cmd.ProductCode,
                chunk_count      = chunkItems.Count()
            });

            var history = PrintHistory.Create(
                template.Id,
                template.Name,
                template.Version,
                printer.PrinterCode,
                runtimeJson,
                concatenatedZpl,
                traceId: $"batch-{cmd.ProductionOrderNo}",
                correlationId: cmd.EventId);

            if (success) history.MarkSuccess(0, "Batch printed successfully");
            else         history.MarkFailed(0, "Batch print failed");

            await db.PrintHistories.AddAsync(history, ct);
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Batch] Failed to persist print audit — non-fatal.");
        }
    }

    private static ProductionBatchPrintedEvent CreateBatchResult(
        ProductionBatchPrintCommand cmd,
        string printerCode,
        IReadOnlyList<string> succeededIds,
        IReadOnlyList<string> failedIds,
        string? error)
    {
        return ProductionBatchPrintedEvent.Create(
            productionOrderNo: cmd.ProductionOrderNo,
            printerCode: printerCode,
            succeededJobIds: succeededIds,
            failedJobIds: failedIds,
            errorMessage: error,
            commandId: cmd.EventId);
    }
}
