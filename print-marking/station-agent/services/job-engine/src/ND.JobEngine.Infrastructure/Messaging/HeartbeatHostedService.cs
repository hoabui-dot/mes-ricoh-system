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

                _logger.LogDebug("Job Engine Heartbeat service active.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred publishing heartbeats in Job Engine.");
            }

            await Task.Delay( TimeSpan.FromSeconds(3), stoppingToken);
        }
    }
}
