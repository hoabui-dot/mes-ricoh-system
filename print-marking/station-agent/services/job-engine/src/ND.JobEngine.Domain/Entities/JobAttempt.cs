using ND.JobEngine.Domain.Enums;
using ND.SharedKernel.Primitives;

namespace ND.JobEngine.Domain.Entities;

/// <summary>
/// A single execution attempt for a job.
/// Table: job_engine_job_attempts
/// </summary>
public sealed class JobAttempt : Entity
{
    public string JobId { get; private set; } = default!;
    public int AttemptNo { get; private set; }
    public string TriggerType { get; private set; } = Enums.TriggerType.Auto;
    public string? TriggeredByUserId { get; private set; }
    public string ResultStatus { get; private set; } = "RUNNING";
    public string StartedAt { get; private set; } = DateTime.UtcNow.ToString("o");
    public string? FinishedAt { get; private set; }
    public string? ErrorMessage { get; private set; }
    public string? ParentAttemptId { get; private set; }
    public int RetrySequence { get; private set; }
    public string? ReasonCode { get; private set; }
    public string? ReasonDescription { get; private set; }

    private JobAttempt() { }

    public static JobAttempt Create(
        string jobId, 
        int attemptNo, 
        string triggerType, 
        string? triggeredByUserId = null,
        string? parentAttemptId = null,
        int retrySequence = 0,
        string? reasonCode = null,
        string? reasonDescription = null)
    {
        return new JobAttempt
        {
            JobId = jobId,
            AttemptNo = attemptNo,
            TriggerType = triggerType,
            TriggeredByUserId = triggeredByUserId,
            ParentAttemptId = parentAttemptId,
            RetrySequence = retrySequence,
            ReasonCode = reasonCode,
            ReasonDescription = reasonDescription,
            StartedAt = DateTime.UtcNow.ToString("o")
        };
    }

    public void Succeed()
    {
        ResultStatus = AttemptStatus.Success;
        FinishedAt = DateTime.UtcNow.ToString("o");
    }

    public void Fail(string errorMessage)
    {
        ResultStatus = AttemptStatus.Failed;
        ErrorMessage = errorMessage;
        FinishedAt = DateTime.UtcNow.ToString("o");
    }

    public void Cancel()
    {
        ResultStatus = AttemptStatus.Cancelled;
        FinishedAt = DateTime.UtcNow.ToString("o");
    }
}
