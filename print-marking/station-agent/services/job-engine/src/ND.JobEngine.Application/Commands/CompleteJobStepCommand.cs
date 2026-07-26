using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Domain.Entities;
using ND.JobEngine.Domain.Enums;
using ND.JobEngine.Domain.Exceptions;
using ND.SharedKernel.Abstractions;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Application.Commands;

public record CompleteJobStepCommand(string JobId, string StepName, bool Success, string? ErrorMessage = null);

public sealed class CompleteJobStepHandler
{
    private readonly IJobRepository _jobRepository;
    private readonly IJobAttemptRepository _attemptRepository;
    private readonly IJobStepRepository _stepRepository;
    private readonly IJobHistoryRepository _historyRepository;
    private readonly IJobStateTransitionRepository _transitionRepository;
    private readonly IJobEngineOutboxRepository _outboxRepository;
    private readonly IProductionOrderRepository _orderRepository;
    private readonly IProductionItemRepository _itemRepository;
    private readonly IDistributedLock _distributedLock;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CompleteJobStepHandler> _logger;

    public CompleteJobStepHandler(
        IJobRepository jobRepository,
        IJobAttemptRepository attemptRepository,
        IJobStepRepository stepRepository,
        IJobHistoryRepository historyRepository,
        IJobStateTransitionRepository transitionRepository,
        IJobEngineOutboxRepository outboxRepository,
        IProductionOrderRepository orderRepository,
        IProductionItemRepository itemRepository,
        IDistributedLock distributedLock,
        IUnitOfWork unitOfWork,
        IServiceScopeFactory scopeFactory,
        ILogger<CompleteJobStepHandler> logger)
    {
        _jobRepository = jobRepository;
        _attemptRepository = attemptRepository;
        _stepRepository = stepRepository;
        _historyRepository = historyRepository;
        _transitionRepository = transitionRepository;
        _outboxRepository = outboxRepository;
        _orderRepository = orderRepository;
        _itemRepository = itemRepository;
        _distributedLock = distributedLock;
        _unitOfWork = unitOfWork;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task HandleAsync(CompleteJobStepCommand command, CancellationToken cancellationToken = default)
    {
        var lockKey = $"lock:job:{command.JobId}";

        await using var lockHandle = await _distributedLock.TryAcquireAsync(lockKey, TimeSpan.FromSeconds(30), cancellationToken);
        if (lockHandle is null)
        {
            _logger.LogWarning("Could not acquire lock for job {JobId}. Another process may be handling it.", command.JobId);
            return;
        }

        var job = await _jobRepository.GetByIdAsync(command.JobId, cancellationToken)
            ?? throw new JobNotFoundException(command.JobId);

        var attempts = await _attemptRepository.GetByJobIdAsync(job.Id, cancellationToken);
        var activeAttempt = attempts.OrderByDescending(a => a.AttemptNo).FirstOrDefault();
        if (activeAttempt is null || activeAttempt.ResultStatus != "RUNNING")
        {
            _logger.LogWarning("Active attempt not found or not running for job {JobId}.", command.JobId);
            return;
        }

        var steps = await _stepRepository.GetByAttemptIdAsync(activeAttempt.Id, cancellationToken);
        var step = steps.FirstOrDefault(s => s.StepName.Equals(command.StepName, StringComparison.OrdinalIgnoreCase));
        if (step is null)
        {
            _logger.LogWarning("Step {StepName} not found in active attempt {AttemptId} for job {JobId}.", command.StepName, activeAttempt.Id, command.JobId);
            return;
        }

        if (step.Status != StepStatus.Pending && step.Status != StepStatus.Running)
        {
            _logger.LogInformation("Step {StepName} in attempt {AttemptId} already in status {Status}.", command.StepName, activeAttempt.Id, step.Status);
            return;
        }

        if (command.Success)
        {
            step.Complete();
            _logger.LogInformation("Step {StepName} completed successfully for job {JobId}.", command.StepName, command.JobId);
        }
        else
        {
            step.Fail(command.ErrorMessage ?? "Unknown step failure");
            _logger.LogError("Step {StepName} failed for job {JobId}: {Error}", command.StepName, command.JobId, command.ErrorMessage);
        }

        await _stepRepository.UpdateAsync(step, cancellationToken);

        // Record step update history
        var historyNote = $"Step {command.StepName} finished with success={command.Success}";
        var stepHistory = JobHistory.Record(job.Id, job.CurrentStatus, job.CurrentStatus, $"STEP_{command.StepName}_FINISHED", performedBy: "system", attemptId: activeAttempt.Id, note: historyNote);
        await _historyRepository.AddAsync(stepHistory, cancellationToken);

        if (command.Success)
        {
            // If the completed step was VISION_CHECK, we skip PLC_REJECT
            if (command.StepName.Equals("VISION_CHECK", StringComparison.OrdinalIgnoreCase))
            {
                var plcRejectStep = steps.FirstOrDefault(s => s.StepName.Equals("PLC_REJECT", StringComparison.OrdinalIgnoreCase));
                if (plcRejectStep is not null && plcRejectStep.Status == StepStatus.Pending)
                {
                    plcRejectStep.Skip();
                    await _stepRepository.UpdateAsync(plcRejectStep, cancellationToken);
                    var skipHistory = JobHistory.Record(job.Id, job.CurrentStatus, job.CurrentStatus, "STEP_PLC_REJECT_SKIPPED", performedBy: "system", attemptId: activeAttempt.Id, note: "Vision check passed, PLC reject skipped.");
                    await _historyRepository.AddAsync(skipHistory, cancellationToken);
                }
            }

            // Find next pending step
            var nextStep = steps
                .Where(s => s.Status == StepStatus.Pending)
                .OrderBy(s => s.StepOrder)
                .FirstOrDefault();

            if (nextStep is not null)
            {
                var deviceId = nextStep.StepName.ToUpperInvariant() switch {
                    "PRINT_LABEL" => "printer-01",
                    "LASER_MARK" => "laser-01",
                    "VISION_CHECK" => "camera-01",
                    "PLC_REJECT" => "plc-01",
                    _ => null
                };
                nextStep.Start(deviceId, job.PayloadJson);
                await _stepRepository.UpdateAsync(nextStep, cancellationToken);

                var startHistory = JobHistory.Record(job.Id, job.CurrentStatus, job.CurrentStatus, $"STEP_{nextStep.StepName}_STARTED", performedBy: "system", attemptId: activeAttempt.Id, note: $"Bắt đầu bước {nextStep.StepName}");
                await _historyRepository.AddAsync(startHistory, cancellationToken);

                var resolvedDispatchTarget = ExtractDispatchTarget(job.PayloadJson);
                var jobEvent = JobProcessingEvent.From(
                    job.Id,
                    job.JobNo,
                    job.JobType,
                    job.ProductCode,
                    job.ProductSerial,
                    job.SourceSystem,
                    activeAttempt.AttemptNo,
                    payloadJson: job.PayloadJson,
                    targetPrinter: job.AssignedPrinter,
                    dispatchTarget: resolvedDispatchTarget);

                var nextRoutingKey = GetStepRoutingKey(nextStep.StepName);
                var outboxEvent = JobEngineOutboxEvent.Create(
                    nameof(Job),
                    job.Id,
                    jobEvent.EventType,
                    nextRoutingKey,
                    System.Text.Json.JsonSerializer.Serialize(jobEvent));

                await _outboxRepository.AddAsync(outboxEvent, cancellationToken);
            }
            else
            {
                // No pending steps left. Check if there was a failed step (specifically VISION_CHECK)
                var hasFailedStep = steps.Any(s => s.Status == StepStatus.Failed);
                if (hasFailedStep)
                {
                    await FailJobAndAttemptAsync(job, activeAttempt, command.ErrorMessage, steps, cancellationToken);
                }
                else
                {
                    var oldStatus = job.CurrentStatus;
                    job.Complete();
                    activeAttempt.Succeed();

                    await _jobRepository.UpdateAsync(job, cancellationToken);
                    await _attemptRepository.UpdateAsync(activeAttempt, cancellationToken);
                    await UpdateProductionItemStatusAsync(job.JobNo, job.Id, JobStatus.Completed, cancellationToken);

                    var jobHistory = JobHistory.Record(job.Id, oldStatus, job.CurrentStatus, "JOB_COMPLETED", performedBy: "system", attemptId: activeAttempt.Id);
                    await _historyRepository.AddAsync(jobHistory, cancellationToken);

                    var transition = JobStateTransition.Record(job.Id, oldStatus, job.CurrentStatus, "JOB_COMPLETED");
                    await _transitionRepository.AddAsync(transition, cancellationToken);

                    var jobEvent = JobCompletedEvent.From(
                        job.Id,
                        job.JobNo,
                        job.JobType,
                        job.ProductCode,
                        job.ProductSerial,
                        job.SourceSystem);

                    var outboxEvent = JobEngineOutboxEvent.Create(
                        nameof(Job),
                        job.Id,
                        jobEvent.EventType,
                        JobEventRoutingKeys.Completed,
                        System.Text.Json.JsonSerializer.Serialize(jobEvent));

                    await _outboxRepository.AddAsync(outboxEvent, cancellationToken);
                }
            }
        }
        else
        {
            if (command.StepName.Equals("VISION_CHECK", StringComparison.OrdinalIgnoreCase))
            {
                var plcRejectStep = steps.FirstOrDefault(s => s.StepName.Equals("PLC_REJECT", StringComparison.OrdinalIgnoreCase));
                if (plcRejectStep is not null && plcRejectStep.Status == StepStatus.Pending)
                {
                    plcRejectStep.Start("plc-01", job.PayloadJson);
                    await _stepRepository.UpdateAsync(plcRejectStep, cancellationToken);

                    var startHistory = JobHistory.Record(job.Id, job.CurrentStatus, job.CurrentStatus, "STEP_PLC_REJECT_STARTED", performedBy: "system", attemptId: activeAttempt.Id, note: "Bắt đầu bước PLC_REJECT do Vision check lỗi");
                    await _historyRepository.AddAsync(startHistory, cancellationToken);

                    var resolvedDispatchTarget = ExtractDispatchTarget(job.PayloadJson);
                    var jobEvent = JobProcessingEvent.From(
                        job.Id,
                        job.JobNo,
                        job.JobType,
                        job.ProductCode,
                        job.ProductSerial,
                        job.SourceSystem,
                        activeAttempt.AttemptNo,
                        payloadJson: job.PayloadJson,
                        targetPrinter: job.AssignedPrinter,
                        dispatchTarget: resolvedDispatchTarget);

                    var outboxEvent = JobEngineOutboxEvent.Create(
                        nameof(Job),
                        job.Id,
                        jobEvent.EventType,
                        "command.plc.reject",
                        System.Text.Json.JsonSerializer.Serialize(jobEvent));

                    await _outboxRepository.AddAsync(outboxEvent, cancellationToken);
                }
                else
                {
                    await FailJobAndAttemptAsync(job, activeAttempt, command.ErrorMessage, steps, cancellationToken);
                }
            }
            else
            {
                await FailJobAndAttemptAsync(job, activeAttempt, command.ErrorMessage, steps, cancellationToken);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // If the current job has finished processing (meaning it is COMPLETED, FAILED, or WAIT_REWORK)
        if (job.CurrentStatus == Domain.Enums.JobStatus.Completed || 
            job.CurrentStatus == Domain.Enums.JobStatus.Failed || 
            job.CurrentStatus == Domain.Enums.JobStatus.WaitRework ||
            job.CurrentStatus == Domain.Enums.JobStatus.Cancelled)
        {
            // Run queue processing asynchronously
            _ = Task.Run(async () =>
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var distLock = scope.ServiceProvider.GetRequiredService<IDistributedLock>();
                    var jobRepo = scope.ServiceProvider.GetRequiredService<IJobRepository>();
                    var procHandler = scope.ServiceProvider.GetRequiredService<ProcessJobHandler>();
                    var logger = scope.ServiceProvider.GetRequiredService<ILogger<CompleteJobStepHandler>>();

                    // Lock the station queue to prevent concurrent queue triggers
                    var qLockKey = "lock:station:queue";
                    await using var qLockHandle = await distLock.TryAcquireAsync(qLockKey, TimeSpan.FromSeconds(30), CancellationToken.None);
                    if (qLockHandle is null)
                    {
                        logger.LogWarning("Could not acquire station queue lock during next job trigger.");
                        return;
                    }

                    // Check if there are any active processing jobs (to be absolutely sure we don't start concurrent runs)
                    var currentProcessing = await jobRepo.GetByStatusAsync(Domain.Enums.JobStatus.Processing, CancellationToken.None);
                    if (currentProcessing.Any())
                    {
                        logger.LogInformation("Skipping queue trigger: job {ProcessingJobId} is currently processing.", currentProcessing[0].Id);
                        return;
                    }

                    // Get all queued jobs and order by CreatedAt
                    var queued = await jobRepo.GetByStatusAsync(Domain.Enums.JobStatus.Queued, CancellationToken.None);
                    var next = queued.OrderBy(j => j.CreatedAt).FirstOrDefault();
                    if (next is not null)
                    {
                        logger.LogInformation("Triggering next queued job {NextJobId} (JobNo={JobNo}).", next.Id, next.JobNo);
                        await procHandler.HandleAsync(new ProcessJobCommand(next.Id, Domain.Enums.TriggerType.Auto), CancellationToken.None);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred while triggering next queued job");
                }
            });
        }
    }

    public static string GetStepRoutingKey(string stepName)
    {
        return stepName.ToUpperInvariant() switch
        {
            "PRINT_LABEL" => "command.printer.print",
            "LASER_MARK" => "command.laser.mark",
            "VISION_CHECK" => "command.vision.check",
            "PLC_REJECT" => "command.plc.reject",
            _ => "job.processing"
        };
    }

    private async Task FailJobAndAttemptAsync(
        Job job,
        JobAttempt activeAttempt,
        string? errorMessage,
        IEnumerable<JobStep> steps,
        CancellationToken cancellationToken)
    {
        var visionCheckStep = steps.FirstOrDefault(s => s.StepName.Equals("VISION_CHECK", StringComparison.OrdinalIgnoreCase));
        var finalError = errorMessage;
        if (visionCheckStep is not null && !string.IsNullOrEmpty(visionCheckStep.ErrorMessage))
        {
            finalError = visionCheckStep.ErrorMessage;
        }

        var oldStatus = job.CurrentStatus;
        job.Fail();
        activeAttempt.Fail(finalError ?? "A step failed");

        await _jobRepository.UpdateAsync(job, cancellationToken);
        await _attemptRepository.UpdateAsync(activeAttempt, cancellationToken);
        await UpdateProductionItemStatusAsync(job.JobNo, job.Id, JobStatus.Failed, cancellationToken);

        var jobHistory = JobHistory.Record(job.Id, oldStatus, job.CurrentStatus, "JOB_FAILED", performedBy: "system", attemptId: activeAttempt.Id);
        await _historyRepository.AddAsync(jobHistory, cancellationToken);

        var transition = JobStateTransition.Record(job.Id, oldStatus, job.CurrentStatus, "JOB_FAILED");
        await _transitionRepository.AddAsync(transition, cancellationToken);

        var jobEvent = JobFailedEvent.From(
            job.Id,
            job.JobNo,
            job.JobType,
            job.ProductCode,
            job.ProductSerial,
            job.SourceSystem,
            finalError);

        var outboxEvent = JobEngineOutboxEvent.Create(
            nameof(Job),
            job.Id,
            jobEvent.EventType,
            JobEventRoutingKeys.Failed,
            System.Text.Json.JsonSerializer.Serialize(jobEvent));

        await _outboxRepository.AddAsync(outboxEvent, cancellationToken);
    }

    private async Task UpdateProductionItemStatusAsync(string jobNo, string jobId, string status, CancellationToken cancellationToken)
    {
        try
        {
            var items = await _itemRepository.GetByOrderNoAsync(jobNo, cancellationToken);
            var item = items.FirstOrDefault(i => i.CurrentJobId == jobId);
            if (item != null)
            {
                if (status == JobStatus.Completed)
                {
                    item.Complete();
                }
                else if (status == JobStatus.Failed)
                {
                    item.Fail();
                }
                await _itemRepository.UpdateAsync(item, cancellationToken);

                // Check if all items in this order are completed
                var allItems = await _itemRepository.GetByOrderNoAsync(jobNo, cancellationToken);
                if (allItems.All(i => i.Status == "COMPLETED"))
                {
                    var order = await _orderRepository.GetByOrderNoAsync(jobNo, cancellationToken);
                    if (order != null && order.Status != "COMPLETED")
                    {
                        order.Complete();
                        await _orderRepository.UpdateAsync(order, cancellationToken);
                    }
                }
                else if (allItems.Any(i => i.Status == "PROCESSING" || i.Status == "PENDING"))
                {
                    var order = await _orderRepository.GetByOrderNoAsync(jobNo, cancellationToken);
                    if (order != null && order.Status == "CREATED")
                    {
                        order.Start();
                        await _orderRepository.UpdateAsync(order, cancellationToken);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update production item status for JobNo={JobNo} JobId={JobId}", jobNo, jobId);
        }
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
