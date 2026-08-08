using ND.PrinterAdapter.Application.Dtos;

namespace ND.PrinterAdapter.Application.Interfaces;

/// <summary>
/// Abstraction for a printer driver.
/// Implementations: SimulationPrinterDriver (TCP to Device Simulator), CupsPrinterDriver (lpr via CUPS)
/// Nothing outside Print Adapter should know which driver is active.
/// </summary>
public interface IPrinterDriver
{
    /// <summary>Sends raw ZPL content to the printer. Returns true if accepted.</summary>
    Task<PrintResult> PrintAsync(string content, CancellationToken ct = default);

    /// <summary>Returns current printer status (Idle, Printing, Stopped, Offline, Disconnected).</summary>
    Task<PrinterDriverStatus> GetStatusAsync(CancellationToken ct = default);

    /// <summary>Discovers available printers managed by this driver.</summary>
    Task<IReadOnlyList<DiscoveredPrinter>> DiscoverAsync(CancellationToken ct = default);

    /// <summary>Quick reachability check. Returns true if printer is reachable and ready.</summary>
    Task<bool> HealthCheckAsync(CancellationToken ct = default);

    /// <summary>Returns detailed hardware maintenance statistics.</summary>
    Task<PrinterMaintenanceInfo?> GetMaintenanceInfoAsync(CancellationToken ct = default);
}
