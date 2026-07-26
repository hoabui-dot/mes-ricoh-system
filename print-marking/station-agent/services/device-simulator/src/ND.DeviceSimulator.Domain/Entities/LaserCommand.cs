using ND.SharedKernel.Primitives;

namespace ND.DeviceSimulator.Domain.Entities;

/// <summary>
/// Record of a laser mark command received on TCP port 8901.
/// Table: laser_commands
/// </summary>
public sealed class LaserCommand : Entity
{
    public string RawCommand { get; private set; } = default!;  // e.g. "MARK:template:fc"
    public string Status { get; private set; } = default!;      // SUCCESS / FAILED
    public int DurationMs { get; private set; }
    public string ExecutedAt { get; private set; } = default!;
    public string? ErrorMessage { get; private set; }

    private LaserCommand() { }

    public static LaserCommand Create(string rawCommand, int durationMs, string status, string? error = null)
        => new()
        {
            RawCommand = rawCommand,
            DurationMs = durationMs,
            Status = status,
            ExecutedAt = DateTime.UtcNow.ToString("o"),
            ErrorMessage = error
        };
}
