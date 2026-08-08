using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

public sealed class AlarmTimelineEvent : Entity
{
    public string AlarmId { get; private set; } = default!;
    public string ActionType { get; private set; } = default!;
    public string? PreviousState { get; private set; }
    public string NewState { get; private set; } = default!;
    public string? ActorUserId { get; private set; }
    public string ActorUsername { get; private set; } = default!;
    public string ActorRole { get; private set; } = default!;
    public string? Comment { get; private set; }
    public string MetadataJson { get; private set; } = "{}";
    public string OccurredAt { get; private set; } = default!;
    public string? CorrelationId { get; private set; }

    private AlarmTimelineEvent() { }

    public static AlarmTimelineEvent Create(string alarmId, string actionType, string? previousState,
        string newState, string? actorUserId, string actorUsername, string actorRole, string? comment,
        string metadataJson, DateTime occurredAt, string? correlationId) => new()
    {
        Id = Guid.NewGuid().ToString("N"), AlarmId = alarmId, ActionType = actionType,
        PreviousState = previousState, NewState = newState, ActorUserId = actorUserId,
        ActorUsername = actorUsername, ActorRole = actorRole, Comment = comment,
        MetadataJson = string.IsNullOrWhiteSpace(metadataJson) ? "{}" : metadataJson,
        OccurredAt = occurredAt.ToUniversalTime().ToString("o"),
        CorrelationId = correlationId, CreatedAt = occurredAt.ToUniversalTime().ToString("o")
    };
}
