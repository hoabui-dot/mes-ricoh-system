using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ND.Infrastructure.Messaging;
using ND.ProjectionService.Application.Interfaces;
using ND.ProjectionService.Infrastructure.BackgroundServices;
using ND.ProjectionService.Infrastructure.Messaging;
using ND.ProjectionService.Infrastructure.Persistence;
using ND.ProjectionService.Infrastructure.Repositories;
using ND.ProjectionService.Infrastructure.Integration;
using ND.SharedKernel.Abstractions;

namespace ND.ProjectionService.Infrastructure.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddProjectionInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // SQLite
        var dbPath = configuration["SQLITE_PROJECTION_PATH"] ?? "data/projection.db";
        services.AddDbContext<ProjectionDbContext>(opts =>
            opts.UseSqlite($"Data Source={dbPath}"));
        services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<ProjectionDbContext>());

        // Repositories
        services.AddScoped<IProductionViewRepository, ProductionViewRepository>();
        services.AddScoped<IActivityLogRepository, ActivityLogRepository>();
        services.AddScoped<IDeviceStatusRepository, DeviceStatusRepository>();
        services.AddScoped<IProductionRecordRepository, ProductionRecordRepository>();
        services.AddScoped<IAlarmRepository, AlarmRepository>();
        services.AddScoped<IProductionOrderViewRepository, ProductionOrderViewRepository>();

        // Kafka Publisher & Consumer
        services.Configure<KafkaOptions>(configuration.GetSection(KafkaOptions.SectionName));
        services.AddSingleton<IEventConsumer, KafkaConsumer>();
        services.AddSingleton<IEventPublisher, KafkaPublisher>();
        services.AddSingleton<PrinterManagementKafkaClient>();

        // HttpClient for polling
        services.AddHttpClient();
        services.AddSingleton<IMesConnectionStatusProvider, MesConnectionStatusProvider>();

        // Hosted Services
        services.AddHostedService<ProjectionEventConsumer>();
        services.AddHostedService<DeviceStatusPoller>();
        services.AddHostedService<StartupAlarmScanService>();
        services.AddHostedService<MesConnectionStatusPoller>();
        services.AddHostedService(sp => sp.GetRequiredService<PrinterManagementKafkaClient>());

        return services;
    }
}
