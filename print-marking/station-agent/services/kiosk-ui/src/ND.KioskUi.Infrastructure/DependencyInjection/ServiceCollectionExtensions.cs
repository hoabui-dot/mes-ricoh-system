using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ND.Infrastructure.Redis;
using ND.Infrastructure.Messaging;
using ND.KioskUi.Application.Commands;
using ND.KioskUi.Application.Interfaces;
using ND.KioskUi.Application.Options;
using ND.KioskUi.Infrastructure.Persistence;
using ND.KioskUi.Infrastructure.Repositories;
using ND.SharedKernel.Abstractions;
using StackExchange.Redis;

namespace ND.KioskUi.Infrastructure.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddKioskInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Options
        services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));

        // SQLite / EF Core
        var dbPath = configuration["SQLITE_KIOSK_PATH"] ?? "data/kiosk.db";
        services.AddDbContext<KioskDbContext>(opts =>
            opts.UseSqlite($"Data Source={dbPath}"));
        services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<KioskDbContext>());

        // Repositories
        services.AddScoped<IKioskUserRepository, KioskUserRepository>();
        services.AddScoped<IKioskSessionRepository, KioskSessionRepository>();
        services.AddScoped<IKioskAccessLogRepository, KioskAccessLogRepository>();
        services.AddScoped<IKioskRbacRepository, KioskRbacRepository>();

        // Redis
        var redisConnection = configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";
        services.AddSingleton<IConnectionMultiplexer>(_ =>
            ConnectionMultiplexer.Connect(redisConnection));
        services.AddSingleton<IIdempotencyService, RedisIdempotencyService>();

        // Application handlers
        services.AddScoped<LoginHandler>();

        // RabbitMQ Publisher
        services.Configure<RabbitMqOptions>(configuration.GetSection(RabbitMqOptions.SectionName));
        services.AddSingleton<IRabbitMqPublisher, RabbitMqPublisher>();

        return services;
    }
}
