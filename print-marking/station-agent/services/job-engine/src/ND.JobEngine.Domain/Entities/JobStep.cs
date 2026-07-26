using ND.JobEngine.Domain.Enums;
using ND.SharedKernel.Primitives;

namespace ND.JobEngine.Domain.Entities;

/// <summary>
/// An individual step within a job attempt.
/// Table: job_engine_job_steps
/// </summary>
public sealed class JobStep : Entity
{
    public string AttemptId { get; private set; } = default!;
    public string StepName { get; private set; } = default!;
    public int StepOrder { get; private set; }
    public string Status { get; private set; } = StepStatus.Pending;
    public string? StartedAt { get; private set; }
    public string? FinishedAt { get; private set; }
    public string? ResultJson { get; private set; }
    public string? ErrorMessage { get; private set; }
    public int ExecutionDurationMs { get; private set; } = 0;
    public int RetryCount { get; private set; } = 0;
    public string? PayloadJsonStep { get; private set; }
    public string? AssignedDeviceId { get; private set; }
    public string? ExecutionResult { get; private set; }

    private JobStep() { }

    public static JobStep Create(string attemptId, string stepName, int stepOrder)
    {
        return new JobStep
        {
            AttemptId = attemptId,
            StepName = stepName,
            StepOrder = stepOrder,
            Status = StepStatus.Pending
        };
    }

    public void Start(string? assignedDeviceId = null, string? payload = null)
    {
        Status = StepStatus.Running;
        StartedAt = DateTime.UtcNow.ToString("o");
        AssignedDeviceId = assignedDeviceId;
        PayloadJsonStep = payload;
    }

    public void Complete(string? resultJson = null)
    {
        Status = StepStatus.Completed;
        ResultJson = resultJson;
        FinishedAt = DateTime.UtcNow.ToString("o");
        ExecutionResult = "SUCCESS";
        if (DateTime.TryParse(StartedAt, out var start))
        {
            ExecutionDurationMs = (int)(DateTime.UtcNow - start).TotalMilliseconds;
        }
    }

    public void Fail(string errorMessage)
    {
        Status = StepStatus.Failed;
        ErrorMessage = errorMessage;
        FinishedAt = DateTime.UtcNow.ToString("o");
        ExecutionResult = "FAILED";
        if (DateTime.TryParse(StartedAt, out var start))
        {
            ExecutionDurationMs = (int)(DateTime.UtcNow - start).TotalMilliseconds;
        }
    }

    public void Skip()
    {
        Status = StepStatus.Skipped;
        FinishedAt = DateTime.UtcNow.ToString("o");
        ExecutionResult = "SKIPPED";
    }

    public void IncrementRetry()
    {
        RetryCount++;
    }
}
