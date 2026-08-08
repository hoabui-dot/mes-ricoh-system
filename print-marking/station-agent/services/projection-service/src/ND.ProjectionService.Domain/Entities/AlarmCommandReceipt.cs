using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

/// <summary>Persistent idempotency receipt. It is written in the same transaction as the alarm mutation.</summary>
public sealed class AlarmCommandReceipt : Entity
{
    public string IdempotencyKey { get; private set; } = default!;
    public string AlarmId { get; private set; } = default!;
    public string CommandType { get; private set; } = default!;
    public string ActorUserId { get; private set; } = default!;
    public string CompletedAt { get; private set; } = default!;

    private AlarmCommandReceipt() { }

    public static AlarmCommandReceipt Create(string key, string alarmId, string commandType,
        string actorUserId, DateTime at) => new()
    {
        Id = Guid.NewGuid().ToString("N"), IdempotencyKey = key, AlarmId = alarmId,
        CommandType = commandType, ActorUserId = actorUserId,
        CompletedAt = at.ToUniversalTime().ToString("o"), CreatedAt = at.ToUniversalTime().ToString("o")
    };
}
