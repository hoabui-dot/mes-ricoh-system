using ND.SharedKernel.Primitives;

namespace ND.PlcAdapter.Domain.Entities;

public sealed class PlcCommand : Entity
{
    public string JobId { get; private set; } = default!;
    public string AttemptId { get; private set; } = default!;
    public string PlcId { get; private set; } = default!;
    public string CommandName { get; private set; } = default!;
    public string CommandPayload { get; private set; } = "{}";
    public string ExecutionStatus { get; private set; } = "PENDING";
    public string? SentAt { get; private set; }
    public string? FinishedAt { get; private set; }
    public string? ErrorMessage { get; private set; }

    private PlcCommand() { }

    public static PlcCommand Create(string jobId, string attemptId, string plcId, string commandName, string commandPayload)
        => new() { JobId = jobId, AttemptId = attemptId, PlcId = plcId, CommandName = commandName, CommandPayload = commandPayload };

    public void MarkSent() { ExecutionStatus = "SENT"; SentAt = DateTime.UtcNow.ToString("o"); }
    public void MarkSuccess() { ExecutionStatus = "SUCCESS"; FinishedAt = DateTime.UtcNow.ToString("o"); }
    public void MarkFailed(string error) { ExecutionStatus = "FAILED"; ErrorMessage = error; FinishedAt = DateTime.UtcNow.ToString("o"); }
}
