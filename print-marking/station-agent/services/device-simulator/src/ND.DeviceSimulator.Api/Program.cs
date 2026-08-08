using Microsoft.EntityFrameworkCore;
using Serilog;
using ND.DeviceSimulator.Application.Abstractions;
using ND.DeviceSimulator.Application.Dtos;
using ND.DeviceSimulator.Infrastructure.Hubs;
using ND.DeviceSimulator.Infrastructure.Persistence;
using ND.DeviceSimulator.Infrastructure.State;
using ND.DeviceSimulator.Infrastructure.VirtualDevices;
using ND.DeviceSimulator.Infrastructure.Workers;
using Microsoft.Data.Sqlite;
using System.Text.Json;
using ND.DeviceSimulator.Domain.Entities;
using ND.Infrastructure.Messaging;

// ── Bootstrap Serilog ─────────────────────────────────────────────────────────
Log.Logger = new LoggerConfiguration().WriteTo.Console().CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((ctx, lc) => lc
        .ReadFrom.Configuration(ctx.Configuration)
        .Enrich.FromLogContext()
        .Enrich.WithProperty("Service", "device-simulator")
        .WriteTo.Console()
        .WriteTo.File("logs/device-simulator-.log", rollingInterval: RollingInterval.Day));

    // ── SQLite ────────────────────────────────────────────────────────────────
    var dbPath = builder.Configuration.GetConnectionString("Sqlite")
                 ?? "Data Source=/data/device-simulator.db";

    try
    {
        var connectionStringBuilder = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(dbPath);
        var dataSource = connectionStringBuilder.DataSource;

        if (!string.IsNullOrEmpty(dataSource) && Path.IsPathRooted(dataSource))
        {
            var directory = Path.GetDirectoryName(dataSource);
            if (!string.IsNullOrEmpty(directory))
            {
                // Try to create directory to verify permissions
                if (!Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                // Verify write permission by creating and deleting a temp file
                var tempFile = Path.Combine(directory, $".write_test_{Guid.NewGuid()}");
                File.WriteAllText(tempFile, "test");
                File.Delete(tempFile);
            }
        }
    }
    catch (Exception ex)
    {
        var connectionStringBuilder = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(dbPath);
        var dataSource = connectionStringBuilder.DataSource;
        var fileName = !string.IsNullOrEmpty(dataSource) ? Path.GetFileName(dataSource) : "device-simulator.db";
        var localDbDir = Path.Combine(builder.Environment.ContentRootPath, "data");
        
        if (!Directory.Exists(localDbDir))
        {
            Directory.CreateDirectory(localDbDir);
        }
        
        var localDbPath = Path.Combine(localDbDir, fileName);
        connectionStringBuilder.DataSource = localDbPath;
        dbPath = connectionStringBuilder.ConnectionString;

        Log.Warning(ex, "Could not write to configured database directory. Falling back to local database path: {FallbackPath}", localDbPath);
    }

    builder.Services.AddDbContext<SimulatorDbContext>(opt => opt.UseSqlite(dbPath));

    builder.Services.AddSingleton<SimulatorStateService>();
    builder.Services.AddSingleton<ISimulatorStateService>(sp => sp.GetRequiredService<SimulatorStateService>());

    // ── RabbitMQ (for gateway heartbeat publishing to projection service) ─────
    builder.Services.Configure<RabbitMqOptions>(builder.Configuration.GetSection(RabbitMqOptions.SectionName));
    builder.Services.AddSingleton<IRabbitMqPublisher, RabbitMqPublisher>();

    // ── Virtual device services ───────────────────────────────────────────────
    builder.Services.AddSingleton<VirtualVisionService>();
    builder.Services.AddSingleton<VirtualFactoryGateway>();
    builder.Services.AddSingleton<VirtualPlcServer>();
    builder.Services.AddSingleton<VirtualLaserServer>();

    builder.Services.AddHostedService(sp => sp.GetRequiredService<VirtualFactoryGateway>());
    builder.Services.AddHostedService(sp => sp.GetRequiredService<VirtualPlcServer>());
    builder.Services.AddHostedService(sp => sp.GetRequiredService<VirtualLaserServer>());
    builder.Services.AddHostedService<ConnectionCheckWorker>();
    builder.Services.AddHostedService<MesEventForwarder>();

    // ── SignalR ───────────────────────────────────────────────────────────────
    builder.Services.AddSignalR();

    // ── CORS ──────────────────────────────────────────────────────────────────
    builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
        p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

    builder.Services.AddOpenApi();
    builder.Services.AddHttpClient();

    var app = builder.Build();

    // ── Migrate + Seed ────────────────────────────────────────────────────────
    await using (var scope = app.Services.CreateAsyncScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<SimulatorDbContext>();
        await db.Database.EnsureCreatedAsync();

        var conn = db.Database.GetDbConnection();
        await conn.OpenAsync();
        using (var pragmaCmd = conn.CreateCommand())
        {
            pragmaCmd.CommandText = "PRAGMA journal_mode=DELETE;";
            await pragmaCmd.ExecuteNonQueryAsync();
        }
        await conn.CloseAsync();

        await SimulatorDbSeeder.SeedAsync(db);
    }

    app.UseSerilogRequestLogging();
    app.UseCors();

    if (app.Environment.IsDevelopment())
        app.MapOpenApi();

    app.UseDefaultFiles();
    app.UseStaticFiles();

    app.MapHub<SimulatorHub>("/hubs/simulator");

    // ── Health ────────────────────────────────────────────────────────────────
    app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "device-simulator" }));

    // ── Status snapshot ───────────────────────────────────────────────────────
    app.MapGet("/api/status", (ISimulatorStateService state) =>
        Results.Ok(state.GetStatus()));

    // ── Laser ─────────────────────────────────────────────────────────────────
    app.MapGet("/api/laser/commands", async (SimulatorDbContext db, int limit = 50) =>
    {
        var cmds = await db.LaserCommands
            .OrderByDescending(c => c.ExecutedAt)
            .Take(Math.Clamp(limit, 1, 500))
            .ToListAsync();
        return Results.Ok(cmds.Select(c => new LaserCommandDto(c.Id, c.RawCommand, c.Status, c.DurationMs, c.ExecutedAt)));
    });

    // ── Vision ────────────────────────────────────────────────────────────────
    app.MapPost("/api/vision/verify", async (
        VisionVerifyRequest req,
        VirtualVisionService vision,
        IConfiguration config) =>
    {
        var delayMs = int.TryParse(config["Simulator:VISION_DELAY_MS"] ?? "500", out var d) ? d : 500;
        var result = await vision.VerifyAsync(req.JobId, delayMs);
        return result.Result == "PASS" ? Results.Ok(result) : Results.UnprocessableEntity(result);
    });

    app.MapPut("/api/vision/config", (UpdateVisionConfigRequest req, VirtualVisionService vision, ISimulatorStateService state) =>
    {
        vision.UpdateConfig(req.PassRate, req.FailureRate);
        return Results.Ok(state.GetVisionState());
    });

    app.MapGet("/api/vision/results", async (SimulatorDbContext db, int limit = 50) =>
    {
        var results = await db.VisionResults
            .OrderByDescending(r => r.VerifiedAt)
            .Take(Math.Clamp(limit, 1, 500))
            .ToListAsync();
        return Results.Ok(results.Select(r => new VisionResultDto(
            r.Id, r.JobId, r.Result, r.DefectCode, r.Confidence, r.OcrText, r.DurationMs, r.VerifiedAt)));
    });

    // ── PLC ───────────────────────────────────────────────────────────────────
    app.MapGet("/api/plc/registers", (ISimulatorStateService state) =>
        Results.Ok(state.GetPlcState().Registers));

    app.MapPut("/api/plc/registers/{name}", async (
        string name,
        PlcRegisterUpdateRequest req,
        VirtualPlcServer plc) =>
    {
        await plc.SetRegisterFromApiAsync(name, req.Value);
        return Results.Ok();
    });

    app.MapGet("/api/plc/events", async (SimulatorDbContext db, int limit = 50) =>
    {
        var evts = await db.PlcRegisterEvents
            .OrderByDescending(e => e.OccurredAt)
            .Take(Math.Clamp(limit, 1, 500))
            .ToListAsync();
        return Results.Ok(evts.Select(e => new PlcRegisterDto(e.RegisterName, e.Value, e.Source, e.OccurredAt)));
    });

    app.MapPost("/api/gateway/publish", async (
        GatewayPublishRequest req,
        VirtualFactoryGateway gateway) =>
    {
        try
        {
            await gateway.PublishAsync(req);
            return Results.Ok();
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    });

    app.MapPost("/api/gateway/connect", async (VirtualFactoryGateway gateway) =>
    {
        await gateway.ConnectGatewayAsync();
        return Results.Ok(new { status = "connecting" });
    });

    app.MapPost("/api/gateway/disconnect", async (VirtualFactoryGateway gateway) =>
    {
        await gateway.DisconnectGatewayAsync();
        return Results.Ok(new { status = "disconnected" });
    });

    // ── Laser Connect/Disconnect ─────────────────────────────────────────────
    app.MapPost("/api/laser/connect", async (VirtualLaserServer laser) =>
    {
        await laser.ConnectLaserAsync();
        return Results.Ok(new { status = "connected" });
    });

    app.MapPost("/api/laser/disconnect", async (VirtualLaserServer laser) =>
    {
        await laser.DisconnectLaserAsync();
        return Results.Ok(new { status = "disconnected" });
    });

    // ── PLC Connect/Disconnect ───────────────────────────────────────────────
    app.MapPost("/api/plc/connect", async (VirtualPlcServer plc) =>
    {
        await plc.ConnectPlcAsync();
        return Results.Ok(new { status = "connected" });
    });

    app.MapPost("/api/plc/disconnect", async (VirtualPlcServer plc) =>
    {
        await plc.DisconnectPlcAsync();
        return Results.Ok(new { status = "disconnected" });
    });

    // ── Vision Connect/Disconnect ────────────────────────────────────────────
    app.MapPost("/api/vision/connect", (ISimulatorStateService state, Microsoft.AspNetCore.SignalR.IHubContext<ND.DeviceSimulator.Infrastructure.Hubs.SimulatorHub, ND.DeviceSimulator.Application.Abstractions.ISimulatorClient> hub) =>
    {
        state.SetVisionOnline(true);
        hub.Clients.All.SimulatorStatusUpdated(state.GetStatus());
        return Results.Ok(new { status = "connected" });
    });

    app.MapPost("/api/vision/disconnect", (ISimulatorStateService state, Microsoft.AspNetCore.SignalR.IHubContext<ND.DeviceSimulator.Infrastructure.Hubs.SimulatorHub, ND.DeviceSimulator.Application.Abstractions.ISimulatorClient> hub) =>
    {
        state.SetVisionOnline(false);
        hub.Clients.All.SimulatorStatusUpdated(state.GetStatus());
        return Results.Ok(new { status = "disconnected" });
    });

    app.MapPost("/api/gateway/send-print-job", async (
        TriggerJobRequest? body,
        VirtualFactoryGateway gateway,
        ISimulatorStateService state,
        IConfiguration config) =>
    {
        try
        {
            int pcs = body?.Pcs ?? 1;
            if (pcs <= 0)
            {
                return Results.BadRequest(new { error = "Pcs must be greater than 0" });
            }

            if (pcs == 1)
            {
                var dispatchTarget = body?.DispatchTarget ?? "simulation";
                var data = new List<UnifiedTagRequest>
                {
                    new("operation.type", "PRINT_ONLY"),
                    new("print.type", "LABEL_PRINT"),
                    new("product.id", "FC-WP-RO100G-B-998822"),
                    new("product.lot", "LOT-2026-06-A-001"),
                    new("product.mfg_date", "2026-06-16"),
                    new("product.exp_date", "2028-06-16"),
                    new("production.planned_qty", "1"),
                    new("production.completed_qty", "1"),
                    new("production.remaining_qty", "0"),
                    new("dispatch_target", dispatchTarget),
                    new("assigned_team", body?.Team ?? "Team A"),
                };
                if (!string.IsNullOrEmpty(body?.Notes))
                    data.Add(new("dispatch_notes", body.Notes));

                var site = config["Simulator:SITE_CODE"] ?? "NMDDuongDuong";
                var edgeId = config["Simulator:EDGE_ID"] ?? "edge-ipc-l3-marking";
                var area = config["Simulator:AREA_CODE"] ?? "Assembly_Section";
                var line = config["Simulator:LINE_CODE"] ?? "Chuyen03";
                var topic = $"nd/{site}/{edgeId}/command";

                var station = body?.Station ?? "Printer-01";
                var req = new GatewayPublishRequest(topic, site, area, line, station, edgeId, data);
                var eventId = await gateway.PublishAsync(req);

                if (!string.IsNullOrEmpty(body?.Scenario))
                {
                    state.SetJobScenario(eventId, body.Scenario);
                }

                return Results.Ok(new { eventId });
            }
            else
            {
                // Generate a shared production order number for this batch so they all group together
                var batchId = Guid.NewGuid().ToString("N")[..8].ToUpper();
                var orderNo = $"WO-{batchId}";

                // Fire-and-forget background task
                _ = Task.Run(async () =>
                {
                    try
                    {
                        var site = config["Simulator:SITE_CODE"] ?? "NMDDuongDuong";
                        var edgeId = config["Simulator:EDGE_ID"] ?? "edge-ipc-l3-marking";
                        var area = config["Simulator:AREA_CODE"] ?? "Assembly_Section";
                        var line = config["Simulator:LINE_CODE"] ?? "Chuyen03";
                        var topic = $"nd/{site}/{edgeId}/command";

                        for (int i = 0; i < pcs; i++)
                        {
                            var dispatchTarget2 = body?.DispatchTarget ?? "simulation";
                        var data = new List<UnifiedTagRequest>
                            {
                                new("operation.type", "PRINT_ONLY"),
                                new("print.type", "LABEL_PRINT"),
                                new("product.id", "FC-WP-RO100G-B-998822"),
                                new("product.lot", "LOT-2026-06-A-001"),
                                new("product.mfg_date", "2026-06-16"),
                                new("product.exp_date", "2028-06-16"),
                                new("production.order_number", orderNo),
                                new("production.planned_qty", pcs.ToString()),
                                new("production.completed_qty", (i + 1).ToString()),
                                new("production.remaining_qty", (pcs - (i + 1)).ToString()),
                                new("dispatch_target", dispatchTarget2),
                                new("assigned_team", body?.Team ?? "Team A"),
                            };
                        if (!string.IsNullOrEmpty(body?.Notes))
                            data.Add(new("dispatch_notes", body.Notes));

                        var stationBatch = body?.Station ?? "Printer-01";
                        var req = new GatewayPublishRequest(topic, site, area, line, stationBatch, edgeId, data);
                            var eventId = await gateway.PublishAsync(req);

                            if (!string.IsNullOrEmpty(body?.Scenario))
                            {
                                state.SetJobScenario(eventId, body.Scenario);
                            }

                            // Wait 1.2 seconds between prints to let Kiosk UI animate progress
                            await Task.Delay(1200);
                        }
                    }
                    catch (Exception)
                    {
                        // Ignore background worker exceptions
                    }
                });

                return Results.Ok(new { status = "triggered", pcs });
            }
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    });

    app.MapPost("/api/gateway/send-mark-job", async (
        TriggerJobRequest req,
        VirtualFactoryGateway gateway,
        ISimulatorStateService state,
        IConfiguration config) =>
    {
        try
        {
            var markDispatchTarget = req.DispatchTarget ?? "simulation";
            var data = new List<UnifiedTagRequest>
            {
                new("operation.type", "MARK_ONLY"),
                new("marking.type", "LASER_ETCHING"),
                new("marking.serial", "SN-0001234"),
                new("marking.lot", "2026-BATCH-A"),
                new("marking.date_code", "260616"),
                new("dispatch_target", markDispatchTarget),
                new("assigned_team", req.Team ?? "Team A"),
            };
            if (!string.IsNullOrEmpty(req.Notes))
                data.Add(new("dispatch_notes", req.Notes));

            var site = config["Simulator:SITE_CODE"] ?? "NMDDuongDuong";
            var edgeId = config["Simulator:EDGE_ID"] ?? "edge-ipc-l3-marking";
            var area = config["Simulator:AREA_CODE"] ?? "Assembly_Section";
            var line = config["Simulator:LINE_CODE"] ?? "Chuyen03";
            var topic = $"nd/{site}/{edgeId}/command";

            var markStation = req.Station ?? "Laser-Marking-03";
            var publishReq = new GatewayPublishRequest(topic, site, area, line, markStation, edgeId, data);
            var eventId = await gateway.PublishAsync(publishReq);

            if (!string.IsNullOrEmpty(req.Scenario))
            {
                state.SetJobScenario(eventId, req.Scenario);
            }

            return Results.Ok(new { eventId });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    });

    app.MapPost("/api/gateway/send-print-mark-job", async (
        TriggerJobRequest req,
        VirtualFactoryGateway gateway,
        ISimulatorStateService state,
        IConfiguration config) =>
    {
        try
        {
            var pmDispatchTarget = req.DispatchTarget ?? "simulation";
            var data = new List<UnifiedTagRequest>
            {
                new("operation.type", "PRINT_AND_MARK"),
                new("print.type", "PRODUCT_LABEL"),
                new("marking.type", "LASER_SERIALIZATION"),
                new("product.id", "FC-WP-RO100G-B-998822"),
                new("product.lot", "LOT-2026-06-A-001"),
                new("marking.serial", "SN-0001234"),
                new("dispatch_target", pmDispatchTarget),
                new("assigned_team", req.Team ?? "Team A"),
            };
            if (!string.IsNullOrEmpty(req.Notes))
                data.Add(new("dispatch_notes", req.Notes));
            if (req.Pcs.HasValue)
                data.Add(new("production.planned_qty", req.Pcs.Value.ToString()));

            var site = config["Simulator:SITE_CODE"] ?? "NMDDuongDuong";
            var edgeId = config["Simulator:EDGE_ID"] ?? "edge-ipc-l3-marking";
            var area = config["Simulator:AREA_CODE"] ?? "Assembly_Section";
            var line = config["Simulator:LINE_CODE"] ?? "Chuyen03";
            var topic = $"nd/{site}/{edgeId}/command";

            var pmStation = req.Station ?? "Station-Combined-01";
            var publishReq = new GatewayPublishRequest(topic, site, area, line, pmStation, edgeId, data);
            var eventId = await gateway.PublishAsync(publishReq);

            if (!string.IsNullOrEmpty(req.Scenario))
            {
                state.SetJobScenario(eventId, req.Scenario);
            }

            return Results.Ok(new { eventId });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    });

    app.MapPost("/gateway/production-orders", async (
        CreateGatewayOrderRequest req,
        VirtualFactoryGateway gateway,
        SimulatorDbContext db,
        IConfiguration config) =>
    {
        try
        {
            if (string.IsNullOrWhiteSpace(req.ProductionOrderId))
                return Results.BadRequest(new { error = "production_order_id is required" });
            if (string.IsNullOrWhiteSpace(req.OrderNumber))
                return Results.BadRequest(new { error = "order_number is required" });
            if (string.IsNullOrWhiteSpace(req.OperationType))
                return Results.BadRequest(new { error = "operation_type is required" });
            if (string.IsNullOrWhiteSpace(req.Station))
                return Results.BadRequest(new { error = "station is required" });
            if (req.Quantity <= 0)
                return Results.BadRequest(new { error = "quantity must be greater than 0" });

            var data = new List<UnifiedTagRequest>();
            if (req.OperationType == "PRINT_ONLY")
            {
                data.Add(new("operation.type", "PRINT_ONLY"));
                data.Add(new("print.type", "LABEL_PRINT"));
                data.Add(new("product.id", req.ProductId));
                data.Add(new("product.lot", req.LotNumber));
                data.Add(new("product.mfg_date", req.MfgDate));
                data.Add(new("product.exp_date", req.ExpDate));
            }
            else if (req.OperationType == "MARK_ONLY")
            {
                data.Add(new("operation.type", "MARK_ONLY"));
                data.Add(new("marking.type", "LASER_ETCHING"));
                data.Add(new("marking.serial", req.SerialNumber));
                data.Add(new("marking.lot", req.LotNumber));
                data.Add(new("marking.date_code", req.MfgDate));
            }
            else if (req.OperationType == "PRINT_AND_MARK")
            {
                data.Add(new("operation.type", "PRINT_AND_MARK"));
                data.Add(new("print.type", "PRODUCT_LABEL"));
                data.Add(new("marking.type", "LASER_SERIALIZATION"));
                data.Add(new("product.id", req.ProductId));
                data.Add(new("product.lot", req.LotNumber));
                data.Add(new("marking.serial", req.SerialNumber));
            }
            else
            {
                return Results.BadRequest(new { error = $"Unsupported operation type: {req.OperationType}" });
            }

            // MES Event Correlation tags
            data.Add(new("production.order_id", req.ProductionOrderId));
            data.Add(new("production.order_number", req.OrderNumber));

            // Enriched Planning tags
            data.Add(new("production.workflow", req.WorkflowName ?? "Default Workflow"));
            data.Add(new("product.name", req.ProductName ?? "Bearing Seal 35mm"));
            data.Add(new("product.revision", req.ProductRevision ?? "Rev A"));
            data.Add(new("customer.name", req.Customer ?? "Won Seal Tech"));
            data.Add(new("production.planned_qty", req.PlannedQuantity.ToString()));
            data.Add(new("production.completed_qty", req.CompletedQuantity.ToString()));
            data.Add(new("production.remaining_qty", req.RemainingQuantity.ToString()));
            data.Add(new("production.step", req.CurrentStep ?? "PRINT"));
            data.Add(new("assigned_team", req.AssignedTeam ?? "Team A"));
            data.Add(new("operator", req.Operator ?? "admin.operator"));
            data.Add(new("product.material", "NBR-70"));
            data.Add(new("product.rubber_type", "Synthetic Rubber"));
            data.Add(new("product.country", "Vietnam"));
            data.Add(new("product.batch", "BATCH-01"));

            var site = config["Simulator:SITE_CODE"] ?? "NMDDuongDuong";
            var edgeId = config["Simulator:EDGE_ID"] ?? "edge-ipc-l3-marking";
            var area = config["Simulator:AREA_CODE"] ?? "Assembly_Section";
            var line = config["Simulator:LINE_CODE"] ?? "Chuyen03";
            var topic = $"nd/{site}/{edgeId}/command";

            var publishReq = new GatewayPublishRequest(topic, site, area, line, req.Station, edgeId, data);
            var eventId = await gateway.PublishAsync(publishReq);

            // Record mapping in SQLite
            var mapping = ProductionOrderMapping.Create(
                req.ProductionOrderId,
                req.OrderNumber,
                eventId,
                req.ProductionOrderId, // Correlation ID
                req.OperationType,
                req.Station,
                "QUEUED"
            );
            db.ProductionOrderMappings.Add(mapping);
            await db.SaveChangesAsync();

            return Results.Json(new { gatewayOrderId = eventId, accepted = true, timestamp = DateTime.UtcNow });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    });

    app.MapGet("/api/jobs", async (string? status) =>
    {
        var jobEngineDbPath = Environment.GetEnvironmentVariable("SQLITE_JOB_ENGINE_PATH") ?? "";
        if (string.IsNullOrEmpty(jobEngineDbPath))
        {
            if (File.Exists("/data/job_engine.db"))
            {
                jobEngineDbPath = "/data/job_engine.db";
            }
            else
            {
                jobEngineDbPath = Path.GetFullPath("../../../job-engine/src/ND.JobEngine.Api/data/job_engine.db");
            }
        }

        if (!File.Exists(jobEngineDbPath))
        {
            return Results.Ok(new List<object>());
        }

        var jobs = new List<object>();
        using (var connection = new SqliteConnection($"Data Source={jobEngineDbPath};Mode=ReadOnly"))
        {
            await connection.OpenAsync();
            var sql = @"
                SELECT 
                    j.id AS JobId,
                    j.job_no AS JobNo,
                    j.product_code AS ProductCode,
                    j.job_type AS WorkflowType,
                    j.current_status AS Status,
                    j.created_at AS StartTime,
                    j.completed_at AS CompletedAt,
                    (SELECT a.finished_at FROM job_engine_job_attempts a WHERE a.job_id = j.id ORDER BY a.attempt_no DESC LIMIT 1) AS FinishedAt,
                    (SELECT s.step_name FROM job_engine_job_steps s 
                     WHERE s.attempt_id = (SELECT a.id FROM job_engine_job_attempts a WHERE a.job_id = j.id ORDER BY a.attempt_no DESC LIMIT 1)
                     AND s.status = 'Failed' LIMIT 1) AS FailedStepName
                FROM job_engine_jobs j
                ORDER BY j.created_at DESC";

            using (var command = new SqliteCommand(sql, connection))
            using (var reader = await command.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    var jobId = reader.GetString(0);
                    var jobNo = reader.GetString(1);
                    var productCode = reader.GetString(2);
                    var workflowType = reader.GetString(3);
                    var currentStatus = reader.GetString(4);
                    var startTimeStr = reader.GetString(5);
                    var completedAtStr = reader.IsDBNull(6) ? null : reader.GetString(6);
                    var finishedAtStr = reader.IsDBNull(7) ? null : reader.GetString(7);
                    var failedStepName = reader.IsDBNull(8) ? null : reader.GetString(8);

                    var startTime = DateTimeOffset.Parse(startTimeStr);
                    DateTimeOffset? endTime = null;
                    if (!string.IsNullOrEmpty(completedAtStr)) endTime = DateTimeOffset.Parse(completedAtStr);
                    else if (!string.IsNullOrEmpty(finishedAtStr)) endTime = DateTimeOffset.Parse(finishedAtStr);

                    var duration = endTime.HasValue ? (int)(endTime.Value - startTime).TotalSeconds : (int)(DateTimeOffset.UtcNow - startTime).TotalSeconds;
                    if (duration < 0) duration = 0;

                    var mappedStatus = currentStatus.ToUpperInvariant();
                    if (!string.IsNullOrEmpty(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
                    {
                        if (status.Equals("Running", StringComparison.OrdinalIgnoreCase) && mappedStatus != "PROCESSING") continue;
                        if (status.Equals("Completed", StringComparison.OrdinalIgnoreCase) && mappedStatus != "COMPLETED") continue;
                        if (status.Equals("Failed", StringComparison.OrdinalIgnoreCase) && mappedStatus != "FAILED") continue;
                    }

                    string? failureSource = null;
                    if (mappedStatus == "FAILED" && !string.IsNullOrEmpty(failedStepName))
                    {
                        failureSource = failedStepName.ToUpperInvariant() switch
                        {
                            "PRINT_LABEL" => "Printer",
                            "LASER_MARK" => "Laser",
                            "VISION_CHECK" => "Vision",
                            "PLC_REJECT" => "PLC",
                            _ => "System"
                        };
                    }

                    jobs.Add(new
                    {
                        jobId,
                        jobNo,
                        productCode,
                        workflowType,
                        status = mappedStatus,
                        startTime = startTimeStr,
                        duration,
                        failureSource
                    });
                }
            }
        }

        return Results.Ok(jobs);
    });

    app.MapGet("/api/jobs/{id}/details", async (string id, SimulatorDbContext simDb) =>
    {
        var jobEngineDbPath = Environment.GetEnvironmentVariable("SQLITE_JOB_ENGINE_PATH") ?? "";
        if (string.IsNullOrEmpty(jobEngineDbPath))
        {
            if (File.Exists("/data/job_engine.db"))
            {
                jobEngineDbPath = "/data/job_engine.db";
            }
            else
            {
                jobEngineDbPath = Path.GetFullPath("../../../job-engine/src/ND.JobEngine.Api/data/job_engine.db");
            }
        }

        if (!File.Exists(jobEngineDbPath)) return Results.NotFound(new { error = "Job engine database not found" });

        object? jobObj = null;
        string? jobNo = null;
        string? jobCreatedAt = null;
        string? jobCompletedAt = null;
        string? jobStatus = null;
        string? productCode = null;

        var attempts = new List<dynamic>();
        var engineTimeline = new List<dynamic>();

        string? labelTemplateName = null;
        var printerDbPath = jobEngineDbPath.Replace("job_engine.db", "printer.db");
        if (File.Exists(printerDbPath))
        {
            try
            {
                using (var printerConnection = new SqliteConnection($"Data Source={printerDbPath};Mode=ReadOnly"))
                {
                    await printerConnection.OpenAsync();
                    var printerJobSql = "SELECT label_template FROM printer_jobs WHERE job_id = @jobId LIMIT 1";
                    using (var printerCmd = new SqliteCommand(printerJobSql, printerConnection))
                    {
                        printerCmd.Parameters.AddWithValue("@jobId", id);
                        using (var printerReader = await printerCmd.ExecuteReaderAsync())
                        {
                            if (await printerReader.ReadAsync())
                            {
                                labelTemplateName = printerReader.GetString(0);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reading printer.db: {ex.Message}");
            }
        }

        using (var connection = new SqliteConnection($"Data Source={jobEngineDbPath};Mode=ReadOnly"))
        {
            await connection.OpenAsync();

            var jobSql = "SELECT id, job_no, product_code, job_type, current_status, created_at, completed_at, triggered_by_user_id, reason_code, reason_description FROM job_engine_jobs WHERE id = @id";
            using (var cmd = new SqliteCommand(jobSql, connection))
            {
                cmd.Parameters.AddWithValue("@id", id);
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    if (await reader.ReadAsync())
                    {
                        jobNo = reader.GetString(1);
                        productCode = reader.GetString(2);
                        jobStatus = reader.GetString(4);
                        jobCreatedAt = reader.GetString(5);
                        jobCompletedAt = reader.IsDBNull(6) ? null : reader.GetString(6);

                        jobObj = new
                        {
                            id = reader.GetString(0),
                            jobNo,
                            productCode,
                            jobType = reader.GetString(3),
                            current_status = jobStatus,
                            created_at = jobCreatedAt,
                            completed_at = jobCompletedAt,
                            triggered_by_user_id = reader.IsDBNull(7) ? null : reader.GetString(7),
                            reason_code = reader.IsDBNull(8) ? null : reader.GetString(8),
                            reason_description = reader.IsDBNull(9) ? null : reader.GetString(9),
                            labelTemplate = labelTemplateName
                        };
                    }
                }
            }

            if (jobObj is null || jobNo is null) return Results.NotFound(new { error = "Job not found in engine" });

            var attemptSql = "SELECT id, attempt_no, trigger_type, triggered_by_user_id, result_status, started_at, finished_at, error_message, reason_code, reason_description FROM job_engine_job_attempts WHERE job_id = @jobId ORDER BY attempt_no ASC";
            using (var cmd = new SqliteCommand(attemptSql, connection))
            {
                cmd.Parameters.AddWithValue("@jobId", id);
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        var attemptId = reader.GetString(0);
                        attempts.Add(new
                        {
                            id = attemptId,
                            attemptNo = reader.GetInt32(1),
                            triggerType = reader.GetString(2),
                            triggeredByUserId = reader.IsDBNull(3) ? null : reader.GetString(3),
                            resultStatus = reader.GetString(4),
                            startedAt = reader.GetString(5),
                            finishedAt = reader.IsDBNull(6) ? null : reader.GetString(6),
                            errorMessage = reader.IsDBNull(7) ? null : reader.GetString(7),
                            reasonCode = reader.IsDBNull(8) ? null : reader.GetString(8),
                            reasonDescription = reader.IsDBNull(9) ? null : reader.GetString(9),
                            steps = new List<object>()
                        });
                    }
                }
            }

            for (var i = 0; i < attempts.Count; i++)
            {
                var attempt = attempts[i];
                var steps = new List<object>();
                var stepsSql = "SELECT step_name, step_order, status, started_at, finished_at, result_json, error_message FROM job_engine_job_steps WHERE attempt_id = @attemptId ORDER BY step_order ASC";
                using (var cmd = new SqliteCommand(stepsSql, connection))
                {
                    cmd.Parameters.AddWithValue("@attemptId", attempt.id);
                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            steps.Add(new
                            {
                                stepName = reader.GetString(0),
                                stepOrder = reader.GetInt32(1),
                                status = reader.GetString(2),
                                startedAt = reader.IsDBNull(3) ? null : reader.GetString(3),
                                finishedAt = reader.IsDBNull(4) ? null : reader.GetString(4),
                                resultJson = reader.IsDBNull(5) ? null : reader.GetString(5),
                                errorMessage = reader.IsDBNull(6) ? null : reader.GetString(6)
                            });
                        }
                    }
                }
                attempts[i] = new
                {
                    attempt.id,
                    attempt.attemptNo,
                    attempt.triggerType,
                    attempt.triggeredByUserId,
                    attempt.resultStatus,
                    attempt.startedAt,
                    attempt.finishedAt,
                    attempt.errorMessage,
                    attempt.reasonCode,
                    attempt.reasonDescription,
                    steps
                };
            }

            var historySql = "SELECT action_name, old_status, new_status, performed_by, note, created_at FROM job_engine_job_history WHERE job_id = @jobId ORDER BY created_at ASC";
            using (var cmd = new SqliteCommand(historySql, connection))
            {
                cmd.Parameters.AddWithValue("@jobId", id);
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        engineTimeline.Add(new
                        {
                            source = "Engine",
                            stage = reader.GetString(0),
                            status = reader.GetString(2),
                            detail = reader.IsDBNull(4) ? "" : reader.GetString(4),
                            occurredAt = reader.GetString(5),
                            performedBy = reader.IsDBNull(3) ? null : reader.GetString(3)
                        });
                    }
                }
            }
        }

        var printerJobs = await simDb.PrinterJobs.AsNoTracking().ToListAsync();
        var matchingPrinterJobs = printerJobs
            .Where(pj => pj.ZplContent != null && pj.ZplContent.Contains(jobNo))
            .Select(pj => new { pj.Id, pj.Status, pj.ZplContent, pj.DurationMs, pj.ReceivedAt, pj.ErrorMessage })
            .ToList();

        var laserCommands = await simDb.LaserCommands.AsNoTracking().ToListAsync();
        var matchingLaserCommands = laserCommands
            .Where(lc => lc.RawCommand != null && lc.RawCommand.Contains(jobNo))
            .Select(lc => new { lc.Id, lc.RawCommand, lc.Status, lc.DurationMs, lc.ExecutedAt, lc.ErrorMessage })
            .ToList();

        var matchingVisionResults = await simDb.VisionResults
            .AsNoTracking()
            .Where(vr => vr.JobId == jobNo)
            .Select(vr => new { vr.Id, Result = vr.Result, vr.DefectCode, vr.Confidence, vr.OcrText, vr.DurationMs, vr.VerifiedAt })
            .ToListAsync();

        var plcEvents = await simDb.PlcRegisterEvents.AsNoTracking().ToListAsync();

        DateTimeOffset jobStart = DateTimeOffset.Parse(jobCreatedAt ?? DateTimeOffset.UtcNow.ToString("o"));
        DateTimeOffset jobEnd = jobCompletedAt != null ? DateTimeOffset.Parse(jobCompletedAt) : DateTimeOffset.UtcNow;

        var matchingPlcEvents = plcEvents
            .Where(pe => {
                if (!DateTimeOffset.TryParse(pe.OccurredAt, out var occurred)) return false;
                return occurred >= jobStart.AddSeconds(-2) && occurred <= jobEnd.AddSeconds(2);
            })
            .Select(pe => new { pe.Id, pe.RegisterName, pe.Value, pe.Source, pe.OccurredAt })
            .ToList();

        var simTimelineEvents = await simDb.TimelineEvents.AsNoTracking().ToListAsync();
        var matchingSimTimeline = simTimelineEvents
            .Where(te => te.Detail != null && te.Detail.Contains(jobNo))
            .Select(te => new {
                source = "Simulator",
                stage = te.Stage,
                status = te.Status,
                detail = te.Detail,
                occurredAt = te.OccurredAt
            })
            .ToList();

        var combinedTimeline = new List<dynamic>();
        combinedTimeline.AddRange(engineTimeline);
        combinedTimeline.AddRange(matchingSimTimeline);

        foreach (var pe in matchingPlcEvents)
        {
            if (pe.RegisterName.Equals("REJECT_PRODUCT", StringComparison.OrdinalIgnoreCase))
            {
                combinedTimeline.Add(new {
                    source = "PLC",
                    stage = pe.Value ? "PLCRejectStarted" : "PLCRejectCompleted",
                    status = "INFO",
                    detail = $"Coil REJECT_PRODUCT set to {(pe.Value ? "ON" : "OFF")} ({pe.Source})",
                    occurredAt = pe.OccurredAt
                });
            }
        }

        var sortedTimeline = combinedTimeline
            .OrderBy(t => {
                if (DateTimeOffset.TryParse(t.occurredAt, out DateTimeOffset dt)) return dt;
                return DateTimeOffset.MinValue;
            })
            .ToList();

        object? failureAnalysis = null;
        if (jobStatus == "FAILED")
        {
            var failedVision = matchingVisionResults.FirstOrDefault(vr => vr.Result == "FAIL");
            if (failedVision != null)
            {
                failureAnalysis = new
                {
                    source = "Vision",
                    reason = failedVision.DefectCode ?? "Unknown defect",
                    expected = productCode,
                    actual = failedVision.OcrText ?? "",
                    device = "Virtual Vision",
                    rawResponse = JsonSerializer.Serialize(failedVision)
                };
            }
            else
            {
                var failedLaser = matchingLaserCommands.FirstOrDefault(lc => lc.Status == "FAILED");
                if (failedLaser != null)
                {
                    failureAnalysis = new
                    {
                        source = "Laser",
                        reason = failedLaser.ErrorMessage ?? "Simulated laser failure",
                        expected = "",
                        actual = "",
                        device = "Virtual Laser",
                        rawResponse = JsonSerializer.Serialize(failedLaser)
                    };
                }
                else
                {
                    var failedPrinter = matchingPrinterJobs.FirstOrDefault(pj => pj.Status == "FAILED");
                    if (failedPrinter != null)
                    {
                        failureAnalysis = new
                        {
                            source = "Printer",
                            reason = failedPrinter.ErrorMessage ?? "Simulated print failure",
                            expected = "",
                            actual = "",
                            device = "Virtual Printer",
                            rawResponse = JsonSerializer.Serialize(failedPrinter)
                        };
                    }
                }
            }
        }

        var detailPayload = new
        {
            job = jobObj,
            attempts,
            timeline = sortedTimeline,
            deviceResponses = new
            {
                printer = matchingPrinterJobs,
                laser = matchingLaserCommands,
                vision = matchingVisionResults,
                plc = matchingPlcEvents
            },
            failureAnalysis
        };

        return Results.Ok(detailPayload);
    });

    app.MapGet("/api/gateway/events", async (SimulatorDbContext db, int limit = 50) =>
    {
        var evts = await db.GatewayEvents
            .OrderByDescending(e => e.OccurredAt)
            .Take(Math.Clamp(limit, 1, 500))
            .ToListAsync();
        return Results.Ok(evts.Select(e => new GatewayEventDto(e.Id, e.Direction, e.Topic, e.PayloadJson, e.OccurredAt)));
    });

    // ── Timeline ──────────────────────────────────────────────────────────────
    app.MapGet("/api/timeline", async (SimulatorDbContext db, int limit = 100) =>
    {
        var evts = await db.TimelineEvents
            .OrderByDescending(e => e.OccurredAt)
            .Take(Math.Clamp(limit, 1, 1000))
            .ToListAsync();
        return Results.Ok(evts.Select(e => new TimelineEventDto(e.Id, e.Stage, e.Status, e.Detail, e.OccurredAt)));
    });

    // ── Config ────────────────────────────────────────────────────────────────
    app.MapGet("/api/config", async (SimulatorDbContext db) =>
    {
        var values = await db.ConfigurationValues.OrderBy(c => c.Key).ToListAsync();
        return Results.Ok(values.Select(c => new ConfigValueDto(c.Id, c.Key, c.Value, c.Description, c.IsEditable)));
    });

    app.MapPut("/api/config/{key}", async (string key, UpdateConfigValueRequest req, SimulatorDbContext db) =>
    {
        var cfg = await db.ConfigurationValues.FirstOrDefaultAsync(c => c.Key == key);
        if (cfg is null) return Results.NotFound();
        if (!cfg.IsEditable) return Results.BadRequest(new { error = "Read-only config value" });
        cfg.UpdateValue(req.Value);
        await db.SaveChangesAsync();
        return Results.Ok();
    });

    // ── Connections ───────────────────────────────────────────────────────────
    app.MapGet("/api/connections", async (SimulatorDbContext db) =>
    {
        var conns = await db.SystemConnections.ToListAsync();
        return Results.Ok(conns.Select(c => new ConnectionStatusDto(c.ConnectionName, c.Status, c.Detail, c.CheckedAt)));
    });

    // ── Test Console Reset ───────────────────────────────────────────────────
    // Resets all virtual devices to online state for a clean test run
    app.MapPost("/api/test/reset", async (
        VirtualLaserServer laser,
        VirtualFactoryGateway gateway,
        ISimulatorStateService state,
        Microsoft.AspNetCore.SignalR.IHubContext<ND.DeviceSimulator.Infrastructure.Hubs.SimulatorHub, ND.DeviceSimulator.Application.Abstractions.ISimulatorClient> hub) =>
    {
        try
        {
            await laser.ConnectLaserAsync();
            state.SetVisionOnline(true);

            // Ensure gateway is connected
            if (!state.GetStatus().Gateway.Connected)
            {
                await gateway.ConnectGatewayAsync();
            }

            await hub.Clients.All.SimulatorStatusUpdated(state.GetStatus());
            return Results.Ok(new { status = "reset", message = "All devices restored to online state" });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    });

    // ── Kiosk UI Service Proxy for Auth & RBAC ────────────────────────────────
    var kioskUrl = builder.Configuration["KIOSK_URL"] ?? "http://kiosk-ui:5007";

    async Task ProxyToKioskAsync(HttpContext context, string targetUrl, HttpClient client)
    {
        var request = new HttpRequestMessage(new HttpMethod(context.Request.Method), targetUrl);

        if (HttpMethods.IsPost(context.Request.Method) || 
            HttpMethods.IsPut(context.Request.Method) || 
            HttpMethods.IsDelete(context.Request.Method))
        {
            context.Request.EnableBuffering();
            var stream = new StreamReader(context.Request.Body);
            var bodyText = await stream.ReadToEndAsync();
            if (!string.IsNullOrEmpty(bodyText))
            {
                request.Content = new StringContent(bodyText, System.Text.Encoding.UTF8, "application/json");
            }
        }

        foreach (var header in context.Request.Headers)
        {
            if (!header.Key.StartsWith("Content-", StringComparison.OrdinalIgnoreCase))
            {
                request.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray());
            }
        }

        try
        {
            var response = await client.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();
            context.Response.StatusCode = (int)response.StatusCode;
            context.Response.ContentType = response.Content.Headers.ContentType?.ToString() ?? "application/json";
            await context.Response.WriteAsync(content);
        }
        catch (Exception ex)
        {
            context.Response.StatusCode = 502;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { error = $"Kiosk Proxy failed: {ex.Message}" });
        }
    }

    app.MapPost("/api/auth/login", async (HttpContext context, HttpClient client) =>
    {
        await ProxyToKioskAsync(context, $"{kioskUrl}/api/auth/login", client);
    });

    app.Map("/api/rbac/{*path}", async (string? path, HttpContext context, HttpClient client) =>
    {
        var targetUrl = $"{kioskUrl}/api/rbac/{path}";
        if (context.Request.QueryString.HasValue)
        {
            targetUrl += context.Request.QueryString.Value;
        }
        await ProxyToKioskAsync(context, targetUrl, client);
    });

    // ── Printer Adapter Service Proxy for Label Templates & Print History ─────
    var printerAdapterUrl = builder.Configuration["PRINTER_ADAPTER_URL"] ?? "http://printer-adapter:5003";

    async Task ProxyToPrinterAdapterAsync(HttpContext context, string targetUrl, HttpClient client)
    {
        var request = new HttpRequestMessage(new HttpMethod(context.Request.Method), targetUrl);

        if (HttpMethods.IsPost(context.Request.Method) || 
            HttpMethods.IsPut(context.Request.Method) || 
            HttpMethods.IsDelete(context.Request.Method))
        {
            context.Request.EnableBuffering();
            var stream = new StreamReader(context.Request.Body);
            var bodyText = await stream.ReadToEndAsync();
            if (!string.IsNullOrEmpty(bodyText))
            {
                request.Content = new StringContent(bodyText, System.Text.Encoding.UTF8, "application/json");
            }
        }

        foreach (var header in context.Request.Headers)
        {
            if (!header.Key.StartsWith("Content-", StringComparison.OrdinalIgnoreCase))
            {
                request.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray());
            }
        }

        try
        {
            var response = await client.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();
            context.Response.StatusCode = (int)response.StatusCode;
            context.Response.ContentType = response.Content.Headers.ContentType?.ToString() ?? "application/json";
            await context.Response.WriteAsync(content);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Printer Adapter Proxy failed: {TargetUrl}", targetUrl);
            context.Response.StatusCode = 502;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { error = $"Printer Adapter Proxy failed: {ex.Message}" });
        }
    }

    app.Map("/api/label-templates/{*path}", async (string? path, HttpContext context, HttpClient client) =>
    {
        var targetUrl = $"{printerAdapterUrl}/api/label-templates" + (string.IsNullOrEmpty(path) ? "" : $"/{path}");
        if (context.Request.QueryString.HasValue)
        {
            targetUrl += context.Request.QueryString.Value;
        }
        await ProxyToPrinterAdapterAsync(context, targetUrl, client);
    });

    app.Map("/api/print-history/{*path}", async (string? path, HttpContext context, HttpClient client) =>
    {
        var targetUrl = $"{printerAdapterUrl}/api/print-history" + (string.IsNullOrEmpty(path) ? "" : $"/{path}");
        if (context.Request.QueryString.HasValue)
        {
            targetUrl += context.Request.QueryString.Value;
        }
        await ProxyToPrinterAdapterAsync(context, targetUrl, client);
    });

    // ── Simulation Printer Control Proxy ─────────────────────────────────────
    // Forwards connect/disconnect/mode calls to printer-adapter's VirtualPrinterSimulator
    app.MapGet("/api/printers/simulation-status", async (HttpContext context, HttpClient client) =>
    {
        var targetUrl = $"{printerAdapterUrl}/api/simulation/printers";
        await ProxyToPrinterAdapterAsync(context, targetUrl, client);
    });

    app.MapPost("/api/printers/simulation-status/{code}/connect", async (string code, HttpContext context, HttpClient client) =>
    {
        var targetUrl = $"{printerAdapterUrl}/api/simulation/printers/{code}/connect";
        await ProxyToPrinterAdapterAsync(context, targetUrl, client);
    });

    app.MapPost("/api/printers/simulation-status/{code}/disconnect", async (string code, HttpContext context, HttpClient client) =>
    {
        var targetUrl = $"{printerAdapterUrl}/api/simulation/printers/{code}/disconnect";
        await ProxyToPrinterAdapterAsync(context, targetUrl, client);
    });

    app.MapPost("/api/printers/simulation-status/{code}/mode", async (string code, HttpContext context, HttpClient client) =>
    {
        var targetUrl = $"{printerAdapterUrl}/api/simulation/printers/{code}/mode";
        await ProxyToPrinterAdapterAsync(context, targetUrl, client);
    });

    app.MapFallbackToFile("index.html");


    await app.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Device Simulator host terminated unexpectedly");
    return 1;
}
finally
{
    await Log.CloseAndFlushAsync();
}

return 0;

public record TriggerJobRequest(
    string? Scenario,
    int? Pcs = null,
    string? DispatchTarget = "simulation",
    string? Station = null,
    string? Team = null,
    string? Notes = null
);


public record CreateGatewayOrderRequest(
    [property: System.Text.Json.Serialization.JsonPropertyName("production_order_id")] string ProductionOrderId,
    [property: System.Text.Json.Serialization.JsonPropertyName("order_number")] string OrderNumber,
    [property: System.Text.Json.Serialization.JsonPropertyName("operation_type")] string OperationType,
    [property: System.Text.Json.Serialization.JsonPropertyName("station")] string Station,
    [property: System.Text.Json.Serialization.JsonPropertyName("priority")] int Priority,
    [property: System.Text.Json.Serialization.JsonPropertyName("product_id")] string ProductId,
    [property: System.Text.Json.Serialization.JsonPropertyName("lot_number")] string LotNumber,
    [property: System.Text.Json.Serialization.JsonPropertyName("serial_number")] string SerialNumber,
    [property: System.Text.Json.Serialization.JsonPropertyName("mfg_date")] string MfgDate,
    [property: System.Text.Json.Serialization.JsonPropertyName("exp_date")] string ExpDate,
    [property: System.Text.Json.Serialization.JsonPropertyName("quantity")] int Quantity,
    [property: System.Text.Json.Serialization.JsonPropertyName("workflow_name")] string WorkflowName,
    [property: System.Text.Json.Serialization.JsonPropertyName("product_name")] string ProductName,
    [property: System.Text.Json.Serialization.JsonPropertyName("product_revision")] string ProductRevision,
    [property: System.Text.Json.Serialization.JsonPropertyName("customer")] string Customer,
    [property: System.Text.Json.Serialization.JsonPropertyName("planned_quantity")] int PlannedQuantity,
    [property: System.Text.Json.Serialization.JsonPropertyName("completed_quantity")] int CompletedQuantity,
    [property: System.Text.Json.Serialization.JsonPropertyName("remaining_quantity")] int RemainingQuantity,
    [property: System.Text.Json.Serialization.JsonPropertyName("current_step")] string CurrentStep,
    [property: System.Text.Json.Serialization.JsonPropertyName("assigned_team")] string AssignedTeam,
    [property: System.Text.Json.Serialization.JsonPropertyName("operator")] string Operator
);

public partial class Program { }
