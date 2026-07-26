using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.DeviceSimulator.Application.Abstractions;
using ND.DeviceSimulator.Application.Dtos;
using ND.DeviceSimulator.Domain.Entities;
using ND.DeviceSimulator.Infrastructure.Hubs;
using ND.DeviceSimulator.Infrastructure.Persistence;
using StackExchange.Redis;

namespace ND.DeviceSimulator.Infrastructure.Workers;

/// <summary>
/// Checks Redis, SQLite, and Internet connectivity every 15 seconds.
/// Saves results to system_connections table.
/// </summary>
public sealed class ConnectionCheckWorker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(15);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<ConnectionCheckWorker> _logger;

    public ConnectionCheckWorker(
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        ILogger<ConnectionCheckWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("ConnectionCheckWorker started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await TickAsync(stoppingToken); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            { _logger.LogError(ex, "ConnectionCheckWorker tick failed"); }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SimulatorDbContext>();

        var checks = new List<(string Name, string Status, string? Detail)>
        {
            await CheckRedisAsync(),
            await CheckSqliteAsync(db, ct),
            await CheckInternetAsync(ct),
        };

        var checkedAt = DateTime.UtcNow.ToString("o");

        foreach (var (name, status, detail) in checks)
        {
            var existing = await db.SystemConnections.FirstOrDefaultAsync(c => c.ConnectionName == name, ct);
            if (existing is not null)
                db.SystemConnections.Remove(existing);
            db.SystemConnections.Add(SystemConnection.Create(name, status, detail));
        }

        await db.SaveChangesAsync(ct);
        _logger.LogDebug("Connection checks done");
    }

    private async Task<(string, string, string?)> CheckRedisAsync()
    {
        try
        {
            var conn = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING") ?? _config.GetConnectionString("Redis") ?? "localhost:6379";
            using var redis = await ConnectionMultiplexer.ConnectAsync(conn);
            await redis.GetDatabase().PingAsync();
            return ("Redis", "GREEN", null);
        }
        catch (Exception ex)
        {
            return ("Redis", "RED", ex.Message[..Math.Min(120, ex.Message.Length)]);
        }
    }

    private static async Task<(string, string, string?)> CheckSqliteAsync(SimulatorDbContext db, CancellationToken ct)
    {
        try
        {
            _ = await db.ConfigurationValues.CountAsync(ct);
            return ("SQLite", "GREEN", null);
        }
        catch (Exception ex)
        {
            return ("SQLite", "RED", ex.Message[..Math.Min(120, ex.Message.Length)]);
        }
    }

    private static async Task<(string, string, string?)> CheckInternetAsync(CancellationToken ct)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var resp = await http.GetAsync("https://connectivity-check.ubuntu.com", ct);
            return resp.IsSuccessStatusCode ? ("Internet", "GREEN", null)
                : ("Internet", "YELLOW", $"HTTP {(int)resp.StatusCode}");
        }
        catch (Exception ex)
        {
            return ("Internet", "RED", ex.Message[..Math.Min(120, ex.Message.Length)]);
        }
    }
}
