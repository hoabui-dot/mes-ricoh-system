using ND.SharedKernel.Primitives;

namespace ND.JobEngine.Domain.Entities;

/// <summary>
/// Immutable audit record of every job state change.
/// Table: job_engine_job_history
/// </summary>
public sealed class JobHistory : Entity
{
    public string JobId { get; private set; } = default!;
    public string? AttemptId { get; private set; }
    public string OldStatus { get; private set; } = default!;
    public string NewStatus { get; private set; } = default!;
    public string ActionName { get; private set; } = default!;
    public string PerformedBy { get; private set; } = "system";
    public string? Note { get; private set; }

    private JobHistory() { }

    public static JobHistory Record(
        string jobId,
        string oldStatus,
        string newStatus,
        string actionName,
        string performedBy = "system",
        string? attemptId = null,
        string? note = null)
    {
        return new JobHistory
        {
            JobId = jobId,
            AttemptId = attemptId,
            OldStatus = oldStatus,
            NewStatus = newStatus,
            ActionName = actionName,
            PerformedBy = performedBy,
            Note = note
        };
    }
}
