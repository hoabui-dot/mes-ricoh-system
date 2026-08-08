using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.JobEngine.Application.Commands;
using ND.JobEngine.Application.Interfaces;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Infrastructure.Messaging;

public sealed class VisionVerificationConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqConsumer _consumer;
    private readonly ILogger<VisionVerificationConsumer> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _simulatorUrl;

    private const string Exchange = "station.events";
    private const string Queue = "job-engine.vision-check-commands";
    private const string Pattern = "command.vision.check";

    public VisionVerificationConsumer(
        IServiceScopeFactory scopeFactory,
        IRabbitMqConsumer consumer,
        IConfiguration configuration,
        ILogger<VisionVerificationConsumer> logger)
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
            "Job Engine VisionVerification consumer starting. exchange={Exchange} queue={Queue} pattern={Pattern}",
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
        _logger.LogInformation("Job Engine received vision verification event. Processing...");

        using var scope = _scopeFactory.CreateScope();
        var jobRepository = scope.ServiceProvider.GetRequiredService<IJobRepository>();
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

        var job = await jobRepository.GetByIdAsync(evt.JobId, cancellationToken);
        if (job is null)
        {
            _logger.LogError("Job {JobId} not found in database — cannot execute vision check", evt.JobId);
            return;
        }

        try
        {
            var verifyUrl = $"{_simulatorUrl}/api/vision/verify";
            _logger.LogInformation("Sending verify request to simulator: {Url} for job {JobNo}", verifyUrl, job.JobNo);

            var response = await _httpClient.PostAsJsonAsync(verifyUrl, new { jobId = job.JobNo }, cancellationToken);
            
            if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.UnprocessableEntity)
            {
                var contentString = await response.Content.ReadAsStringAsync(cancellationToken);
                var result = JsonSerializer.Deserialize<VisionVerifyResult>(contentString, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                
                if (result != null && result.Result.Equals("PASS", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogInformation("Vision verification passed for job {JobNo}.", job.JobNo);
                    var cmd = new CompleteJobStepCommand(job.Id, "VISION_CHECK", true);
                    await handler.HandleAsync(cmd, cancellationToken);
                }
                else
                {
                    _logger.LogError("Vision verification failed for job {JobNo}. Result: {Result}", job.JobNo, contentString);
                    var failureData = new
                    {
                        status = "failed",
                        reason = result?.DefectCode ?? "Unknown defect",
                        expected = job.ProductCode,
                        actual = result?.OcrText ?? "",
                        device = "Virtual Vision"
                    };
                    var failureJson = JsonSerializer.Serialize(failureData);
                    var cmd = new CompleteJobStepCommand(job.Id, "VISION_CHECK", false, failureJson);
                    await handler.HandleAsync(cmd, cancellationToken);
                }
            }
            else
            {
                var errorText = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("Simulator returned error status: {StatusCode}, Error: {Error}", response.StatusCode, errorText);
                var cmd = new CompleteJobStepCommand(job.Id, "VISION_CHECK", false, $"Simulator error: {response.StatusCode} - {errorText}");
                await handler.HandleAsync(cmd, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred during vision verification for job {JobNo}", job.JobNo);
            var cmd = new CompleteJobStepCommand(job.Id, "VISION_CHECK", false, $"Vision request exception: {ex.Message}");
            await handler.HandleAsync(cmd, cancellationToken);
        }
    }

    private record VisionVerifyResult(string Result, string? DefectCode, string? OcrText);
}
