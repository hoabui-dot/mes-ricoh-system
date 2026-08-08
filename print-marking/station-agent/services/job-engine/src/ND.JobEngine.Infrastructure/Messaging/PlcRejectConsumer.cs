using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.JobEngine.Application.Commands;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Infrastructure.Messaging;

public sealed class PlcRejectConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqConsumer _consumer;
    private readonly ILogger<PlcRejectConsumer> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _simulatorUrl;

    private const string Exchange = "station.events";
    private const string Queue = "job-engine.plc-reject-commands";
    private const string Pattern = "command.plc.reject";

    public PlcRejectConsumer(
        IServiceScopeFactory scopeFactory,
        IRabbitMqConsumer consumer,
        IConfiguration configuration,
        ILogger<PlcRejectConsumer> logger)
    {
        _scopeFactory = scopeFactory;
        _consumer = consumer;
        _logger = logger;

        var host = Environment.GetEnvironmentVariable("SIMULATOR_HOST") ?? configuration["Simulator:Host"] ?? "localhost";
        var port = Environment.GetEnvironmentVariable("SIMULATOR_PORT") ?? configuration["Simulator:Port"] ?? "5000";
        _simulatorUrl = $"http://{host}:{port}";
        _httpClient = new HttpClient();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Job Engine PlcReject consumer starting. exchange={Exchange} queue={Queue} pattern={Pattern}",
            Exchange, Queue, Pattern);

        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: Queue,
            routingKeyPattern: Pattern,
            onMessage: (routingKey, json) => HandleMessageAsync(json, stoppingToken),
            cancellationToken: stoppingToken);

        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
    }

    private async Task HandleMessageAsync(string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Job Engine received PLC reject command. Processing...");

        using var scope = _scopeFactory.CreateScope();
        var handler = scope.ServiceProvider.GetRequiredService<CompleteJobStepHandler>();

        JobProcessingEvent? evt;
        try
        {
            evt = JsonSerializer.Deserialize<JobProcessingEvent>(payloadJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialise JobProcessingEvent payload from RabbitMQ message");
            throw; // Nack
        }

        if (evt is null)
        {
            _logger.LogWarning("Received null JobProcessingEvent from RabbitMQ — skipping");
            return;
        }

        try
        {
            var rejectUrl = $"{_simulatorUrl}/api/plc/registers/REJECT_PRODUCT";
            _logger.LogInformation("Sending PLC Reject command to simulator: {Url} for job {JobNo}", rejectUrl, evt.JobNo);

            var response = await _httpClient.PutAsJsonAsync(rejectUrl, new { value = true }, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var errorText = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("Simulator PLC reject PUT returned error: {StatusCode}, Error: {Error}", response.StatusCode, errorText);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred during PLC reject command for job {JobNo}", evt.JobNo);
        }

        // Wait 1.5 seconds simulating PLC reject physical operation time
        _logger.LogInformation("Waiting 1.5s for PLC rejection simulation to complete...");
        await Task.Delay(TimeSpan.FromSeconds(1.5), cancellationToken);

        // Complete the step (success=true since PLC completed the rejection routine)
        var cmd = new CompleteJobStepCommand(evt.JobId, "PLC_REJECT", true);
        await handler.HandleAsync(cmd, cancellationToken);
        _logger.LogInformation("PLC reject step completed for job {JobId}", evt.JobId);
    }
}
