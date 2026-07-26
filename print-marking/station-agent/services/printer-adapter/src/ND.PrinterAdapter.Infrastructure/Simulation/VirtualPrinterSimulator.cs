using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.PrinterAdapter.Infrastructure.Persistence;
using ND.UnifiedContracts.Events;

namespace ND.PrinterAdapter.Infrastructure.Simulation;

public enum PrinterSimulatorMode
{
    Success = 0, PrinterBusy = 1, Offline = 2, PaperOut = 3,
    RibbonOut = 4, HeadOpen = 5, InvalidZpl = 6, InvalidBarcode = 7,
    TcpTimeout = 8, TcpConnectionRefused = 9, MemoryFull = 10,
}

internal sealed class SimulatedPrinterEndpoint
{
    public string PrinterCode { get; init; } = default!;
    public string DisplayName { get; init; } = default!;
    public int Port { get; init; }
    public string SimulatorMode { get; set; } = "Success";
    public bool ForceOffline { get; set; } = false;
    public TcpListener? Listener { get; set; }
}

/// <summary>
/// Self-hosted TCP server simulating Zebra ZPL printers inside printer-adapter.
/// Reads all "simulation" DriverType printers from the database on startup,
/// opens a TcpListener per printer on its configured port, handles ZPL payloads.
/// Publishes an immediate RabbitMQ heartbeat on connect/disconnect so the kiosk
/// UI reflects status changes in &lt;1s (same as physical devices).
/// </summary>
public sealed class VirtualPrinterSimulator : BackgroundService
{
    private static readonly Random Rng = new();
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly IRabbitMqPublisher _publisher;
    private readonly ILogger<VirtualPrinterSimulator> _logger;
    private List<SimulatedPrinterEndpoint> _endpoints = new();

    private const string Exchange = "station.events";

    public VirtualPrinterSimulator(IServiceScopeFactory scopeFactory, IConfiguration config,
        IRabbitMqPublisher publisher,
        ILogger<VirtualPrinterSimulator> logger)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _publisher = publisher;
        _logger = logger;
    }

    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, long> _printCounters = new();

    public string GetSimulatorMode(string printerCode)
    {
        var ep = _endpoints.FirstOrDefault(e => e.PrinterCode.Equals(printerCode, StringComparison.OrdinalIgnoreCase));
        return ep?.SimulatorMode ?? "Success";
    }

    public long GetPrintCounter(string printerCode)
    {
        return _printCounters.TryGetValue(printerCode.ToLowerInvariant(), out var count) ? count : 0;
    }

    public void SetMode(string printerCode, string mode)
    {
        var ep = _endpoints.FirstOrDefault(e => e.PrinterCode.Equals(printerCode, StringComparison.OrdinalIgnoreCase));
        if (ep is not null) { ep.SimulatorMode = mode; _logger.LogInformation("Printer simulator [{Code}] mode -> {Mode}", printerCode, mode); }
    }

    public async Task SetOnlineAsync(string? printerCode, bool online, CancellationToken ct = default)
    {
        foreach (var ep in _endpoints)
            if (printerCode == null || ep.PrinterCode.Equals(printerCode, StringComparison.OrdinalIgnoreCase))
            {
                ep.ForceOffline = !online;

                if (!online)
                {
                    // Stop listener immediately on disconnect
                    ep.Listener?.Stop(); ep.Listener = null;
                }
                else
                {
                    // Start listener NOW before publishing heartbeat.
                    // HeartbeatHostedService may ping within ms of the heartbeat being received by
                    // projection-service — if the port is not yet bound the ping fails and the status
                    // immediately flips back to offline (the race condition the user reported).
                    if (ep.Listener == null)
                    {
                        try
                        {
                            ep.Listener = new TcpListener(IPAddress.Any, ep.Port);
                            ep.Listener.Start();
                            _logger.LogInformation("Printer simulator [{Code}] TCP listener started on :{Port} (immediate)", ep.PrinterCode, ep.Port);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Printer simulator [{Code}] failed to start listener immediately", ep.PrinterCode);
                        }
                    }
                }

                _logger.LogInformation("Printer simulator [{Code}] forced {State}", ep.PrinterCode, online ? "ONLINE" : "OFFLINE");

                // Publish heartbeat after listener is ready
                try
                {
                    var routingKey = $"device.heartbeat.{ep.PrinterCode.ToLowerInvariant()}";
                    var hb = new DeviceStatusHeartbeat(
                        ep.PrinterCode,
                        "Printer",
                        online,
                        online ? "Idle" : "Offline",
                        DateTime.UtcNow.ToString("o")
                    );
                    await _publisher.PublishAsync(Exchange, routingKey, JsonSerializer.Serialize(hb), ct);
                    _logger.LogInformation("Printer simulator [{Code}] published immediate heartbeat -> {State}", ep.PrinterCode, online ? "ONLINE" : "OFFLINE");
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Printer simulator [{Code}] failed to publish immediate heartbeat", ep.PrinterCode);
                }
            }
    }

    public IReadOnlyList<object> GetStatus() =>
        _endpoints.Select(ep => (object)new { ep.PrinterCode, ep.DisplayName, ep.Port, ep.SimulatorMode,
            IsOnline = !ep.ForceOffline, IsListening = ep.Listener != null }).ToList();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await using (var scope = _scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PrinterDbContext>();
            var sims = await db.Printers.Where(p => p.DriverType == "simulation").ToListAsync(stoppingToken);
            _endpoints = sims.Select(p => new SimulatedPrinterEndpoint { PrinterCode = p.PrinterCode, DisplayName = p.DisplayName, Port = p.Port }).ToList();
        }
        if (_endpoints.Count == 0) { _logger.LogWarning("VirtualPrinterSimulator: no simulation printers in DB."); return; }
        _logger.LogInformation("VirtualPrinterSimulator: starting {N} printer(s): {Codes}", _endpoints.Count,
            string.Join(", ", _endpoints.Select(e => $"{e.PrinterCode}:{e.Port}")));
        await Task.WhenAll(_endpoints.Select(ep => RunListenerAsync(ep, stoppingToken)));
        _logger.LogInformation("VirtualPrinterSimulator: all listeners stopped.");
    }

    private async Task RunListenerAsync(SimulatedPrinterEndpoint ep, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (ep.ForceOffline || ep.SimulatorMode.Equals("Offline", StringComparison.OrdinalIgnoreCase))
                {
                    if (ep.Listener != null) { ep.Listener.Stop(); ep.Listener = null; }
                    await Task.Delay(500, ct); continue;
                }
                if (ep.Listener == null)
                {
                    ep.Listener = new TcpListener(IPAddress.Any, ep.Port);
                    ep.Listener.Start();
                    _logger.LogInformation("VirtualPrinterSimulator [{Code}] listening on TCP :{Port} (mode: {Mode})", ep.PrinterCode, ep.Port, ep.SimulatorMode);
                }
                var client = await ep.Listener.AcceptTcpClientAsync(ct);
                _ = HandleClientAsync(ep, client, ct);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) when (!ep.ForceOffline)
            {
                _logger.LogError(ex, "VirtualPrinterSimulator [{Code}] accept error", ep.PrinterCode);
                await Task.Delay(1000, ct);
            }
        }
        ep.Listener?.Stop(); ep.Listener = null;
    }

    private async Task HandleClientAsync(SimulatedPrinterEndpoint ep, TcpClient client, CancellationToken ct)
    {
        Enum.TryParse<PrinterSimulatorMode>(ep.SimulatorMode, true, out var mode);
        if (mode == PrinterSimulatorMode.TcpConnectionRefused) { _logger.LogWarning("Printer [{Code}]: TcpConnectionRefused", ep.PrinterCode); client.Close(); return; }
        using (client)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            string? zpl = null; string status; string? error = null;
            try
            {
                await using var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
                var sb = new StringBuilder(); var buf = new char[4096];
                client.ReceiveTimeout = mode == PrinterSimulatorMode.TcpTimeout ? 50 : 2000;
                int n; while ((n = await reader.ReadAsync(buf, ct)) > 0) { sb.Append(buf, 0, n); if (sb.Length > 65536) break; }
                zpl = sb.ToString(); sw.Stop();
                (status, error) = mode switch
                {
                    PrinterSimulatorMode.PrinterBusy => ("FAILED", "ERROR: Printer busy"),
                    PrinterSimulatorMode.PaperOut => ("FAILED", "ERROR: Paper out"),
                    PrinterSimulatorMode.RibbonOut => ("FAILED", "ERROR: Ribbon out"),
                    PrinterSimulatorMode.HeadOpen => ("FAILED", "ERROR: Print head open"),
                    PrinterSimulatorMode.InvalidZpl => ("FAILED", "ERROR: Invalid ZPL command"),
                    PrinterSimulatorMode.InvalidBarcode => ("FAILED", "ERROR: Invalid barcode data"),
                    PrinterSimulatorMode.MemoryFull => ("FAILED", "ERROR: Printer memory full"),
                    PrinterSimulatorMode.TcpTimeout => ("FAILED", "TCP Timeout (simulated)"),
                    _ => ("_PROCESS", null)
                };
                if (status == "_PROCESS")
                {
                    var delay = int.TryParse(_config["Simulator:PRINTER_DELAY_MS"] ?? "800", out var d) ? d : 800;
                    await Task.Delay(delay, ct);
                    var fr = int.TryParse(_config["Simulator:PRINTER_FAILURE_RATE"] ?? "5", out var f) ? f : 5;
                    status = Rng.Next(100) < fr ? "FAILED" : "PRINTED";
                    if (status == "FAILED") error = "Simulated random print failure";
                }
                var resp = mode switch
                {
                    PrinterSimulatorMode.PrinterBusy => "NACK: BUSY", PrinterSimulatorMode.PaperOut => "NACK: PAPER_OUT",
                    PrinterSimulatorMode.RibbonOut => "NACK: RIBBON_OUT", PrinterSimulatorMode.HeadOpen => "NACK: HEAD_OPEN",
                    PrinterSimulatorMode.InvalidZpl => "NACK: INVALID_ZPL", PrinterSimulatorMode.InvalidBarcode => "NACK: INVALID_BARCODE",
                    PrinterSimulatorMode.MemoryFull => "NACK: MEMORY_FULL",
                    _ => status == "PRINTED" ? "ACK" : "NACK: UNKNOWN"
                };
                if (resp == "ACK")
                {
                    var labelCount = 0;
                    if (zpl != null)
                    {
                        int pos = 0;
                        while ((pos = zpl.IndexOf("^XA", pos, StringComparison.OrdinalIgnoreCase)) != -1)
                        {
                            labelCount++;
                            pos += 3;
                        }
                    }
                    if (labelCount == 0) labelCount = 1;
                    _printCounters.AddOrUpdate(ep.PrinterCode.ToLowerInvariant(), labelCount, (k, old) => old + labelCount);
                }
                await stream.WriteAsync(Encoding.ASCII.GetBytes(resp + "\n"), ct);
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex) { status = "FAILED"; error = ex.Message; }
            sw.Stop();
            _logger.LogInformation("Printer simulator [{Code}] {Status} — {Bytes}b — {Ms}ms{Err}",
                ep.PrinterCode, status, zpl?.Length ?? 0, (int)sw.ElapsedMilliseconds, error != null ? " — " + error : "");
        }
    }
}
