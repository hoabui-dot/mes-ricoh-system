using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

/// <summary>
/// Durable idempotency boundary for an asynchronous printer command.
/// A command may be redelivered, but a command id is reserved before any
/// physical printer call is made.
/// </summary>
public sealed class PrinterCommandExecution : Entity
{
    public string CommandId { get; private set; } = default!;
    public string CommandType { get; private set; } = default!;
    public string Status { get; private set; } = "PROCESSING";
    public string? ResultJson { get; private set; }
    public string StartedAt { get; private set; } = DateTime.UtcNow.ToString("o");
    public string? CompletedAt { get; private set; }

    private PrinterCommandExecution() { }

    public static PrinterCommandExecution Start(string commandId, string commandType)
        => new()
        {
            CommandId = commandId,
            CommandType = commandType,
            Status = "PROCESSING"
        };

    public void Complete(string resultJson)
    {
        Status = "COMPLETED";
        ResultJson = resultJson;
        CompletedAt = DateTime.UtcNow.ToString("o");
    }
}
