using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.UnifiedContracts.Events;

namespace ND.PrinterAdapter.Infrastructure.Messaging;

/// <summary>Consumes production print commands from the shared remote broker.</summary>
public sealed class PrinterCommandConsumer : BackgroundService
{
    private const string Exchange = "station.events";
    private const string Queue = "printer-adapter.print-commands";
    private readonly IEventConsumer _consumer;
    private readonly IEventPublisher _publisher;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PrinterCommandConsumer> _logger;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public PrinterCommandConsumer(
        IEventConsumer consumer,
        IEventPublisher publisher,
        IServiceScopeFactory scopeFactory,
        ILogger<PrinterCommandConsumer> logger)
    {
        _consumer = consumer;
        _publisher = publisher;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await _consumer.StartConsumingAsync(Exchange, Queue, JobEventRoutingKeys.BatchPrint,
            HandleMessageAsync, stoppingToken);
        await _consumer.StartConsumingAsync(Exchange, Queue, JobEventRoutingKeys.Print,
            HandleMessageAsync, stoppingToken);

        _logger.LogInformation("Printer command consumer active. queue={Queue}", Queue);
        await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken);
    }

    private async Task HandleMessageAsync(string routingKey, string payloadJson)
    {
        var isSingle = string.Equals(routingKey, JobEventRoutingKeys.Print, StringComparison.OrdinalIgnoreCase);
        var command = isSingle
            ? NormalizeSingleCommand(payloadJson)
            : JsonSerializer.Deserialize<ProductionBatchPrintCommand>(payloadJson, JsonOptions)
              ?? throw new InvalidOperationException("Invalid batch printer command payload.");
        if (string.IsNullOrWhiteSpace(command.EventId) || command.LabelItems is null || command.LabelItems.Count == 0)
            throw new InvalidOperationException("Printer command requires event_id and label_items.");

        await using var scope = _scopeFactory.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<BatchPrintService>();
        var result = await service.HandleCommandAsync(command, CancellationToken.None, "KAFKA");
        if (result is null)
        {
            _logger.LogInformation("Command {CommandId} was already reserved or completed; no duplicate print.", command.EventId);
            return;
        }

        if (isSingle)
        {
            var item = command.LabelItems[0];
            var singleResult = new PrinterPrintedEvent
            {
                EventId = result.EventId,
                JobId = item.JobId,
                JobNo = command.ProductionOrderNo,
                PrinterCode = result.PrinterCode,
                Success = result.Success,
                ErrorMessage = result.ErrorMessage,
                Timestamp = result.Timestamp
            };
            await _publisher.PublishAsync(Exchange, JobEventRoutingKeys.PrinterPrinted,
                JsonSerializer.Serialize(singleResult, JsonOptions));
        }
        else
        {
            await _publisher.PublishAsync(Exchange, JobEventRoutingKeys.PrinterBatchPrinted,
                JsonSerializer.Serialize(result, JsonOptions));
        }

        if (!result.Success && !string.IsNullOrWhiteSpace(result.ErrorMessage))
        {
            var error = new PrinterErrorEvent
            {
                EventId = $"evt-printer-error-{Guid.NewGuid():N}",
                PrinterId = result.PrinterCode,
                PrinterCode = result.PrinterCode,
                AdapterId = Environment.GetEnvironmentVariable("KAFKA_CONNECTION_NAME") ?? "PRINT-ADAPTER-01",
                ErrorMessage = result.ErrorMessage,
                Timestamp = DateTimeOffset.UtcNow.ToString("o")
            };
            await _publisher.PublishAsync(Exchange, JobEventRoutingKeys.PrinterError,
                JsonSerializer.Serialize(error, JsonOptions));
        }
    }

    private static ProductionBatchPrintCommand NormalizeSingleCommand(string payloadJson)
    {
        var evt = JsonSerializer.Deserialize<JobProcessingEvent>(payloadJson, JsonOptions)
                  ?? throw new InvalidOperationException("Invalid single printer command payload.");
        return new ProductionBatchPrintCommand
        {
            EventId = evt.EventId,
            ProductionOrderNo = evt.JobNo,
            JobType = evt.JobType,
            ProductCode = evt.ProductCode,
            PayloadJson = evt.PayloadJson,
            TargetPrinter = evt.TargetPrinter,
            DispatchTarget = evt.DispatchTarget ?? "production-printer",
            LabelItems = [new BatchLabelItem
            {
                JobId = evt.JobId,
                ProductSerial = evt.ProductSerial,
                Sequence = 1
            }],
            BatchSize = 1,
            Timestamp = evt.Timestamp
        };
    }
}
