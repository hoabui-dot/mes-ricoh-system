using ND.SharedKernel.Primitives;

namespace ND.DeviceSimulator.Domain.Entities;

/// <summary>
/// Record of a print job received on TCP port 9100.
/// Table: printer_jobs
/// </summary>
public sealed class PrinterJob : Entity
{
    public string Status { get; private set; } = default!;      // PRINTED / FAILED
    public string? ZplContent { get; private set; }             // raw ZPL/EPL bytes as string
    public int DurationMs { get; private set; }
    public string ReceivedAt { get; private set; } = default!;
    public string? ErrorMessage { get; private set; }

    private PrinterJob() { }

    public static PrinterJob Create(string? zplContent, int durationMs, string status, string? error = null)
        => new()
        {
            ZplContent = zplContent,
            DurationMs = durationMs,
            Status = status,
            ReceivedAt = DateTime.UtcNow.ToString("o"),
            ErrorMessage = error
        };
}
