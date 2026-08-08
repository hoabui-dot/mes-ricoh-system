using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using Serilog;
using ND.Infrastructure.Observability;

var builder = WebApplication.CreateBuilder(args);
Log.Logger = SerilogConfiguration.Configure(
    new LoggerConfiguration(), builder.Configuration, "printer-adapter-ui").CreateLogger();
builder.Host.UseSerilog();
builder.Services.AddHttpClient<PrinterManagementKafkaClient>(client =>
    client.Timeout = TimeSpan.FromSeconds(builder.Configuration.GetValue("MONITOR_HTTP_TIMEOUT_SECONDS", 5)));
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
    private readonly PrinterManagementKafkaClient _printerManagement;
    private readonly IConfiguration _config;
    private readonly ILogger<MonitoringService> _logger;
    private readonly DateTimeOffset _startedAt = DateTimeOffset.UtcNow;

    public MonitoringService(PrinterManagementKafkaClient printerManagement, IConfiguration config, ILogger<MonitoringService> logger)
    { _printerManagement = printerManagement; _config = config; _logger = logger; }

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
        try
        {
            var health = await GetAdapterJsonAsync("/health", null, ct);
            var status = health?["status"]?.GetValue<string>() ?? "Unknown";
            return new JsonObject
            {
                ["status"] = status.Equals("Healthy", StringComparison.OrdinalIgnoreCase) ? "Online" : "Degraded",
                ["transport"] = "HTTP",
                ["responseTimeMs"] = ElapsedMs(started),
                ["health"] = health,
                ["lastSuccessfulCheck"] = DateTimeOffset.UtcNow
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Printer Adapter monitoring request failed");
            return new JsonObject { ["status"] = "Offline", ["transport"] = "HTTP", ["latestError"] = SafeError(ex) };
        }
    }

    public async Task<List<JsonObject>> GetPrintersAsync(CancellationToken ct)
    {
        try
        {
            var json = await GetAdapterJsonAsync("/api/printers", null, ct);
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
            health = await GetAdapterJsonAsync("/health", null, ct);
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
        return new JsonObject
        {
            ["status"] = "NotRequired",
            ["transport"] = "HTTP"
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
        try
        {
            var json = await GetAdapterJsonAsync("/api/print-history", "?page=1&pageSize=50", ct);
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

    private async Task<JsonNode?> GetAdapterJsonAsync(string path, string? query, CancellationToken ct)
    {
        var response = await _printerManagement.RequestAsync("GET", path, query, ct);
        if (response.StatusCode < 200 || response.StatusCode >= 300) return null;
        return JsonNode.Parse(response.Body);
    }

    private static JsonObject Unavailable(string status) => new() { ["status"] = status };
    private static bool IsStatus(JsonObject p, params string[] values) => values.Contains(p["status"]?.GetValue<string>(), StringComparer.OrdinalIgnoreCase);
    private static long ElapsedMs(long started) => (long)(Stopwatch.GetElapsedTime(started).TotalMilliseconds);
    private static string SafeError(Exception ex) => ex is HttpRequestException ? "Dependency unreachable" : "Monitoring request failed";
}
