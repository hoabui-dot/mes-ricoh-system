using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ND.Infrastructure.Messaging;
using ND.Infrastructure.Redis;
using ND.StationGateway.Application.Commands;
using ND.StationGateway.Application.Interfaces;
using ND.StationGateway.Infrastructure.Messaging;
using ND.StationGateway.Infrastructure.Options;
using ND.StationGateway.Infrastructure.Persistence;
using ND.StationGateway.Infrastructure.Repositories;
using ND.SharedKernel.Abstractions;
using StackExchange.Redis;

namespace ND.StationGateway.Infrastructure.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddStationGatewayInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // ── Options ────────────────────────────────────────────────────────────
        services.Configure<GatewayOptions>(configuration.GetSection(GatewayOptions.SectionName));

        // ── SQLite / EF Core (with ANTIGRAVITY Principle 6 fallback) ──────────────
        // If the configured path's directory is not writable (e.g. /data not mounted),
        // fall back to a local data/ directory within ContentRootPath.
        var configuredDbPath = configuration["SQLITE_GATEWAY_PATH"] ?? "data/gateway.db";
        var dbPath = ResolveWritableDbPath(configuredDbPath);

        services.AddDbContext<GatewayDbContext>(opts =>
            opts.UseSqlite($"Data Source={dbPath}"));
        services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<GatewayDbContext>());
        services.AddScoped<ITransactionalUnitOfWork>(sp => sp.GetRequiredService<GatewayDbContext>());

        // ── Repositories ───────────────────────────────────────────────────────
        services.AddScoped<IGatewayRequestRepository, GatewayRequestRepository>();
        services.AddScoped<IGatewayOutboxRepository, GatewayOutboxRepository>();

        // ── Application handler (Scoped — one per HTTP request) ────────────────
        services.AddScoped<ProcessGatewayOrderHandler>();

        // ── Redis (idempotency + distributed lock) ─────────────────────────────
        var redisConnection = configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";
        services.AddSingleton<IConnectionMultiplexer>(_ =>
            ConnectionMultiplexer.Connect(redisConnection));
        services.AddSingleton<IIdempotencyService, RedisIdempotencyService>();
        services.AddSingleton<IDistributedLock, RedisDistributedLock>();

        // ── RabbitMQ publisher (singleton — one AMQP connection per process) ──
        services.Configure<RabbitMqOptions>(configuration.GetSection(RabbitMqOptions.SectionName));
        services.AddSingleton<IRabbitMqPublisher, RabbitMqPublisher>();

        // ── Outbox processor background worker ─────────────────────────────────
        services.AddHostedService<OutboxProcessorWorker>();

        return services;
    }

    /// <summary>
    /// ANTIGRAVITY Principle 6: Verify write permissions before committing to a SQLite path.
    /// If the target directory is not writable (e.g. /data not mounted in container),
    /// fall back to a local data/ subdirectory relative to the current working directory.
    /// </summary>
    private static string ResolveWritableDbPath(string configuredPath)
    {
        try
        {
            var fullPath = Path.GetFullPath(configuredPath);
            var dir = Path.GetDirectoryName(fullPath) ?? ".";
            Directory.CreateDirectory(dir);

            // Quick write-permission probe
            var probe = Path.Combine(dir, ".write_probe");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);

            return fullPath;
        }
        catch
        {
            // Ultimate fallback: system temp directory — always writable on any OS/container
            var fallback = Path.Combine(Path.GetTempPath(), "gateway.db");
            return fallback;
        }
    }
}
