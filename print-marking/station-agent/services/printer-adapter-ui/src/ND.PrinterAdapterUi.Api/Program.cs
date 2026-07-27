using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using Serilog;
using ND.Infrastructure.Observability;

var builder = WebApplication.CreateBuilder(args);
Log.Logger = SerilogConfiguration.Configure(
    new LoggerConfiguration(), builder.Configuration, "printer-adapter-ui").CreateLogger();
builder.Host.UseSerilog();
builder.Services.AddHttpClient("monitor", client =>
{
    client.Timeout = TimeSpan.FromSeconds(
        builder.Configuration.GetValue("MONITOR_HTTP_TIMEOUT_SECONDS", 5));
});
builder.Services.AddSingleton<MonitoringService>();
builder.Services.AddOpenApi();

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "printer-adapter-ui" }));

app.MapGet("/api/monitoring/summary", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetSummaryAsync(ct)));
app.MapGet("/api/monitoring/printer-adapter", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetPrinterAdapterAsync(ct)));
app.MapGet("/api/monitoring/printers", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetPrintersAsync(ct)));
app.MapGet("/api/monitoring/printers/{printerCode}", async (string printerCode, MonitoringService service, CancellationToken ct) =>
{
    var printer = (await service.GetPrintersAsync(ct)).FirstOrDefault(p =>
        string.Equals(p["printerCode"]?.GetValue<string>(), printerCode, StringComparison.OrdinalIgnoreCase));
    return printer is null ? Results.NotFound() : Results.Ok(printer);
});
app.MapGet("/api/monitoring/cups", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetCupsAsync(ct)));
app.MapGet("/api/monitoring/tcp-printers", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetTcpPrintersAsync(ct)));
app.MapGet("/api/monitoring/kafka", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetKafkaAsync(ct)));
app.MapGet("/api/monitoring/kafka/queues", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetKafkaTopologyAsync(ct)));
app.MapGet("/api/monitoring/kafka/exchanges", () => Results.Ok(Array.Empty<object>()));
app.MapGet("/api/monitoring/kafka/bindings", () => Results.Ok(Array.Empty<object>()));
app.MapGet("/api/monitoring/kafka/connections", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(new[] { await service.GetKafkaAsync(ct) }));
app.MapGet("/api/monitoring/kafka/consumers", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetKafkaTopologyAsync(ct)));
app.MapGet("/api/monitoring/heartbeats", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetHeartbeatsAsync(ct)));
app.MapGet("/api/monitoring/status-transitions", () => Results.Ok(Array.Empty<object>()));
app.MapGet("/api/monitoring/print-jobs", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetPrintJobsAsync(ct)));
app.MapGet("/api/monitoring/errors", async (MonitoringService service, CancellationToken ct) =>
    Results.Ok(await service.GetErrorsAsync(ct)));

app.MapFallbackToFile("index.html");
app.Run();

sealed class MonitoringService
{
    private readonly IHttpClientFactory _clients;
    private readonly IConfiguration _config;
    private readonly ILogger<MonitoringService> _logger;
    private readonly DateTimeOffset _startedAt = DateTimeOffset.UtcNow;

    public MonitoringService(IHttpClientFactory clients, IConfiguration config, ILogger<MonitoringService> logger)
    {
        _clients = clients;
        _config = config;
        _logger = logger;
    }

    private string? AdapterUrl => _config["PRINTER_ADAPTER_URL"]?.TrimEnd('/');
    private string? ProjectionUrl => _config["PROJECTION_SERVICE_URL"]?.TrimEnd('/');

    public async Task<object> GetSummaryAsync(CancellationToken ct)
    {
        var adapter = await GetPrinterAdapterAsync(ct);
        var printers = await GetPrintersAsync(ct);
        var kafka = await GetKafkaAsync(ct);
        var online = printers.Count(p => IsStatus(p, "ONLINE", "IDLE"));
        var errors = printers.Count(p => IsStatus(p, "ERROR"));
        var offline = printers.Count - online - errors;
        var cups = await GetCupsAsync(ct);
        var adapterOnline = adapter["status"]?.GetValue<string>() == "Online";
        var adapterReachable = adapter["status"]?.GetValue<string>() is "Online" or "Degraded";
        var kafkaConnected = kafka["status"]?.GetValue<string>() == "Connected";
        var status = adapterOnline && kafkaConnected && online > 0 ? "Healthy"
            : adapterReachable ? "Degraded" : "Offline";
        return new
        {
            status,
            timestamp = DateTimeOffset.UtcNow,
            printerAdapter = adapter,
            kafka,
            cups,
            printers = new { total = printers.Count, online, offline, error = errors },
            uptimeSeconds = (long)(DateTimeOffset.UtcNow - _startedAt).TotalSeconds
        };
    }

    public async Task<JsonObject> GetPrinterAdapterAsync(CancellationToken ct)
    {
        var started = Stopwatch.GetTimestamp();
        if (string.IsNullOrWhiteSpace(AdapterUrl)) return Unavailable("Unconfigured");
        try
        {
            var health = await GetJsonAsync($"{AdapterUrl}/api/health", ct);
            var status = health?["status"]?.GetValue<string>() ?? "Unknown";
            return new JsonObject
            {
                ["status"] = status.Equals("Healthy", StringComparison.OrdinalIgnoreCase) ? "Online" : "Degraded",
                ["baseUrl"] = AdapterUrl,
                ["responseTimeMs"] = ElapsedMs(started),
                ["health"] = health,
                ["lastSuccessfulCheck"] = DateTimeOffset.UtcNow
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Printer Adapter monitoring request failed");
            return new JsonObject { ["status"] = "Offline", ["baseUrl"] = AdapterUrl, ["latestError"] = SafeError(ex) };
        }
    }

    public async Task<List<JsonObject>> GetPrintersAsync(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(AdapterUrl)) return [];
        try
        {
            var json = await GetJsonAsync($"{AdapterUrl}/api/printers", ct);
            return json is JsonArray rows ? rows.OfType<JsonObject>().ToList() : [];
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Printer list monitoring request failed");
            return [];
        }
    }

    public async Task<object> GetCupsAsync(CancellationToken ct)
    {
        JsonNode? health = null;
        try
        {
            health = await GetJsonAsync($"{AdapterUrl}/api/health", ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "CUPS monitoring request failed");
        }
        return new
        {
            status = health?["cups"]?["status"]?.GetValue<string>() ?? "Unknown",
            queue = health?["cups"]?["queue"]?.GetValue<string>(),
            printerCode = health?["cups"]?["printerCode"]?.GetValue<string>(),
            driverStatus = health?["cups"]?["driverStatus"]?.GetValue<string>(),
            lastProbe = DateTimeOffset.UtcNow
        };
    }

    public async Task<List<object>> GetTcpPrintersAsync(CancellationToken ct)
    {
        var printers = await GetPrintersAsync(ct);
        return printers.Where(p => p["driverType"]?.GetValue<string>()?.Equals("tcp", StringComparison.OrdinalIgnoreCase) == true)
            .Select(p => (object)new { printerCode = p["printerCode"]?.GetValue<string>(), host = p["ipAddress"]?.GetValue<string>(), port = p["port"]?.GetValue<int>(), status = p["status"]?.GetValue<string>() }).ToList();
    }

    public async Task<JsonObject> GetKafkaAsync(CancellationToken ct)
    {
        var adapterHealth = await GetJsonAsync($"{AdapterUrl}/api/health", ct);
        var connected = string.Equals(adapterHealth?["kafka"]?["status"]?.GetValue<string>(), "Connected", StringComparison.OrdinalIgnoreCase)
            || string.Equals(adapterHealth?["kafka"]?["status"]?.GetValue<string>(), "Healthy", StringComparison.OrdinalIgnoreCase);
        return new JsonObject
        {
            ["status"] = connected ? "Connected" : "Unavailable",
            ["bootstrapServers"] = adapterHealth?["kafka"]?["bootstrapServers"]?.DeepClone() ?? _config["KAFKA_BOOTSTRAP_SERVERS"],
            ["clientId"] = adapterHealth?["kafka"]?["clientId"]?.DeepClone() ?? _config["KAFKA_CLIENT_ID"],
            ["consumerGroup"] = adapterHealth?["kafka"]?["consumerGroup"]?.DeepClone(),
            ["transport"] = "Kafka"
        };
    }

    public async Task<List<JsonObject>> GetKafkaTopologyAsync(CancellationToken ct)
        => [await GetKafkaAsync(ct)];

    public async Task<List<object>> GetHeartbeatsAsync(CancellationToken ct)
    {
        var printers = await GetPrintersAsync(ct);
        var staleSeconds = _config.GetValue("MONITOR_STALE_HEARTBEAT_SECONDS", 45);
        return printers.Select(p =>
        {
            var raw = p["lastHeartbeatAt"]?.GetValue<string>();
            var parsed = DateTimeOffset.TryParse(raw, out var timestamp);
            var stale = !parsed || DateTimeOffset.UtcNow - timestamp > TimeSpan.FromSeconds(staleSeconds);
            return (object)new { printerCode = p["printerCode"]?.GetValue<string>(), timestamp, status = p["status"]?.GetValue<string>(), classification = parsed ? (stale ? "Stale" : "Current") : "Missing" };
        }).ToList();
    }

    public async Task<List<JsonObject>> GetPrintJobsAsync(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(AdapterUrl)) return [];
        try
        {
            var json = await GetJsonAsync($"{AdapterUrl}/api/print-history?page=1&pageSize=50", ct);
            return json is JsonArray rows ? rows.OfType<JsonObject>().ToList() : [];
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Print history monitoring request failed");
            return [];
        }
    }

    public async Task<List<object>> GetErrorsAsync(CancellationToken ct)
    {
        var health = await GetPrinterAdapterAsync(ct);
        var errors = new List<object>();
        if (health["status"]?.GetValue<string>() is "Offline" or "Degraded") errors.Add(new { source = "Printer Adapter", severity = "Warning", message = health["latestError"]?.GetValue<string>() ?? "Adapter dependency is degraded", timestamp = DateTimeOffset.UtcNow });
        var cups = await GetCupsAsync(ct);
        if (cups is not null && cups.GetType().GetProperty("status")?.GetValue(cups)?.ToString() != "Connected") errors.Add(new { source = "CUPS", severity = "Warning", message = "Configured CUPS queue is unavailable", timestamp = DateTimeOffset.UtcNow });
        return errors;
    }

    private async Task<JsonNode?> GetJsonAsync(string? url, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        using var response = await _clients.CreateClient("monitor").GetAsync(url, ct);
        if (!response.IsSuccessStatusCode) return null;
        return JsonNode.Parse(await response.Content.ReadAsStringAsync(ct));
    }

    private static JsonObject Unavailable(string status) => new() { ["status"] = status };
    private static bool IsStatus(JsonObject p, params string[] values) => values.Contains(p["status"]?.GetValue<string>(), StringComparer.OrdinalIgnoreCase);
    private static long ElapsedMs(long started) => (long)(Stopwatch.GetElapsedTime(started).TotalMilliseconds);
    private static string SafeError(Exception ex) => ex is HttpRequestException ? "Dependency unreachable" : "Monitoring request failed";
}
