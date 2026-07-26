using ND.PrinterAdapter.Application.Dtos;

namespace ND.PrinterAdapter.Application.Interfaces;

/// <summary>
/// Aggregates multiple CUPS information sources (IPP API, job queue, TCP fallback)
/// and returns a single <see cref="NormalizedPrinterState"/>.
///
/// Architecture contract:
/// - Only CupsPrinterDriver calls this interface.
/// - Projection Service never calls this directly.
/// - All hardware interpretation lives exclusively inside Printer Adapter.
/// </summary>
public interface ICupsPrinterStateAggregator
{
    /// <summary>
    /// Queries the CUPS IPP API and aggregates the result into a normalized printer state.
    /// Falls back to TCP reachability if IPP is unavailable.
    /// </summary>
    Task<NormalizedPrinterState> GetStateAsync(string queueName, CancellationToken ct = default);
}
