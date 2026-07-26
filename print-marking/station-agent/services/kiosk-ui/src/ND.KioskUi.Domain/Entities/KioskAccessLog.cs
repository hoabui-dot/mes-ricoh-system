using ND.SharedKernel.Primitives;

namespace ND.KioskUi.Domain.Entities;

/// <summary>
/// Immutable audit log of every user action.
/// Table: kiosk_access_logs
/// </summary>
public sealed class KioskAccessLog : Entity
{
    public string UserId { get; private set; } = default!;
    public string SessionId { get; private set; } = default!;
    public string ActionName { get; private set; } = default!;
    public string TargetType { get; private set; } = default!;
    public string TargetId { get; private set; } = default!;
    public string Result { get; private set; } = default!;  // SUCCESS / DENIED / FAILED
    public string? DetailJson { get; private set; }
    public string PerformedAt { get; private set; } = DateTime.UtcNow.ToString("o");

    private KioskAccessLog() { }

    public static KioskAccessLog Create(
        string userId, string sessionId, string actionName,
        string targetType, string targetId, string result, string? detailJson = null)
    {
        return new KioskAccessLog
        {
            UserId = userId,
            SessionId = sessionId,
            ActionName = actionName,
            TargetType = targetType,
            TargetId = targetId,
            Result = result,
            DetailJson = detailJson,
            PerformedAt = DateTime.UtcNow.ToString("o")
        };
    }
}
