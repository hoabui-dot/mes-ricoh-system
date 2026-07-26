using System.Diagnostics;
using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Infrastructure.Simulation;

namespace ND.PrinterAdapter.Infrastructure.DeviceAdapters;

/// <summary>
/// Wraps the ZPL TCP simulator adapter and queries the in-memory simulator mode/metrics.
/// </summary>
public sealed class SimulationPrinterDriver : IPrinterDriver
{
    private readonly string _printerCode;
    private readonly IPrinterAdapter _tcpAdapter;
    private readonly VirtualPrinterSimulator _simulator;
    private readonly string _ipAddress;
    private readonly int _port;
    private readonly ILogger<SimulationPrinterDriver> _logger;

    public SimulationPrinterDriver(
        string printerCode,
        IPrinterAdapter tcpAdapter,
        VirtualPrinterSimulator simulator,
        string ipAddress,
        int port,
        ILogger<SimulationPrinterDriver> logger)
    {
        _printerCode = printerCode;
        _tcpAdapter = tcpAdapter;
        _simulator = simulator;
        _ipAddress = ipAddress;
        _port = port;
        _logger = logger;
    }

    public async Task<PrintResult> PrintAsync(string content, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        _logger.LogInformation("SimulationPrinterDriver: Sending ZPL to {Ip}:{Port} ({Bytes} bytes)",
            _ipAddress, _port, content.Length);

        // Check simulated error mode before TCP transmission
        var mode = _simulator.GetSimulatorMode(_printerCode);
        if (mode.Equals("Offline", StringComparison.OrdinalIgnoreCase))
        {
            return PrintResult.Fail("OFFLINE", "Simulated printer is offline", isRecoverable: true, isRetryable: true);
        }
        if (mode.Equals("PrinterBusy", StringComparison.OrdinalIgnoreCase))
        {
            return PrintResult.Fail("BUSY", "Simulated printer is busy", isRecoverable: true, isRetryable: true);
        }
        if (mode.Equals("PaperOut", StringComparison.OrdinalIgnoreCase))
        {
            return PrintResult.Fail("PAPER_OUT", "Simulated paper out", isRecoverable: false, isRetryable: false);
        }
        if (mode.Equals("RibbonOut", StringComparison.OrdinalIgnoreCase))
        {
            return PrintResult.Fail("RIBBON_OUT", "Simulated ribbon out", isRecoverable: false, isRetryable: false);
        }
        if (mode.Equals("HeadOpen", StringComparison.OrdinalIgnoreCase))
        {
            return PrintResult.Fail("HEAD_OPEN", "Simulated print head open", isRecoverable: false, isRetryable: false);
        }

        var ok = await _tcpAdapter.PrintAsync(_ipAddress, _port, content, ct);
        sw.Stop();

        return ok
            ? PrintResult.Ok(sw.ElapsedMilliseconds)
            : PrintResult.Fail("TCP_FAILED", $"Could not connect to simulated printer at {_ipAddress}:{_port}",
                isRecoverable: true, isRetryable: true, durationMs: sw.ElapsedMilliseconds);
    }

    public async Task<PrinterDriverStatus> GetStatusAsync(CancellationToken ct = default)
    {
        var reachable = await _tcpAdapter.CheckHealthAsync(_ipAddress, _port, ct);
        if (!reachable) return PrinterDriverStatus.Offline;

        var mode = _simulator.GetSimulatorMode(_printerCode);
        return mode switch
        {
            "Offline" => PrinterDriverStatus.Offline,
            "PrinterBusy" => PrinterDriverStatus.Busy,
            "PaperOut" => PrinterDriverStatus.PaperOut,
            "RibbonOut" => PrinterDriverStatus.RibbonOut,
            "HeadOpen" => PrinterDriverStatus.HeadOpen,
            "MemoryFull" => PrinterDriverStatus.BufferFull,
            "Success" => PrinterDriverStatus.Online,
            _ => PrinterDriverStatus.Online
        };
    }

    public Task<IReadOnlyList<DiscoveredPrinter>> DiscoverAsync(CancellationToken ct = default)
    {
        IReadOnlyList<DiscoveredPrinter> result =
        [
            new DiscoveredPrinter
            {
                Id = $"sim-{_ipAddress}-{_port}",
                Name = "Device Simulator",
                QueueName = $"{_ipAddress}:{_port}",
                Driver = "simulation",
                Status = "Idle",
                IsDefault = true
            }
        ];
        return Task.FromResult(result);
    }

    public async Task<bool> HealthCheckAsync(CancellationToken ct = default)
    {
        var status = await GetStatusAsync(ct);
        return status is PrinterDriverStatus.Online
                      or PrinterDriverStatus.Busy
                      or PrinterDriverStatus.Printing
                      or PrinterDriverStatus.Waiting
                      or PrinterDriverStatus.Warning;
    }

    public Task<PrinterMaintenanceInfo?> GetMaintenanceInfoAsync(CancellationToken ct = default)
    {
        var mode = _simulator.GetSimulatorMode(_printerCode);
        var isThermalWarning = mode.Equals("MemoryFull", StringComparison.OrdinalIgnoreCase); // use memory full as warning state triggers
        var count = _simulator.GetPrintCounter(_printerCode);

        var info = new PrinterMaintenanceInfo(
            SerialNumber: $"SN-SIM-{_printerCode.ToUpperInvariant()}",
            LifetimePrintLength: count,
            LastMaintenanceDate: DateTime.UtcNow.AddDays(-5).ToString("yyyy-MM-dd"),
            RecommendedCleaning: "Lau đầu in (Clean print head every 2000 labels)",
            ThermalWarning: isThermalWarning,
            CurrentTemperature: isThermalWarning ? 68.0 : 27.5
        );
        return Task.FromResult<PrinterMaintenanceInfo?>(info);
    }
}
