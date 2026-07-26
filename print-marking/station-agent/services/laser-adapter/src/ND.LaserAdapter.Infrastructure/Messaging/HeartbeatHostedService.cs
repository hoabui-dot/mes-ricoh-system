using System;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.LaserAdapter.Infrastructure.Persistence;
using ND.SharedKernel.Abstractions;
using ND.UnifiedContracts.Events;

namespace ND.LaserAdapter.Infrastructure.Messaging;

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
        _logger.LogInformation("Laser Adapter Heartbeat Background Service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            var isOnline = false;
            var lifecycleState = "Offline";
            var endpoint = "localhost:8901";

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LaserDbContext>();

                var laser = await db.Lasers.FirstOrDefaultAsync(l => l.LaserCode == "laser-01", stoppingToken);
                if (laser != null)
                {
                    endpoint = laser.Endpoint;

                    // Parse endpoint (e.g. localhost:8901 or 127.0.0.1:8901)
                    var host = "localhost";
                    var port = 8901;
                    var parts = endpoint.Split(':');
                    if (parts.Length > 0) host = parts[0];
                    if (parts.Length > 1 && int.TryParse(parts[1], out var parsedPort)) port = parsedPort;

                    // Ping via TCP socket connection check
                    try
                    {
                        using var tcp = new TcpClient();
                        var connectTask = tcp.ConnectAsync(host, port, stoppingToken).AsTask();
                        var delayTask = Task.Delay(1000, stoppingToken);
                        var completedTask = await Task.WhenAny(connectTask, delayTask);
                        if (completedTask == connectTask && tcp.Connected)
                        {
                            isOnline = true;
                            lifecycleState = "Idle";
                        }
                    }
                    catch
                    {
                        isOnline = false;
                        lifecycleState = "Offline";
                    }
                }

                // Publish heartbeat
                var hb = new DeviceStatusHeartbeat(
                    "laser-01",
                    "Laser",
                    isOnline,
                    lifecycleState,
                    DateTime.UtcNow.ToString("o")
                );

                await _publisher.PublishAsync(Exchange, "device.heartbeat.laser-01", JsonSerializer.Serialize(hb), stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred in Laser Adapter heartbeat publisher.");
            }

            await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
        }
    }
}
