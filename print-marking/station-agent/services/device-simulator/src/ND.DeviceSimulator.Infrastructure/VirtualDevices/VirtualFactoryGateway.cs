using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MQTTnet;
using MQTTnet.Client;
using ND.DeviceSimulator.Application.Abstractions;
using ND.DeviceSimulator.Application.Dtos;
using ND.DeviceSimulator.Domain.Entities;
using ND.DeviceSimulator.Infrastructure.Hubs;
using ND.DeviceSimulator.Infrastructure.Persistence;
using ND.Infrastructure.Messaging;
using ND.UnifiedContracts.Events;

namespace ND.DeviceSimulator.Infrastructure.VirtualDevices;

/// <summary>
/// Virtual Factory Gateway — MQTT client that connects to the broker.
/// Publishes UnifiedEvent format messages (manual or scheduled).
/// Subscribes to command topics and forwards to timeline.
/// Also publishes DeviceStatusHeartbeat to RabbitMQ so the projection-service
/// and kiosk UI reflect gateway online/offline state in real time.
/// </summary>
public sealed class VirtualFactoryGateway : BackgroundService
{
    private IMqttClient? _mqttClient;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ISimulatorStateService _state;
    private readonly IHubContext<SimulatorHub, ISimulatorClient> _hub;
    private readonly IConfiguration _config;
    private readonly IRabbitMqPublisher _rabbitPublisher;
    private readonly ILogger<VirtualFactoryGateway> _logger;

    private static readonly JsonSerializerOptions JsonOpts  = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    private static readonly JsonSerializerOptions CamelOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private volatile bool _forceDisconnected = false;

    private const string Exchange         = "station.events";
    private const string GatewayDeviceId  = "gateway-01";
    private const string GatewayDeviceType = "FactoryGateway";

    public VirtualFactoryGateway(
        IServiceScopeFactory scopeFactory,
        ISimulatorStateService state,
        IHubContext<SimulatorHub, ISimulatorClient> hub,
        IConfiguration config,
        IRabbitMqPublisher rabbitPublisher,
        ILogger<VirtualFactoryGateway> logger)
    {
        _scopeFactory    = scopeFactory;
        _state           = state;
        _hub             = hub;
        _config          = config;
        _rabbitPublisher = rabbitPublisher;
        _logger          = logger;
    }

    public async Task DisconnectGatewayAsync(CancellationToken ct = default)
    {
        _forceDisconnected = true;
        if (_mqttClient != null)
        {
            await _mqttClient.DisconnectAsync(cancellationToken: ct);
        }
        _state.SetGatewayConnected(false);
        await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());

        // Immediately publish offline heartbeat to RabbitMQ so projection-service + kiosk UI update now
        await PublishRabbitHeartbeatAsync(isOnline: false, ct);

        _logger.LogInformation("Factory Gateway MQTT manually disconnected via API");
    }

    public async Task ConnectGatewayAsync(CancellationToken ct = default)
    {
        _forceDisconnected = false;
        _logger.LogInformation("Factory Gateway MQTT connection enabled via API");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_forceDisconnected)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
                    continue;
                }

                await ConnectAsync(stoppingToken);
                await RunSchedulerAsync(stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "VirtualFactoryGateway error — reconnecting in 10s");
                _state.SetGatewayConnected(false);
                await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());

                // Publish offline heartbeat on unexpected disconnect
                await PublishRabbitHeartbeatAsync(isOnline: false, stoppingToken);

                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
        }

        if (_mqttClient?.IsConnected == true)
            await _mqttClient.DisconnectAsync(cancellationToken: stoppingToken);
    }

    private async Task ConnectAsync(CancellationToken ct)
    {
        var host           = Environment.GetEnvironmentVariable("SIMULATOR_MQTT_HOST") ?? Environment.GetEnvironmentVariable("MQTT_HOST") ?? _config["Simulator:MQTT_HOST"] ?? "localhost";
        var port           = int.TryParse(Environment.GetEnvironmentVariable("SIMULATOR_MQTT_PORT") ?? Environment.GetEnvironmentVariable("MQTT_PORT") ?? _config["Simulator:MQTT_PORT"] ?? "1883", out var p) ? p : 1883;
        var user           = _config["Simulator:MQTT_USERNAME"] ?? "";
        var pass           = _config["Simulator:MQTT_PASSWORD"] ?? "";
        var subscribeTopic = _config["Simulator:MQTT_SUBSCRIBE_TOPIC"] ?? "factory/commands/#";

        var factory = new MqttFactory();
        _mqttClient = factory.CreateMqttClient();

        var opts = new MqttClientOptionsBuilder()
            .WithTcpServer(host, port)
            .WithClientId($"device-simulator-gateway-{Guid.NewGuid()}")
            .WithCleanSession();

        if (!string.IsNullOrWhiteSpace(user))
            opts = opts.WithCredentials(user, pass);

        _mqttClient.ApplicationMessageReceivedAsync += async args =>
        {
            var payload = Encoding.UTF8.GetString(args.ApplicationMessage.PayloadSegment);
            _state.RecordGatewayReceive(args.ApplicationMessage.Topic);
            await RecordAndBroadcastAsync("RECEIVE", args.ApplicationMessage.Topic, payload, ct);
            await AddTimelineAsync("MQTT_RECEIVED", "INFO", $"Topic: {args.ApplicationMessage.Topic}", ct);
        };

        _mqttClient.DisconnectedAsync += async args =>
        {
            _state.SetGatewayConnected(false);
            await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());

            // Publish offline heartbeat to RabbitMQ on any unexpected disconnect
            await PublishRabbitHeartbeatAsync(isOnline: false, CancellationToken.None);
            _logger.LogWarning("Gateway MQTT disconnected");
        };

        await _mqttClient.ConnectAsync(opts.Build(), ct);

        var subOpts = new MqttFactory().CreateSubscribeOptionsBuilder()
            .WithTopicFilter(f => f.WithTopic(subscribeTopic))
            .Build();
        await _mqttClient.SubscribeAsync(subOpts, ct);

        _state.SetGatewayConnected(true, host, port);
        await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());

        // Publish initial online heartbeat immediately on connect
        await PublishRabbitHeartbeatAsync(isOnline: true, ct);

        _logger.LogInformation("VirtualFactoryGateway connected to MQTT {Host}:{Port}, subscribed to {Topic}", host, port, subscribeTopic);
    }

    private async Task RunSchedulerAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _mqttClient?.IsConnected == true)
        {
            await Task.Delay(TimeSpan.FromSeconds(3), ct);

            // Guard: if manually disconnected during the 3s delay, do NOT publish an online
            // heartbeat — this was the race condition causing kiosk UI to snap back to Online.
            if (_forceDisconnected) break;

            // Publish gateway-01 heartbeat to RabbitMQ every 3s.
            // DeviceStatusPoller marks device offline after 10s silence — so 3s interval keeps it alive.
            await PublishRabbitHeartbeatAsync(isOnline: true, ct);

            var enabled = (_config["Simulator:GATEWAY_AUTO_PUBLISH_ENABLED"] ?? "false") == "true";
            if (!enabled) continue;

            var intervalSec = int.TryParse(_config["Simulator:GATEWAY_AUTO_PUBLISH_INTERVAL_SEC"] ?? "30", out var i) ? i : 30;
            await Task.Delay(TimeSpan.FromSeconds(intervalSec - 3), ct); // already waited 3s above

            await PublishHeartbeatAsync(ct);
        }
    }


    /// <summary>
    /// Publishes a DeviceStatusHeartbeat to RabbitMQ station.events exchange.
    /// Consumed by projection-service HandleDeviceHeartbeatAsync → updates device status
    /// table → pushes OnDeviceStatusUpdate via SignalR to kiosk UI.
    /// </summary>
    private async Task PublishRabbitHeartbeatAsync(bool isOnline, CancellationToken ct)
    {
        try
        {
            var lifecycleState = isOnline ? "Idle" : "Offline";
            var hb = new DeviceStatusHeartbeat(
                GatewayDeviceId,
                GatewayDeviceType,
                isOnline,
                lifecycleState,
                DateTime.UtcNow.ToString("o")
            );
            var routingKey = $"device.heartbeat.{GatewayDeviceId}";
            var json = JsonSerializer.Serialize(hb, CamelOpts);
            await _rabbitPublisher.PublishAsync(Exchange, routingKey, json, ct);
            _logger.LogDebug("Published gateway heartbeat → RabbitMQ: isOnline={IsOnline}", isOnline);
        }
        catch (Exception ex)
        {
            // Non-fatal — don't crash gateway loop if RabbitMQ is temporarily unavailable
            _logger.LogWarning(ex, "Failed to publish gateway heartbeat to RabbitMQ");
        }
    }

    public async Task<string> PublishAsync(GatewayPublishRequest request, CancellationToken ct = default)
    {
        if (_mqttClient?.IsConnected != true)
            throw new InvalidOperationException("Gateway not connected to MQTT broker");

        var tags = request.Data.Select(d => new UnifiedTag { Tag = d.Tag, Value = d.Value, Quality = d.Quality }).ToList();
        var eventId = $"evt-sim-{Guid.NewGuid():N}";
        var evt = UnifiedEvent.Create(request.Site, request.Area, request.Line, request.Machine, request.EdgeId, tags, eventId);
        var json = JsonSerializer.Serialize(evt, JsonOpts);

        await _mqttClient.PublishAsync(new MqttApplicationMessageBuilder()
            .WithTopic(request.Topic)
            .WithPayload(json)
            .Build(), ct);

        _state.RecordGatewayPublish(request.Topic);
        await RecordAndBroadcastAsync("PUBLISH", request.Topic, json, ct);
        await AddTimelineAsync("GATEWAY_PUBLISHED", "OK", $"Published to {request.Topic}", ct);

        _logger.LogInformation("Gateway published to {Topic} with event id {EventId}", request.Topic, eventId);
        return eventId;
    }

    private async Task PublishHeartbeatAsync(CancellationToken ct)
    {
        var topic   = _config["Simulator:MQTT_PUBLISH_TOPIC"] ?? "factory/events/simulator";
        var site    = _config["Simulator:SITE_CODE"]  ?? "FACTORY-A";
        var area    = _config["Simulator:AREA_CODE"]  ?? "LINE-1";
        var line    = _config["Simulator:LINE_CODE"]  ?? "LINE-1";
        var machine = _config["Simulator:MACHINE_CODE"] ?? "SIMULATOR-01";
        var edgeId  = _config["Simulator:EDGE_ID"]    ?? "edge-simulator";

        var tags = new List<UnifiedTag> { new() { Tag = "simulator.heartbeat", Value = "ALIVE", Quality = "GOOD" } };
        var evt  = UnifiedEvent.Create(site, area, line, machine, edgeId, tags);
        var json = JsonSerializer.Serialize(evt, JsonOpts);

        if (_mqttClient?.IsConnected != true) return;

        await _mqttClient.PublishAsync(new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(json)
            .Build(), ct);

        _state.RecordGatewayPublish(topic);
        await RecordAndBroadcastAsync("PUBLISH", topic, json, ct);
        _logger.LogDebug("Gateway auto-heartbeat published");
    }

    private async Task RecordAndBroadcastAsync(string direction, string topic, string payloadJson, CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SimulatorDbContext>();

        var entity = GatewayEvent.Create(direction, topic, payloadJson);
        db.GatewayEvents.Add(entity);

        var count = await db.GatewayEvents.CountAsync(ct);
        if (count > 500)
        {
            var oldest = await db.GatewayEvents.OrderBy(e => e.OccurredAt).Take(count - 500).ToListAsync(ct);
            db.GatewayEvents.RemoveRange(oldest);
        }
        await db.SaveChangesAsync(ct);

        var dto = new GatewayEventDto(entity.Id, direction, topic, payloadJson, entity.OccurredAt);
        await _hub.Clients.All.GatewayEventOccurred(dto);
    }

    private async Task AddTimelineAsync(string stage, string status, string detail, CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SimulatorDbContext>();
        var evt = TimelineEvent.Create(stage, status, detail);
        db.TimelineEvents.Add(evt);
        await db.SaveChangesAsync(ct);
        await _hub.Clients.All.TimelineEventAdded(new TimelineEventDto(evt.Id, evt.Stage, evt.Status, evt.Detail, evt.OccurredAt));
    }
}
