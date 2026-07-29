using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Infrastructure.Persistence;
using ND.PrinterAdapter.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.PrinterAdapter.Infrastructure.Messaging;

/// <summary>
/// Handles Kiosk/Projection management requests over Kafka. HTTP endpoints on
/// the adapter remain liveness and local diagnostics only; remote station UI
/// traffic never calls them.
/// </summary>
public sealed class PrinterManagementConsumer : BackgroundService
{
    private const string Exchange = "station.events";
    private const string RequestPattern = "command.printer.management";
    private readonly IEventConsumer _consumer;
    private readonly IEventPublisher _publisher;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PrinterManagementConsumer> _logger;

    public PrinterManagementConsumer(IEventConsumer consumer, IEventPublisher publisher, IServiceScopeFactory scopeFactory, ILogger<PrinterManagementConsumer> logger)
    { _consumer = consumer; _publisher = publisher; _scopeFactory = scopeFactory; _logger = logger; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await _consumer.StartConsumingAsync(Exchange, "printer-adapter.management", RequestPattern, HandleAsync, stoppingToken);
        await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken);
    }

    private async Task HandleAsync(string _, string payload)
    {
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        var requestId = ReadString(root, "request_id", "requestId") ?? Guid.NewGuid().ToString("D");
        var method = ReadString(root, "method") ?? "GET";
        var path = ReadString(root, "path") ?? string.Empty;
        var query = ReadString(root, "query");
        var body = ReadString(root, "body") ?? string.Empty;
        var requestedBy = ReadString(root, "requested_by", "requestedBy");
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var service = scope.ServiceProvider.GetRequiredService<PrinterManagementService>();
            var response = await service.HandleAsync(method, path, query, body, requestedBy, CancellationToken.None);
            await PublishResponseAsync(requestId, response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Printer management request failed. requestId={RequestId} method={Method} path={Path}", requestId, method, path);
            await PublishResponseAsync(requestId, new PrinterManagementResponse(500, "application/json", JsonSerializer.Serialize(new { error = ex.Message })));
        }
    }

    private Task PublishResponseAsync(string requestId, PrinterManagementResponse response)
        => _publisher.PublishAsync(Exchange, "printer.management.response", JsonSerializer.Serialize(new
        {
            event_id = Guid.NewGuid().ToString("D"),
            request_id = requestId,
            status_code = response.StatusCode,
            content_type = response.ContentType,
            body = response.Body,
            is_base64 = response.IsBase64,
            file_name = response.FileName
        }));

    private static string? ReadString(JsonElement root, params string[] names)
        => names.Select(name => root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}

public sealed record PrinterManagementResponse(int StatusCode, string ContentType, string Body, bool IsBase64 = false, string? FileName = null);

public sealed class PrinterManagementService
{
    private readonly PrinterDbContext _db;
    private readonly ILabelTemplateRepository _templates;
    private readonly IPrintHistoryRepository _history;
    private readonly IUnitOfWork _uow;
    private readonly IPrinterDriverFactory _driverFactory;
    private readonly ILabelRenderer _renderer;
    private readonly IPrintQueue _printQueue;

    public PrinterManagementService(PrinterDbContext db, ILabelTemplateRepository templates, IPrintHistoryRepository history, IUnitOfWork uow, IPrinterDriverFactory driverFactory, ILabelRenderer renderer, IPrintQueue printQueue)
    { _db = db; _templates = templates; _history = history; _uow = uow; _driverFactory = driverFactory; _renderer = renderer; _printQueue = printQueue; }

    public async Task<PrinterManagementResponse> HandleAsync(string method, string path, string? query, string body, string? requestedBy, CancellationToken ct)
    {
        var normalized = "/" + path.Trim('/');
        if (method.Equals("GET", StringComparison.OrdinalIgnoreCase) && normalized == "/api/health") return Json(200, new
        {
            status = "Healthy",
            service = "printer-adapter",
            kafka = new { status = "Connected", bootstrapServers = Environment.GetEnvironmentVariable("KAFKA_BOOTSTRAP_SERVERS") },
            cups = new { status = "Configured", queue = Environment.GetEnvironmentVariable("CUPS_QUEUE") }
        });
        if (method.Equals("GET", StringComparison.OrdinalIgnoreCase) && normalized == "/api/label-templates") return Json(200, await ListTemplatesAsync(query, ct));
        if (method.Equals("GET", StringComparison.OrdinalIgnoreCase) && (normalized == "/api/label-templates/active" || normalized == "/api/label-templates/default")) return await TemplateAsync(await _templates.GetDefaultAsync(ct));
        if (method.Equals("GET", StringComparison.OrdinalIgnoreCase) && normalized == "/api/printers") return Json(200, await PrintersAsync(ct));
        if (method.Equals("GET", StringComparison.OrdinalIgnoreCase) && normalized == "/api/printers/ready") return Json(200, await PrintersAsync(ct, ready: true));
        if (method.Equals("GET", StringComparison.OrdinalIgnoreCase) && normalized == "/api/printers/active") return Json(200, await PrintersAsync(ct, active: true));
        if (method.Equals("GET", StringComparison.OrdinalIgnoreCase) && normalized == "/api/printers/discover") return await DiscoverPrintersAsync(ct);
        if (method.Equals("GET", StringComparison.OrdinalIgnoreCase) && normalized == "/api/print-history")
        {
            var values = (query ?? string.Empty).TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
                .Select(part => part.Split('=', 2)).ToDictionary(part => part[0], part => part.Length > 1 ? Uri.UnescapeDataString(part[1]) : "", StringComparer.OrdinalIgnoreCase);
            var page = int.TryParse(values.GetValueOrDefault("page"), out var parsedPage) ? parsedPage : 1;
            var pageSize = int.TryParse(values.GetValueOrDefault("pageSize"), out var parsedPageSize) ? parsedPageSize : 50;
            return Json(200, (await _history.ListAsync(page, pageSize, ct)).Select(h => new { h.Id, h.TemplateName, h.TemplateVersion, h.PrinterCode, h.Status, h.DurationMs, h.RetryCount, h.TraceId, h.CorrelationId, h.CreatedAt }));
        }
        if (method.Equals("GET", StringComparison.OrdinalIgnoreCase) && normalized == "/api/printer-template-assignments") return Json(200, await _templates.GetAllAssignmentsAsync(ct));
        if (method.Equals("POST", StringComparison.OrdinalIgnoreCase) && normalized == "/api/label-templates") return await CreateTemplateAsync(body, requestedBy, ct);
        if (method.Equals("POST", StringComparison.OrdinalIgnoreCase) && normalized == "/api/label-templates/import") return await ImportTemplateAsync(body, requestedBy, ct);
        if (method.Equals("POST", StringComparison.OrdinalIgnoreCase) && normalized == "/api/printer-template-assignments") return await AssignTemplateAsync(body, requestedBy, ct);
        if (method.Equals("DELETE", StringComparison.OrdinalIgnoreCase) && normalized.StartsWith("/api/printer-template-assignments/", StringComparison.Ordinal)) { await _templates.RemoveAssignmentAsync(partsLast(normalized), ct); await _uow.SaveChangesAsync(ct); return Json(204, new { }); }

        var parts = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 3 && parts[0] == "api" && parts[1] == "label-templates")
        {
            var id = parts[2];
            if (parts.Length == 4 && parts[3] == "render-with-data" && method.Equals("POST", StringComparison.OrdinalIgnoreCase))
                return await RenderStoredTemplateAsync(id, body, ct);
            if (parts.Length == 4 && parts[3] == "print-test" && method.Equals("POST", StringComparison.OrdinalIgnoreCase))
                return await PrintTestTemplateAsync(id, body, ct);
            if (parts.Length == 3 && method.Equals("GET", StringComparison.OrdinalIgnoreCase)) return await TemplateAsync(await _templates.GetByIdAsync(id, ct));
            if (parts.Length == 3 && method.Equals("PUT", StringComparison.OrdinalIgnoreCase)) return await UpdateTemplateAsync(id, body, requestedBy, ct);
            if (parts.Length == 3 && method.Equals("POST", StringComparison.OrdinalIgnoreCase) && parts[2] is not ("active" or "default")) return await DuplicateTemplateAsync(id, requestedBy, ct);
            if (parts.Length == 4 && parts[3] == "versions" && method.Equals("GET", StringComparison.OrdinalIgnoreCase)) return Json(200, await _templates.GetVersionHistoryAsync(id, ct));
            if (parts.Length == 4 && parts[3] == "export" && method.Equals("GET", StringComparison.OrdinalIgnoreCase)) return await ExportAsync(id, ct);
            if (parts.Length == 4 && method.Equals("POST", StringComparison.OrdinalIgnoreCase) && parts[3] is "publish" or "archive" or "set-default") return await ChangeTemplateStatusAsync(id, parts[3], requestedBy, ct);
        }
        if (parts.Length == 3 && parts[0] == "api" && parts[1] == "printer-template-assignments" && method.Equals("GET", StringComparison.OrdinalIgnoreCase)) return Json(200, (object?)await _templates.GetAssignmentForPrinterAsync(parts[2], ct) ?? new { });
        if (parts.Length == 4 && parts[0] == "api" && parts[1] == "printers" && parts[3] is "activate" or "deactivate" && method.Equals("POST", StringComparison.OrdinalIgnoreCase)) return await ChangePrinterAsync(parts[2], parts[3], body, requestedBy, ct);
        if (parts.Length == 4 && parts[0] == "api" && parts[1] == "printers" && method.Equals("GET", StringComparison.OrdinalIgnoreCase))
        {
            if (parts[3] == "health") return await PrinterHealthAsync(parts[2], ct);
            if (parts[3] == "maintenance") return await PrinterMaintenanceAsync(parts[2], ct);
        }
        if (parts.Length == 4 && parts[0] == "api" && parts[1] == "printers" && parts[3] == "test-connection" && method.Equals("POST", StringComparison.OrdinalIgnoreCase)) return await TestPrinterConnectionAsync(parts[2], ct);
        if (parts.Length == 3 && parts[0] == "api" && parts[1] == "label-templates" && method.Equals("DELETE", StringComparison.OrdinalIgnoreCase)) return await DeleteTemplateAsync(parts[2], ct);
        return Json(501, new { error = "PRINTER_MANAGEMENT_OPERATION_NOT_SUPPORTED", method, path = normalized });
    }

    private async Task<PrinterManagementResponse> CreateTemplateAsync(string body, string? user, CancellationToken ct)
    { using var doc = JsonDocument.Parse(body); var t = CreateFromJson(doc.RootElement, user); await _templates.AddAsync(t, ct); await _uow.SaveChangesAsync(ct); return Json(201, ToTemplate(t)); }

    private async Task<PrinterManagementResponse> UpdateTemplateAsync(string id, string body, string? user, CancellationToken ct)
    {
        var t = await _templates.GetByIdAsync(id, ct);
        if (t is null) return Json(404, new { error = "LABEL_TEMPLATE_NOT_FOUND" });

        using var doc = JsonDocument.Parse(body);
        var p = doc.RootElement;

        // Keep the version that is being replaced as an immutable snapshot.
        // The Kafka management path must have the same history semantics as
        // the direct local API path used by development tools.
        await _templates.AddVersionAsync(LabelTemplateVersion.Snapshot(t.Id, t.Version, t.TemplateJson, user), ct);
        t.Update(S(p, "name") ?? t.Name, S(p, "description"), I(p, "dpi", t.Dpi), D(p, "labelWidth", t.LabelWidth), D(p, "labelHeight", t.LabelHeight), S(p, "templateJson") ?? t.TemplateJson, user, S(p, "note"), S(p, "templateCode"), S(p, "category"), S(p, "orientation"), S(p, "revision"), S(p, "supportedBarcodeTypes"), S(p, "supportedPrinterModels"), S(p, "compatibleStationTypes"), S(p, "layoutType"), I(p, "sheetColumns", t.SheetColumns), I(p, "sheetRows", t.SheetRows), DNullable(p, "gapMm"));
        await _templates.UpdateAsync(t, ct);
        await _uow.SaveChangesAsync(ct);
        return Json(200, ToTemplate(t));
    }

    private async Task<PrinterManagementResponse> DuplicateTemplateAsync(string id, string? user, CancellationToken ct)
    { var source = await _templates.GetByIdAsync(id, ct); if (source is null) return Json(404, new { error = "LABEL_TEMPLATE_NOT_FOUND" }); var copy = ND.PrinterAdapter.Domain.Entities.LabelTemplate.Create($"{source.Name} (copy)", source.Description, source.Dpi, source.LabelWidth, source.LabelHeight, source.TemplateJson, "draft", user, source.Note, source.TemplateCode, source.Category, source.Orientation, source.Revision, source.SupportedBarcodeTypes, source.SupportedPrinterModels, source.CompatibleStationTypes, source.LayoutType, source.SheetColumns, source.SheetRows, source.GapMm); await _templates.AddAsync(copy, ct); await _uow.SaveChangesAsync(ct); return Json(201, ToTemplate(copy)); }

    private async Task<PrinterManagementResponse> ImportTemplateAsync(string body, string? user, CancellationToken ct)
    { using var doc = JsonDocument.Parse(body); var root = doc.RootElement.TryGetProperty("template", out var nested) ? nested : doc.RootElement; var t = CreateFromJson(root, user, $"{S(root, "name") ?? "Imported Template"} (imported)"); await _templates.AddAsync(t, ct); await _uow.SaveChangesAsync(ct); return Json(201, new { t.Id, t.Name, t.Status }); }

    private async Task<PrinterManagementResponse> AssignTemplateAsync(string body, string? user, CancellationToken ct)
    { using var doc = JsonDocument.Parse(body); var p = doc.RootElement; var code = S(p, "printerCode"); var id = S(p, "templateId"); if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(id)) return Json(400, new { error = "printerCode and templateId are required" }); var t = await _templates.GetByIdAsync(id, ct); if (t is null) return Json(400, new { error = "LABEL_TEMPLATE_NOT_FOUND" }); await _templates.UpsertAssignmentAsync(code, id, t.Name, user, ct); await _uow.SaveChangesAsync(ct); return Json(200, new { printerCode = code, templateId = id, templateName = t.Name }); }

    private static ND.PrinterAdapter.Domain.Entities.LabelTemplate CreateFromJson(JsonElement p, string? user, string? overrideName = null)
    { var json = p.TryGetProperty("templateJson", out var template) ? template.ValueKind == JsonValueKind.String ? template.GetString()! : template.GetRawText() : "{}"; return ND.PrinterAdapter.Domain.Entities.LabelTemplate.Create(overrideName ?? S(p, "name") ?? "Unnamed Template", S(p, "description"), I(p, "dpi", 203), D(p, "labelWidth", 50), D(p, "labelHeight", 30), json, S(p, "status") ?? "draft", user, S(p, "note"), S(p, "templateCode"), S(p, "category"), S(p, "orientation") ?? "PORTRAIT", S(p, "revision") ?? "A", S(p, "supportedBarcodeTypes"), S(p, "supportedPrinterModels"), S(p, "compatibleStationTypes"), S(p, "layoutType") ?? "1UP", I(p, "sheetColumns", 1), I(p, "sheetRows", 1), D(p, "gapMm", 0)); }
    private static string partsLast(string path) => path.Split('/', StringSplitOptions.RemoveEmptyEntries).Last();
    private static string? S(JsonElement p, string name) => p.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : null;
    private static int I(JsonElement p, string name, int fallback) => p.TryGetProperty(name, out var v) && v.TryGetInt32(out var value) ? value : fallback;
    private static double D(JsonElement p, string name, double fallback) => p.TryGetProperty(name, out var v) && v.TryGetDouble(out var value) ? value : fallback;
    private static double? DNullable(JsonElement p, string name) => p.TryGetProperty(name, out var v) && v.TryGetDouble(out var value) ? value : null;

    private async Task<PrinterManagementResponse> RenderStoredTemplateAsync(string id, string body, CancellationToken ct)
    {
        var template = await _templates.GetByIdAsync(id, ct);
        if (template is null) return Json(404, new { error = "LABEL_TEMPLATE_NOT_FOUND" });
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        var data = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (doc.RootElement.TryGetProperty("data", out var dataNode) && dataNode.ValueKind == JsonValueKind.Object)
            foreach (var property in dataNode.EnumerateObject()) data[property.Name] = property.Value.ToString();
        try
        {
            var zpl = _renderer.Render(template.GetTemplateJsonWithLayout(), data);
            return Json(200, new { templateId = template.Id, templateVersion = template.Version, zpl, rendererType = _renderer.RendererType });
        }
        catch (InvalidOperationException ex) { return Json(400, new { error = ex.Message }); }
    }

    private async Task<PrinterManagementResponse> PrintTestTemplateAsync(string id, string body, CancellationToken ct)
    {
        var template = await _templates.GetByIdAsync(id, ct);
        if (template is null) return Json(404, new { error = "LABEL_TEMPLATE_NOT_FOUND" });

        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        var root = document.RootElement;
        var printerCode = S(root, "printerCode") ?? S(root, "printer_code");
        if (string.IsNullOrWhiteSpace(printerCode)) return Json(400, new { error = "PRINTER_CODE_REQUIRED" });

        var printer = await _db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == printerCode, ct);
        if (printer is null) return Json(404, new { error = "PRINTER_NOT_FOUND" });

        var data = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (root.TryGetProperty("data", out var dataNode) && dataNode.ValueKind == JsonValueKind.Object)
            foreach (var property in dataNode.EnumerateObject()) data[property.Name] = property.Value.ToString();

        string zpl;
        try { zpl = _renderer.Render(template.GetTemplateJsonWithLayout(), data); }
        catch (InvalidOperationException ex) { return Json(400, new { error = $"RENDER_ERROR: {ex.Message}" }); }

        var traceId = Guid.NewGuid().ToString("N");
        var correlationId = S(root, "correlationId") ?? S(root, "correlation_id") ?? Guid.NewGuid().ToString("N");
        var history = PrintHistory.Create(template.Id, template.Name, template.Version, printer.PrinterCode,
            JsonSerializer.Serialize(data), zpl, traceId, correlationId);
        await _history.AddAsync(history, ct);
        await _uow.SaveChangesAsync(ct);

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        var completion = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var printJob = new PrintJob(printer.PrinterCode, printer.IpAddress, printer.Port, zpl,
            Guid.NewGuid().ToString("N"), Guid.NewGuid().ToString("N"), template.Id, 1,
            traceId, correlationId, completion, printer.DriverType, printer.CupsQueueName,
            "MANUAL_TEST");
        await _printQueue.QueuePrintJobAsync(printJob);
        var success = await completion.Task.WaitAsync(ct);
        stopwatch.Stop();

        if (success) history.MarkSuccess(stopwatch.ElapsedMilliseconds, "ACK");
        else history.MarkFailed(stopwatch.ElapsedMilliseconds, "Printer connection failed or timed out");
        await _uow.SaveChangesAsync(ct);
        return Json(200, new { historyId = history.Id, success, durationMs = stopwatch.ElapsedMilliseconds, zpl });
    }

    private async Task<object> ListTemplatesAsync(string? query, CancellationToken ct)
    {
        var values = (query ?? string.Empty).TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries).Select(part => part.Split('=', 2)).ToDictionary(part => Uri.UnescapeDataString(part[0]), part => part.Length > 1 ? Uri.UnescapeDataString(part[1]) : string.Empty, StringComparer.OrdinalIgnoreCase);
        var dpi = int.TryParse(values.GetValueOrDefault("dpi"), out var parsedDpi) ? parsedDpi : (int?)null;
        var search = values.GetValueOrDefault("search");
        var status = values.GetValueOrDefault("status");
        var includeArchived = bool.TryParse(values.GetValueOrDefault("includeArchived"), out var include) && include;
        var list = await _templates.ListAsync(search, dpi, status, includeArchived, ct);
        return list.Select(ToTemplate).ToList();
    }

    private async Task<PrinterManagementResponse> TemplateAsync(ND.PrinterAdapter.Domain.Entities.LabelTemplate? template)
        => template is null ? Json(404, new { error = "LABEL_TEMPLATE_NOT_FOUND" }) : Json(200, ToTemplate(template));

    private async Task<PrinterManagementResponse> ChangeTemplateStatusAsync(string id, string action, string? user, CancellationToken ct)
    {
        var template = await _templates.GetByIdAsync(id, ct);
        if (template is null) return Json(404, new { error = "LABEL_TEMPLATE_NOT_FOUND" });
        if (action == "publish") template.Publish(user); else if (action == "archive") template.Archive(); else { await _templates.ClearDefaultFlagAsync(ct); template.SetAsDefault(); }
        await _templates.UpdateAsync(template, ct); await _uow.SaveChangesAsync(ct);
        return Json(200, new { template.Id, template.Status, template.IsDefault, template.Version });
    }

    private async Task<PrinterManagementResponse> DeleteTemplateAsync(string id, CancellationToken ct)
    { await _templates.DeleteAsync(id, ct); await _uow.SaveChangesAsync(ct); return Json(204, new { }); }

    private async Task<PrinterManagementResponse> ExportAsync(string id, CancellationToken ct)
    {
        var template = await _templates.GetByIdAsync(id, ct); if (template is null) return Json(404, new { error = "LABEL_TEMPLATE_NOT_FOUND" });
        var export = JsonSerializer.Serialize(new { exportVersion = 1, exportedAt = DateTime.UtcNow.ToString("o"), template = ToTemplate(template) }, new JsonSerializerOptions { WriteIndented = true });
        return new PrinterManagementResponse(200, "application/json", Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(export)), true, $"{template.Name.Replace(' ', '_')}_v{template.Version}.json");
    }

    private async Task<PrinterManagementResponse> ChangePrinterAsync(string code, string action, string body, string? user, CancellationToken ct)
    {
        var printer = await _db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == code, ct); if (printer is null) return Json(404, new { error = "PRINTER_NOT_FOUND" });
        if (action == "deactivate") printer.Deactivate();
        else { using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body); var id = doc.RootElement.TryGetProperty("templateId", out var prop) ? prop.GetString() : null; if (string.IsNullOrWhiteSpace(id)) return Json(400, new { error = "templateId is required" }); var template = await _templates.GetByIdAsync(id, ct); if (template is null) return Json(400, new { error = "LABEL_TEMPLATE_NOT_FOUND" }); printer.Activate(id, template.Name, user); }
        await _uow.SaveChangesAsync(ct); return Json(200, new { printer.PrinterCode, printer.IsActiveForWork, printer.ActiveTemplateId, printer.ActiveTemplateName });
    }

    private async Task<PrinterManagementResponse> DiscoverPrintersAsync(CancellationToken ct)
    {
        var queue = Environment.GetEnvironmentVariable("CUPS_QUEUE") ?? "Zebra_Technologies_ZTC_GK420t";
        var driver = _driverFactory.ResolveByType("cups", cupsQueueName: queue);
        return Json(200, await driver.DiscoverAsync(ct));
    }

    private async Task<PrinterManagementResponse> PrinterHealthAsync(string code, CancellationToken ct)
    {
        var printer = await _db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == code, ct);
        if (printer is null) return Json(404, new { error = "PRINTER_NOT_FOUND" });
        var driver = _driverFactory.Resolve(printer);
        var status = await driver.GetStatusAsync(ct);
        var ready = status is PrinterDriverStatus.Online or PrinterDriverStatus.Busy or PrinterDriverStatus.Printing or PrinterDriverStatus.Waiting or PrinterDriverStatus.Warning;
        return Json(200, new { printerCode = printer.PrinterCode, displayName = printer.DisplayName, driverType = printer.DriverType, cupsQueueName = printer.CupsQueueName, status = status.ToString(), isReady = ready, checkedAt = DateTimeOffset.UtcNow });
    }

    private async Task<PrinterManagementResponse> PrinterMaintenanceAsync(string code, CancellationToken ct)
    {
        var printer = await _db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == code, ct);
        if (printer is null) return Json(404, new { error = "PRINTER_NOT_FOUND" });
        var info = await _driverFactory.Resolve(printer).GetMaintenanceInfoAsync(ct);
        return info is null ? Json(400, new { error = "PRINTER_MAINTENANCE_UNAVAILABLE" }) : Json(200, info);
    }

    private async Task<PrinterManagementResponse> TestPrinterConnectionAsync(string code, CancellationToken ct)
    {
        var printer = await _db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == code, ct);
        if (printer is null) return Json(404, new { error = "PRINTER_NOT_FOUND" });
        var driver = _driverFactory.Resolve(printer);
        var reachable = await driver.HealthCheckAsync(ct);
        var status = await driver.GetStatusAsync(ct);
        return Json(200, new { printerCode = printer.PrinterCode, driverType = printer.DriverType, cupsQueueName = printer.CupsQueueName, status = status.ToString(), isReachable = reachable, checkedAt = DateTimeOffset.UtcNow });
    }

    private async Task<List<object>> PrintersAsync(CancellationToken ct, bool ready = false, bool active = false)
    {
        var query = _db.Printers.AsNoTracking();
        if (ready) query = query.Where(p => p.Status.ToUpper() == "ONLINE" || p.Status.ToUpper() == "IDLE");
        if (active) query = query.Where(p => p.IsActiveForWork);
        var rows = await query.OrderBy(p => p.PrinterCode).Select(p => new { p.Id, p.PrinterCode, p.DisplayName, p.IpAddress, p.Port, p.Protocol, p.Vendor, p.Status, p.DriverType, p.CupsQueueName, p.LastHeartbeatAt, p.IsActiveForWork, p.ActiveTemplateId, p.ActiveTemplateName, p.ActivatedAt, p.ActivatedBy }).ToListAsync(ct);
        return rows.Cast<object>().ToList();
    }

    private static object ToTemplate(ND.PrinterAdapter.Domain.Entities.LabelTemplate t) => new { t.Id, t.Name, t.Description, t.Note, t.TemplateCode, t.Category, t.Orientation, t.Revision, t.SupportedBarcodeTypes, t.SupportedPrinterModels, t.CompatibleStationTypes, t.Dpi, t.LabelWidth, t.LabelHeight, templateJson = JsonDocument.Parse(t.TemplateJson).RootElement, t.Version, t.Status, t.IsDefault, t.IsActive, t.CreatedBy, t.UpdatedBy, t.UpdatedAt, t.LayoutType, t.SheetColumns, t.SheetRows, t.GapMm };
    private static PrinterManagementResponse Json(int status, object body) => new(status, "application/json", JsonSerializer.Serialize(body));
}
