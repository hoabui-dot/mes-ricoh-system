using Serilog;
using ND.Infrastructure.Observability;
using ND.ProjectionService.Infrastructure.DependencyInjection;
using ND.ProjectionService.Infrastructure.Persistence;
using ND.ProjectionService.Infrastructure.SignalR;
using ND.ProjectionService.Application.Interfaces;
using ND.ProjectionService.Application.Dtos;
using ND.ProjectionService.Domain.Entities;
using System.Net.Sockets;
using System.Net.Http;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ND.SharedKernel.Abstractions;
using ND.ProjectionService.Domain.Alarms;
using ND.ProjectionService.Application.Alarms;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
Log.Logger = SerilogConfiguration.Configure(
    new LoggerConfiguration(), builder.Configuration, "projection-service").CreateLogger();
builder.Host.UseSerilog();

// Add Infrastructure
builder.Services.AddProjectionInfrastructure(builder.Configuration);

// Add SignalR
builder.Services.AddSignalR();

// CORS for frontend / browser connection
builder.Services.AddCors(opts =>
    opts.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(_ => true) // Allow any local origin for development / Kiosk deployment
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

var jwtSecret = builder.Configuration["Jwt:Secret"] ?? "change_me_to_a_long_random_secret_at_least_32_chars";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "nd-station-agent";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "nd-kiosk";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true,
        ValidateIssuerSigningKey = true, ValidIssuer = jwtIssuer, ValidAudience = jwtAudience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
    };
});
builder.Services.AddAuthorization(options => options.AddPolicy("AlarmView", policy =>
    policy.RequireAuthenticatedUser().RequireAssertion(context =>
        context.User.IsInRole("SUPER_ADMIN") || context.User.HasClaim("permission", "SYSTEM_ADMIN") ||
        context.User.HasClaim("permission", "ALARM_VIEW"))));

var app = builder.Build();

// Ensure DB is created and seeded on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ProjectionDbContext>();
    await db.Database.EnsureCreatedAsync();

    // Idempotent schema migrations
    using (var cmd = db.Database.GetDbConnection().CreateCommand())
    {
        await db.Database.OpenConnectionAsync();

        // v1: lifecycle_state on devices
        cmd.CommandText = "ALTER TABLE projection_device_status ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'Offline';";
        try { await cmd.ExecuteNonQueryAsync(); } catch { }

        // v2: initial alarms table
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS projection_alarms (
                id TEXT PRIMARY KEY,
                severity TEXT NOT NULL,
                source TEXT NOT NULL,
                message TEXT NOT NULL,
                device_id TEXT NULL,
                is_acknowledged INTEGER NOT NULL DEFAULT 0,
                acknowledged_by TEXT NULL,
                acknowledged_at TEXT NULL,
                created_at TEXT NOT NULL
            );";
        try { await cmd.ExecuteNonQueryAsync(); } catch { }

        // v3: alarm aggregation + categorization columns
        foreach (var sql in new[]
        {
            "ALTER TABLE projection_alarms ADD COLUMN alarm_type TEXT NOT NULL DEFAULT 'ProductionError';",
            "ALTER TABLE projection_alarms ADD COLUMN alarm_group_key TEXT NOT NULL DEFAULT '';",
            "ALTER TABLE projection_alarms ADD COLUMN device_name TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN production_order_id TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN current_state TEXT NOT NULL DEFAULT 'Active';",
            "ALTER TABLE projection_alarms ADD COLUMN first_occurred_at TEXT NOT NULL DEFAULT '';",
            "ALTER TABLE projection_alarms ADD COLUMN last_occurred_at TEXT NOT NULL DEFAULT '';",
            "ALTER TABLE projection_alarms ADD COLUMN repeat_count INTEGER NOT NULL DEFAULT 0;",
            "ALTER TABLE projection_alarms ADD COLUMN resolved_at TEXT NULL;",
            // Back-fill group key for existing rows that have a device_id
            "UPDATE projection_alarms SET alarm_group_key = id WHERE alarm_group_key = '';",
            // Back-fill first/last occurred from created_at for existing rows
            "UPDATE projection_alarms SET first_occurred_at = created_at WHERE first_occurred_at = '';",
            "UPDATE projection_alarms SET last_occurred_at = created_at WHERE last_occurred_at = '';",
            // Back-fill current_state from is_acknowledged for existing rows
            "UPDATE projection_alarms SET current_state = 'Acknowledged' WHERE is_acknowledged = 1 AND current_state = 'Active';",
            // Index on alarm_group_key for fast dedup lookups
            "CREATE INDEX IF NOT EXISTS idx_alarms_group_key ON projection_alarms(alarm_group_key);",
            // New diagnostic columns in projection_device_status
            "ALTER TABLE projection_device_status ADD COLUMN serial_number TEXT;",
            "ALTER TABLE projection_device_status ADD COLUMN lifetime_print_counter INTEGER;",
            "ALTER TABLE projection_device_status ADD COLUMN thermal_temp REAL;",
            "ALTER TABLE projection_device_status ADD COLUMN connection_details TEXT;",
            // Device Status History Table
            @"CREATE TABLE IF NOT EXISTS projection_device_status_history (
                id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                lifecycle_state TEXT NOT NULL,
                is_online INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                created_at TEXT NOT NULL
            );"
        })
        {
            cmd.CommandText = sql;
            try { await cmd.ExecuteNonQueryAsync(); } catch { }
        }

        // v4: authoritative alarm domain (additive compatibility migration)
        foreach (var sql in new[]
        {
            "ALTER TABLE projection_alarms ADD COLUMN alarm_code TEXT NOT NULL DEFAULT 'LEGACY_ALARM';",
            "ALTER TABLE projection_alarms ADD COLUMN dedupe_key TEXT NOT NULL DEFAULT '';",
            "ALTER TABLE projection_alarms ADD COLUMN category TEXT NOT NULL DEFAULT 'SYSTEM';",
            "ALTER TABLE projection_alarms ADD COLUMN state TEXT NOT NULL DEFAULT 'RAISED';",
            "ALTER TABLE projection_alarms ADD COLUMN station_id TEXT NOT NULL DEFAULT 'STATION-01';",
            "ALTER TABLE projection_alarms ADD COLUMN source_service TEXT NOT NULL DEFAULT 'projection-service';",
            "ALTER TABLE projection_alarms ADD COLUMN source_type TEXT NOT NULL DEFAULT 'Legacy';",
            "ALTER TABLE projection_alarms ADD COLUMN source_id TEXT NOT NULL DEFAULT '';",
            "ALTER TABLE projection_alarms ADD COLUMN job_id TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN work_order_no TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN product_code TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN product_serial TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN production_impact TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN title_key TEXT NOT NULL DEFAULT 'alarm.legacy.title';",
            "ALTER TABLE projection_alarms ADD COLUMN message_key TEXT NOT NULL DEFAULT 'alarm.legacy.message';",
            "ALTER TABLE projection_alarms ADD COLUMN message_params_json TEXT NOT NULL DEFAULT '{}';",
            "ALTER TABLE projection_alarms ADD COLUMN technical_message TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN correlation_id TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN first_seen_at TEXT NOT NULL DEFAULT '';",
            "ALTER TABLE projection_alarms ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';",
            "ALTER TABLE projection_alarms ADD COLUMN occurrence_count INTEGER NOT NULL DEFAULT 1;",
            "ALTER TABLE projection_alarms ADD COLUMN assigned_to TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN assigned_at TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN resolved_by TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN resolution_code TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN resolution_comment TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN suppressed_until TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN suppression_reason TEXT NULL;",
            "ALTER TABLE projection_alarms ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';",
            "ALTER TABLE projection_alarms ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;",
            "ALTER TABLE projection_alarms ADD COLUMN escalation_level INTEGER NOT NULL DEFAULT 0;",
            "ALTER TABLE projection_alarms ADD COLUMN escalated_at TEXT NULL;",
            "UPDATE projection_alarms SET dedupe_key = CASE WHEN alarm_group_key <> '' THEN alarm_group_key ELSE id END WHERE dedupe_key = '';",
            "UPDATE projection_alarms SET source_id = COALESCE(device_id, production_order_id, id) WHERE source_id = '';",
            "UPDATE projection_alarms SET technical_message = message WHERE technical_message IS NULL;",
            "UPDATE projection_alarms SET first_seen_at = CASE WHEN first_occurred_at <> '' THEN first_occurred_at ELSE created_at END WHERE first_seen_at = '';",
            "UPDATE projection_alarms SET last_seen_at = CASE WHEN last_occurred_at <> '' THEN last_occurred_at ELSE created_at END WHERE last_seen_at = '';",
            "UPDATE projection_alarms SET updated_at = created_at WHERE updated_at = '';",
            "UPDATE projection_alarms SET occurrence_count = repeat_count + 1;",
            "UPDATE projection_alarms SET category = CASE WHEN alarm_type = 'DeviceConnection' THEN 'DEVICE' ELSE 'JOB' END;",
            "UPDATE projection_alarms SET state = CASE current_state WHEN 'Active' THEN 'RAISED' WHEN 'Acknowledged' THEN 'ACKNOWLEDGED' WHEN 'Resolved' THEN 'CLEARED' ELSE 'RAISED' END;",
            "CREATE INDEX IF NOT EXISTS idx_alarm_dedupe_key ON projection_alarms(dedupe_key);",
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_alarm_active_dedupe ON projection_alarms(dedupe_key) WHERE state IN ('RAISED','ACKNOWLEDGED','IN_PROGRESS','SUPPRESSED');",
            @"CREATE TABLE IF NOT EXISTS alarm_timeline_events (
                id TEXT PRIMARY KEY, alarm_id TEXT NOT NULL, action_type TEXT NOT NULL,
                previous_state TEXT NULL, new_state TEXT NOT NULL, actor_user_id TEXT NULL,
                actor_username TEXT NOT NULL, actor_role TEXT NOT NULL, comment TEXT NULL,
                metadata_json TEXT NOT NULL, occurred_at TEXT NOT NULL, correlation_id TEXT NULL, created_at TEXT NOT NULL);",
            "CREATE INDEX IF NOT EXISTS idx_alarm_timeline_alarm_occurred ON alarm_timeline_events(alarm_id, occurred_at);",
            @"CREATE TABLE IF NOT EXISTS alarm_outbox_events (
                id TEXT PRIMARY KEY, event_id TEXT NOT NULL, alarm_id TEXT NOT NULL, event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL, routing_key TEXT NOT NULL, status TEXT NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0, next_retry_at TEXT NULL, published_at TEXT NULL,
                last_error TEXT NULL, created_at TEXT NOT NULL);",
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_alarm_outbox_event_id ON alarm_outbox_events(event_id);",
            @"CREATE TABLE IF NOT EXISTS alarm_inbox_messages (
                id TEXT PRIMARY KEY, consumer_name TEXT NOT NULL, event_id TEXT NOT NULL,
                processed_at TEXT NOT NULL, correlation_id TEXT NULL, created_at TEXT NOT NULL);",
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_alarm_inbox_consumer_event ON alarm_inbox_messages(consumer_name, event_id);"
            ,@"CREATE TABLE IF NOT EXISTS alarm_command_receipts (
                id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL, alarm_id TEXT NOT NULL,
                command_type TEXT NOT NULL, actor_user_id TEXT NOT NULL, completed_at TEXT NOT NULL,
                created_at TEXT NOT NULL);"
            ,"CREATE UNIQUE INDEX IF NOT EXISTS ux_alarm_command_idempotency ON alarm_command_receipts(idempotency_key);"
        })
        {
            cmd.CommandText = sql;
            try { await cmd.ExecuteNonQueryAsync(); } catch (Exception ex) { Log.Debug(ex, "Alarm schema statement skipped"); }
        }
    }

    var seedAlarms = app.Environment.IsDevelopment() ||
        string.Equals(app.Configuration["ALARM_SEED_ENABLED"], "true", StringComparison.OrdinalIgnoreCase);
    await ProjectionDbSeeder.SeedAsync(db, seedAlarms);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

static object ParseJsonObject(string json)
{
    using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
    return document.RootElement.Clone();
}

static AlarmV2Dto ToAlarmV2(Alarm a) => new(
    a.Id, a.AlarmCode, a.DedupeKey, a.Severity, a.Category, a.State, a.StationId,
    a.SourceService, a.SourceType, a.SourceId, a.DeviceId, a.JobId, a.WorkOrderNo,
    a.ProductCode, a.ProductSerial, a.TitleKey, a.MessageKey, ParseJsonObject(a.MessageParamsJson),
    a.TechnicalMessage, a.ProductionImpact, a.FirstSeenAt, a.LastSeenAt, a.OccurrenceCount,
    a.AcknowledgedBy, a.AcknowledgedAt, a.AssignedTo, a.AssignedAt, a.ResolvedBy, a.ResolvedAt,
    a.ResolutionCode, a.ResolutionComment, a.SuppressedUntil, a.SuppressionReason,
    a.EscalationLevel, a.EscalatedAt, a.UpdatedAt, a.RowVersion);

// ── REST Query Endpoints ────────────────────────────────────────────────────

app.MapGet("/api/projection/production", async (
    string? stationId,
    IConfiguration config,
    IProductionViewRepository repo,
    CancellationToken ct) =>
{
    var targetStationId = stationId ?? config["STATION_ID"] ?? "STATION-01";
    var view = await repo.GetByStationIdAsync(targetStationId, ct);
    if (view is null)
        return Results.NotFound(new { error = $"No production view found for station: {targetStationId}" });

    var dto = new ProductionViewDto(
        view.StationId,
        view.JobId,
        view.WorkOrderNo,
        view.ProductCode,
        view.ProductSerial,
        view.JobStatus,
        view.UpdatedAt);

    return Results.Ok(dto);
});

app.MapGet("/api/projection/activities", async (
    int? limit,
    IActivityLogRepository repo,
    CancellationToken ct) =>
{
    var batchSize = limit ?? 10;
    var logs = await repo.GetLatestAsync(batchSize, ct);
    var dtos = logs.Select(l => new ActivityLogDto(
        l.Id,
        l.EventType,
        l.JobId,
        l.JobNo,
        l.ProductCode,
        l.Status,
        l.Message,
        l.OccurredAt));

    return Results.Ok(dtos);
});

app.MapGet("/api/projection/devices", async (
    IDeviceStatusRepository repo,
    CancellationToken ct) =>
{
    var devices = await repo.GetAllAsync(ct);
    var dtos = devices.Select(d => new DeviceStatusDto(
        d.DeviceId,
        d.DeviceType,
        d.IsOnline,
        d.LastSeenAt,
        d.LifecycleState));

    return Results.Ok(dtos);
});

app.MapGet("/api/projection/devices/{code}/history", async (
    string code,
    ProjectionDbContext db,
    CancellationToken ct) =>
{
    var history = await db.DeviceStatusHistories
        .Where(h => h.DeviceId == code)
        .OrderByDescending(h => h.Timestamp)
        .Take(50)
        .Select(h => new
        {
            deviceId = h.DeviceId,
            lifecycleState = h.LifecycleState,
            isOnline = h.IsOnline,
            timestamp = h.Timestamp
        })
        .ToListAsync(ct);

    return Results.Ok(history);
});

app.MapGet("/api/projection/records/today", async (
    int? page,
    int? pageSize,
    IProductionRecordRepository repo,
    CancellationToken ct) =>
{
    var p = page ?? 1;
    var ps = pageSize ?? 10;
    var (items, totalCount) = await repo.GetTodayAsync(p, ps, ct);

    var dtos = items.Select(r => new ProductionRecordDto(
        r.Id,
        r.JobId,
        r.JobNo,
        r.ProductCode,
        r.ProductSerial,
        r.JobType,
        r.CurrentStatus,
        r.StationId,
        r.CreatedAt,
        r.UpdatedAt)).ToList();

    return Results.Ok(new PagedResult<ProductionRecordDto>(dtos, totalCount, p, ps));
});

app.MapGet("/api/projection/records/history", async (
    int? page,
    int? pageSize,
    string? status,
    string? productCode,
    string? workOrder,
    string? dateFrom,
    string? dateTo,
    IProductionRecordRepository repo,
    CancellationToken ct) =>
{
    var p = page ?? 1;
    var ps = pageSize ?? 10;
    var (items, totalCount) = await repo.GetHistoryAsync(p, ps, status, productCode, workOrder, dateFrom, dateTo, ct);

    var dtos = items.Select(r => new ProductionRecordDto(
        r.Id,
        r.JobId,
        r.JobNo,
        r.ProductCode,
        r.ProductSerial,
        r.JobType,
        r.CurrentStatus,
        r.StationId,
        r.CreatedAt,
        r.UpdatedAt)).ToList();

    return Results.Ok(new PagedResult<ProductionRecordDto>(dtos, totalCount, p, ps));
});

app.MapGet("/api/projection/records/work-order/{workOrderNo}", async (
    string workOrderNo,
    ProjectionDbContext db,
    CancellationToken ct) =>
{
    var records = await db.ProductionRecords
        .Where(r => r.JobNo == workOrderNo)
        .OrderBy(r => r.CreatedAt)
        .ToListAsync(ct);

    var dtos = records.Select(r => new ProductionRecordDto(
        r.Id,
        r.JobId,
        r.JobNo,
        r.ProductCode,
        r.ProductSerial,
        r.JobType,
        r.CurrentStatus,
        r.StationId,
        r.CreatedAt,
        r.UpdatedAt)).ToList();

    return Results.Ok(dtos);
});

// Production Order Views (new architecture - replaces old job-engine direct access)
app.MapGet("/api/projection/orders", async (
    IProductionOrderViewRepository repo,
    CancellationToken ct) =>
{
    var orders = await repo.GetLatestAsync(100, ct);
    return Results.Ok(orders.Select(o => new {
        o.Id,
        o.OrderNo,
        o.ProductCode,
        o.PlannedQty,
        o.CompletedQty,
        o.RemainingQty,
        o.Status,
        o.CreatedAt,
        o.UpdatedAt,
        ProgressPercent = o.PlannedQty > 0 ? (int)Math.Round((double)o.CompletedQty / o.PlannedQty * 100) : 0
    }));
});

app.MapGet("/api/projection/orders/{orderNo}/items", async (
    string orderNo,
    IProductionRecordRepository repo,
    CancellationToken ct) =>
{
    var (records, _) = await repo.GetHistoryAsync(
        page: 1, pageSize: 500,
        workOrder: orderNo,
        cancellationToken: ct);
    return Results.Ok(records.Select(r => new {
        r.Id,
        r.JobId,
        r.JobNo,
        r.ProductCode,
        r.ProductSerial,
        r.JobType,
        r.CurrentStatus,
        r.AssignedPrinter,
        r.StartTime,
        r.EndTime,
        r.RetryCount,
        r.ErrorMessage,
        r.CreatedAt,
        r.UpdatedAt
    }).OrderBy(r => r.CreatedAt));
});

// ── Alarm Center v2 read APIs ──────────────────────────────────────────────
app.MapGet("/api/alarms", async (
    int? page, int? pageSize, string? stationId, string? state, string? severity,
    string? category, string? deviceId, string? jobId, string? workOrderNo,
    string? assignedTo, bool? productionImpactOnly, string? from, string? to,
    string? sort, IAlarmRepository repo, CancellationToken ct) =>
{
    var p = Math.Max(1, page ?? 1);
    var ps = Math.Clamp(pageSize ?? 25, 1, 100);
    if (state is not null && state is not ("ACTIVE" or "HISTORY" or AlarmState.Raised or AlarmState.Acknowledged or AlarmState.InProgress or AlarmState.Cleared or AlarmState.Closed or AlarmState.Suppressed))
        return Results.BadRequest(new { error = "Trạng thái cảnh báo không hợp lệ." });
    if (severity is not null && !AlarmSeverity.All.Contains(severity))
        return Results.BadRequest(new { error = "Mức độ cảnh báo không hợp lệ." });
    if (category is not null && !AlarmCategory.All.Contains(category))
        return Results.BadRequest(new { error = "Nhóm cảnh báo không hợp lệ." });
    var (items, total) = await repo.GetAdvancedPagedAsync(p, ps, stationId, state, severity,
        category, deviceId, jobId, workOrderNo, assignedTo, productionImpactOnly ?? false,
        from, to, sort, ct);
    return Results.Ok(new { items = items.Select(ToAlarmV2), totalCount = total, page = p,
        pageSize = ps, totalPages = (int)Math.Ceiling((double)total / ps) });
}).RequireAuthorization("AlarmView");

app.MapGet("/api/alarms/summary", async (string? stationId, IAlarmRepository repo, CancellationToken ct) =>
{
    var summary = await repo.GetSummaryAsync(stationId, ct);
    return Results.Ok(new { activeCount = summary.ActiveCount, unacknowledgedCount = summary.UnacknowledgedCount,
        criticalCount = summary.CriticalCount, inProgressCount = summary.InProgressCount,
        clearedTodayCount = summary.ClearedTodayCount });
}).RequireAuthorization("AlarmView");

app.MapGet("/api/alarms/options", () => Results.Ok(new
{
    states = new[] { AlarmState.Raised, AlarmState.Acknowledged, AlarmState.InProgress, AlarmState.Cleared, AlarmState.Closed, AlarmState.Suppressed },
    severities = AlarmSeverity.All.OrderBy(x => x), categories = AlarmCategory.All.OrderBy(x => x)
})).RequireAuthorization("AlarmView");

app.MapGet("/api/alarms/{alarmId}", async (string alarmId, IAlarmRepository repo, CancellationToken ct) =>
{
    var alarm = await repo.GetByIdAsync(alarmId, ct);
    return alarm is null ? Results.NotFound(new { error = "Không tìm thấy cảnh báo." }) : Results.Ok(ToAlarmV2(alarm));
}).RequireAuthorization("AlarmView");

app.MapGet("/api/alarms/{alarmId}/timeline", async (string alarmId, IAlarmRepository alarms,
    IAlarmTimelineRepository timeline, CancellationToken ct) =>
{
    if (await alarms.GetByIdAsync(alarmId, ct) is null) return Results.NotFound(new { error = "Không tìm thấy cảnh báo." });
    var events = await timeline.GetByAlarmIdAsync(alarmId, ct);
    return Results.Ok(events.Select(x => new AlarmTimelineDto(x.Id, x.AlarmId, x.ActionType,
        x.PreviousState, x.NewState, x.ActorUserId, x.ActorUsername, x.ActorRole, x.Comment,
        ParseJsonObject(x.MetadataJson), x.OccurredAt, x.CorrelationId)));
}).RequireAuthorization("AlarmView");

// ── Alarm Center secure command APIs ──────────────────────────────────────
var alarmCommands = app.MapGroup("/api/alarms").RequireAuthorization();

alarmCommands.MapPost("/{alarmId}/acknowledge", async (string alarmId, HttpContext http,
    ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
    await ExecuteAlarmCommand(http, db, alarmId, "ACKNOWLEDGE", "ALARM_ACKNOWLEDGE",
        actor => commands.AcknowledgeAsync(alarmId, actor, ct), ct));

alarmCommands.MapPost("/{alarmId}/assign", async (string alarmId, AssignAlarmRequest request,
    HttpContext http, ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
{
    var actor = GetAlarmActor(http.User);
    var target = string.IsNullOrWhiteSpace(request.AssignedTo) ? actor.Username : request.AssignedTo.Trim();
    var permission = string.Equals(target, actor.Username, StringComparison.OrdinalIgnoreCase)
        ? "ALARM_ASSIGN" : "ALARM_ASSIGN_OTHERS";
    return await ExecuteAlarmCommand(http, db, alarmId, "ASSIGN", permission,
        current => commands.AssignAsync(alarmId, target, current, ct), ct);
});

alarmCommands.MapPost("/{alarmId}/start-work", async (string alarmId, HttpContext http,
    ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
    await ExecuteAlarmCommand(http, db, alarmId, "START_WORK", "ALARM_START_WORK",
        actor => commands.StartWorkAsync(alarmId, actor, ct), ct));

alarmCommands.MapPost("/{alarmId}/clear", async (string alarmId, ResolveAlarmRequest request,
    HttpContext http, ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.ResolutionCode) || string.IsNullOrWhiteSpace(request.Comment))
        return AlarmError(StatusCodes.Status400BadRequest, "ALARM_RESOLUTION_REQUIRED", "Cần chọn kết quả và nhập ghi chú xử lý.");
    if (request.Comment.Length > 1000)
        return AlarmError(StatusCodes.Status400BadRequest, "ALARM_COMMENT_TOO_LONG", "Ghi chú không được vượt quá 1000 ký tự.");
    return await ExecuteAlarmCommand(http, db, alarmId, "CLEAR", "ALARM_CLEAR",
        actor => commands.ClearAsync(alarmId, request.ResolutionCode, request.Comment, actor, ct), ct);
});

alarmCommands.MapPost("/{alarmId}/close", async (string alarmId, HttpContext http,
    ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
    await ExecuteAlarmCommand(http, db, alarmId, "CLOSE", "ALARM_CLOSE",
        actor => commands.CloseAsync(alarmId, actor, ct), ct));

alarmCommands.MapPost("/{alarmId}/suppress", async (string alarmId, SuppressAlarmRequest request,
    HttpContext http, ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Reason))
        return AlarmError(StatusCodes.Status400BadRequest, "ALARM_SUPPRESSION_REASON_REQUIRED", "Cần nhập lý do tạm ẩn cảnh báo.");
    if (request.Reason.Length > 500 || request.Until <= DateTime.UtcNow || request.Until > DateTime.UtcNow.AddDays(30))
        return AlarmError(StatusCodes.Status400BadRequest, "ALARM_SUPPRESSION_INVALID", "Thời hạn hoặc lý do tạm ẩn không hợp lệ.");
    return await ExecuteAlarmCommand(http, db, alarmId, "SUPPRESS", "ALARM_SUPPRESS",
        actor => commands.SuppressAsync(alarmId, request.Reason, request.Until, actor, ct), ct);
});

alarmCommands.MapPost("/{alarmId}/unsuppress", async (string alarmId, HttpContext http,
    ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
    await ExecuteAlarmCommand(http, db, alarmId, "UNSUPPRESS", "ALARM_SUPPRESS",
        actor => commands.UnsuppressAsync(alarmId, actor, ct), ct));

alarmCommands.MapPost("/{alarmId}/retry-device", async (string alarmId, ManualRetryRequest request,
    HttpContext http, ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Reason))
        return AlarmError(400, "ALARM_REASON_REQUIRED", "Cần nhập lý do thử lại thiết bị.");
    var alarm = await db.Alarms.AsNoTracking().FirstOrDefaultAsync(x => x.Id == alarmId, ct);
    if (alarm is null) return AlarmError(404, "ALARM_NOT_FOUND", "Không tìm thấy cảnh báo.");
    if (string.IsNullOrWhiteSpace(alarm.DeviceId)) return AlarmError(409, "ALARM_RETRY_NOT_SUPPORTED", "Cảnh báo này không hỗ trợ thử lại thiết bị.");
    return await ExecuteAlarmCommand(http, db, alarmId, "RETRY_DEVICE", "ALARM_RETRY_DEVICE",
        actor => commands.RequestManualCommandAsync(alarmId, "RETRY_DEVICE", request.Reason, GetIdempotencyKey(http), actor, ct), ct, true);
});

alarmCommands.MapPost("/{alarmId}/retry-job-step", async (string alarmId, ManualRetryRequest request,
    HttpContext http, ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Reason))
        return AlarmError(400, "ALARM_REASON_REQUIRED", "Cần nhập lý do thử lại bước công việc.");
    var alarm = await db.Alarms.AsNoTracking().FirstOrDefaultAsync(x => x.Id == alarmId, ct);
    if (alarm is null) return AlarmError(404, "ALARM_NOT_FOUND", "Không tìm thấy cảnh báo.");
    if (string.IsNullOrWhiteSpace(alarm.JobId)) return AlarmError(409, "ALARM_JOB_NOT_RETRYABLE", "Cảnh báo này không gắn với công việc có thể thử lại.");
    return await ExecuteAlarmCommand(http, db, alarmId, "RETRY_JOB_STEP", "ALARM_RETRY_JOB",
        actor => commands.RequestManualCommandAsync(alarmId, "RETRY_JOB_STEP", request.Reason, GetIdempotencyKey(http), actor, ct), ct, true);
});

alarmCommands.MapPost("/{alarmId}/escalate", async (string alarmId, HttpContext http,
    ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
{
    var alarm = await db.Alarms.AsNoTracking().FirstOrDefaultAsync(x => x.Id == alarmId, ct);
    if (alarm is null) return AlarmError(404, "ALARM_NOT_FOUND", "Không tìm thấy cảnh báo.");
    return await ExecuteAlarmCommand(http, db, alarmId, "ESCALATE", "ALARM_ESCALATE",
        actor => commands.EscalateAsync(alarmId, alarm.EscalationLevel + 1, actor, ct), ct);
});

alarmCommands.MapPost("/{alarmId}/vision-bypass", async (string alarmId, VisionBypassRequest request,
    HttpContext http, ProjectionDbContext db, IAlarmCommandService commands, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.ReasonCode) || string.IsNullOrWhiteSpace(request.Comment) ||
        string.IsNullOrWhiteSpace(request.ProductSerial) || request.JobAttempt < 1)
        return AlarmError(400, "ALARM_VISION_BYPASS_DETAILS_REQUIRED",
            "Bỏ qua Vision cần mã lý do, ghi chú, serial sản phẩm và lần chạy công việc.");
    if (request.Comment.Length > 1000)
        return AlarmError(400, "ALARM_COMMENT_TOO_LONG", "Ghi chú không được vượt quá 1000 ký tự.");
    var alarm = await db.Alarms.AsNoTracking().FirstOrDefaultAsync(x => x.Id == alarmId, ct);
    if (alarm is null) return AlarmError(404, "ALARM_NOT_FOUND", "Không tìm thấy cảnh báo.");
    if (alarm.Category != AlarmCategory.Quality || string.IsNullOrWhiteSpace(alarm.JobId))
        return AlarmError(409, "ALARM_RETRY_NOT_SUPPORTED", "Cảnh báo này không hỗ trợ bỏ qua Vision.");
    var reason = $"{request.ReasonCode}: {request.Comment}; serial={request.ProductSerial}; attempt={request.JobAttempt}";
    return await ExecuteAlarmCommand(http, db, alarmId, "VISION_BYPASS", "ALARM_VISION_BYPASS",
        actor => commands.RequestManualCommandAsync(alarmId, "VISION_BYPASS", reason,
            GetIdempotencyKey(http), actor, ct), ct, true);
});

// ── Alarm Center: legacy paginated + filtered list ─────────────────────────
app.MapGet("/api/projection/alarms", async (
    int? page,
    int? pageSize,
    string? alarmType,
    string? status,
    string? severity,
    string? deviceId,
    string? search,
    string? dateFrom,
    string? dateTo,
    IAlarmRepository repo,
    CancellationToken ct) =>
{
    var p  = page     ?? 1;
    var ps = pageSize ?? 20;

    var (items, totalCount) = await repo.GetPagedAsync(
        p, ps, alarmType, status, severity, deviceId, search, dateFrom, dateTo, ct);

    var activeCount = await repo.GetActiveCountAsync(ct);

    var dtos = items.Select(a => new AlarmDto(
        a.Id, a.AlarmType, a.AlarmGroupKey,
        a.Severity, a.Source, a.Message,
        a.DeviceId, a.DeviceName, a.ProductionOrderId,
        a.IsAcknowledged, a.CurrentState,
        a.AcknowledgedBy, a.AcknowledgedAt,
        a.FirstOccurredAt, a.LastOccurredAt, a.RepeatCount, a.ResolvedAt,
        a.CreatedAt
    )).ToList();

    return Results.Ok(new PagedAlarmResult(
        dtos, totalCount, p, ps,
        (int)Math.Ceiling((double)totalCount / ps),
        activeCount));
});

// ── Alarm Center: active count for dashboard banner ────────────────────────
app.MapGet("/api/projection/alarms/count", async (
    IAlarmRepository repo,
    CancellationToken ct) =>
{
    var active = await repo.GetActiveCountAsync(ct);
    return Results.Ok(new { active });
});

// ── Alarm Center: acknowledge ──────────────────────────────────────────────
app.MapPost("/api/projection/alarms/{id}/acknowledge", async (
    string id,
    HttpContext http,
    ProjectionDbContext db,
    IAlarmCommandService commands,
    CancellationToken ct) =>
{
    return await ExecuteAlarmCommand(http, db, id, "ACKNOWLEDGE", "ALARM_ACKNOWLEDGE",
        actor => commands.AcknowledgeAsync(id, actor, ct), ct);
}).RequireAuthorization();

app.MapGet("/api/projection/diagnostics/health", async (
    ProjectionDbContext db,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    var report = new Dictionary<string, object>();

    // 1. SQLite
    var sqliteOk = false;
    var sqliteTime = 0L;
    try
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        sqliteOk = await db.Database.CanConnectAsync(ct);
        sw.Stop();
        sqliteTime = sw.ElapsedMilliseconds;
    }
    catch {}
    report["sqlite"] = new { status = sqliteOk ? "Healthy" : "Unhealthy", latencyMs = sqliteTime };

    // Helper for TCP check
    async Task<object> CheckTcpAsync(string host, int port)
    {
        var ok = false;
        var time = 0L;
        try
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            using var tcp = new TcpClient();
            var connectTask = tcp.ConnectAsync(host, port, ct).AsTask();
            var delayTask = Task.Delay(1000, ct);
            var completedTask = await Task.WhenAny(connectTask, delayTask);
            if (completedTask == connectTask && tcp.Connected)
            {
                ok = true;
            }
            sw.Stop();
            time = sw.ElapsedMilliseconds;
        }
        catch {}
        return new { status = ok ? "Healthy" : "Unhealthy", latencyMs = time };
    }

    // 2. RabbitMQ
    var rabbitHost = configuration["RabbitMq:Host"] ?? "rabbitmq";
    var rabbitPort = 5672;
    report["rabbitmq"] = await CheckTcpAsync(rabbitHost, rabbitPort);

    // 3. MQTT Broker
    var mqttHost = configuration["MQTT_BROKER_HOST"] ?? "mosquitto";
    var mqttPort = 1883;
    report["mqtt"] = await CheckTcpAsync(mqttHost, mqttPort);

    // 4. Printer Adapter API. The adapter runs on the separate Print Station,
    // so diagnostics must probe its configured HTTP endpoint rather than the
    // simulator/raw-printer TCP port 9100.
    var printerAdapterUrl = configuration["PRINTER_ADAPTER_URL"] ?? "http://printer-adapter:5003";
    if (Uri.TryCreate(printerAdapterUrl, UriKind.Absolute, out var printerAdapterUri))
        report["printer"] = await CheckTcpAsync(printerAdapterUri.Host, printerAdapterUri.Port);
    else
        report["printer"] = new { status = "Unhealthy", latencyMs = 0L };

    // 5. Laser
    report["laser"] = await CheckTcpAsync("device-simulator", 8901);

    // 6. PLC
    report["plc"] = await CheckTcpAsync("device-simulator", 5020);

    return Results.Ok(report);
});

app.MapGet("/api/projection/diagnostics/metrics", async (
    IProductionRecordRepository recordRepo,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    // Aggregate production record metrics
    var allRecords = await recordRepo.GetAllAsync(ct);
    var todayRecords = allRecords.Where(r => {
        if (DateTime.TryParse(r.CreatedAt, out var created)) {
            return created.Date == DateTime.UtcNow.Date;
        }
        return false;
    }).ToList();

    var totalToday = todayRecords.Count;
    var completedToday = todayRecords.Count(r => r.CurrentStatus == "Completed");
    var failedToday = todayRecords.Count(r => r.CurrentStatus == "FAILED" || r.CurrentStatus == "Failed");

    double passRate = totalToday > 0 ? ((double)completedToday / totalToday) * 100 : 100.0;
    double failRate = totalToday > 0 ? ((double)failedToday / totalToday) * 100 : 0.0;

    // Fetch step averages from job-engine
    var stepAverages = new Dictionary<string, double>();
    var jobEngineUrl = configuration["JOB_ENGINE_URL"] ?? "http://job-engine:5002";
    try
    {
        using var client = httpClientFactory.CreateClient();
        var response = await client.GetAsync($"{jobEngineUrl}/api/jobs/metrics", ct);
        if (response.IsSuccessStatusCode)
        {
            var content = await response.Content.ReadAsStringAsync(ct);
            var root = JsonDocument.Parse(content).RootElement;
            if (root.TryGetProperty("averages", out var averagesProp) && averagesProp.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in averagesProp.EnumerateObject())
                {
                    if (prop.Value.TryGetDouble(out var val))
                    {
                        stepAverages[prop.Name] = val;
                    }
                }
            }
        }
    }
    catch
    {
        // Log or fallback
        stepAverages["error"] = 0.0;
    }

    return Results.Ok(new {
        throughput = totalToday,
        passRate = Math.Round(passRate, 1),
        failureRate = Math.Round(failRate, 1),
        stepAverages
    });
});

app.MapGet("/api/projection/config", async (
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    var simulatorUrl = configuration["SIMULATOR_URL"] ?? "http://device-simulator:8080";
    using var client = httpClientFactory.CreateClient();
    try
    {
        var response = await client.GetAsync($"{simulatorUrl}/api/config", ct);
        if (response.IsSuccessStatusCode)
        {
            var content = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(content, "application/json");
        }
        return Results.StatusCode((int)response.StatusCode);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

app.MapPut("/api/projection/config/{key}", async (
    string key,
    JsonElement reqBody,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    var simulatorUrl = configuration["SIMULATOR_URL"] ?? "http://device-simulator:8080";
    using var client = httpClientFactory.CreateClient();
    try
    {
        var response = await client.PutAsJsonAsync($"{simulatorUrl}/api/config/{key}", reqBody, ct);
        if (response.IsSuccessStatusCode)
        {
            return Results.Ok();
        }
        return Results.StatusCode((int)response.StatusCode);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

// ── Printer Management Proxy ──────────────────────────────────────────────────
// Forwards kiosk-ui printer management requests to printer-adapter.
// printer-adapter is the single source of truth for all printer devices.

app.MapGet("/api/projection/printers/ready", async (
    bool? includeSimulation,
    IHttpClientFactory httpClientFactory, IConfiguration configuration, CancellationToken ct) =>
{
    var adapterUrl = configuration["PRINTER_ADAPTER_URL"] ?? "http://printer-adapter:5003";
    using var client = httpClientFactory.CreateClient();
    try
    {
        // Forward includeSimulation query param so printer-adapter can filter simulation printers
        var qs = includeSimulation == true ? "?includeSimulation=true" : "";
        var res = await client.GetAsync($"{adapterUrl}/api/printers/ready{qs}", ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        return Results.Content(body, "application/json", statusCode: (int)res.StatusCode);
    }
    catch (Exception ex) { return Results.Problem(ex.Message); }
});

app.MapGet("/api/projection/printers/active", async (
    IHttpClientFactory httpClientFactory, IConfiguration configuration, CancellationToken ct) =>
{
    var adapterUrl = configuration["PRINTER_ADAPTER_URL"] ?? "http://printer-adapter:5003";
    using var client = httpClientFactory.CreateClient();
    try
    {
        var res = await client.GetAsync($"{adapterUrl}/api/printers/active", ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        return Results.Content(body, "application/json", statusCode: (int)res.StatusCode);
    }
    catch
    {
        return Results.Problem("Printer adapter unreachable", statusCode: 502);
    }
});

app.MapGet("/api/projection/printers/{code}/maintenance", async (
    string code,
    IHttpClientFactory httpClientFactory, IConfiguration configuration, CancellationToken ct) =>
{
    var adapterUrl = configuration["PRINTER_ADAPTER_URL"] ?? "http://printer-adapter:5003";
    using var client = httpClientFactory.CreateClient();
    try
    {
        var res = await client.GetAsync($"{adapterUrl}/api/printers/{code}/maintenance", ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        return Results.Content(body, "application/json", statusCode: (int)res.StatusCode);
    }
    catch
    {
        return Results.Problem("Printer adapter unreachable", statusCode: 502);
    }
});

app.MapPost("/api/projection/printers/{code}/activate", async (
    string code, JsonElement reqBody,
    IHttpClientFactory httpClientFactory, IConfiguration configuration, CancellationToken ct) =>
{
    var adapterUrl = configuration["PRINTER_ADAPTER_URL"] ?? "http://printer-adapter:5003";
    using var client = httpClientFactory.CreateClient();
    try
    {
        var res = await client.PostAsJsonAsync($"{adapterUrl}/api/printers/{code}/activate", reqBody, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        return Results.Content(body, "application/json", statusCode: (int)res.StatusCode);
    }
    catch (Exception ex) { return Results.Problem(ex.Message); }
});

app.MapPost("/api/projection/printers/{code}/deactivate", async (
    string code,
    IHttpClientFactory httpClientFactory, IConfiguration configuration, CancellationToken ct) =>
{
    var adapterUrl = configuration["PRINTER_ADAPTER_URL"] ?? "http://printer-adapter:5003";
    using var client = httpClientFactory.CreateClient();
    try
    {
        var res = await client.PostAsync($"{adapterUrl}/api/printers/{code}/deactivate", null, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        return Results.Content(body, "application/json", statusCode: (int)res.StatusCode);
    }
    catch (Exception ex) { return Results.Problem(ex.Message); }
});

app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "projection-service" }));

// ── SignalR Hubs ────────────────────────────────────────────────────────────
app.MapHub<ProductionHub>("/hubs/production");

app.Run();

static AlarmActor GetAlarmActor(ClaimsPrincipal user)
{
    var id = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
    var username = user.FindFirstValue(ClaimTypes.Name) ?? user.FindFirstValue("unique_name") ?? id ?? "unknown";
    var role = user.FindFirstValue(ClaimTypes.Role) ?? "MEMBER";
    return new AlarmActor(id, username, role);
}

static string GetIdempotencyKey(HttpContext http) =>
    http.Request.Headers.TryGetValue("Idempotency-Key", out var value) && !string.IsNullOrWhiteSpace(value)
        ? value.ToString() : $"{http.TraceIdentifier}:{http.Request.Path}";

static bool HasAlarmPermission(ClaimsPrincipal user, string permission) =>
    AlarmAuthorizationMatrix.IsAllowed(user.FindFirstValue(ClaimTypes.Role), permission,
        user.FindAll("permission").Select(x => x.Value));

static IResult AlarmError(int status, string code, string message) =>
    Results.Json(new { code, message }, statusCode: status);

static async Task<IResult> ExecuteAlarmCommand(HttpContext http, ProjectionDbContext db,
    string alarmId, string commandType, string permission, Func<AlarmActor, Task<Alarm>> execute,
    CancellationToken ct, bool requireExplicitIdempotency = false)
{
    if (!HasAlarmPermission(http.User, permission))
        return AlarmError(403, "ALARM_PERMISSION_DENIED", "Bạn không có quyền thực hiện hành động này.");
    var key = GetIdempotencyKey(http);
    if (requireExplicitIdempotency && !http.Request.Headers.ContainsKey("Idempotency-Key"))
        return AlarmError(400, "ALARM_IDEMPOTENCY_KEY_REQUIRED", "Yêu cầu cần khóa chống gửi trùng.");
    if (key.Length > 200) return AlarmError(400, "ALARM_IDEMPOTENCY_KEY_INVALID", "Khóa chống gửi trùng không hợp lệ.");
    var existing = await db.AlarmCommandReceipts.AsNoTracking().FirstOrDefaultAsync(x => x.IdempotencyKey == key, ct);
    if (existing is not null)
    {
        if (existing.AlarmId != alarmId || existing.CommandType != commandType)
            return AlarmError(409, "ALARM_IDEMPOTENCY_CONFLICT", "Khóa chống gửi trùng đã được dùng cho yêu cầu khác.");
        var current = await db.Alarms.AsNoTracking().FirstOrDefaultAsync(x => x.Id == alarmId, ct);
        return Results.Ok(new { alarmId, state = current?.State, idempotentReplay = true });
    }
    var actor = GetAlarmActor(http.User);
    db.AlarmCommandReceipts.Add(AlarmCommandReceipt.Create(key, alarmId, commandType, actor.UserId ?? "unknown", DateTime.UtcNow));
    try
    {
        var alarm = await execute(actor);
        return Results.Ok(new { alarmId = alarm.Id, alarm.State, alarm.RowVersion, idempotentReplay = false });
    }
    catch (ND.SharedKernel.Exceptions.NotFoundException)
    {
        db.ChangeTracker.Clear();
        return AlarmError(404, "ALARM_NOT_FOUND", "Không tìm thấy cảnh báo.");
    }
    catch (AlarmLifecycleException ex)
    {
        db.ChangeTracker.Clear();
        var code = ex.Message.Contains("already", StringComparison.OrdinalIgnoreCase)
            ? "ALARM_ALREADY_PROCESSED" : "ALARM_STATE_CONFLICT";
        return AlarmError(409, code, "Trạng thái cảnh báo đã thay đổi. Vui lòng tải lại dữ liệu.");
    }
    catch (DbUpdateConcurrencyException)
    {
        db.ChangeTracker.Clear();
        return AlarmError(409, "ALARM_CONCURRENCY_CONFLICT", "Cảnh báo vừa được người khác cập nhật. Vui lòng tải lại.");
    }
    catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("UNIQUE", StringComparison.OrdinalIgnoreCase) == true)
    {
        db.ChangeTracker.Clear();
        return AlarmError(409, "ALARM_IDEMPOTENCY_CONFLICT", "Yêu cầu trùng đang được xử lý.");
    }
}

public sealed record AssignAlarmRequest(string AssignedTo);
public sealed record ResolveAlarmRequest(string ResolutionCode, string Comment);
public sealed record SuppressAlarmRequest(string Reason, DateTime Until, string Scope = "ALARM");
public sealed record ManualRetryRequest(string Reason);
public sealed record VisionBypassRequest(string ReasonCode, string Comment, string ProductSerial, int JobAttempt);
