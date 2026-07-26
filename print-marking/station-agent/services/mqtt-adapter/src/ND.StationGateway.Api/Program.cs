using System.Text.Json;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using ND.Infrastructure.Observability;
using ND.StationGateway.Application.Commands;
using ND.StationGateway.Infrastructure.DependencyInjection;
using ND.StationGateway.Infrastructure.Persistence;
using ND.UnifiedContracts.Events;
using ND.UnifiedContracts.Validation;
using Scalar.AspNetCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// ── Serilog ───────────────────────────────────────────────────────────────────
Log.Logger = SerilogConfiguration.Configure(
    new LoggerConfiguration(),
    builder.Configuration,
    "station-gateway").CreateLogger();

builder.Logging.ClearProviders();
builder.Services.AddSerilog();

// ── Infrastructure (SQLite, Redis, RabbitMQ, outbox poller) ──────────────────
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
    to RabbitMQ for the Job Engine to process.

    Idempotent: same event_id → 409 Conflict (not an error, safe to retry with a new event_id).
    """)
.Produces(StatusCodes.Status202Accepted)
.Produces(StatusCodes.Status409Conflict)
.ProducesValidationProblem(StatusCodes.Status400BadRequest)
.ProducesProblem(StatusCodes.Status500InternalServerError);

await app.RunAsync();
