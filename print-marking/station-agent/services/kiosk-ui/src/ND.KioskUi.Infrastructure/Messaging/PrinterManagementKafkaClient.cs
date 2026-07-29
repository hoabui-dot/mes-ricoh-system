using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;

namespace ND.KioskUi.Infrastructure.Messaging;

public sealed record PrinterManagementResponse(int StatusCode, string ContentType, string Body, bool IsBase64 = false, string? FileName = null);

/// <summary>
/// Kafka request/reply boundary for Printer Adapter management operations.
/// The Kiosk never reaches the remote adapter over HTTP. Each request is
/// correlated by request_id and the adapter replies on the printer event topic.
/// </summary>
public sealed class PrinterManagementKafkaClient : BackgroundService
{
    private const string Exchange = "station.events";
    private const string RequestKey = "command.printer.management";
    private const string ResponsePattern = "printer.management.response";
    private const string ConsumerQueue = "kiosk-ui.printer-management-responses";
    private readonly IEventPublisher _publisher;
    private readonly IEventConsumer _consumer;
    private readonly ILogger<PrinterManagementKafkaClient> _logger;
    private readonly ConcurrentDictionary<string, TaskCompletionSource<PrinterManagementResponse>> _pending = new();

    public PrinterManagementKafkaClient(IEventPublisher publisher, IEventConsumer consumer, ILogger<PrinterManagementKafkaClient> logger)
    {
        _publisher = publisher;
        _consumer = consumer;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await _consumer.StartConsumingAsync(Exchange, ConsumerQueue, ResponsePattern, HandleResponseAsync, stoppingToken);
        await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken);
    }

    public async Task<PrinterManagementResponse> RequestAsync(string method, string path, string? query, string body, string requestedBy, CancellationToken ct)
    {
        var requestId = Guid.NewGuid().ToString("D");
        var completion = new TaskCompletionSource<PrinterManagementResponse>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[requestId] = completion;
        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                event_id = requestId,
                request_id = requestId,
                method,
                path,
                query,
                body,
                requested_by = requestedBy,
                station_id = Environment.GetEnvironmentVariable("STATION_ID") ?? "PRINT-STATION-01",
                timestamp = DateTimeOffset.UtcNow.ToString("o")
            });
            await _publisher.PublishAsync(Exchange, RequestKey, payload, ct);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(30));
            using (timeout.Token.Register(() => completion.TrySetException(new TimeoutException("Printer Adapter Kafka management request timed out."))))
            {
                return await completion.Task;
            }
        }
        finally { _pending.TryRemove(requestId, out _); }
    }

    private Task HandleResponseAsync(string _, string payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            var requestId = ReadString(root, "request_id", "requestId");
            if (string.IsNullOrWhiteSpace(requestId) || !_pending.TryGetValue(requestId, out var completion)) return Task.CompletedTask;
            var body = ReadString(root, "body") ?? "{}";
            completion.TrySetResult(new PrinterManagementResponse(
                root.TryGetProperty("status_code", out var status) ? status.GetInt32() : 502,
                ReadString(root, "content_type") ?? "application/json",
                body,
                root.TryGetProperty("is_base64", out var encoded) && encoded.GetBoolean(),
                ReadString(root, "file_name")));
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Invalid Printer Adapter management response received from Kafka"); }
        return Task.CompletedTask;
    }

    private static string? ReadString(JsonElement root, params string[] names)
        => names.Select(name => root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}
