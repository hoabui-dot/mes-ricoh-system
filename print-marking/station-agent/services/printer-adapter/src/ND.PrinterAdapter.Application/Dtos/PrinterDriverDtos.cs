namespace ND.PrinterAdapter.Application.Dtos;

/// <summary>
/// Normalized printer health/status as produced by the driver layer.
/// Maps 1:1 to NormalizedPrinterState.State for CUPS printers.
/// Projection Service consumes only these values — never raw CUPS output.
/// </summary>
public enum PrinterDriverStatus
{
    Unknown,
    Connecting,
    Online,
    Busy,
    Printing,
    Waiting,
    Warning,
    Stopped,      // Legacy: paused queue (maps to Error in UI)
    Offline,
    Disconnected, // Legacy: TCP unreachable (simulation)
    Error,
    PaperOut,
    RibbonOut,
    HeadOpen,
    BufferFull,
    ThermalWarning
}

/// <summary>Result of a print operation.</summary>
public sealed class PrintResult
{
    public bool Success { get; init; }
    public string? ErrorCode { get; init; }
    public string? ErrorMessage { get; init; }
    public bool IsRecoverable { get; init; }
    public bool IsRetryable { get; init; }
    public long DurationMs { get; init; }

    public static PrintResult Ok(long durationMs = 0) =>
        new() { Success = true, DurationMs = durationMs };

    public static PrintResult Fail(
        string errorCode,
        string errorMessage,
        bool isRecoverable = false,
        bool isRetryable = false,
        long durationMs = 0) =>
        new()
        {
            Success = false,
            ErrorCode = errorCode,
            ErrorMessage = errorMessage,
            IsRecoverable = isRecoverable,
            IsRetryable = isRetryable,
            DurationMs = durationMs
        };
}

/// <summary>A printer discovered via driver enumeration (e.g. lpstat).</summary>
public sealed class DiscoveredPrinter
{
    public string Id { get; init; } = default!;
    public string Name { get; init; } = default!;
    public string QueueName { get; init; } = default!;
    public string Driver { get; init; } = default!;
    public string Status { get; init; } = default!;
    public bool IsDefault { get; init; }
}
