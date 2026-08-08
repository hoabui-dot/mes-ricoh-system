using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.ProjectionService.Application.Interfaces;
using ND.SharedKernel.Abstractions;
using ND.SharedKernel.Time;
using Microsoft.AspNetCore.SignalR;
using ND.ProjectionService.Infrastructure.SignalR;
using System.Text.Json;
using ND.UnifiedContracts.Events;

namespace ND.ProjectionService.Infrastructure.Messaging;

public sealed class AlarmOutboxProcessorWorker : BackgroundService
{
    private const string Exchange = "station.events";
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqPublisher _publisher;
    private readonly ISystemClock _clock;
    private readonly ILogger<AlarmOutboxProcessorWorker> _logger;
    private readonly IHubContext<ProductionHub> _hub;

    public AlarmOutboxProcessorWorker(IServiceScopeFactory scopeFactory, IRabbitMqPublisher publisher,
        ISystemClock clock, IHubContext<ProductionHub> hub, ILogger<AlarmOutboxProcessorWorker> logger)
    {
        _scopeFactory = scopeFactory; _publisher = publisher; _clock = clock; _hub = hub; _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await ProcessBatchAsync(stoppingToken); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Alarm outbox batch failed; pending records remain durable");
            }
            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }

    internal async Task ProcessBatchAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var repository = scope.ServiceProvider.GetRequiredService<IAlarmOutboxRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var pending = await repository.GetPendingAsync(25, _clock.UtcNowIso, ct);
        foreach (var item in pending)
        {
            try
            {
                await _publisher.PublishAsync(Exchange, item.RoutingKey, item.PayloadJson, ct);
                item.MarkPublished(_clock.UtcNow);
                using var payload = JsonDocument.Parse(item.PayloadJson);
                var root = payload.RootElement;
                if (root.TryGetProperty("station_id", out var stationValue) &&
                    root.TryGetProperty("event_type", out var eventTypeValue))
                {
                    var stationId = stationValue.GetString();
                    var eventType = eventTypeValue.GetString();
                    if (!string.IsNullOrWhiteSpace(stationId) && !string.IsNullOrWhiteSpace(eventType))
                    {
                        await _hub.Clients.Group(stationId).SendAsync(eventType, root.Clone(), ct);
                        await _hub.Clients.Group(stationId).SendAsync("AlarmSummaryChanged",
                            new { stationId, updatedAt = _clock.UtcNowIso }, ct);
                    }
                }
                _logger.LogInformation("Published alarm outbox event {EventId} for alarm {AlarmId}", item.EventId, item.AlarmId);
            }
            catch (Exception ex)
            {
                var delay = TimeSpan.FromSeconds(Math.Min(300, Math.Pow(2, Math.Min(item.RetryCount + 1, 8))));
                item.MarkFailed(ex.Message, _clock.UtcNow.Add(delay));
                _logger.LogWarning(ex, "Alarm outbox publish delayed for event {EventId}; retry {RetryCount}", item.EventId, item.RetryCount);
            }
            await repository.UpdateAsync(item, ct);
        }
        if (pending.Count > 0) await unitOfWork.SaveChangesAsync(ct);
    }
}
