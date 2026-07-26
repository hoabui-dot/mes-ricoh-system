using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Domain.Entities;
using ND.JobEngine.Domain.Enums;
using ND.SharedKernel.Abstractions;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Infrastructure.Messaging;

public sealed class HeartbeatHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqPublisher _publisher;
    private readonly ILogger<HeartbeatHostedService> _logger;
    private const string Exchange = "station.events";

    public HeartbeatHostedService(
        IServiceScopeFactory scopeFactory,
        IRabbitMqPublisher publisher,
        ILogger<HeartbeatHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _publisher = publisher;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Job Engine Heartbeat Background Service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var jobRepo = scope.ServiceProvider.GetRequiredService<IJobRepository>();
                var stepRepo = scope.ServiceProvider.GetRequiredService<IJobStepRepository>();
                var attemptRepo = scope.ServiceProvider.GetRequiredService<IJobAttemptRepository>();

                // Check active steps
                var activeJobs = await jobRepo.GetByStatusAsync("Running", stoppingToken);
                
                string plcState = "Idle";
                string cameraState = "Idle";
                string gatewayState = "Connected";

                if (activeJobs.Count > 0)
                {
                    var activeJob = activeJobs[0];
                    var attempts = await attemptRepo.GetByJobIdAsync(activeJob.Id, stoppingToken);
                    var activeAttempt = attempts.OrderByDescending(a => a.RetrySequence).FirstOrDefault();
                    if (activeAttempt != null)
                    {
                        var steps = await stepRepo.GetByAttemptIdAsync(activeAttempt.Id, stoppingToken);
                        var runningStep = steps.FirstOrDefault(s => s.Status == StepStatus.Running);
                        if (runningStep != null)
                        {
                            var name = runningStep.StepName.ToUpperInvariant();
                            if (name == "VISION_CHECK")
                            {
                                cameraState = "Verifying";
                                plcState = "Busy";
                            }
                            else if (name == "PLC_REJECT")
                            {
                                plcState = "Rejecting";
                                cameraState = "Idle";
                            }
                            else
                            {
                                plcState = "Busy";
                            }
                        }
                    }
                }

                // Publish gateway-01 heartbeat
                var gwHb = new DeviceStatusHeartbeat(
                    "gateway-01",
                    "Gateway",
                    true,
                    gatewayState,
                    DateTime.UtcNow.ToString("o")
                );
                await _publisher.PublishAsync(Exchange, "device.heartbeat.gateway-01", JsonSerializer.Serialize(gwHb), stoppingToken);

                // Publish plc-01 heartbeat
                var plcHb = new DeviceStatusHeartbeat(
                    "plc-01",
                    "PLC",
                    true,
                    plcState,
                    DateTime.UtcNow.ToString("o")
                );
                await _publisher.PublishAsync(Exchange, "device.heartbeat.plc-01", JsonSerializer.Serialize(plcHb), stoppingToken);

                // Publish camera-01 heartbeat
                var cameraHb = new DeviceStatusHeartbeat(
                    "camera-01",
                    "VisionCamera",
                    true,
                    cameraState,
                    DateTime.UtcNow.ToString("o")
                );
                await _publisher.PublishAsync(Exchange, "device.heartbeat.camera-01", JsonSerializer.Serialize(cameraHb), stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred publishing heartbeats in Job Engine.");
            }

            await Task.Delay( TimeSpan.FromSeconds(3), stoppingToken);
        }
    }
}
