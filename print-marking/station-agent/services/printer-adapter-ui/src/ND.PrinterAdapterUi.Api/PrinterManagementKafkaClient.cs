using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;

public sealed record PrinterManagementResponse(int StatusCode, string ContentType, string Body);

public sealed class PrinterManagementKafkaClient : BackgroundService
{
    private readonly IEventPublisher _publisher;
    private readonly IEventConsumer _consumer;
    private readonly ILogger<PrinterManagementKafkaClient> _logger;
    private readonly ConcurrentDictionary<string, TaskCompletionSource<PrinterManagementResponse>> _pending = new();

    public PrinterManagementKafkaClient(IEventPublisher publisher, IEventConsumer consumer, ILogger<PrinterManagementKafkaClient> logger)
    { _publisher = publisher; _consumer = consumer; _logger = logger; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await _consumer.StartConsumingAsync("station.events", "printer-adapter-ui.management-responses", "printer.management.response", HandleResponseAsync, stoppingToken);
        await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken);
    }

    public async Task<PrinterManagementResponse> RequestAsync(string method, string path, string? query, CancellationToken ct)
    {
        var requestId = Guid.NewGuid().ToString("D");
        var completion = new TaskCompletionSource<PrinterManagementResponse>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[requestId] = completion;
        try
        {
            await _publisher.PublishAsync("station.events", "command.printer.management", JsonSerializer.Serialize(new
            {
                event_id = requestId, request_id = requestId, method, path, query, body = "",
                requested_by = "printer-adapter-ui", timestamp = DateTimeOffset.UtcNow.ToString("o")
            }), ct);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            using (timeout.Token.Register(() => completion.TrySetException(new TimeoutException("Printer Adapter Kafka management request timed out."))))
                return await completion.Task;
        }
        finally { _pending.TryRemove(requestId, out _); }
    }

    private Task HandleResponseAsync(string _, string payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            var requestId = Read(root, "request_id", "requestId");
            if (string.IsNullOrWhiteSpace(requestId) || !_pending.TryGetValue(requestId, out var completion)) return Task.CompletedTask;
            completion.TrySetResult(new PrinterManagementResponse(
                root.TryGetProperty("status_code", out var status) ? status.GetInt32() : 502,
                Read(root, "content_type") ?? "application/json",
                Read(root, "body") ?? "{}"));
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Invalid Printer Adapter management response received from Kafka"); }
        return Task.CompletedTask;
    }

    private static string? Read(JsonElement root, params string[] names)
        => names.Select(name => root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null)
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}
