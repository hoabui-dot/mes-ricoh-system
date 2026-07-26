using System.Net;
using System.Net.Sockets;
using System.Text;
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

namespace ND.DeviceSimulator.Infrastructure.VirtualDevices;

/// <summary>
/// Virtual laser TCP server on port 8901.
/// Text protocol: client sends "MARK:{template}:{fc}\n"
/// Server responds: "SUCCESS:{duration_ms}\n" or "FAILED:{reason}\n"
/// </summary>
public sealed class VirtualLaserServer : BackgroundService
{
    private const int DefaultPort = 8901;
    private static readonly Random Rng = new();

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ISimulatorStateService _state;
    private readonly IHubContext<SimulatorHub, ISimulatorClient> _hub;
    private readonly IConfiguration _config;
    private readonly ILogger<VirtualLaserServer> _logger;

    private TcpListener? _listener;
    private volatile bool _forceDisconnected = false;

    public VirtualLaserServer(
        IServiceScopeFactory scopeFactory,
        ISimulatorStateService state,
        IHubContext<SimulatorHub, ISimulatorClient> hub,
        IConfiguration config,
        ILogger<VirtualLaserServer> logger)
    {
        _scopeFactory = scopeFactory;
        _state = state;
        _hub = hub;
        _config = config;
        _logger = logger;
    }

    public async Task ConnectLaserAsync(CancellationToken ct = default)
    {
        _forceDisconnected = false;
        _logger.LogInformation("Virtual Laser connection enabled via API");
    }

    public async Task DisconnectLaserAsync(CancellationToken ct = default)
    {
        _forceDisconnected = true;
        try
        {
            _listener?.Stop();
        }
        catch { }
        _state.SetLaserOnline(false);
        await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());
        _logger.LogInformation("Virtual Laser manually disconnected via API");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_forceDisconnected)
                {
                    if (_listener != null)
                    {
                        _listener.Stop();
                        _listener = null;
                        _state.SetLaserOnline(false);
                        await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());
                    }
                    await Task.Delay(500, stoppingToken);
                    continue;
                }

                if (_listener == null)
                {
                    var port = int.TryParse(GetConfig("LASER_PORT", "8901"), out var p) ? p : DefaultPort;
                    _listener = new TcpListener(IPAddress.Any, port);
                    _listener.Start();
                    _state.SetLaserOnline(true);
                    _logger.LogInformation("VirtualLaserServer listening on TCP :{Port}", port);
                    await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());
                }

                var client = await _listener.AcceptTcpClientAsync(stoppingToken);
                _ = HandleClientAsync(client, stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                if (!_forceDisconnected)
                {
                    _logger.LogError(ex, "VirtualLaserServer accept error");
                    await Task.Delay(1000, stoppingToken);
                }
            }
        }

        _listener?.Stop();
        _state.SetLaserOnline(false);
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken ct)
    {
        using (client)
        {
            await using var stream = client.GetStream();
            using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
            using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true) { AutoFlush = true };

            string? line;
            while ((line = await reader.ReadLineAsync(ct)) is not null)
            {
                var rawCommand = line.Trim();
                if (string.IsNullOrEmpty(rawCommand)) continue;

                var jobNo = ExtractJobNoFromLaserCommand(rawCommand);
                if (!string.IsNullOrEmpty(jobNo))
                {
                    _state.SetActiveJobId(jobNo);
                }

                _logger.LogDebug("Laser command received: {Cmd}", rawCommand);

                var delayMs = int.TryParse(GetConfig("LASER_DELAY_MS", "2000"), out var d) ? d : 2000;
                var sw = System.Diagnostics.Stopwatch.StartNew();
                await Task.Delay(delayMs, ct);
                sw.Stop();
                var duration = (int)sw.ElapsedMilliseconds;

                var failureRate = int.TryParse(GetConfig("LASER_FAILURE_RATE", "3"), out var f) ? f : 3;
                string status;
                string? error = null;

                if (Rng.Next(100) < failureRate)
                {
                    status = "FAILED";
                    error = "Simulated laser failure";
                    await writer.WriteLineAsync($"FAILED:Simulated laser failure");
                }
                else
                {
                    status = "SUCCESS";
                    await writer.WriteLineAsync($"SUCCESS:{duration}");
                }

                _state.RecordLaserCommand(rawCommand, status);

                var cmd = LaserCommand.Create(rawCommand, duration, status, error);
                await PersistAsync(cmd, ct);

                var dto = new LaserCommandDto(cmd.Id, rawCommand, status, duration, cmd.ExecutedAt);
                await _hub.Clients.All.LaserCommandExecuted(dto);
                await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());

                await AddTimelineAsync("LASER_EXECUTED", status == "SUCCESS" ? "OK" : "FAILED",
                    $"Laser command: {rawCommand} — {status}", ct);

                _logger.LogInformation("Laser {Cmd} → {Status} ({Duration}ms)", rawCommand, status, duration);
            }
        }
    }

    private async Task PersistAsync(LaserCommand cmd, CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SimulatorDbContext>();
        db.LaserCommands.Add(cmd);

        var count = await db.LaserCommands.CountAsync(ct);
        if (count > 500)
        {
            var oldest = await db.LaserCommands.OrderBy(c => c.ExecutedAt).Take(count - 500).ToListAsync(ct);
            db.LaserCommands.RemoveRange(oldest);
        }
        await db.SaveChangesAsync(ct);
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

    private string GetConfig(string key, string @default)
        => _config[$"Simulator:{key}"] ?? @default;

    private static string? ExtractJobNoFromLaserCommand(string? command)
    {
        if (string.IsNullOrEmpty(command)) return null;
        var jobNoIndex = command.IndexOf("JobNo:", StringComparison.OrdinalIgnoreCase);
        if (jobNoIndex == -1) return null;
        var sub = command[(jobNoIndex + 6)..];
        var semiIndex = sub.IndexOf(';');
        if (semiIndex != -1) sub = sub[..semiIndex];
        return sub.Trim();
    }
}
