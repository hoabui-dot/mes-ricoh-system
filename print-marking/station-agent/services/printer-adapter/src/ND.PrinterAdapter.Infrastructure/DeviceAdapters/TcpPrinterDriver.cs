using System.Diagnostics;
using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Application.Interfaces;

namespace ND.PrinterAdapter.Infrastructure.DeviceAdapters;

/// <summary>Driver for a real raw-TCP ZPL printer. No simulator or virtual listener is involved.</summary>
public sealed class TcpPrinterDriver : IPrinterDriver
{
    private readonly string _printerCode;
    private readonly IPrinterAdapter _adapter;
    private readonly string _ipAddress;
    private readonly int _port;
    private readonly ILogger<TcpPrinterDriver> _logger;

    public TcpPrinterDriver(string printerCode, IPrinterAdapter adapter, string ipAddress, int port,
        ILogger<TcpPrinterDriver> logger)
    {
        _printerCode = printerCode;
        _adapter = adapter;
        _ipAddress = ipAddress;
        _port = port;
        _logger = logger;
    }

    public async Task<PrintResult> PrintAsync(string content, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var success = await _adapter.PrintAsync(_ipAddress, _port, content, ct);
        sw.Stop();
        return success
            ? PrintResult.Ok(sw.ElapsedMilliseconds)
            : PrintResult.Fail("TCP_FAILED", $"Could not connect to printer {_printerCode} at {_ipAddress}:{_port}",
                isRecoverable: true, isRetryable: true, durationMs: sw.ElapsedMilliseconds);
    }

    public async Task<PrinterDriverStatus> GetStatusAsync(CancellationToken ct = default)
        => await _adapter.CheckHealthAsync(_ipAddress, _port, ct)
            ? PrinterDriverStatus.Online
            : PrinterDriverStatus.Offline;

    public Task<IReadOnlyList<DiscoveredPrinter>> DiscoverAsync(CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<DiscoveredPrinter>>(Array.Empty<DiscoveredPrinter>());

    public async Task<bool> HealthCheckAsync(CancellationToken ct = default)
        => await _adapter.CheckHealthAsync(_ipAddress, _port, ct);

    public Task<PrinterMaintenanceInfo?> GetMaintenanceInfoAsync(CancellationToken ct = default)
        => Task.FromResult<PrinterMaintenanceInfo?>(null);
}
