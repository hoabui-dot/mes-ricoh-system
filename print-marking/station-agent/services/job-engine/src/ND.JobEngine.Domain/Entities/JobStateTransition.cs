using ND.SharedKernel.Primitives;

namespace ND.JobEngine.Domain.Entities;

/// <summary>
/// State machine transition record.
/// Table: job_engine_state_transitions
/// </summary>
public sealed class JobStateTransition : Entity
{
    public string JobId { get; private set; } = default!;
    public string FromState { get; private set; } = default!;
    public string ToState { get; private set; } = default!;
    public string Trigger { get; private set; } = default!;

    private JobStateTransition() { }

    public static JobStateTransition Record(string jobId, string fromState, string toState, string trigger)
    {
        return new JobStateTransition
        {
            JobId = jobId,
            FromState = fromState,
            ToState = toState,
            Trigger = trigger
        };
    }
}
