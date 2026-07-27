using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using ND.Infrastructure.Messaging;
using ND.Infrastructure.Observability;
using ND.StationGateway.Application.Commands;
using ND.StationGateway.Infrastructure.DependencyInjection;
using ND.StationGateway.Infrastructure.Persistence;
using ND.UnifiedContracts.Events;
using ND.UnifiedContracts.Validation;
using Scalar.AspNetCore;
using Serilog;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// ── Serilog ───────────────────────────────────────────────────────────────────
Log.Logger = SerilogConfiguration.Configure(
    new LoggerConfiguration(),
    builder.Configuration,
    "station-gateway").CreateLogger();

builder.Logging.ClearProviders();
builder.Services.AddSerilog();

// ── Infrastructure (SQLite, Redis, Kafka, outbox poller) ──────────────────
builder.Services.AddStationGatewayInfrastructure(builder.Configuration);

// ── OpenAPI ───────────────────────────────────────────────────────────────────
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, _, _) =>
    {
        document.Info.Title = "Station Gateway API";
        document.Info.Description = "HTTP entry point for Factory Gateway to submit production orders to the Print Marking Station.";
        document.Info.Version = "v1";
        return Task.CompletedTask;
    });
});

var app = builder.Build();

// ── DB initialisation ─────────────────────────────────────────────────────────
// Path resolution and directory creation are handled in AddStationGatewayInfrastructure
// via ResolveWritableDbPath (ANTIGRAVITY Principle 6 fallback).
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GatewayDbContext>();
    await db.Database.EnsureCreatedAsync();
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.MapOpenApi();
app.MapScalarApiReference(options =>
{
    options.Title = "Station Gateway API";
    options.Theme = ScalarTheme.DeepSpace;
    options.DefaultHttpClient = new(ScalarTarget.CSharp, ScalarClient.HttpClient);
});

app.UseSerilogRequestLogging();

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /health
app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    service = "station-gateway",
    timestamp = DateTimeOffset.UtcNow
}))
.WithName("HealthCheck")
.WithTags("System")
.WithSummary("Health check");

// Read-only readiness and MES activity derived from the existing gateway audit log.
// Simulator/manual sources are intentionally excluded from MES telemetry.
app.MapGet("/api/gateway/connection-status", async (
    GatewayDbContext db,
    IEventPublisher eventPublisher,
    IConnectionMultiplexer redis,
    CancellationToken cancellationToken) =>
{
    var now = DateTimeOffset.UtcNow;
    var windowStart = now.AddHours(-24);
    var requests = await db.GatewayRequests.AsNoTracking().ToListAsync(cancellationToken);
    var mesRequests = requests
        .Where(r => IsMesSource(r.Source))
        .Select(r => new { Request = r, ReceivedAt = ParseUtc(r.ReceivedAt) })
        .Where(x => x.ReceivedAt.HasValue && x.ReceivedAt.Value >= windowStart)
        .OrderByDescending(x => x.ReceivedAt)
        .ToList();
    var lastSuccess = mesRequests.FirstOrDefault(x => x.Request.Status.Equals("PROCESSED", StringComparison.OrdinalIgnoreCase));
    var lastFailure = mesRequests.FirstOrDefault(x => x.Request.Status.Equals("FAILED", StringComparison.OrdinalIgnoreCase));
    var databaseConnected = await db.Database.CanConnectAsync(cancellationToken);
    var redisConnected = redis.IsConnected;
    var dependenciesReady = databaseConnected && redisConnected && eventPublisher.IsConnected;
    var recentSuccess = lastSuccess?.ReceivedAt >= now.AddMinutes(-15);
    var status = !dependenciesReady || (lastFailure?.ReceivedAt is not null && lastFailure.ReceivedAt > lastSuccess?.ReceivedAt)
        ? "DEGRADED" : recentSuccess ? "RECENTLY_ACTIVE" : "IDLE";

    return Results.Ok(new
    {
        integration = "MES", status, protocol = "HTTP",
        stationGateway = new
        {
            status = dependenciesReady ? "READY" : "DEGRADED",
            service = "station-gateway",
            database = databaseConnected ? "CONNECTED" : "DISCONNECTED",
            redis = redisConnected ? "CONNECTED" : "DISCONNECTED",
            kafka = eventPublisher.IsConnected ? "CONNECTED" : "DISCONNECTED"
        },
        lastSuccessfulMesRequest = lastSuccess?.ReceivedAt,
        lastMesRequest = mesRequests.FirstOrDefault()?.ReceivedAt,
        lastError = lastFailure is null ? null : new { occurredAt = lastFailure.ReceivedAt, message = lastFailure.Request.ErrorMessage },
        requestsLast24Hours = mesRequests.Count,
        successfulRequestsLast24Hours = mesRequests.Count(x => x.Request.Status.Equals("PROCESSED", StringComparison.OrdinalIgnoreCase)),
        failedRequestsLast24Hours = mesRequests.Count(x => x.Request.Status.Equals("FAILED", StringComparison.OrdinalIgnoreCase)),
        observedAt = now
    });
})
.WithName("MesConnectionStatus")
.WithTags("Gateway")
.WithSummary("MES direct connection and Station Gateway readiness");

// GET /api/gateway/info
app.MapGet("/api/gateway/info", () => Results.Ok(new
{
    service = "Station Gateway",
    version = "1.0.0",
    description = "HTTP entry point for Factory Gateway → Print Marking Station",
    endpoints = new[]
    {
        "POST /api/gateway/orders — Submit a production order",
        "GET  /api/gateway/info  — Service information",
        "GET  /health            — Health check",
        "GET  /scalar/v1         — Interactive API docs"
    }
}))
.WithName("ServiceInfo")
.WithTags("System")
.WithSummary("Service information and available endpoints");

// POST /api/gateway/orders
app.MapPost("/api/gateway/orders", async (
    [FromBody] UnifiedEvent order,
    [FromServices] ProcessGatewayOrderHandler handler,
    CancellationToken cancellationToken) =>
{
    // ── Validate UnifiedEvent schema ──────────────────────────────────────────
    var validator = new UnifiedEventValidator();
    var validationResult = await validator.ValidateAsync(order, cancellationToken);

    if (!validationResult.IsValid)
    {
        var errors = validationResult.Errors.Select(e => e.ErrorMessage).ToList();
        Log.Warning("Gateway order validation failed: {Errors}", string.Join("; ", errors));
        return Results.BadRequest(new
        {
            error = "ValidationFailed",
            details = errors
        });
    }

    var command = new ProcessGatewayOrderCommand(
        RequestId: order.EventId,
        Source: order.EdgeId,
        PayloadJson: JsonSerializer.Serialize(order)
    );

    try
    {
        var accepted = await handler.HandleAsync(command, cancellationToken);

        if (!accepted)
        {
            return Results.Conflict(new
            {
                error = "DuplicateEvent",
                message = $"Event '{order.EventId}' was already processed.",
                eventId = order.EventId
            });
        }

        return Results.Accepted(value: new
        {
            requestId = Guid.NewGuid().ToString(),
            eventId = order.EventId,
            status = "Accepted",
            message = "Production order accepted. Jobs will be created shortly."
        });
    }
    catch (Exception ex)
    {
        Log.Error(ex, "Unexpected error processing gateway order {EventId}", order?.EventId);
        return Results.Problem(
            title: "Internal Server Error",
            detail: "An unexpected error occurred while processing the production order.",
            statusCode: 500);
    }
})
.WithName("CreateGatewayOrder")
.WithTags("Gateway")
.WithSummary("Submit a production order from Factory Gateway")
.WithDescription("""
    Accepts a UnifiedEvent JSON payload from Factory Gateway.
    Validates, deduplicates (Redis 24h), persists to SQLite, and enqueues
    to Kafka for the Job Engine to process.

    Idempotent: same event_id → 409 Conflict (not an error, safe to retry with a new event_id).
    """)
.Produces(StatusCodes.Status202Accepted)
.Produces(StatusCodes.Status409Conflict)
.ProducesValidationProblem(StatusCodes.Status400BadRequest)
.ProducesProblem(StatusCodes.Status500InternalServerError);

await app.RunAsync();

static bool IsMesSource(string? source)
{
    if (string.IsNullOrWhiteSpace(source)) return false;
    var value = source.Trim();
    return !value.Contains("simulator", StringComparison.OrdinalIgnoreCase)
        && !value.Contains("manual", StringComparison.OrdinalIgnoreCase)
        && !value.Contains("device-sim", StringComparison.OrdinalIgnoreCase);
}

static DateTimeOffset? ParseUtc(string? value)
    => DateTimeOffset.TryParse(value, out var parsed) ? parsed.ToUniversalTime() : null;
