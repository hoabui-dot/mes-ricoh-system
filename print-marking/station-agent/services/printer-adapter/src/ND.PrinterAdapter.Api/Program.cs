1using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using ND.Infrastructure.Observability;
using ND.Infrastructure.Messaging;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Domain.Entities;
using ND.PrinterAdapter.Infrastructure.DeviceAdapters;
using ND.PrinterAdapter.Infrastructure.Messaging;
using ND.PrinterAdapter.Infrastructure.Persistence;
using ND.PrinterAdapter.Infrastructure.Rendering;
using ND.PrinterAdapter.Infrastructure.Simulation;
using ND.SharedKernel.Abstractions;
using ND.SharedKernel.Time;
using StackExchange.Redis;
using ND.Infrastructure.Redis;
using Serilog;
using FluentValidation;
using ND.PrinterAdapter.Application.DTOs;
using ND.PrinterAdapter.Application.Validation;
using ND.PrinterAdapter.Application.Dtos;

var builder = WebApplication.CreateBuilder(args);

Log.Logger = SerilogConfiguration.Configure(
    new LoggerConfiguration(), builder.Configuration, "printer-adapter").CreateLogger();
builder.Host.UseSerilog();

var dbPath = builder.Configuration["SQLITE_PRINTER_PATH"] ?? "data/printer.db";
builder.Services.AddDbContext<PrinterDbContext>(opts => opts.UseSqlite($"Data Source={dbPath}"));
builder.Services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<PrinterDbContext>());

var redisConnection = builder.Configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisConnection));
builder.Services.AddSingleton<IIdempotencyService, RedisIdempotencyService>();
builder.Services.AddSingleton<RedisHeartbeatCache>();

builder.Services.AddSingleton<ISystemClock, SystemClock>();
builder.Services.AddSingleton<IPrinterAdapter, ZplTcpPrinterAdapter>();

// CUPS IPP state aggregator — queries CUPS IPP API at host.docker.internal:631
// to determine real hardware state (Online/Busy/Printing/Waiting/Warning/Offline/Error).
// Must be singleton so the HttpClient pool is shared across all health-check calls.
builder.Services.AddHttpClient<CupsPrinterStateAggregator>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(5);
    client.DefaultRequestHeaders.Add("Accept", "application/ipp");
});
builder.Services.AddSingleton<ICupsPrinterStateAggregator>(sp =>
    sp.GetRequiredService<CupsPrinterStateAggregator>());

builder.Services.AddSingleton<IPrinterDriverFactory, PrinterDriverFactory>();

// Label rendering strategy
builder.Services.AddSingleton<ILabelRenderer, ZplRenderer>();

// Print Queue
builder.Services.AddSingleton<IPrintQueue, PrintQueue>();
builder.Services.AddHostedService<PrintQueueProcessor>();

// Repositories (scoped — use the DbContext's lifetime)
builder.Services.AddScoped<ILabelTemplateRepository, LabelTemplateRepository>();
builder.Services.AddScoped<IPrintHistoryRepository, PrintHistoryRepository>();

// Validators
builder.Services.AddValidatorsFromAssemblyContaining<CreateTemplateRequestValidator>();

// RabbitMQ registrations
builder.Services.Configure<RabbitMqOptions>(builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.AddSingleton<IRabbitMqConsumer, RabbitMqConsumer>();
builder.Services.AddSingleton<IRabbitMqPublisher, RabbitMqPublisher>();

// Register hosted consumer
builder.Services.AddHostedService<JobProcessingConsumer>();
builder.Services.AddHostedService<BatchPrintConsumer>();
builder.Services.AddHostedService<HeartbeatHostedService>();
builder.Services.AddHostedService<PrinterHealthService>();

// Virtual printer simulator — self-hosted TCP listeners replacing device-simulator's printer TCP server
builder.Services.AddSingleton<VirtualPrinterSimulator>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<VirtualPrinterSimulator>());

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();   // Microsoft.AspNetCore.OpenApi — generates /openapi/v1.json

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();
app.UseCors();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PrinterDbContext>();
    var dbDir = Path.GetDirectoryName(Path.GetFullPath(dbPath));
    if (!string.IsNullOrEmpty(dbDir)) Directory.CreateDirectory(dbDir);
    await db.Database.EnsureCreatedAsync();

    // Safe schema upgrade for existing databases — SQLite only.
    // EnsureCreated does not add new columns to existing tables, so we do it manually.
    // These are idempotent: SQLite throws "duplicate column name" if it already exists,
    // which we catch and ignore.
    var conn = db.Database.GetDbConnection();
    await conn.OpenAsync();

    // Explicitly set journal mode to DELETE to disable WAL mode and avoid container sync/lock issues
    using (var pragmaCmd = conn.CreateCommand())
    {
        pragmaCmd.CommandText = "PRAGMA journal_mode=DELETE;";
        await pragmaCmd.ExecuteNonQueryAsync();
    }
    foreach (var sql in new[]
    {
        "ALTER TABLE printer_printers ADD COLUMN driver_type TEXT NOT NULL DEFAULT 'simulation'",
        "ALTER TABLE printer_printers ADD COLUMN cups_queue_name TEXT",
        "ALTER TABLE printer_printers ADD COLUMN is_active_for_work INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE printer_printers ADD COLUMN active_template_id TEXT",
        "ALTER TABLE printer_printers ADD COLUMN active_template_name TEXT",
        "ALTER TABLE printer_printers ADD COLUMN activated_at TEXT",
        "ALTER TABLE printer_printers ADD COLUMN activated_by TEXT",
        "ALTER TABLE label_templates ADD COLUMN status TEXT NOT NULL DEFAULT 'published'",
        "ALTER TABLE label_templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_templates ADD COLUMN created_by TEXT",
        "ALTER TABLE label_templates ADD COLUMN updated_by TEXT",
        "ALTER TABLE label_templates ADD COLUMN note TEXT",
        // N-Up layout columns (idempotent — silently ignored if already exist)
        "ALTER TABLE label_templates ADD COLUMN layout_type TEXT NOT NULL DEFAULT '1UP'",
        "ALTER TABLE label_templates ADD COLUMN sheet_columns INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_templates ADD COLUMN sheet_rows INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_templates ADD COLUMN gap_mm REAL NOT NULL DEFAULT 0",
        @"CREATE TABLE IF NOT EXISTS printer_template_assignments (
            id TEXT PRIMARY KEY,
            printer_code TEXT NOT NULL UNIQUE,
            template_id TEXT NOT NULL,
            template_name TEXT,
            assigned_by TEXT,
            assigned_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"
    })
    {
        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = sql;
            await cmd.ExecuteNonQueryAsync();
        }
        catch { /* Column/table already exists — safe to ignore */ }
    }

    // Migrate any existing simulation printers still pointing to old device-simulator host -> localhost
    try
    {
        using var migCmd = conn.CreateCommand();
        migCmd.CommandText = "UPDATE printer_printers SET ip_address = 'localhost' WHERE driver_type = 'simulation' AND ip_address != 'localhost'";
        await migCmd.ExecuteNonQueryAsync();
    }
    catch { /* ignore */ }

    await conn.CloseAsync();

    // Seed default printers (including the physical CUPS printer)
    var printerHost = Environment.GetEnvironmentVariable("PRINTER_HOST") ?? app.Configuration["Printer:Host"] ?? "localhost";
    var printerPort = int.TryParse(Environment.GetEnvironmentVariable("PRINTER_PORT") ?? app.Configuration["Printer:Port"], out var p) ? p : 9100;
    await PrinterDbSeeder.SeedAsync(db, printerHost, printerPort);

    // Seed 5 default label templates
    await SeedDefaultTemplatesAsync(db);
}

// ── OpenAPI + Scalar UI ───────────────────────────────────────────────────────────
app.MapOpenApi();              // JSON spec  →  /openapi/v1.json
app.MapScalarApiReference(opt =>
{
    opt.Title           = "Printer Adapter API";
    opt.Theme           = ScalarTheme.DeepSpace;
    opt.DefaultHttpClient = new(ScalarTarget.Shell, ScalarClient.Curl);
});                            // UI          →  /scalar/v1

// ── Infrastructure endpoints ────────────────────────────────────────────────

app.MapGet("/api/printers", async (PrinterDbContext db, CancellationToken ct) =>
    Results.Ok(await db.Printers.Select(p => new
    {
        p.Id, p.PrinterCode, p.DisplayName, p.IpAddress, p.Port,
        p.Protocol, p.Vendor, p.Status, p.DriverType, p.CupsQueueName,
        p.GroupId, p.LastHeartbeatAt,
        p.IsActiveForWork, p.ActiveTemplateId, p.ActiveTemplateName, p.ActivatedAt, p.ActivatedBy
    }).ToListAsync(ct)))
    .WithName("GetAllPrinters")
    .WithSummary("List all printers")
    .WithDescription("Returns all registered printers with their current status, driver type (simulation / tcp / cups), CUPS queue name, active template assignment, last heartbeat timestamp, and work activation state.")
    .WithTags("Printers")
    .Produces(200);

// GET /api/printers/ready — printers that are online and available for work registration
app.MapGet("/api/printers/ready", async (
    bool? includeSimulation,
    PrinterDbContext db,
    CancellationToken ct) =>
{
    var query = db.Printers
        .Where(p => p.Status == "ONLINE" || p.Status == "IDLE" || p.Status == "Idle");

    // By default exclude simulation printers — they are managed by the device-simulator service.
    // Pass ?includeSimulation=true to include them (e.g. for development/testing).
    if (includeSimulation != true)
        query = query.Where(p => p.DriverType != "simulation");

    var printers = await query.Select(p => new
    {
        p.Id, p.PrinterCode, p.DisplayName, p.IpAddress, p.Port,
        p.Protocol, p.Vendor, p.Status, p.DriverType, p.CupsQueueName,
        p.LastHeartbeatAt, p.IsActiveForWork, p.ActiveTemplateId, p.ActiveTemplateName
    }).ToListAsync(ct);

    return Results.Ok(printers);
})
    .WithName("GetReadyPrinters")
    .WithSummary("List ready printers")
    .WithDescription("Returns only printers whose status is ONLINE or IDLE. These are candidates to be activated for production work via the activate endpoint.")
    .WithTags("Printers")
    .Produces(200);

// GET /api/printers/active — printers activated for production work
app.MapGet("/api/printers/active", async (PrinterDbContext db, CancellationToken ct) =>
    Results.Ok(await db.Printers
        .Where(p => p.IsActiveForWork)
        .Select(p => new
        {
            p.Id, p.PrinterCode, p.DisplayName, p.IpAddress, p.Port,
            p.Protocol, p.Vendor, p.Status, p.DriverType, p.CupsQueueName,
            p.LastHeartbeatAt, p.IsActiveForWork, p.ActiveTemplateId, p.ActiveTemplateName,
            p.ActivatedAt, p.ActivatedBy
        }).ToListAsync(ct)))
    .WithName("GetActivePrinters")
    .WithSummary("List printers active for production")
    .WithDescription("Returns all printers that have been explicitly activated for production work (IsActiveForWork = true), including which operator activated them and the assigned template.")
    .WithTags("Printers")
    .Produces(200);

// POST /api/printers/{code}/activate — add printer to active work list with mandatory template
app.MapPost("/api/printers/{code}/activate", async (
    string code,
    JsonElement body,
    PrinterDbContext db,
    IUnitOfWork uow,
    CancellationToken ct) =>
{
    var printer = await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == code, ct);
    if (printer is null)
        return Results.NotFound(new { error = $"Printer '{code}' not found" });

    if (!body.TryGetProperty("templateId", out var tidProp) || string.IsNullOrEmpty(tidProp.GetString()))
        return Results.BadRequest(new { error = "templateId is required when activating a printer" });
    var templateId = tidProp.GetString()!;

    // Validate template exists
    var template = await db.LabelTemplates.FirstOrDefaultAsync(t => t.Id == templateId, ct);
    if (template is null)
        return Results.BadRequest(new { error = $"Template '{templateId}' not found" });
    if (template.Status == "archived")
        return Results.BadRequest(new { error = "Cannot assign an archived template to a printer" });

    var activatedBy = body.TryGetProperty("activatedBy", out var byProp) ? byProp.GetString() : null;
    printer.Activate(templateId, template.Name, activatedBy);
    await uow.SaveChangesAsync(ct);

    return Results.Ok(new
    {
        printer.PrinterCode, printer.DisplayName, printer.IsActiveForWork,
        printer.ActiveTemplateId, printer.ActiveTemplateName, printer.ActivatedAt
    });
})
.WithName("ActivatePrinter")
.WithSummary("Activate printer for production work")
.WithDescription("Marks a printer as active for production and assigns a mandatory label template. Body must include `templateId` (required) and optionally `activatedBy`. The template must exist and must not be archived.")
.WithTags("Printers")
.Produces(200)
.ProducesProblem(400)
.ProducesProblem(404);

// POST /api/printers/{code}/deactivate — remove printer from active work list
app.MapPost("/api/printers/{code}/deactivate", async (
    string code,
    PrinterDbContext db,
    IUnitOfWork uow,
    CancellationToken ct) =>
{
    var printer = await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == code, ct);
    if (printer is null)
        return Results.NotFound(new { error = $"Printer '{code}' not found" });

    printer.Deactivate();
    await uow.SaveChangesAsync(ct);
    return Results.Ok(new { printer.PrinterCode, printer.IsActiveForWork });
})
.WithName("DeactivatePrinter")
.WithSummary("Deactivate printer from production work")
.WithDescription("Removes a printer from the active-for-work list. The printer remains registered but will not receive automatic print job routing until re-activated.")
.WithTags("Printers")
.Produces(200)
.ProducesProblem(404);

// GET /api/simulation/printers — status of all virtual printer simulators
app.MapGet("/api/simulation/printers", (VirtualPrinterSimulator simulator) =>
    Results.Ok(simulator.GetStatus()))
    .WithName("GetSimulationPrinters")
    .WithSummary("List virtual printer simulator statuses")
    .WithDescription("Returns the current state of all virtual TCP printer simulators (online/offline, failure mode, port). These simulators replace the physical printer TCP servers in development and testing environments.")
    .WithTags("Simulation")
    .Produces(200);

// POST /api/simulation/printers/{code}/mode — set failure mode for a simulated printer
app.MapPost("/api/simulation/printers/{code}/mode", (string code, JsonElement body, VirtualPrinterSimulator simulator) =>
{
    var mode = body.TryGetProperty("mode", out var m) ? m.GetString() ?? "Success" : "Success";
    simulator.SetMode(code, mode);
    return Results.Ok(new { printerCode = code, mode });
})
.WithName("SetSimulationPrinterMode")
.WithSummary("Set failure mode of a simulated printer")
.WithDescription("Changes the behaviour of a virtual printer simulator. Supported modes: `Success` (normal ACK), `Timeout` (connection hangs), `Disconnect` (immediate TCP close), `Error` (NACK response). Useful for testing print retry and error-handling logic.")
.WithTags("Simulation")
.Produces(200);

// POST /api/simulation/printers/{code}/connect|disconnect
app.MapPost("/api/simulation/printers/{code}/connect",
    async (string code, VirtualPrinterSimulator simulator, CancellationToken ct) =>
    { await simulator.SetOnlineAsync(code, true, ct); return Results.Ok(); })
    .WithName("ConnectSimulationPrinter")
    .WithSummary("Bring simulated printer online")
    .WithDescription("Starts the virtual TCP listener for the specified simulated printer code, making it appear online and reachable to the print queue processor.")
    .WithTags("Simulation")
    .Produces(200);

app.MapPost("/api/simulation/printers/{code}/disconnect",
    async (string code, VirtualPrinterSimulator simulator, CancellationToken ct) =>
    { await simulator.SetOnlineAsync(code, false, ct); return Results.Ok(); })
    .WithName("DisconnectSimulationPrinter")
    .WithSummary("Take simulated printer offline")
    .WithDescription("Stops the virtual TCP listener for the specified simulated printer code, causing it to appear unreachable. Useful for testing offline/failover scenarios.")
    .WithTags("Simulation")
    .Produces(200);

app.MapGet("/api/printers/discover", async (IPrinterDriverFactory driverFactory, ILoggerFactory loggerFactory, CancellationToken ct) =>
{
    // Use CupsPrinterDriver discovery to enumerate CUPS queues
    var cupsQueue = Environment.GetEnvironmentVariable("CUPS_QUEUE") ?? "Zebra_Technologies_ZTC_GK420t";
    var cupsDriver = driverFactory.ResolveByType("cups", cupsQueueName: cupsQueue);
    var discovered = await cupsDriver.DiscoverAsync(ct);
    return Results.Ok(discovered);
})
.WithName("DiscoverPrinters")
.WithSummary("Discover CUPS printers")
.WithDescription("Enumerates locally available CUPS print queues using the CUPS driver. Returns a list of discovered printer names and connection details. Requires a CUPS daemon to be reachable.")
.WithTags("Printers")
.Produces(200);

app.MapGet("/api/printers/{code}/health", async (string code, PrinterDbContext db, IPrinterDriverFactory driverFactory, CancellationToken ct) =>
{
    var printer = await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == code, ct);
    if (printer is null)
        return Results.NotFound(new { error = $"Printer '{code}' not found" });

    var driver = driverFactory.Resolve(printer);
    var status = await driver.GetStatusAsync(ct);
    var isReady = status is ND.PrinterAdapter.Application.Dtos.PrinterDriverStatus.Online
                       or ND.PrinterAdapter.Application.Dtos.PrinterDriverStatus.Busy
                       or ND.PrinterAdapter.Application.Dtos.PrinterDriverStatus.Printing
                       or ND.PrinterAdapter.Application.Dtos.PrinterDriverStatus.Waiting
                       or ND.PrinterAdapter.Application.Dtos.PrinterDriverStatus.Warning;

    return Results.Ok(new
    {
        printerCode = printer.PrinterCode,
        displayName = printer.DisplayName,
        driverType = printer.DriverType,
        cupsQueueName = printer.CupsQueueName,
        status = status.ToString(),
        isReady,
        checkedAt = DateTimeOffset.UtcNow
    });
})
.WithName("GetPrinterHealth")
.WithSummary("Get real-time health of a printer")
.WithDescription("Queries the driver layer for the live status of the specified printer (Idle, Printing, Offline, Error). Returns `isReady: true` when the printer can accept print jobs.")
.WithTags("Printers")
.Produces(200)
.ProducesProblem(404);

app.MapGet("/api/printers/{code}/maintenance", async (string code, PrinterDbContext db, IPrinterDriverFactory driverFactory, CancellationToken ct) =>
{
    var printer = await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == code, ct);
    if (printer is null)
        return Results.NotFound(new { error = $"Printer '{code}' not found" });

    var driver = driverFactory.Resolve(printer);
    var maintenanceInfo = await driver.GetMaintenanceInfoAsync(ct);
    if (maintenanceInfo is null)
        return Results.BadRequest(new { error = "Failed to retrieve maintenance info from driver." });

    return Results.Ok(maintenanceInfo);
})
.WithName("GetPrinterMaintenanceInfo")
.WithSummary("Get maintenance details of a printer")
.WithDescription("Queries the driver layer for detailed serial, print counter, cleaning recommendations and temperature of the specified printer.")
.WithTags("Printers")
.Produces(200)
.ProducesProblem(400)
.ProducesProblem(404);

app.MapPost("/api/printers/{code}/test-connection", async (string code, PrinterDbContext db, IPrinterDriverFactory driverFactory, CancellationToken ct) =>
{
    var printer = await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == code, ct);
    if (printer is null)
        return Results.NotFound(new { error = $"Printer '{code}' not found" });

    var driver = driverFactory.Resolve(printer);
    var isHealthy = await driver.HealthCheckAsync(ct);
    var status = await driver.GetStatusAsync(ct);

    return Results.Ok(new
    {
        printerCode = printer.PrinterCode,
        driverType = printer.DriverType,
        cupsQueueName = printer.CupsQueueName,
        status = status.ToString(),
        isReachable = isHealthy,
        checkedAt = DateTimeOffset.UtcNow
    });
})
.WithName("TestPrinterConnection")
.WithSummary("Test TCP/CUPS connectivity to a printer")
.WithDescription("Performs a full driver-level health check and connection probe for the specified printer. Returns `isReachable: true` if the printer is reachable and responding. Useful for pre-print diagnostics from the Kiosk UI.")
.WithTags("Printers")
.Produces(200)
.ProducesProblem(404);

app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "printer-adapter" }))
    .WithName("HealthCheck")
    .WithSummary("Service health check")
    .WithDescription("Lightweight liveness probe. Returns HTTP 200 with `{ status: 'healthy', service: 'printer-adapter' }` when the service is running. Used by Docker health checks and load balancers.")
    .WithTags("Health")
    .Produces(200);

// ── Label Template API ──────────────────────────────────────────────────────

// GET /api/label-templates
app.MapGet("/api/label-templates", async (
    ILabelTemplateRepository repo,
    string? search,
    int? dpi,
    string? status,
    string? layoutType,
    bool includeArchived = false,
    CancellationToken ct = default) =>
{
    var templates = await repo.ListAsync(search, dpi, status, includeArchived, ct);

    // Filter by layoutType if provided (1UP | 2UP | 3UP)
    if (!string.IsNullOrWhiteSpace(layoutType))
    {
        var lt = layoutType.ToUpperInvariant();
        templates = templates.Where(t => t.LayoutType.Equals(lt, StringComparison.OrdinalIgnoreCase)).ToList();
    }

    return Results.Ok(templates.Select(t =>
    {
        System.Text.Json.JsonElement jsonEl;
        try { jsonEl = System.Text.Json.JsonDocument.Parse(t.TemplateJson).RootElement; }
        catch { jsonEl = System.Text.Json.JsonDocument.Parse("{}").RootElement; }
        return new
        {
            t.Id, t.Name, t.Description, t.Note,
            t.TemplateCode, t.Category, t.Orientation, t.Revision,
            t.SupportedBarcodeTypes, t.SupportedPrinterModels, t.CompatibleStationTypes,
            t.Dpi, t.LabelWidth, t.LabelHeight,
            templateJson = jsonEl,
            t.Version, t.Status, t.IsDefault,
            t.IsActive, t.CreatedBy, t.UpdatedBy, t.CreatedAt, t.UpdatedAt,
            // N-Up layout fields
            t.LayoutType, t.SheetColumns, t.SheetRows, t.GapMm
        };
    }));
})
.WithName("ListLabelTemplates")
.WithSummary("List label templates")
.WithDescription("Returns all label templates. Supports optional filtering by `search` (name/code partial match), `dpi`, `status`, `layoutType` (1UP | 2UP | 3UP), and `includeArchived` flag.")
.WithTags("Label Templates")
.Produces(200);

// GET /api/label-templates/active — returns the default published template
app.MapGet("/api/label-templates/active", async (
    ILabelTemplateRepository repo,
    ILoggerFactory loggerFactory,
    CancellationToken ct) =>
{
    var logger = loggerFactory.CreateLogger("PrinterAdapter.Api");
    logger.LogInformation("[API] GET /api/label-templates/active called.");
    var template = await repo.GetDefaultAsync(ct);
    if (template is null)
    {
        logger.LogWarning("[API] No default template found.");
        return Results.NotFound(new { error = "No default published template found." });
    }
    logger.LogInformation("[API] Returning active template '{Name}' v{Version}", template.Name, template.Version);
    try
    {
        var parsed = System.Text.Json.JsonDocument.Parse(template.TemplateJson).RootElement;
        return Results.Ok(new
        {
            template.Id, template.Name, template.Description, template.Note,
            template.TemplateCode, template.Category, template.Orientation, template.Revision,
            template.SupportedBarcodeTypes, template.SupportedPrinterModels, template.CompatibleStationTypes,
            template.Dpi, template.LabelWidth, template.LabelHeight,
            templateJson = parsed, template.Version, template.Status,
            template.IsDefault, template.IsActive, template.CreatedBy, template.UpdatedBy,
            template.CreatedAt, template.UpdatedAt,
            template.LayoutType, template.SheetColumns, template.SheetRows, template.GapMm
        });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[API] Failed to parse TemplateJson for '{Name}'", template.Name);
        throw;
    }
})
.WithName("GetActiveLabelTemplate")
.WithSummary("Get the active (default) label template")
.WithDescription("Returns the single label template flagged as the system default (IsDefault = true, Status = published). Used by the Device Simulator and print pipeline to determine which template to use when no explicit template is specified in the print job.")
.WithTags("Label Templates")
.Produces(200)
.ProducesProblem(404);

// GET /api/label-templates/default
app.MapGet("/api/label-templates/default", async (ILabelTemplateRepository repo, CancellationToken ct) =>
{
    var template = await repo.GetDefaultAsync(ct);
    if (template is null) return Results.NotFound(new { error = "No default template set." });
    return Results.Ok(new
    {
        template.Id, template.Name, template.Description, template.Note,
        template.TemplateCode, template.Category, template.Orientation, template.Revision,
        template.SupportedBarcodeTypes, template.SupportedPrinterModels, template.CompatibleStationTypes,
        template.Dpi, template.LabelWidth, template.LabelHeight,
        templateJson = System.Text.Json.JsonDocument.Parse(template.TemplateJson).RootElement,
        template.Version, template.Status, template.IsDefault,
        template.IsActive, template.CreatedBy, template.UpdatedBy, template.CreatedAt, template.UpdatedAt,
        template.LayoutType, template.SheetColumns, template.SheetRows, template.GapMm
    });
})
.WithName("GetDefaultLabelTemplate")
.WithSummary("Get the default label template")
.WithDescription("Alias for the active template endpoint. Returns the label template that has IsDefault = true. Only one template can hold the default flag at a time; the flag is cleared automatically when a new default is set.")
.WithTags("Label Templates")
.Produces(200)
.ProducesProblem(404);

// POST /api/label-templates/{id}/publish
app.MapPost("/api/label-templates/{id}/publish", async (
    string id, ILabelTemplateRepository repo, IUnitOfWork uow, CancellationToken ct) =>
{
    var template = await repo.GetByIdAsync(id, ct);
    if (template is null) return Results.NotFound();
    template.Publish();
    await repo.UpdateAsync(template, ct);
    await uow.SaveChangesAsync(ct);
    return Results.Ok(new { template.Id, template.Status, template.Version });
})
.WithName("PublishLabelTemplate")
.WithSummary("Publish a label template")
.WithDescription("Transitions a label template from `draft` status to `published`. Only published templates can be assigned to printers or selected as the system default.")
.WithTags("Label Templates")
.Produces(200)
.ProducesProblem(404);

// POST /api/label-templates/{id}/archive
app.MapPost("/api/label-templates/{id}/archive", async (
    string id, ILabelTemplateRepository repo, IUnitOfWork uow, CancellationToken ct) =>
{
    var template = await repo.GetByIdAsync(id, ct);
    if (template is null) return Results.NotFound();
    template.Archive();
    await repo.UpdateAsync(template, ct);
    await uow.SaveChangesAsync(ct);
    return Results.Ok(new { template.Id, template.Status, template.Version });
})
.WithName("ArchiveLabelTemplate")
.WithSummary("Archive a label template")
.WithDescription("Soft-deletes a label template by changing its status to `archived`. Archived templates are excluded from list results (unless `includeArchived=true`), cannot be assigned to printers, and cannot be set as default.")
.WithTags("Label Templates")
.Produces(200)
.ProducesProblem(404);

// POST /api/label-templates/{id}/set-default
app.MapPost("/api/label-templates/{id}/set-default", async (
    string id, ILabelTemplateRepository repo, IUnitOfWork uow, CancellationToken ct) =>
{
    var template = await repo.GetByIdAsync(id, ct);
    if (template is null) return Results.NotFound();
    if (template.Status == "archived")
        return Results.BadRequest(new { error = "Cannot set an archived template as default." });
    await repo.ClearDefaultFlagAsync(ct);
    template.SetAsDefault();
    await repo.UpdateAsync(template, ct);
    await uow.SaveChangesAsync(ct);
    return Results.Ok(new { template.Id, template.IsDefault, template.Status });
})
.WithName("SetDefaultLabelTemplate")
.WithSummary("Set a template as the system default")
.WithDescription("Clears the IsDefault flag on all other templates and sets it on the specified template. The template must not be archived. The default template is used automatically by the print pipeline when no explicit template is provided in a print request.")
.WithTags("Label Templates")
.Produces(200)
.ProducesProblem(400)
.ProducesProblem(404);

// GET /api/label-templates/{id}/export
app.MapGet("/api/label-templates/{id}/export", async (
    string id, ILabelTemplateRepository repo, CancellationToken ct) =>
{
    var template = await repo.GetByIdAsync(id, ct);
    if (template is null) return Results.NotFound();
    var export = new
    {
        exportVersion = 1,
        exportedAt = DateTime.UtcNow.ToString("o"),
        template = new
        {
            template.Name, template.Description, template.Dpi,
            template.LabelWidth, template.LabelHeight,
            templateJson = System.Text.Json.JsonDocument.Parse(template.TemplateJson).RootElement,
            template.Version, template.Status,
            // N-Up layout
            template.LayoutType, template.SheetColumns, template.SheetRows, template.GapMm
        }
    };
    var json = System.Text.Json.JsonSerializer.Serialize(export, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
    var bytes = System.Text.Encoding.UTF8.GetBytes(json);
    var filename = $"{template.Name.Replace(" ", "_")}_v{template.Version}.json";
    return Results.File(bytes, "application/json", filename);
})
.WithName("ExportLabelTemplate")
.WithSummary("Export a label template to JSON file")
.WithDescription("Downloads a label template as a portable JSON file (`application/json`). The export envelope includes `exportVersion`, `exportedAt` timestamp, and the full template definition. The downloaded file can be re-imported via `POST /api/label-templates/import`.")
.WithTags("Label Templates")
.Produces(200, contentType: "application/json")
.ProducesProblem(404);

// POST /api/label-templates/import
app.MapPost("/api/label-templates/import", async (
    System.Text.Json.JsonElement body,
    ILabelTemplateRepository repo,
    IUnitOfWork uow,
    CancellationToken ct) =>
{
    try
    {
        var tmpl = body.GetProperty("template");
        var name = tmpl.GetProperty("name").GetString() ?? "Imported Template";
        var desc = tmpl.TryGetProperty("description", out var d) ? d.GetString() : null;
        var dpiVal = tmpl.TryGetProperty("dpi", out var dpiP) ? dpiP.GetInt32() : 203;
        var wVal = tmpl.TryGetProperty("labelWidth", out var wP) ? wP.GetDouble() : 50;
        var hVal = tmpl.TryGetProperty("labelHeight", out var hP) ? hP.GetDouble() : 30;
        var layoutType = tmpl.TryGetProperty("layoutType", out var ltP) ? ltP.GetString() ?? "1UP" : "1UP";
        var sheetColumns = tmpl.TryGetProperty("sheetColumns", out var scP) ? scP.GetInt32() : 1;
        var sheetRows = tmpl.TryGetProperty("sheetRows", out var srP) ? srP.GetInt32() : 1;
        var gapMm = tmpl.TryGetProperty("gapMm", out var gmP) ? gmP.GetDouble() : 0.0;
        var templateJsonProp = tmpl.GetProperty("templateJson");
        var templateJsonStr = templateJsonProp.ValueKind == System.Text.Json.JsonValueKind.String
            ? templateJsonProp.GetString()!
            : templateJsonProp.GetRawText();
        // Validate JSON
        System.Text.Json.JsonDocument.Parse(templateJsonStr);
        var imported = LabelTemplate.Create(
            $"{name} (imported)", desc, dpiVal, wVal, hVal, templateJsonStr, "draft",
            layoutType: layoutType, sheetColumns: sheetColumns, sheetRows: sheetRows, gapMm: gapMm);
        await repo.AddAsync(imported, ct);
        await uow.SaveChangesAsync(ct);
        return Results.Created($"/api/label-templates/{imported.Id}", new { imported.Id, imported.Name, imported.Status });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = $"Import failed: {ex.Message}" });
    }
})
.WithName("ImportLabelTemplate")
.WithSummary("Import a label template from a JSON file")
.WithDescription("Accepts the export envelope produced by `GET /api/label-templates/{id}/export`. Parses `template.name`, `template.description`, `template.dpi`, `template.labelWidth`, `template.labelHeight`, and `template.templateJson`. The imported template is created in `draft` status with name suffixed `(imported)`.")
.WithTags("Label Templates")
.Produces(201)
.ProducesProblem(400);

// ── Printer Assignment API ────────────────────────────────────────────────────

// GET /api/printer-template-assignments
app.MapGet("/api/printer-template-assignments", async (ILabelTemplateRepository repo, CancellationToken ct) =>
    Results.Ok(await repo.GetAllAssignmentsAsync(ct)))
    .WithName("GetAllPrinterTemplateAssignments")
    .WithSummary("List all printer-to-template assignments")
    .WithDescription("Returns all current printer template assignments. Each assignment maps a `printerCode` to a specific `templateId` and records who made the assignment and when.")
    .WithTags("Printer Assignments")
    .Produces(200);

// GET /api/printer-template-assignments/{printerCode}
app.MapGet("/api/printer-template-assignments/{printerCode}", async (
    string printerCode, ILabelTemplateRepository repo, CancellationToken ct) =>
{
    var assignment = await repo.GetAssignmentForPrinterAsync(printerCode, ct);
    return assignment is null ? Results.NotFound() : Results.Ok(assignment);
})
.WithName("GetPrinterTemplateAssignment")
.WithSummary("Get template assignment for a specific printer")
.WithDescription("Returns the currently assigned label template for the given printer code. Returns 404 if no explicit assignment exists (the printer will fall back to the system default template).")
.WithTags("Printer Assignments")
.Produces(200)
.ProducesProblem(404);

// POST /api/printer-template-assignments
app.MapPost("/api/printer-template-assignments", async (
    AssignPrinterRequest req,
    ILabelTemplateRepository repo,
    IUnitOfWork uow,
    CancellationToken ct) =>
{
    var template = await repo.GetByIdAsync(req.TemplateId, ct);
    if (template is null) return Results.BadRequest(new { error = "Template not found." });
    await repo.UpsertAssignmentAsync(req.PrinterCode, req.TemplateId, template.Name, req.AssignedBy, ct);
    await uow.SaveChangesAsync(ct);
    return Results.Ok(new { req.PrinterCode, req.TemplateId, templateName = template.Name });
})
.WithName("AssignTemplateToParinter")
.WithSummary("Assign a label template to a printer")
.WithDescription("Creates or updates a printer-to-template assignment (upsert by `printerCode`). Body: `{ printerCode: string (required), templateId: string (required), assignedBy: string (optional) }`. The template must exist.")
.WithTags("Printer Assignments")
.Produces(200)
.ProducesProblem(400);

// DELETE /api/printer-template-assignments/{printerCode}
app.MapDelete("/api/printer-template-assignments/{printerCode}", async (
    string printerCode, ILabelTemplateRepository repo, IUnitOfWork uow, CancellationToken ct) =>
{
    await repo.RemoveAssignmentAsync(printerCode, ct);
    await uow.SaveChangesAsync(ct);
    return Results.NoContent();
})
.WithName("RemovePrinterTemplateAssignment")
.WithSummary("Remove a printer's template assignment")
.WithDescription("Deletes the explicit template assignment for the specified printer. After removal the printer reverts to the system default template for print routing.")
.WithTags("Printer Assignments")
.Produces(204);


// POST /api/label-templates/preview

app.MapPost("/api/label-templates/preview", async (LabelPreviewRequest req, CancellationToken ct) =>
{
    try
    {
        using var client = new HttpClient();
        client.Timeout = TimeSpan.FromSeconds(15);

        // Labelary API uses dots-per-mm (dpmm) — not raw DPI:
        //   8dpmm  = 203 DPI  (most common desktop/industrial label printer)
        //   12dpmm = 300 DPI
        //   24dpmm = 600 DPI
        var dpiStr = req.Dpi switch
        {
            >= 500 => "24dpmm",
            >= 250 => "12dpmm",
            _      => "8dpmm"    // default: 203 DPI
        };

        // Labelary format: /v1/printers/{dpmm}/labels/{widthInch}x{heightInch}/0/
        var widthInch  = req.Width  > 0 ? req.Width  : 4.0;
        var heightInch = req.Height > 0 ? req.Height : 2.0;
        var url = $"http://api.labelary.com/v1/printers/{dpiStr}/labels/{widthInch}x{heightInch}/0/";

        using var content = new StringContent(req.Zpl, System.Text.Encoding.UTF8, "application/x-www-form-urlencoded");
        client.DefaultRequestHeaders.Add("Accept", "image/png");

        var response = await client.PostAsync(url, content, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            return Results.BadRequest(new { error = $"Labelary returned {response.StatusCode}: {body}" });
        }

        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
        return Results.File(bytes, "image/png");
    }
    catch (TaskCanceledException)
    {
        return Results.BadRequest(new { error = "Preview request timed out (Labelary API unreachable)" });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = $"Failed to proxy preview request: {ex.Message}" });
    }
})
.WithName("PreviewZpl")
.WithSummary("Render ZPL to PNG image via Labelary")
.WithDescription("Proxies a ZPL string to the Labelary public API (api.labelary.com) and returns a rendered PNG image. Body: `{ zpl: string (required), dpi: int (default 203), width: double (inches, default 4.0), height: double (inches, default 2.4) }`. DPI is automatically converted to Labelary dpmm units (203→8dpmm, 300→12dpmm, 600→24dpmm). Returns `image/png` on success.")
.WithTags("Template Rendering")
.Produces(200, contentType: "image/png")
.ProducesProblem(400);


// GET /api/label-templates/{id}
app.MapGet("/api/label-templates/{id}", async (string id, ILabelTemplateRepository repo, CancellationToken ct) =>
{
    var template = await repo.GetByIdAsync(id, ct);
    if (template is null) return Results.NotFound();
    return Results.Ok(new
    {
        template.Id, template.Name, template.Description, template.Note,
        template.TemplateCode, template.Category, template.Orientation, template.Revision,
        template.SupportedBarcodeTypes, template.SupportedPrinterModels, template.CompatibleStationTypes,
        template.Dpi, template.LabelWidth, template.LabelHeight,
        templateJson = System.Text.Json.JsonDocument.Parse(template.TemplateJson).RootElement,
        template.Version, template.Status, template.IsDefault,
        template.IsActive, template.CreatedBy, template.UpdatedBy, template.CreatedAt, template.UpdatedAt,
        template.LayoutType, template.SheetColumns, template.SheetRows, template.GapMm
    });
})
.WithName("GetLabelTemplateById")
.WithSummary("Get a label template by ID")
.WithDescription("Returns the full detail of a single label template identified by its UUID. Includes all metadata fields (templateCode, category, orientation, revision, supportedBarcodeTypes, supportedPrinterModels, compatibleStationTypes) and the parsed templateJson element.")
.WithTags("Label Templates")
.Produces(200)
.ProducesProblem(404);

// POST /api/label-templates
app.MapPost("/api/label-templates", async (
    CreateTemplateRequest req,
    IValidator<CreateTemplateRequest> validator,
    ILabelTemplateRepository repo,
    IUnitOfWork uow,
    CancellationToken ct) =>
{
    var validationResult = await validator.ValidateAsync(req, ct);
    if (!validationResult.IsValid)
    {
        return Results.ValidationProblem(validationResult.ToDictionary());
    }

    var template = LabelTemplate.Create(
        req.Name, req.Description, req.Dpi, req.LabelWidth, req.LabelHeight, req.TemplateJson,
        note: req.Note, templateCode: req.TemplateCode, category: req.Category, orientation: req.Orientation,
        revision: req.Revision, supportedBarcodeTypes: req.SupportedBarcodeTypes,
        supportedPrinterModels: req.SupportedPrinterModels, compatibleStationTypes: req.CompatibleStationTypes,
        layoutType: req.LayoutType, sheetColumns: req.SheetColumns, sheetRows: req.SheetRows, gapMm: req.GapMm);
    await repo.AddAsync(template, ct);
    await uow.SaveChangesAsync(ct);

    var response = new
    {
        template.Id, template.Name, template.Description, template.Note,
        template.TemplateCode, template.Category, template.Orientation, template.Revision,
        template.SupportedBarcodeTypes, template.SupportedPrinterModels, template.CompatibleStationTypes,
        template.Dpi, template.LabelWidth, template.LabelHeight,
        templateJson = System.Text.Json.JsonDocument.Parse(template.TemplateJson).RootElement,
        template.Version, template.Status, template.IsDefault,
        template.IsActive, template.CreatedBy, template.UpdatedBy, template.CreatedAt, template.UpdatedAt,
        template.LayoutType, template.SheetColumns, template.SheetRows, template.GapMm
    };
    return Results.Created($"/api/label-templates/{template.Id}", response);
})
.WithName("CreateLabelTemplate")
.WithSummary("Create a new label template")
.WithDescription("Creates a new label template in `draft` status. **Validation rules**: `name` is required (max 100 chars); `dpi` must be 203, 300, or 600; `labelWidth` and `labelHeight` must be > 0 and ≤ 500 mm; `templateJson` must be valid JSON. **Optional fields**: `templateCode` (unique identifier, e.g. LBL-PRODUCT-50x30), `category`, `orientation` (PORTRAIT/LANDSCAPE, default PORTRAIT), `revision` (default A), `supportedBarcodeTypes`, `supportedPrinterModels`, `compatibleStationTypes`.")
.WithTags("Label Templates")
.Produces(201)
.ProducesValidationProblem()
.ProducesProblem(400);

// PUT /api/label-templates/{id}
app.MapPut("/api/label-templates/{id}", async (
    string id,
    UpdateTemplateRequest req,
    IValidator<UpdateTemplateRequest> validator,
    ILabelTemplateRepository repo,
    IUnitOfWork uow,
    CancellationToken ct) =>
{
    var validationResult = await validator.ValidateAsync(req, ct);
    if (!validationResult.IsValid)
    {
        return Results.ValidationProblem(validationResult.ToDictionary());
    }

    var template = await repo.GetByIdAsync(id, ct);
    if (template is null) return Results.NotFound();

    // Snapshot the current version before overwriting
    var snapshot = LabelTemplateVersion.Snapshot(template.Id, template.Version, template.TemplateJson);
    await repo.AddVersionAsync(snapshot, ct);

    template.Update(
        req.Name, req.Description, req.Dpi, req.LabelWidth, req.LabelHeight, req.TemplateJson,
        note: req.Note, templateCode: req.TemplateCode, category: req.Category, orientation: req.Orientation,
        revision: req.Revision, supportedBarcodeTypes: req.SupportedBarcodeTypes,
        supportedPrinterModels: req.SupportedPrinterModels, compatibleStationTypes: req.CompatibleStationTypes,
        gapMm: req.GapMm);
    await repo.UpdateAsync(template, ct);
    await uow.SaveChangesAsync(ct);

    return Results.Ok(new
    {
        template.Id, template.Name, template.Description, template.Note,
        template.TemplateCode, template.Category, template.Orientation, template.Revision,
        template.SupportedBarcodeTypes, template.SupportedPrinterModels, template.CompatibleStationTypes,
        template.Dpi, template.LabelWidth, template.LabelHeight,
        templateJson = System.Text.Json.JsonDocument.Parse(template.TemplateJson).RootElement,
        template.Version, template.Status, template.IsDefault,
        template.IsActive, template.CreatedBy, template.UpdatedBy, template.CreatedAt, template.UpdatedAt,
        template.LayoutType, template.SheetColumns, template.SheetRows, template.GapMm
    });
})
.WithName("UpdateLabelTemplate")
.WithSummary("Update an existing label template")
.WithDescription("Replaces all fields on a label template. Before saving, the current version is automatically snapshotted into the version history table (retrievable via `GET /api/label-templates/{id}/versions`). Applies the same validation rules as `POST /api/label-templates`. The `version` counter is incremented on each successful update.")
.WithTags("Label Templates")
.Produces(200)
.ProducesValidationProblem()
.ProducesProblem(404);

// DELETE /api/label-templates/{id}
app.MapDelete("/api/label-templates/{id}", async (
    string id, ILabelTemplateRepository repo, IUnitOfWork uow, CancellationToken ct) =>
{
    await repo.DeleteAsync(id, ct);
    await uow.SaveChangesAsync(ct);
    return Results.NoContent();
})
.WithName("DeleteLabelTemplate")
.WithSummary("Permanently delete a label template")
.WithDescription("Hard-deletes a label template and its associated version history. This action is irreversible. Consider using `POST /api/label-templates/{id}/archive` for a recoverable soft-delete instead.")
.WithTags("Label Templates")
.Produces(204);

// POST /api/label-templates/{id}/duplicate
app.MapPost("/api/label-templates/{id}/duplicate", async (
    string id,
    ILabelTemplateRepository repo,
    IUnitOfWork uow,
    CancellationToken ct) =>
{
    var original = await repo.GetByIdAsync(id, ct);
    if (original is null) return Results.NotFound();

    var copy = LabelTemplate.Create(
        $"{original.Name} (copy)", original.Description,
        original.Dpi, original.LabelWidth, original.LabelHeight, original.TemplateJson,
        category: original.Category, orientation: original.Orientation,
        supportedBarcodeTypes: original.SupportedBarcodeTypes,
        supportedPrinterModels: original.SupportedPrinterModels,
        compatibleStationTypes: original.CompatibleStationTypes,
        layoutType: original.LayoutType,
        sheetColumns: original.SheetColumns,
        sheetRows: original.SheetRows,
        gapMm: original.GapMm);
    await repo.AddAsync(copy, ct);
    await uow.SaveChangesAsync(ct);
    
    var response = new
    {
        copy.Id,
        copy.Name,
        copy.Description,
        copy.Dpi,
        copy.LabelWidth,
        copy.LabelHeight,
        templateJson = System.Text.Json.JsonDocument.Parse(copy.TemplateJson).RootElement,
        copy.Version,
        copy.IsActive,
        copy.CreatedAt,
        copy.UpdatedAt,
        copy.LayoutType,
        copy.SheetColumns,
        copy.SheetRows,
        copy.GapMm
    };
    return Results.Created($"/api/label-templates/{copy.Id}", response);
})
.WithName("DuplicateLabelTemplate")
.WithSummary("Duplicate a label template")
.WithDescription("Creates a full copy of an existing label template. The copy is named `{original name} (copy)` and inherits all layout fields, category, orientation, and barcode/printer/station metadata. The copy starts at version 1 in `draft` status with no default flag.")
.WithTags("Label Templates")
.Produces(201)
.ProducesProblem(404);

// GET /api/label-templates/{id}/versions
app.MapGet("/api/label-templates/{id}/versions", async (
    string id, ILabelTemplateRepository repo, CancellationToken ct) =>
{
    var versions = await repo.GetVersionHistoryAsync(id, ct);
    return Results.Ok(versions.Select(v => new
    {
        v.Id, v.TemplateId, v.Version, v.CreatedBy, v.CreatedAt
    }));
})
.WithName("GetLabelTemplateVersionHistory")
.WithSummary("List version history for a label template")
.WithDescription("Returns all historical snapshots of a label template, ordered by version number. A new snapshot is automatically captured each time the template is updated via `PUT /api/label-templates/{id}`. Each version record includes its ID, version number, who created it, and the creation timestamp.")
.WithTags("Label Templates")
.Produces(200);

// GET /api/label-templates/{id}/versions/{version}
app.MapGet("/api/label-templates/{id}/versions/{version}", async (
    string id, int version, ILabelTemplateRepository repo, CancellationToken ct) =>
{
    var snap = await repo.GetVersionAsync(id, version, ct);
    return snap is null ? Results.NotFound() : Results.Ok(snap);
})
.WithName("GetLabelTemplateVersion")
.WithSummary("Get a specific historical version of a label template")
.WithDescription("Returns a specific version snapshot for a label template identified by its `id` and integer `version` number. Returns 404 if that version does not exist. The snapshot contains the full `templateJson` as it was at that point in time.")
.WithTags("Label Templates")
.Produces(200)
.ProducesProblem(404);

// ── Render API ───────────────────────────────────────────────────────────────

// POST /api/label-templates/render
// Body: { "templateJson": "...", "data": { "ProductName": "Coffee", ... } }
app.MapPost("/api/label-templates/render", (RenderRequest req, ILabelRenderer renderer) =>
{
    try
    {
        var zpl = renderer.Render(req.TemplateJson, req.Data ?? new Dictionary<string, string>());
        return Results.Ok(new { zpl, rendererType = renderer.RendererType });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("RenderTemplateJson")
.WithSummary("Render a template JSON definition to ZPL")
.WithDescription("Accepts an inline `templateJson` object and a `data` dictionary of runtime field bindings, then returns the generated ZPL string. Body: `{ templateJson: object (required), data: { [key: string]: string } (optional) }`. This endpoint does not require a stored template — useful for real-time preview while building templates in the Kiosk UI.")
.WithTags("Template Rendering")
.Produces(200)
.ProducesProblem(400);

// POST /api/label-templates/{id}/render-with-data
// Renders a stored template with provided runtime data
app.MapPost("/api/label-templates/{id}/render-with-data", async (
    string id,
    RenderWithDataRequest req,
    ILabelTemplateRepository repo,
    ILabelRenderer renderer,
    CancellationToken ct) =>
{
    var template = await repo.GetByIdAsync(id, ct);
    if (template is null) return Results.NotFound();

    try
    {
        var zpl = renderer.Render(template.GetTemplateJsonWithLayout(), req.Data ?? new Dictionary<string, string>());
        return Results.Ok(new
        {
            templateId = template.Id,
            templateVersion = template.Version,
            zpl,
            rendererType = renderer.RendererType
        });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("RenderStoredTemplateWithData")
.WithSummary("Render a stored template with runtime field data")
.WithDescription("Fetches the template definition stored under the given `id`, merges it with the provided `data` field bindings, and returns the generated ZPL string along with `templateId` and `templateVersion`. Body: `{ data: { [key: string]: string } }`. Useful for verifying the ZPL output of a specific stored template before sending a print job.")
.WithTags("Template Rendering")
.Produces(200)
.ProducesProblem(400)
.ProducesProblem(404);

// ── Print Test API ────────────────────────────────────────────────────────────

// POST /api/label-templates/{id}/print-test
app.MapPost("/api/label-templates/{id}/print-test", async (
    string id,
    PrintTestRequest req,
    ILabelTemplateRepository templateRepo,
    IPrintHistoryRepository historyRepo,
    ILabelRenderer renderer,
    IPrintQueue printQueue,
    PrinterDbContext db,
    IUnitOfWork uow,
    CancellationToken ct) =>
{
    var template = await templateRepo.GetByIdAsync(id, ct);
    if (template is null) return Results.NotFound();

    var printer = await db.Printers.FirstOrDefaultAsync(p => p.PrinterCode == (req.PrinterCode ?? "printer-01"), ct);
    if (printer is null) return Results.BadRequest(new { error = "Printer not found" });

    var data = req.Data ?? new Dictionary<string, string>();
    string zpl;
    try
    {
        zpl = renderer.Render(template.GetTemplateJsonWithLayout(), data);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = $"Render error: {ex.Message}" });
    }

    var runtimeDataJson = JsonSerializer.Serialize(data);
    var traceId = Guid.NewGuid().ToString("N");
    var correlationId = req.CorrelationId ?? Guid.NewGuid().ToString("N");

    var history = PrintHistory.Create(
        template.Id, template.Name, template.Version,
        printer.PrinterCode, runtimeDataJson, zpl, traceId, correlationId);

    await historyRepo.AddAsync(history, ct);
    await uow.SaveChangesAsync(ct);

    var sw = System.Diagnostics.Stopwatch.StartNew();
    var requestHex = BitConverter.ToString(System.Text.Encoding.UTF8.GetBytes(zpl)).Replace("-", " ");

    var tcs = new TaskCompletionSource<bool>();
    var printJob = new PrintJob(
        printer.PrinterCode,
        printer.IpAddress,
        printer.Port,
        zpl,
        Guid.NewGuid().ToString("N"),
        Guid.NewGuid().ToString("N"),
        template.Id,
        1,
        traceId,
        correlationId,
        tcs);

    await printQueue.QueuePrintJobAsync(printJob);
    var success = await tcs.Task;
    sw.Stop();

    if (success)
        history.MarkSuccess(sw.ElapsedMilliseconds, "ACK");
    else
        history.MarkFailed(sw.ElapsedMilliseconds, "TCP connection failed or timeout");

    history.RecordTcpTraffic(requestHex, success ? "ACK" : null);
    await uow.SaveChangesAsync(ct);

    return Results.Ok(new
    {
        historyId = history.Id,
        success,
        durationMs = sw.ElapsedMilliseconds,
        zpl
    });
})
.WithName("PrintTestLabel")
.WithSummary("Send a test print job from a stored template")
.WithDescription("Renders the stored template `{id}` with optional runtime `data` bindings, queues a real print job to the specified printer (`printerCode`, defaults to `printer-01`), waits for the print result, and records the outcome in print history. Body: `{ data: { [key: string]: string } (optional), printerCode: string (optional), correlationId: string (optional) }`. Returns `{ historyId, success, durationMs, zpl }`.")
.WithTags("Print Jobs")
.Produces(200)
.ProducesProblem(400)
.ProducesProblem(404);

// ── Print History API ─────────────────────────────────────────────────────────

// GET /api/print-history?page=1&pageSize=50
app.MapGet("/api/print-history", async (
    IPrintHistoryRepository repo,
    int page = 1,
    int pageSize = 50,
    CancellationToken ct = default) =>
{
    var records = await repo.ListAsync(page, pageSize, ct);
    return Results.Ok(records.Select(h => new
    {
        h.Id, h.TemplateName, h.TemplateVersion, h.PrinterCode,
        h.Status, h.DurationMs, h.RetryCount, h.TraceId, h.CorrelationId, h.CreatedAt
    }));
})
.WithName("ListPrintHistory")
.WithSummary("List print job history")
.WithDescription("Returns a paginated list of print history records. Each record includes the template used, printer, job status (success/failed), duration in milliseconds, retry count, trace ID, and correlation ID. Query params: `page` (default 1), `pageSize` (default 50).")
.WithTags("Print History")
.Produces(200);

// GET /api/print-history/{id}
app.MapGet("/api/print-history/{id}", async (string id, IPrintHistoryRepository repo, CancellationToken ct) =>
{
    var record = await repo.GetByIdAsync(id, ct);
    return record is null ? Results.NotFound() : Results.Ok(record);
})
.WithName("GetPrintHistoryById")
.WithSummary("Get a print history record by ID")
.WithDescription("Returns the full detail of a single print history entry, including the generated ZPL string, raw TCP request/response hex, printer code, template ID and version, status, retry count, duration, and all timestamps.")
.WithTags("Print History")
.Produces(200)
.ProducesProblem(404);


app.Run();

// ── Default template seeder ─────────────────────────────────────────────────
static async Task SeedDefaultTemplatesAsync(PrinterDbContext db)
{
    var seeded = new[]
    {
        new
        {
            Name = "50x30 QR Label (Default)",
            Description = "Won Seal Tech Co., Ltd. — 50x30mm landscape QR label for industrial products. DEFAULT.",
            Dpi = 203, Width = 50.0, Height = 30.0, IsDefault = true,
            Json = "{\"width\":50,\"height\":30,\"dpi\":203,\"elements\":[{\"type\":\"text\",\"x\":15,\"y\":20,\"fontSize\":14,\"text\":\"WON SEAL TECH CO., LTD.\"},{\"type\":\"text\",\"x\":15,\"y\":55,\"fontSize\":11,\"binding\":\"product_name\",\"defaultValue\":\"Bearing Seal\"},{\"type\":\"text\",\"x\":15,\"y\":95,\"fontSize\":9,\"text\":\"Product:\"},{\"type\":\"text\",\"x\":100,\"y\":95,\"fontSize\":10,\"binding\":\"product_code\",\"defaultValue\":\"BEARING-SEAL-01\"},{\"type\":\"text\",\"x\":15,\"y\":135,\"fontSize\":9,\"text\":\"Serial:\"},{\"type\":\"text\",\"x\":100,\"y\":135,\"fontSize\":10,\"binding\":\"serial_number\",\"defaultValue\":\"SN-PO-2026-0001-000001\"},{\"type\":\"text\",\"x\":15,\"y\":175,\"fontSize\":9,\"text\":\"Batch:\"},{\"type\":\"text\",\"x\":80,\"y\":175,\"fontSize\":9,\"binding\":\"batch_number\",\"defaultValue\":\"BATCH-01\"},{\"type\":\"text\",\"x\":170,\"y\":175,\"fontSize\":9,\"text\":\"Rev:\"},{\"type\":\"text\",\"x\":215,\"y\":175,\"fontSize\":9,\"binding\":\"revision\",\"defaultValue\":\"A\"},{\"type\":\"text\",\"x\":15,\"y\":210,\"fontSize\":9,\"text\":\"Date:\"},{\"type\":\"text\",\"x\":100,\"y\":210,\"fontSize\":9,\"binding\":\"production_date\",\"defaultValue\":\"2026-07-07\"},{\"type\":\"qr\",\"x\":270,\"y\":70,\"magnification\":4,\"payloadTemplate\":\"{\\\"serial\\\":\\\"{serial_number}\\\",\\\"product\\\":\\\"{product_code}\\\",\\\"revision\\\":\\\"{revision}\\\",\\\"batch\\\":\\\"{batch_number}\\\"}\"}]}"
        },
        new
        {
            Name = "30x50 QR Label (Portrait)",
            Description = "30x50mm portrait QR label for products requiring vertical layout.",
            Dpi = 203, Width = 30.0, Height = 50.0, IsDefault = false,
            Json = "{\"width\":30,\"height\":50,\"dpi\":203,\"elements\":[{\"type\":\"text\",\"x\":10,\"y\":15,\"fontSize\":11,\"text\":\"WON SEAL TECH\"},{\"type\":\"text\",\"x\":10,\"y\":45,\"fontSize\":9,\"binding\":\"product_name\",\"defaultValue\":\"Bearing Seal\"},{\"type\":\"text\",\"x\":10,\"y\":75,\"fontSize\":8,\"text\":\"P/N:\"},{\"type\":\"text\",\"x\":55,\"y\":75,\"fontSize\":8,\"binding\":\"product_code\",\"defaultValue\":\"BEARING-SEAL-01\"},{\"type\":\"text\",\"x\":10,\"y\":105,\"fontSize\":8,\"text\":\"SN:\"},{\"type\":\"text\",\"x\":55,\"y\":105,\"fontSize\":8,\"binding\":\"serial_number\",\"defaultValue\":\"SN-001\"},{\"type\":\"qr\",\"x\":25,\"y\":135,\"magnification\":3,\"payloadTemplate\":\"{\\\"serial\\\":\\\"{serial_number}\\\",\\\"product\\\":\\\"{product_code}\\\"}\"},{\"type\":\"text\",\"x\":10,\"y\":300,\"fontSize\":8,\"binding\":\"production_date\",\"defaultValue\":\"2026-07-07\"}]}"
        },
        new
        {
            Name = "1D Barcode Label 80x40",
            Description = "80x40mm landscape label featuring a Code128 barcode for tracking.",
            Dpi = 203, Width = 80.0, Height = 40.0, IsDefault = false,
            Json = "{\"width\":80,\"height\":40,\"dpi\":203,\"elements\":[{\"type\":\"text\",\"x\":15,\"y\":15,\"fontSize\":14,\"text\":\"WON SEAL TECH CO., LTD.\"},{\"type\":\"text\",\"x\":15,\"y\":50,\"fontSize\":11,\"binding\":\"product_name\",\"defaultValue\":\"Bearing Seal\"},{\"type\":\"text\",\"x\":15,\"y\":85,\"fontSize\":9,\"text\":\"Serial No:\"},{\"type\":\"text\",\"x\":120,\"y\":85,\"fontSize\":9,\"binding\":\"serial_number\",\"defaultValue\":\"SN-001\"},{\"type\":\"barcode\",\"x\":15,\"y\":115,\"height\":80,\"barWidth\":2,\"symbology\":\"Code128\",\"binding\":\"serial_number\",\"defaultValue\":\"SN-001\"},{\"type\":\"text\",\"x\":15,\"y\":215,\"fontSize\":8,\"text\":\"Batch:\"},{\"type\":\"text\",\"x\":80,\"y\":215,\"fontSize\":8,\"binding\":\"batch_number\",\"defaultValue\":\"BATCH-01\"},{\"type\":\"text\",\"x\":250,\"y\":215,\"fontSize\":8,\"text\":\"Date:\"},{\"type\":\"text\",\"x\":315,\"y\":215,\"fontSize\":8,\"binding\":\"production_date\",\"defaultValue\":\"2026-07-07\"}]}"
        },
        new
        {
            Name = "Shipping Label 100x150",
            Description = "100x150mm large shipping label with full product info and QR code.",
            Dpi = 300, Width = 100.0, Height = 150.0, IsDefault = false,
            Json = "{\"width\":100,\"height\":150,\"dpi\":300,\"elements\":[{\"type\":\"text\",\"x\":20,\"y\":20,\"fontSize\":18,\"text\":\"WON SEAL TECH CO., LTD.\"},{\"type\":\"text\",\"x\":20,\"y\":65,\"fontSize\":14,\"binding\":\"product_name\",\"defaultValue\":\"Bearing Seal\"},{\"type\":\"text\",\"x\":20,\"y\":110,\"fontSize\":11,\"text\":\"Product Code:\"},{\"type\":\"text\",\"x\":230,\"y\":110,\"fontSize\":11,\"binding\":\"product_code\",\"defaultValue\":\"BEARING-SEAL-01\"},{\"type\":\"text\",\"x\":20,\"y\":150,\"fontSize\":11,\"text\":\"Serial No:\"},{\"type\":\"text\",\"x\":180,\"y\":150,\"fontSize\":11,\"binding\":\"serial_number\",\"defaultValue\":\"SN-001\"},{\"type\":\"text\",\"x\":20,\"y\":190,\"fontSize\":11,\"text\":\"Batch:\"},{\"type\":\"text\",\"x\":130,\"y\":190,\"fontSize\":11,\"binding\":\"batch_number\",\"defaultValue\":\"BATCH-01\"},{\"type\":\"text\",\"x\":20,\"y\":230,\"fontSize\":11,\"text\":\"Rev:\"},{\"type\":\"text\",\"x\":110,\"y\":230,\"fontSize\":11,\"binding\":\"revision\",\"defaultValue\":\"A\"},{\"type\":\"text\",\"x\":20,\"y\":270,\"fontSize\":11,\"text\":\"Prod. Date:\"},{\"type\":\"text\",\"x\":200,\"y\":270,\"fontSize\":11,\"binding\":\"production_date\",\"defaultValue\":\"2026-07-07\"},{\"type\":\"qr\",\"x\":630,\"y\":80,\"magnification\":5,\"payloadTemplate\":\"{\\\"serial\\\":\\\"{serial_number}\\\",\\\"product\\\":\\\"{product_code}\\\",\\\"revision\\\":\\\"{revision}\\\",\\\"batch\\\":\\\"{batch_number}\\\"}\"},{\"type\":\"text\",\"x\":20,\"y\":340,\"fontSize\":8,\"text\":\"FRAGILE — HANDLE WITH CARE\"}]}"
        },
        new
        {
            Name = "Internal Production Label 50x25",
            Description = "Compact 50x25mm internal label for work-in-progress tracking.",
            Dpi = 203, Width = 50.0, Height = 25.0, IsDefault = false,
            Json = "{\"width\":50,\"height\":25,\"dpi\":203,\"elements\":[{\"type\":\"text\",\"x\":10,\"y\":15,\"fontSize\":10,\"text\":\"WON SEAL TECH\"},{\"type\":\"text\",\"x\":10,\"y\":45,\"fontSize\":9,\"binding\":\"product_code\",\"defaultValue\":\"BEARING-SEAL-01\"},{\"type\":\"text\",\"x\":10,\"y\":75,\"fontSize\":9,\"binding\":\"serial_number\",\"defaultValue\":\"SN-001\"},{\"type\":\"text\",\"x\":10,\"y\":105,\"fontSize\":8,\"binding\":\"batch_number\",\"defaultValue\":\"BATCH-01\"},{\"type\":\"qr\",\"x\":240,\"y\":25,\"magnification\":3,\"payloadTemplate\":\"{\\\"serial\\\":\\\"{serial_number}\\\",\\\"product\\\":\\\"{product_code}\\\"}\"}]}"
        }
    };

    bool changed = false;
    foreach (var s in seeded)
    {
        var existing = await db.LabelTemplates.FirstOrDefaultAsync(t => t.Name == s.Name);
        if (existing is null)
        {
            var t = LabelTemplate.Create(s.Name, s.Description, s.Dpi, s.Width, s.Height, s.Json, "published", "system");
            if (s.IsDefault) t.SetAsDefault();
            await db.LabelTemplates.AddAsync(t);
            changed = true;
        }
        else
        {
            // Ensure default flag is correctly set on existing record
            if (s.IsDefault && !existing.IsDefault)
            {
                existing.SetAsDefault();
                db.LabelTemplates.Update(existing);
                changed = true;
            }
            // Ensure status is published (not archived) for seeded templates
            if (existing.Status == "archived")
            {
                existing.Publish("system");
                db.LabelTemplates.Update(existing);
                changed = true;
            }
        }
    }
    if (changed) await db.SaveChangesAsync();
}

// ── Request records ─────────────────────────────────────────────────────────
public record LabelPreviewRequest(string Zpl, int Dpi = 203, double Width = 4, double Height = 2.4);
public record AssignPrinterRequest(string PrinterCode, string TemplateId, string? AssignedBy = null);
