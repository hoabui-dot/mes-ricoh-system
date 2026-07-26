using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.DeviceSimulator.Domain.Entities;
using ND.DeviceSimulator.Infrastructure.Persistence;
using System.Net.Http.Json;

namespace ND.DeviceSimulator.Infrastructure.Workers;

public sealed class MesEventForwarder : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<MesEventForwarder> _logger;
    private readonly HttpClient _httpClient;
    private HubConnection? _hubConnection;

    public MesEventForwarder(
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        ILogger<MesEventForwarder> logger,
        HttpClient httpClient)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _logger = logger;
        _httpClient = httpClient;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var projectionServiceUrl = Environment.GetEnvironmentVariable("PROJECTION_SERVICE_URL") ?? "http://localhost:5009";
        var hubUrl = $"{projectionServiceUrl.TrimEnd('/')}/hubs/production";
        var stationId = _config["Simulator:MACHINE_CODE"] ?? "SIMULATOR-01";

        _logger.LogInformation("MesEventForwarder connecting to SignalR Hub: {HubUrl} for Station: {StationId}", hubUrl, stationId);

        _hubConnection = new HubConnectionBuilder()
            .WithUrl(hubUrl)
            .WithAutomaticReconnect()
            .Build();

        _hubConnection.On<ProductionRecordDto>("OnProductionRecordUpdate", async (record) =>
        {
            try
            {
                await HandleProductionRecordUpdateAsync(record, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling production record update for JobNo: {JobNo}", record.JobNo);
            }
        });

        // Loop to connect and maintain connection
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_hubConnection.State == HubConnectionState.Disconnected)
                {
                    await _hubConnection.StartAsync(stoppingToken);
                    _logger.LogInformation("MesEventForwarder successfully connected to SignalR Hub.");

                    // Subscribe to the main Station group
                    await _hubConnection.InvokeAsync("SubscribeToStation", stationId, stoppingToken);
                    // Also subscribe to Station-Combined-01 to be robust for local simulations
                    await _hubConnection.InvokeAsync("SubscribeToStation", "Station-Combined-01", stoppingToken);
                    await _hubConnection.InvokeAsync("SubscribeToStation", "STATION-01", stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Failed to connect to SignalR Hub. Retrying in 10 seconds...");
            }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }

    private async Task HandleProductionRecordUpdateAsync(ProductionRecordDto record, CancellationToken ct)
    {
        _logger.LogInformation("MesEventForwarder received OnProductionRecordUpdate: JobNo={JobNo}, Status={Status}", record.JobNo, record.CurrentStatus);

        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SimulatorDbContext>();

        // Check if this JobNo/EventId is mapped in SQLite database
        var mapping = await db.ProductionOrderMappings
            .FirstOrDefaultAsync(m => m.EventId == record.JobNo || m.ProductionOrderId == record.JobNo, ct);

        if (mapping == null)
        {
            _logger.LogDebug("JobNo {JobNo} is not mapped to any MES Production Order. Skipping.", record.JobNo);
            return;
        }

        // Update sqlite status
        mapping.UpdateStatus(record.CurrentStatus);
        db.ProductionOrderMappings.Update(mapping);
        await db.SaveChangesAsync(ct);

        // Forward status update to Go Backend
        var mesBackendUrl = Environment.GetEnvironmentVariable("MES_BACKEND_URL") ?? "http://localhost:8080/api/v1";
        var webhookUrl = $"{mesBackendUrl.TrimEnd('/')}/production/gateway/events";

        var payload = new
        {
            job_no = mapping.EventId,
            production_order_id = mapping.ProductionOrderId,
            order_number = mapping.OrderNumber,
            status = record.CurrentStatus,
            message = $"Trạng thái đơn hàng sản xuất được cập nhật: {record.CurrentStatus} cho Lot: {record.ProductCode}, Serial: {record.ProductSerial}",
            occurred_at = DateTime.UtcNow
        };

        try
        {
            _logger.LogInformation("Forwarding event to MES Backend: {Url} with payload {Payload}", webhookUrl, payload);
            var response = await _httpClient.PostAsJsonAsync(webhookUrl, payload, ct);
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Successfully forwarded event to MES Backend for JobNo {JobNo}", record.JobNo);
            }
            else
            {
                var responseContent = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("MES Backend returned non-success code: {StatusCode}. Response: {Content}", response.StatusCode, responseContent);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send event webhook to MES Backend at {Url}", webhookUrl);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_hubConnection != null)
        {
            await _hubConnection.DisposeAsync();
        }
        await base.StopAsync(cancellationToken);
    }
}

// Inline DTO to match SignalR message format
public record ProductionRecordDto(
    string Id,
    string JobId,
    string JobNo,
    string ProductCode,
    string? ProductSerial,
    string JobType,
    string CurrentStatus,
    string StationId,
    string CreatedAt,
    string UpdatedAt
);
