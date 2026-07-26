using System.Net;
using System.Net.Sockets;
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
/// Virtual PLC Modbus TCP server on port 5020.
/// Supports FC01 (Read Coils) and FC05 (Write Single Coil).
/// Coils: START_BUTTON(0), STOP_BUTTON(1), SENSOR_IN(2), SENSOR_OUT(3), MACHINE_READY(4)
/// </summary>
public sealed class VirtualPlcServer : BackgroundService
{
    private const int DefaultPort = 5020;

    // Coil address mapping
    private static readonly string[] CoilNames = ["START_BUTTON", "STOP_BUTTON", "SENSOR_IN", "SENSOR_OUT", "MACHINE_READY", "REJECT_PRODUCT"];

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ISimulatorStateService _state;
    private readonly IHubContext<SimulatorHub, ISimulatorClient> _hub;
    private readonly IConfiguration _config;
    private readonly ILogger<VirtualPlcServer> _logger;

    private TcpListener? _listener;
    private volatile bool _forceDisconnected = false;

    public VirtualPlcServer(
        IServiceScopeFactory scopeFactory,
        ISimulatorStateService state,
        IHubContext<SimulatorHub, ISimulatorClient> hub,
        IConfiguration config,
        ILogger<VirtualPlcServer> logger)
    {
        _scopeFactory = scopeFactory;
        _state = state;
        _hub = hub;
        _config = config;
        _logger = logger;
    }

    public async Task ConnectPlcAsync(CancellationToken ct = default)
    {
        _forceDisconnected = false;
        _logger.LogInformation("Virtual PLC connection enabled via API");
    }

    public async Task DisconnectPlcAsync(CancellationToken ct = default)
    {
        _forceDisconnected = true;
        try
        {
            _listener?.Stop();
        }
        catch { }
        _state.SetPlcOnline(false);
        await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());
        _logger.LogInformation("Virtual PLC manually disconnected via API");
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
                        _state.SetPlcOnline(false);
                        await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());
                    }
                    await Task.Delay(500, stoppingToken);
                    continue;
                }

                if (_listener == null)
                {
                    var port = int.TryParse(_config["Simulator:PLC_PORT"] ?? "5020", out var p) ? p : DefaultPort;
                    _listener = new TcpListener(IPAddress.Any, port);
                    _listener.Start();
                    _state.SetPlcOnline(true);
                    _logger.LogInformation("VirtualPlcServer Modbus TCP listening on :{Port}", port);
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
                    _logger.LogError(ex, "VirtualPlcServer accept error");
                    await Task.Delay(1000, stoppingToken);
                }
            }
        }

        _listener?.Stop();
        _state.SetPlcOnline(false);
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken ct)
    {
        using (client)
        {
            await using var stream = client.GetStream();
            var mbap = new byte[7];

            while (!ct.IsCancellationRequested)
            {
                // Read MBAP header (7 bytes)
                var read = await ReadExactAsync(stream, mbap, ct);
                if (read == 0) break; // connection closed

                var txId = (ushort)((mbap[0] << 8) | mbap[1]);
                var pduLength = (ushort)(((mbap[4] << 8) | mbap[5]) - 1); // minus unit id byte
                var unitId = mbap[6];

                var pdu = new byte[pduLength];
                await ReadExactAsync(stream, pdu, ct);
                if (pdu.Length == 0) break;

                var fc = pdu[0];
                byte[]? response = null;

                switch (fc)
                {
                    case 0x01: // Read Coils
                        response = HandleReadCoils(txId, unitId, pdu);
                        break;
                    case 0x05: // Write Single Coil
                        response = await HandleWriteCoilAsync(txId, unitId, pdu, ct);
                        break;
                    default:
                        // Exception response: function code | 0x80, exception code 0x01
                        response = BuildException(txId, unitId, fc, 0x01);
                        break;
                }

                if (response is not null)
                    await stream.WriteAsync(response, ct);
            }
        }
    }

    private byte[] HandleReadCoils(ushort txId, byte unitId, byte[] pdu)
    {
        var startAddr = (ushort)((pdu[1] << 8) | pdu[2]);
        var qty = (ushort)((pdu[3] << 8) | pdu[4]);
        var byteCount = (qty + 7) / 8;
        var data = new byte[byteCount];

        for (var i = 0; i < qty; i++)
        {
            var coilAddr = startAddr + i;
            if (coilAddr < CoilNames.Length && _state.GetRegister(CoilNames[coilAddr]))
                data[i / 8] |= (byte)(1 << (i % 8));
        }

        // Response PDU: [unitId][fc=01][byteCount][data...]
        return BuildResponse(txId, unitId, [0x01, (byte)byteCount, .. data]);
    }

    private async Task<byte[]> HandleWriteCoilAsync(ushort txId, byte unitId, byte[] pdu, CancellationToken ct)
    {
        var coilAddr = (ushort)((pdu[1] << 8) | pdu[2]);
        var value = pdu[3] == 0xFF; // 0xFF00 = ON, 0x0000 = OFF

        if (coilAddr < CoilNames.Length)
        {
            var name = CoilNames[coilAddr];
            _state.SetRegister(name, value);
            _state.RecordPlcEvent();

            var evt = PlcRegisterEvent.Create(name, value, "MODBUS");
            await PersistRegisterEventAsync(evt, ct);

            var dto = new PlcRegisterDto(name, value, "MODBUS", evt.OccurredAt);
            await _hub.Clients.All.PlcRegisterChanged(dto);
            await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());

            await AddTimelineAsync("PLC_UPDATED", "OK", $"Coil {name} = {(value ? "ON" : "OFF")} (Modbus)", ct);
            _logger.LogInformation("PLC coil {Name} = {Value} (Modbus)", name, value);
        }

        // Echo request as response (Modbus FC05 spec)
        return BuildResponse(txId, unitId, pdu);
    }

    private static byte[] BuildResponse(ushort txId, byte unitId, byte[] pdu)
    {
        var length = (ushort)(pdu.Length + 1);
        var frame = new byte[6 + pdu.Length + 1];
        frame[0] = (byte)(txId >> 8);
        frame[1] = (byte)(txId & 0xFF);
        frame[2] = 0; frame[3] = 0; // Protocol ID
        frame[4] = (byte)(length >> 8);
        frame[5] = (byte)(length & 0xFF);
        frame[6] = unitId;
        Array.Copy(pdu, 0, frame, 7, pdu.Length);
        return frame;
    }

    private static byte[] BuildException(ushort txId, byte unitId, byte fc, byte exCode)
        => BuildResponse(txId, unitId, [(byte)(fc | 0x80), exCode]);

    private static async Task<int> ReadExactAsync(NetworkStream stream, byte[] buffer, CancellationToken ct)
    {
        var total = 0;
        while (total < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(total), ct);
            if (read == 0) return 0;
            total += read;
        }
        return total;
    }

    private async Task PersistRegisterEventAsync(PlcRegisterEvent evt, CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SimulatorDbContext>();
        db.PlcRegisterEvents.Add(evt);

        var count = await db.PlcRegisterEvents.CountAsync(ct);
        if (count > 1000)
        {
            var oldest = await db.PlcRegisterEvents.OrderBy(e => e.OccurredAt).Take(count - 1000).ToListAsync(ct);
            db.PlcRegisterEvents.RemoveRange(oldest);
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

    // ── Public API: toggle register from HTTP endpoint ────────────────────────
    public async Task SetRegisterFromApiAsync(string name, bool value, CancellationToken ct = default)
    {
        _state.SetRegister(name, value);
        _state.RecordPlcEvent();

        var evt = PlcRegisterEvent.Create(name, value, "API");
        await PersistRegisterEventAsync(evt, ct);

        var dto = new PlcRegisterDto(name, value, "API", evt.OccurredAt);
        await _hub.Clients.All.PlcRegisterChanged(dto);
        await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());
        await AddTimelineAsync("PLC_UPDATED", "OK", $"Register {name} = {(value ? "ON" : "OFF")} (API)", ct);

        if (name.Equals("REJECT_PRODUCT", StringComparison.OrdinalIgnoreCase) && value)
        {
            var jobId = _state.GetActiveJobId() ?? "unknown";
            await AddTimelineAsync("PLCRejectStarted", "INFO", $"Reject started for active job {jobId}", ct);

            // Background task to reset register after 1.5 seconds
            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(1.5));

                    _state.SetRegister("REJECT_PRODUCT", false);
                    _state.RecordPlcEvent();

                    var resetEvt = PlcRegisterEvent.Create("REJECT_PRODUCT", false, "SYSTEM");
                    await PersistRegisterEventAsync(resetEvt, CancellationToken.None);

                    var resetDto = new PlcRegisterDto("REJECT_PRODUCT", false, "SYSTEM", resetEvt.OccurredAt);
                    await _hub.Clients.All.PlcRegisterChanged(resetDto);
                    await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());

                    await AddTimelineAsync("PLCRejectCompleted", "INFO", $"Reject completed for active job {jobId}", CancellationToken.None);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in PLC REJECT_PRODUCT auto-reset background task");
                }
            });
        }
    }
}
