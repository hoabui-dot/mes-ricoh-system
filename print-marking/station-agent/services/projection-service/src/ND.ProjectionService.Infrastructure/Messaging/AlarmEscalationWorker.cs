using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.ProjectionService.Application.Alarms;
using ND.ProjectionService.Domain.Alarms;
using ND.ProjectionService.Infrastructure.Persistence;
using ND.SharedKernel.Time;

namespace ND.ProjectionService.Infrastructure.Messaging;

public sealed class AlarmEscalationWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ISystemClock _clock;
    private readonly ILogger<AlarmEscalationWorker> _logger;

    public AlarmEscalationWorker(IServiceScopeFactory scopeFactory, ISystemClock clock,
        ILogger<AlarmEscalationWorker> logger)
    {
        _scopeFactory = scopeFactory; _clock = clock; _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await EvaluateAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "Persistent alarm escalation scan failed"); }
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }

    internal async Task EvaluateAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ProjectionDbContext>();
        var commands = scope.ServiceProvider.GetRequiredService<IAlarmCommandService>();
        var now = _clock.UtcNow;
        var active = await db.Alarms.AsNoTracking()
            .Where(a => a.State == AlarmState.Raised || a.State == AlarmState.Acknowledged ||
                        a.State == AlarmState.InProgress || a.State == AlarmState.Suppressed)
            .ToListAsync(ct);
        foreach (var alarm in active)
        {
            if (alarm.State == AlarmState.Suppressed && DateTime.TryParse(alarm.SuppressedUntil, out var until) && until <= now)
            {
                await commands.UnsuppressAsync(alarm.Id, AlarmActor.System, ct);
                _logger.LogInformation("Expired suppression restored alarm {AlarmId}", alarm.Id);
                continue;
            }
            var required = AlarmEscalationPolicy.RequiredLevel(alarm, now);
            if (required > alarm.EscalationLevel)
            {
                await commands.EscalateAsync(alarm.Id, required, AlarmActor.System, ct);
                _logger.LogWarning("Alarm {AlarmId} escalated to persistent level {Level}", alarm.Id, required);
            }
        }
    }
}
