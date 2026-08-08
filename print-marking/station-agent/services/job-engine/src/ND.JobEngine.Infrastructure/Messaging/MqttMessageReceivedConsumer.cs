using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.JobEngine.Application.Commands;
using ND.JobEngine.Application.Dtos;
using ND.JobEngine.Domain.Enums;
using ND.UnifiedContracts.Constants;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Infrastructure.Messaging;

/// <summary>
/// Background service that consumes <c>MqttMessageReceived</c> events from RabbitMQ
/// and creates + triggers processing of corresponding Jobs.
///
/// Replaces the previous HTTP endpoint (<c>POST /api/jobs</c> + <c>POST /api/jobs/{id}/process</c>)
/// that was called directly by the mqtt-adapter.
///
/// Subscription:
///   Exchange:    station.events
///   Queue:       job-engine.mqtt-messages
///   Pattern:     mqtt.MqttMessage.MqttMessageReceived
/// </summary>
public sealed class MqttMessageReceivedConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqConsumer _consumer;
    private readonly ILogger<MqttMessageReceivedConsumer> _logger;

    private const string Exchange = "station.events";
    private const string Queue = "job-engine.mqtt-messages";
    private const string Pattern = "mqtt.MqttMessage.MqttMessageReceived";

    public MqttMessageReceivedConsumer(
        IServiceScopeFactory scopeFactory,
        IRabbitMqConsumer consumer,
        ILogger<MqttMessageReceivedConsumer> logger)
    {
        _scopeFactory = scopeFactory;
        _consumer = consumer;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Job Engine RabbitMQ consumer starting. exchange={Exchange} queue={Queue} pattern={Pattern}",
            Exchange, Queue, Pattern);

        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: Queue,
            routingKeyPattern: Pattern,
            onMessage: (routingKey, json) => HandleMessageAsync(json, stoppingToken),
            cancellationToken: stoppingToken);

        // Keep alive until cancellation
        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Message handler — runs inside its own DI scope per message
    // ────────────────────────────────────────────────────────────────────────

    private async Task HandleMessageAsync(string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Job Engine received mqtt message event. Processing...");

        using var scope = _scopeFactory.CreateScope();

        // Deserialise UnifiedEvent from the outbox event payload
        UnifiedEvent? unifiedEvent;
        try
        {
            unifiedEvent = JsonSerializer.Deserialize<UnifiedEvent>(payloadJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialise UnifiedEvent payload from RabbitMQ message");
            throw; // Nack — invalid JSON should not be requeued
        }

        if (unifiedEvent is null)
        {
            _logger.LogWarning("Received null UnifiedEvent from RabbitMQ — skipping");
            return;
        }

        // ── Extract job fields from UnifiedEvent data tags ───────────────────
        var tagsDict = unifiedEvent.Data.ToDictionary(
            t => t.Tag,
            t => t.Value?.ToString() ?? string.Empty,
            StringComparer.OrdinalIgnoreCase);

        var opType = tagsDict.TryGetValue(BusinessConstants.MqttTag.OperationType, out var ot)
            ? ot : "DEFAULT";

        var productCode = tagsDict.TryGetValue(BusinessConstants.MqttTag.ProductId, out var pid)
            ? pid
            : tagsDict.TryGetValue(BusinessConstants.MqttTag.MarkingSerial, out var ms) ? ms : "GENERIC";

        var productSerial = tagsDict.TryGetValue(BusinessConstants.MqttTag.MarkingSerial, out var serial)
            ? serial
            : tagsDict.TryGetValue(BusinessConstants.MqttTag.ProductId, out var pidFallback) ? pidFallback : null;

        var jobNo = tagsDict.TryGetValue("production.order_number", out var wo) && !string.IsNullOrWhiteSpace(wo)
            ? wo
            : unifiedEvent.EventId;

        var plannedQty = tagsDict.TryGetValue("production.planned_qty", out var pqStr) && int.TryParse(pqStr, out var pq)
            ? pq
            : 1;

        // ── Step 1: Create Job ───────────────────────────────────────────────
        var createCommand = new CreateJobCommand(
            JobNo: jobNo,
            SourceSystem: "MQTT_ADAPTER",
            JobType: opType,
            ProductCode: productCode,
            IdempotencyKey: unifiedEvent.EventId,
            PayloadJson: payloadJson,
            ProductSerial: productSerial,
            Priority: 0,
            PlannedQty: plannedQty);

        var createHandler = scope.ServiceProvider.GetRequiredService<CreateJobHandler>();
        JobDto job;
        try
        {
            job = await createHandler.HandleAsync(createCommand, cancellationToken);
            _logger.LogInformation(
                "Job created from MQTT event: JobId={JobId} JobNo={JobNo} Type={Type}",
                job.Id, job.JobNo, job.JobType);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to create job from UnifiedEvent EventId={EventId}", unifiedEvent.EventId);
            throw;
        }
    }
}
