namespace ND.PrinterAdapter.Application.Dtos;

/// <summary>
/// Aggregated, normalized printer state produced by <see cref="Interfaces.ICupsPrinterStateAggregator"/>.
/// Projection Service consumes only this model — never raw CUPS output.
/// </summary>
/// <param name="State">
/// Normalized state string:
/// Online | Busy | Printing | Waiting | Warning | Offline | Error | Connecting | Unknown
/// </param>
/// <param name="StateReason">Raw CUPS printer-state-reasons keyword (e.g. "offline-report", "media-empty").</param>
/// <param name="QueueLength">Number of pending jobs in the CUPS queue.</param>
/// <param name="ActiveJobName">Name of the currently active print job, if any.</param>
/// <param name="Source">Information source: "ipp" | "fallback-tcp" | "error".</param>
public record NormalizedPrinterState(
    string State,
    string? StateReason,
    int QueueLength,
    string? ActiveJobName,
    string Source,
    string? SerialNumber = null,
    long? LifetimePrintCounter = null,
    double? ThermalTemp = null
)
{
    // Convenience factory methods
    public static NormalizedPrinterState Online()   => new("Online",     null, 0, null, "ipp");
    public static NormalizedPrinterState Offline()  => new("Offline",    "offline-report", 0, null, "ipp");
    public static NormalizedPrinterState Unknown()  => new("Unknown",    null, 0, null, "error");
    public static NormalizedPrinterState FallbackOffline() => new("Offline", "unreachable", 0, null, "fallback-tcp");

    /// <summary>Whether the printer is considered operational (not offline or errored).</summary>
    public bool IsOperational => State is "Online" or "Busy" or "Printing" or "Waiting" or "Warning" or "Connecting";
}
