using System.Text;
using System.Text.Json;
using Confluent.Kafka;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ND.PrinterAdapter.Infrastructure.Persistence;

namespace ND.PrinterAdapter.Infrastructure.Messaging;

/// <summary>
/// Kafka request/reply endpoint used by the independently deployed
/// printer-adapter-ui image. This preserves its established management
/// contract without making the UI depend on a Docker-network HTTP endpoint.
/// </summary>
public sealed class KafkaManagementConsumer : BackgroundService
{
    private const string RequestEventType = "command.printer.management";
    private const string ResponseEventType = "printer.management.response";
    private const string ConsumerGroup = "printer-adapter.management-requests";

    private readonly KafkaOptions _options;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<KafkaManagementConsumer> _logger;

    public KafkaManagementConsumer(
        IOptions<KafkaOptions> options,
        IServiceScopeFactory scopeFactory,
        ILogger<KafkaManagementConsumer> logger)
    {
        _options = options.Value;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var config = new ConsumerConfig
        {
            BootstrapServers = _options.BootstrapServers,
            ClientId = _options.ClientId,
            GroupId = ConsumerGroup,
            SecurityProtocol = ParseSecurityProtocol(_options.SecurityProtocol),
            EnableAutoCommit = false,
            AutoOffsetReset = AutoOffsetReset.Earliest,
            AllowAutoCreateTopics = false
        };

        using var consumer = new ConsumerBuilder<string, string>(config)
            .SetErrorHandler((_, error) => _logger.LogWarning("Kafka management consumer error: {Reason}", error.Reason))
            .Build();
        using var producer = new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = _options.BootstrapServers,
            ClientId = _options.ClientId,
            SecurityProtocol = ParseSecurityProtocol(_options.SecurityProtocol),
            EnableIdempotence = true,
            MessageTimeoutMs = 5_000
        }).Build();

        consumer.Subscribe(_options.ManagementCommandsTopic);
        _logger.LogInformation(
            "Kafka management consumer started. topic={Topic} group={GroupId} pattern={Pattern}",
            _options.ManagementCommandsTopic, ConsumerGroup, RequestEventType);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var result = consumer.Consume(stoppingToken);
                if (result?.Message?.Value is null)
                    continue;

                if (!HasEventType(result.Message.Headers, RequestEventType))
                {
                    consumer.Commit(result);
                    continue;
                }

                var request = UnwrapPayload(result.Message.Value);
                var response = await HandleAsync(request, stoppingToken);
                var envelope = CreateEnvelope(response.RequestId, response.PayloadJson);
                var message = new Message<string, string>
                {
                    Key = response.RequestId,
                    Value = envelope,
                    Headers = new Headers { { "event-type", Encoding.UTF8.GetBytes(ResponseEventType) }, { "event-version", "1"u8.ToArray() } }
                };
                await producer.ProduceAsync(_options.ManagementEventsTopic, message, stoppingToken);
                consumer.Commit(result);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (ConsumeException ex)
            {
                _logger.LogWarning(ex, "Kafka management consumer unavailable; retrying in 5 seconds");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Kafka management request failed; message remains uncommitted for retry");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }

        consumer.Close();
    }

    private async Task<ManagementResponse> HandleAsync(string payload, CancellationToken ct)
    {
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        var requestId = ReadString(root, "request_id", "requestId", "event_id", "eventId") ?? Guid.NewGuid().ToString("D");
        var method = ReadString(root, "method") ?? "GET";
        var path = ReadString(root, "path") ?? string.Empty;
        // Older management clients sent paths without a leading slash. Treat
        // both forms identically so an otherwise valid request is not retried
        // forever as a 404 response.
        path = path.Trim();
        if (!string.IsNullOrEmpty(path) && !path.StartsWith("/", StringComparison.Ordinal))
            path = $"/{path}";
        var query = ReadString(root, "query");

        if (!string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase))
            return Reply(requestId, 405, new { error = "Only GET management requests are supported." });

        return path switch
        {
            "/health" or "/api/health" => Reply(requestId, 200, new
            {
                status = "Healthy",
                service = "printer-adapter",
                kafka = new { status = "Connected", bootstrapServers = _options.BootstrapServers, clientId = _options.ClientId, consumerGroup = ConsumerGroup }
            }),
            "/api/printers" => await GetPrintersAsync(requestId, ct),
            "/api/print-history" => await GetPrintHistoryAsync(requestId, query, ct),
            _ => Reply(requestId, 404, new { error = $"Management path '{path}' was not found." })
        };
    }

    private async Task<ManagementResponse> GetPrintersAsync(string requestId, CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PrinterDbContext>();
        var printers = await db.Printers.Select(p => new
        {
            p.Id, p.PrinterCode, p.DisplayName, p.IpAddress, p.Port,
            p.Protocol, p.Vendor, p.Status, p.DriverType, p.CupsQueueName,
            p.GroupId, p.LastHeartbeatAt, p.IsActiveForWork, p.ActiveTemplateId,
            p.ActiveTemplateName, p.ActivatedAt, p.ActivatedBy
        }).ToListAsync(ct);
        return Reply(requestId, 200, printers);
    }

    private async Task<ManagementResponse> GetPrintHistoryAsync(string requestId, string? query, CancellationToken ct)
    {
        var (page, pageSize) = ParsePaging(query);
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PrinterDbContext>();
        var records = await db.PrintHistories.OrderByDescending(h => h.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(h => new { h.Id, h.TemplateName, h.TemplateVersion, h.PrinterCode, h.Status, h.DurationMs, h.RetryCount, h.TraceId, h.CorrelationId, h.CreatedAt })
            .ToListAsync(ct);
        return Reply(requestId, 200, records);
    }

    private static ManagementResponse Reply(string requestId, int statusCode, object body) =>
        new(requestId, JsonSerializer.Serialize(new { request_id = requestId, status_code = statusCode, content_type = "application/json", body = JsonSerializer.Serialize(body) }));

    private string CreateEnvelope(string requestId, string responsePayload) => JsonSerializer.Serialize(new
    {
        event_id = requestId,
        event_type = ResponseEventType,
        event_version = 1,
        occurred_at = DateTimeOffset.UtcNow,
        source = _options.ClientId,
        correlation_id = requestId,
        station_id = _options.PrintStationId,
        partition_key = requestId,
        payload = JsonSerializer.Deserialize<JsonElement>(responsePayload)
    });

    private static string UnwrapPayload(string value)
    {
        using var document = JsonDocument.Parse(value);
        return document.RootElement.TryGetProperty("payload", out var payload) || document.RootElement.TryGetProperty("Payload", out payload)
            ? payload.GetRawText()
            : value;
    }

    private static bool HasEventType(Headers? headers, string expected) =>
        headers?.FirstOrDefault(header => string.Equals(header.Key, "event-type", StringComparison.OrdinalIgnoreCase)) is { } header &&
        string.Equals(Encoding.UTF8.GetString(header.GetValueBytes()), expected, StringComparison.OrdinalIgnoreCase);

    private static string? ReadString(JsonElement root, params string[] names)
    {
        foreach (var name in names)
            if (root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()))
                return value.GetString();
        return null;
    }

    private static (int Page, int PageSize) ParsePaging(string? query)
    {
        var values = (query ?? string.Empty).TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Split('=', 2))
            .Where(parts => parts.Length == 2)
            .ToDictionary(parts => Uri.UnescapeDataString(parts[0]), parts => Uri.UnescapeDataString(parts[1]), StringComparer.OrdinalIgnoreCase);
        var page = values.TryGetValue("page", out var pageValue) && int.TryParse(pageValue, out var parsedPage) ? Math.Max(1, parsedPage) : 1;
        var pageSize = values.TryGetValue("pageSize", out var pageSizeValue) && int.TryParse(pageSizeValue, out var parsedPageSize) ? Math.Clamp(parsedPageSize, 1, 100) : 50;
        return (page, pageSize);
    }

    private static SecurityProtocol ParseSecurityProtocol(string value) =>
        Enum.TryParse<SecurityProtocol>(value, ignoreCase: true, out var protocol) ? protocol : SecurityProtocol.Plaintext;

    private sealed record ManagementResponse(string RequestId, string PayloadJson);
}
