using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.JobEngine.Application.Commands;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Infrastructure.Messaging;

/// <summary>
/// Background service that consumes <c>PrinterPrintedEvent</c> events from RabbitMQ
/// and dispatches a command to complete/fail the corresponding job step in the Job Engine.
///
/// Subscription:
///   Exchange:    station.events
///   Queue:       job-engine.printer-printed-events
///   Pattern:     printer.printed
/// </summary>
public sealed class PrinterPrintedConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqConsumer _consumer;
    private readonly ILogger<PrinterPrintedConsumer> _logger;

    private const string Exchange = "station.events";
    private const string Queue = "job-engine.printer-printed-events";
    private const string Pattern = "printer.printed";

    public PrinterPrintedConsumer(
        IServiceScopeFactory scopeFactory,
        IRabbitMqConsumer consumer,
        ILogger<PrinterPrintedConsumer> logger)
    {
        _scopeFactory = scopeFactory;
        _consumer = consumer;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Job Engine PrinterPrinted consumer starting. exchange={Exchange} queue={Queue} pattern={Pattern}",
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

    private async Task HandleMessageAsync(string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Job Engine received printer printed event. Processing...");

        using var scope = _scopeFactory.CreateScope();

        PrinterPrintedEvent? printedEvent;
        try
        {
            printedEvent = JsonSerializer.Deserialize<PrinterPrintedEvent>(payloadJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialise PrinterPrintedEvent payload from RabbitMQ message");
            throw; // Nack — invalid JSON should not be requeued
        }

        if (printedEvent is null)
        {
            _logger.LogWarning("Received null PrinterPrintedEvent from RabbitMQ — skipping");
            return;
        }

        var command = new CompleteJobStepCommand(
            JobId: printedEvent.JobId,
            StepName: "PRINT_LABEL",
            Success: printedEvent.Success,
            ErrorMessage: printedEvent.ErrorMessage);

        var handler = scope.ServiceProvider.GetRequiredService<CompleteJobStepHandler>();
        try
        {
            await handler.HandleAsync(command, cancellationToken);
            _logger.LogInformation("Job {JobId} step PRINT_LABEL completion status handled successfully", printedEvent.JobId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle step completion for Job {JobId}", printedEvent.JobId);
            throw;
        }
    }
}
