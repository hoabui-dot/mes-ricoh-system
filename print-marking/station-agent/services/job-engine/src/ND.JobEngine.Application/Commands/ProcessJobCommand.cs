using Microsoft.Extensions.Logging;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Domain.Entities;
using ND.JobEngine.Domain.Enums;
using ND.JobEngine.Domain.Exceptions;
using ND.SharedKernel.Abstractions;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Application.Commands;

public record ProcessJobCommand(
    string JobId, 
    string TriggerType = TriggerType.Auto, 
    string? TriggeredByUserId = null,
    string? ParentAttemptId = null,
    int RetrySequence = 0,
    string? ReasonCode = null,
    string? ReasonDescription = null,
    string? OverrideJobType = null,
    string? DispatchTarget = null
);

public sealed class ProcessJobHandler
{
    private readonly IJobRepository _jobRepository;
    private readonly IJobAttemptRepository _attemptRepository;
    private readonly IJobStepRepository _stepRepository;
    private readonly IJobHistoryRepository _historyRepository;
    private readonly IJobStateTransitionRepository _transitionRepository;
    private readonly IJobEngineOutboxRepository _outboxRepository;
    private readonly IDistributedLock _distributedLock;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<ProcessJobHandler> _logger;

    public ProcessJobHandler(
        IJobRepository jobRepository,
        IJobAttemptRepository attemptRepository,
        IJobStepRepository stepRepository,
        IJobHistoryRepository historyRepository,
        IJobStateTransitionRepository transitionRepository,
        IJobEngineOutboxRepository outboxRepository,
        IDistributedLock distributedLock,
        IUnitOfWork unitOfWork,
        ILogger<ProcessJobHandler> logger)
    {
        _jobRepository = jobRepository;
        _attemptRepository = attemptRepository;
        _stepRepository = stepRepository;
        _historyRepository = historyRepository;
        _transitionRepository = transitionRepository;
        _outboxRepository = outboxRepository;
        _distributedLock = distributedLock;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task HandleAsync(ProcessJobCommand command, CancellationToken cancellationToken = default)
    {
        // 1. Lock the station queue to prevent race conditions during status checks
        var queueLockKey = "lock:station:queue";
        await using var queueLockHandle = await _distributedLock.TryAcquireAsync(queueLockKey, TimeSpan.FromSeconds(30), cancellationToken);
        if (queueLockHandle is null)
        {
            _logger.LogWarning("Could not acquire station queue lock. Aborting process command for job {JobId}.", command.JobId);
            return;
        }

        // 2. Lock the specific job
        var lockKey = $"lock:job:{command.JobId}";
        await using var lockHandle = await _distributedLock.TryAcquireAsync(lockKey, TimeSpan.FromSeconds(30), cancellationToken);
        if (lockHandle is null)
        {
            _logger.LogWarning("Could not acquire lock for job {JobId}. Another process may be handling it.", command.JobId);
            return;
        }

        var job = await _jobRepository.GetByIdAsync(command.JobId, cancellationToken)
            ?? throw new JobNotFoundException(command.JobId);

        // If the job is already PROCESSING or has finished, don't run it again
        if (job.CurrentStatus == JobStatus.Processing || 
            job.CurrentStatus == JobStatus.Completed || 
            job.CurrentStatus == JobStatus.Failed || 
            job.CurrentStatus == JobStatus.Cancelled)
        {
            _logger.LogInformation("Job {JobId} is already in status {Status}. Skipping start.", job.Id, job.CurrentStatus);
            return;
        }

        // Check if there is already an active job in PROCESSING status on the same assigned printer
        var activeJobs = await _jobRepository.GetByStatusAsync(JobStatus.Processing, cancellationToken);
        var otherActiveJobsOnSamePrinter = activeJobs.Where(j => j.Id != command.JobId && j.AssignedPrinter == job.AssignedPrinter).ToList();
        if (otherActiveJobsOnSamePrinter.Any())
        {
            _logger.LogInformation("Job {JobId} is queued because another job {ActiveJobId} is currently processing on printer {Printer}.", command.JobId, otherActiveJobsOnSamePrinter[0].Id, job.AssignedPrinter);
            return;
        }

        var oldStatus = job.CurrentStatus;
        job.StartProcessing();

        var attemptCount = await _attemptRepository.GetAttemptCountAsync(command.JobId, cancellationToken);
        var attempt = JobAttempt.Create(
            job.Id, 
            attemptCount + 1, 
            command.TriggerType, 
            command.TriggeredByUserId,
            command.ParentAttemptId,
            command.RetrySequence,
            command.ReasonCode,
            command.ReasonDescription);
            
        await _attemptRepository.AddAsync(attempt, cancellationToken);

        // Determine step job type (support overriding job type for manual reprints/re-marking)
        var stepJobType = command.OverrideJobType ?? job.JobType;

        // Create steps based on job type
        var steps = CreateStepsForJobType(stepJobType, attempt.Id);
        var firstStep = steps.OrderBy(s => s.StepOrder).FirstOrDefault();
        if (firstStep is not null)
        {
            var deviceId = firstStep.StepName.ToUpperInvariant() switch {
                "PRINT_LABEL" => job.AssignedPrinter ?? "printer-01",
                "LASER_MARK" => "laser-01",
                "VISION_CHECK" => "camera-01",
                "PLC_REJECT" => "plc-01",
                _ => null
            };
            firstStep.Start(deviceId, job.PayloadJson);
        }

        foreach (var step in steps)
            await _stepRepository.AddAsync(step, cancellationToken);

        await _jobRepository.UpdateAsync(job, cancellationToken);

        var actionName = command.TriggerType.StartsWith("Manual", StringComparison.OrdinalIgnoreCase) 
            ? $"START_{command.TriggerType.ToUpper()}" 
            : "START_PROCESSING";

        var historyNote = string.IsNullOrEmpty(command.ReasonDescription) 
            ? "Bắt đầu xử lý." 
            : $"Lý do: [{command.ReasonCode}] {command.ReasonDescription}";

        var history = JobHistory.Record(
            job.Id,
            oldStatus,
            job.CurrentStatus,
            actionName,
            performedBy: command.TriggeredByUserId ?? "system",
            attemptId: attempt.Id,
            note: historyNote);
        await _historyRepository.AddAsync(history, cancellationToken);

        var transition = JobStateTransition.Record(job.Id, oldStatus, job.CurrentStatus, actionName);
        await _transitionRepository.AddAsync(transition, cancellationToken);

        // Record outbox event for job processing
        var resolvedDispatchTarget = command.DispatchTarget ?? ExtractDispatchTarget(job.PayloadJson);
        var jobEvent = JobProcessingEvent.From(
            job.Id,
            job.JobNo,
            stepJobType,
            job.ProductCode,
            job.ProductSerial,
            job.SourceSystem,
            attempt.AttemptNo,
            payloadJson: job.PayloadJson,
            targetPrinter: job.AssignedPrinter,
            dispatchTarget: resolvedDispatchTarget);

        var routingKey = firstStep is not null 
            ? CompleteJobStepHandler.GetStepRoutingKey(firstStep.StepName) 
            : JobEventRoutingKeys.Processing;

        var outboxEvent = JobEngineOutboxEvent.Create(
            nameof(Job),
            job.Id,
            jobEvent.EventType,
            routingKey,
            System.Text.Json.JsonSerializer.Serialize(jobEvent));

        await _outboxRepository.AddAsync(outboxEvent, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Job {JobId} processing started with type {JobType}. Attempt #{AttemptNo}",
            job.Id, stepJobType, attempt.AttemptNo);
    }

    private static List<JobStep> CreateStepsForJobType(string jobType, string attemptId)
    {
        return jobType switch
        {
            "PRINT_ONLY" =>
            [
                JobStep.Create(attemptId, "PRINT_LABEL", 1),
                JobStep.Create(attemptId, "VISION_CHECK", 2),
                JobStep.Create(attemptId, "PLC_REJECT", 3)
            ],
            "MARK_ONLY" =>
            [
                JobStep.Create(attemptId, "LASER_MARK", 1),
                JobStep.Create(attemptId, "VISION_CHECK", 2),
                JobStep.Create(attemptId, "PLC_REJECT", 3)
            ],
            "PRINT_AND_MARK" =>
            [
                JobStep.Create(attemptId, "PRINT_LABEL", 1),
                JobStep.Create(attemptId, "LASER_MARK", 2),
                JobStep.Create(attemptId, "VISION_CHECK", 3),
                JobStep.Create(attemptId, "PLC_REJECT", 4)
            ],
            "REWORK" =>
            [
                JobStep.Create(attemptId, "PRINT_LABEL", 1),
                JobStep.Create(attemptId, "LASER_MARK", 2),
                JobStep.Create(attemptId, "VISION_CHECK", 3),
                JobStep.Create(attemptId, "PLC_REJECT", 4)
            ],
            "PRINT_LABEL" =>
            [
                JobStep.Create(attemptId, "PRINT_LABEL", 1)
            ],
            "LASER_MARK" =>
            [
                JobStep.Create(attemptId, "LASER_MARK", 1)
            ],
            "FULL_PROCESS" =>
            [
                JobStep.Create(attemptId, "PRINT_LABEL", 1),
                JobStep.Create(attemptId, "LASER_MARK", 2),
                JobStep.Create(attemptId, "VISION_CHECK", 3),
                JobStep.Create(attemptId, "PLC_REJECT", 4)
            ],
            _ => [JobStep.Create(attemptId, "DEFAULT", 1)]
        };
    }

    private static string? ExtractDispatchTarget(string? payloadJson)
    {
        if (string.IsNullOrEmpty(payloadJson))
            return null;

        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(payloadJson);
            var root = doc.RootElement;
            if (root.TryGetProperty("data", out var dataArr) && dataArr.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                foreach (var item in dataArr.EnumerateArray())
                {
                    var tag = item.TryGetProperty("tag", out var tProp) ? tProp.GetString() : null;
                    var val = item.TryGetProperty("value", out var vProp) ? vProp.GetString() : null;
                    if (string.Equals(tag, "dispatch_target", StringComparison.OrdinalIgnoreCase))
                    {
                        return val;
                    }
                }
            }
        }
        catch
        {
            // Ignore parse failures
        }

        return null;
    }
}
