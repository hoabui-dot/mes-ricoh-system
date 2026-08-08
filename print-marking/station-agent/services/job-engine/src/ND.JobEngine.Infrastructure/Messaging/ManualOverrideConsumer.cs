using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.JobEngine.Application.Commands;
using ND.JobEngine.Application.Interfaces;
using ND.UnifiedContracts.Events;
using ND.JobEngine.Domain.Entities;
using ND.JobEngine.Domain.Enums;
using ND.SharedKernel.Abstractions;

namespace ND.JobEngine.Infrastructure.Messaging;

/// <summary>
/// Background worker that consumes manual override requested events from RabbitMQ
/// (manual reprint, manual re-marking, manual reprocess) and schedules new job attempts
/// in the Job Engine with customized step overrides.
/// </summary>
public sealed class ManualOverrideConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqConsumer _consumer;
    private readonly ILogger<ManualOverrideConsumer> _logger;

    private const string Exchange = "station.events";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public ManualOverrideConsumer(
        IServiceScopeFactory scopeFactory,
        IRabbitMqConsumer consumer,
        ILogger<ManualOverrideConsumer> logger)
    {
        _scopeFactory = scopeFactory;
        _consumer = consumer;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Job Engine Manual Override consumer starting...");

        // 1. Consume manual reprint requests
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: "job-engine.manual-reprint-events",
            routingKeyPattern: JobEventRoutingKeys.ManualReprint,
            onMessage: (routingKey, json) => HandleReprintAsync(json, stoppingToken),
            cancellationToken: stoppingToken);

        // 2. Consume manual re-marking requests
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: "job-engine.manual-remarking-events",
            routingKeyPattern: JobEventRoutingKeys.ManualRemarking,
            onMessage: (routingKey, json) => HandleRemarkingAsync(json, stoppingToken),
            cancellationToken: stoppingToken);

        // 3. Consume manual reprocessing requests
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: "job-engine.manual-reprocess-events",
            routingKeyPattern: JobEventRoutingKeys.ManualReprocess,
            onMessage: (routingKey, json) => HandleReprocessingAsync(json, stoppingToken),
            cancellationToken: stoppingToken);

        // Keep running until canceled
        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
    }

    private async Task HandleReprintAsync(string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Job Engine received manual reprint request.");

        var evt = DeserializeEvent<ManualReprintRequestedEvent>(payloadJson);
        if (evt is null) return;

        using var scope = _scopeFactory.CreateScope();
        var jobRepo = scope.ServiceProvider.GetRequiredService<IJobRepository>();
        var outboxRepo = scope.ServiceProvider.GetRequiredService<IJobEngineOutboxRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var processHandler = scope.ServiceProvider.GetRequiredService<ProcessJobHandler>();
        var historyRepo = scope.ServiceProvider.GetRequiredService<IJobHistoryRepository>();
        var transitionRepo = scope.ServiceProvider.GetRequiredService<IJobStateTransitionRepository>();

        var originalJob = await jobRepo.GetByIdAsync(evt.OriginalExecutionId, cancellationToken);
        if (originalJob is null)
        {
            _logger.LogWarning("Manual reprint requested for non-existing OriginalExecutionId={JobId}", evt.OriginalExecutionId);
            return;
        }

        var rootJobId = originalJob.RootJobId ?? originalJob.Id;
        var familyJobs = (await jobRepo.GetAllAsync(cancellationToken))
            .Where(j => j.RootJobId == rootJobId || j.Id == rootJobId)
            .ToList();
        var nextRetrySeq = familyJobs.Count;

        var newJobNo = $"{originalJob.JobNo}-R{nextRetrySeq}";
        var newIdempotencyKey = $"manual-reprint-{Guid.NewGuid():N}";

        var newJob = Job.Create(
            jobNo: newJobNo,
            sourceSystem: originalJob.SourceSystem,
            jobType: originalJob.JobType,
            productCode: originalJob.ProductCode,
            idempotencyKey: newIdempotencyKey,
            payloadJson: originalJob.PayloadJson,
            productSerial: originalJob.ProductSerial,
            priority: originalJob.Priority,
            parentJobId: originalJob.Id,
            rootJobId: rootJobId,
            retrySequence: nextRetrySeq,
            executionType: "ManualReprint",
            triggeredByUserId: evt.RequestedBy,
            reasonCode: evt.ReasonCode,
            reasonDescription: evt.Comment
        );

        newJob.Queue();
        await jobRepo.AddAsync(newJob, cancellationToken);

        var history = JobHistory.Record(newJob.Id, JobStatus.Created, JobStatus.Queued, "CREATE_JOB");
        await historyRepo.AddAsync(history, cancellationToken);

        var transition = JobStateTransition.Record(newJob.Id, JobStatus.Created, JobStatus.Queued, "CREATE_JOB");
        await transitionRepo.AddAsync(transition, cancellationToken);

        var jobCreatedEvent = JobCreatedEvent.From(
            newJob.Id,
            newJob.JobNo,
            newJob.JobType,
            newJob.ProductCode,
            newJob.ProductSerial,
            newJob.SourceSystem);

        var outboxEvent = JobEngineOutboxEvent.Create(
            nameof(Job),
            newJob.Id,
            jobCreatedEvent.EventType,
            JobEventRoutingKeys.Created,
            System.Text.Json.JsonSerializer.Serialize(jobCreatedEvent));
        await outboxRepo.AddAsync(outboxEvent, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        var cmd = new ProcessJobCommand(
            JobId: newJob.Id,
            TriggerType: "ManualReprint",
            TriggeredByUserId: evt.RequestedBy,
            ParentAttemptId: evt.ParentAttemptId,
            RetrySequence: nextRetrySeq,
            ReasonCode: evt.ReasonCode,
            ReasonDescription: evt.Comment,
            OverrideJobType: "PRINT_ONLY"
        );

        await processHandler.HandleAsync(cmd, cancellationToken);
        _logger.LogInformation("Scheduled manual reprint attempt for new JobId={JobId}.", newJob.Id);
    }

    private async Task HandleRemarkingAsync(string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Job Engine received manual re-marking request.");

        var evt = DeserializeEvent<ManualRemarkingRequestedEvent>(payloadJson);
        if (evt is null) return;

        using var scope = _scopeFactory.CreateScope();
        var jobRepo = scope.ServiceProvider.GetRequiredService<IJobRepository>();
        var outboxRepo = scope.ServiceProvider.GetRequiredService<IJobEngineOutboxRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var processHandler = scope.ServiceProvider.GetRequiredService<ProcessJobHandler>();
        var historyRepo = scope.ServiceProvider.GetRequiredService<IJobHistoryRepository>();
        var transitionRepo = scope.ServiceProvider.GetRequiredService<IJobStateTransitionRepository>();

        var originalJob = await jobRepo.GetByIdAsync(evt.OriginalExecutionId, cancellationToken);
        if (originalJob is null)
        {
            _logger.LogWarning("Manual re-marking requested for non-existing OriginalExecutionId={JobId}", evt.OriginalExecutionId);
            return;
        }

        var rootJobId = originalJob.RootJobId ?? originalJob.Id;
        var familyJobs = (await jobRepo.GetAllAsync(cancellationToken))
            .Where(j => j.RootJobId == rootJobId || j.Id == rootJobId)
            .ToList();
        var nextRetrySeq = familyJobs.Count;

        var newJobNo = $"{originalJob.JobNo}-M{nextRetrySeq}";
        var newIdempotencyKey = $"manual-remarking-{Guid.NewGuid():N}";

        var newJob = Job.Create(
            jobNo: newJobNo,
            sourceSystem: originalJob.SourceSystem,
            jobType: originalJob.JobType,
            productCode: originalJob.ProductCode,
            idempotencyKey: newIdempotencyKey,
            payloadJson: originalJob.PayloadJson,
            productSerial: originalJob.ProductSerial,
            priority: originalJob.Priority,
            parentJobId: originalJob.Id,
            rootJobId: rootJobId,
            retrySequence: nextRetrySeq,
            executionType: "ManualRemarking",
            triggeredByUserId: evt.RequestedBy,
            reasonCode: evt.ReasonCode,
            reasonDescription: evt.Comment
        );

        newJob.Queue();
        await jobRepo.AddAsync(newJob, cancellationToken);

        var history = JobHistory.Record(newJob.Id, JobStatus.Created, JobStatus.Queued, "CREATE_JOB");
        await historyRepo.AddAsync(history, cancellationToken);

        var transition = JobStateTransition.Record(newJob.Id, JobStatus.Created, JobStatus.Queued, "CREATE_JOB");
        await transitionRepo.AddAsync(transition, cancellationToken);

        var jobCreatedEvent = JobCreatedEvent.From(
            newJob.Id,
            newJob.JobNo,
            newJob.JobType,
            newJob.ProductCode,
            newJob.ProductSerial,
            newJob.SourceSystem);

        var outboxEvent = JobEngineOutboxEvent.Create(
            nameof(Job),
            newJob.Id,
            jobCreatedEvent.EventType,
            JobEventRoutingKeys.Created,
            System.Text.Json.JsonSerializer.Serialize(jobCreatedEvent));
        await outboxRepo.AddAsync(outboxEvent, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        var cmd = new ProcessJobCommand(
            JobId: newJob.Id,
            TriggerType: "ManualRemarking",
            TriggeredByUserId: evt.RequestedBy,
            ParentAttemptId: evt.ParentAttemptId,
            RetrySequence: nextRetrySeq,
            ReasonCode: evt.ReasonCode,
            ReasonDescription: evt.Comment,
            OverrideJobType: "MARK_ONLY"
        );

        await processHandler.HandleAsync(cmd, cancellationToken);
        _logger.LogInformation("Scheduled manual re-marking attempt for new JobId={JobId}.", newJob.Id);
    }

    private async Task HandleReprocessingAsync(string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Job Engine received manual reprocessing request.");

        var evt = DeserializeEvent<ManualReprocessingRequestedEvent>(payloadJson);
        if (evt is null) return;

        using var scope = _scopeFactory.CreateScope();
        var jobRepo = scope.ServiceProvider.GetRequiredService<IJobRepository>();
        var outboxRepo = scope.ServiceProvider.GetRequiredService<IJobEngineOutboxRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var processHandler = scope.ServiceProvider.GetRequiredService<ProcessJobHandler>();
        var historyRepo = scope.ServiceProvider.GetRequiredService<IJobHistoryRepository>();
        var transitionRepo = scope.ServiceProvider.GetRequiredService<IJobStateTransitionRepository>();

        var originalJob = await jobRepo.GetByIdAsync(evt.OriginalExecutionId, cancellationToken);
        if (originalJob is null)
        {
            _logger.LogWarning("Manual reprocessing requested for non-existing OriginalExecutionId={JobId}", evt.OriginalExecutionId);
            return;
        }

        var rootJobId = originalJob.RootJobId ?? originalJob.Id;
        var familyJobs = (await jobRepo.GetAllAsync(cancellationToken))
            .Where(j => j.RootJobId == rootJobId || j.Id == rootJobId)
            .ToList();
        var nextRetrySeq = familyJobs.Count;

        var newJobNo = $"{originalJob.JobNo}-P{nextRetrySeq}";
        var newIdempotencyKey = $"manual-reprocess-{Guid.NewGuid():N}";

        var newJob = Job.Create(
            jobNo: newJobNo,
            sourceSystem: originalJob.SourceSystem,
            jobType: originalJob.JobType,
            productCode: originalJob.ProductCode,
            idempotencyKey: newIdempotencyKey,
            payloadJson: originalJob.PayloadJson,
            productSerial: originalJob.ProductSerial,
            priority: originalJob.Priority,
            parentJobId: originalJob.Id,
            rootJobId: rootJobId,
            retrySequence: nextRetrySeq,
            executionType: "ManualReprintAndRemarking",
            triggeredByUserId: evt.RequestedBy,
            reasonCode: evt.ReasonCode,
            reasonDescription: evt.Comment
        );

        newJob.Queue();
        await jobRepo.AddAsync(newJob, cancellationToken);

        var history = JobHistory.Record(newJob.Id, JobStatus.Created, JobStatus.Queued, "CREATE_JOB");
        await historyRepo.AddAsync(history, cancellationToken);

        var transition = JobStateTransition.Record(newJob.Id, JobStatus.Created, JobStatus.Queued, "CREATE_JOB");
        await transitionRepo.AddAsync(transition, cancellationToken);

        var jobCreatedEvent = JobCreatedEvent.From(
            newJob.Id,
            newJob.JobNo,
            newJob.JobType,
            newJob.ProductCode,
            newJob.ProductSerial,
            newJob.SourceSystem);

        var outboxEvent = JobEngineOutboxEvent.Create(
            nameof(Job),
            newJob.Id,
            jobCreatedEvent.EventType,
            JobEventRoutingKeys.Created,
            System.Text.Json.JsonSerializer.Serialize(jobCreatedEvent));
        await outboxRepo.AddAsync(outboxEvent, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        var cmd = new ProcessJobCommand(
            JobId: newJob.Id,
            TriggerType: "ManualReprocessing",
            TriggeredByUserId: evt.RequestedBy,
            ParentAttemptId: evt.ParentAttemptId,
            RetrySequence: nextRetrySeq,
            ReasonCode: evt.ReasonCode,
            ReasonDescription: evt.Comment,
            OverrideJobType: originalJob.JobType
        );

        await processHandler.HandleAsync(cmd, cancellationToken);
        _logger.LogInformation("Scheduled manual reprocessing attempt for new JobId={JobId}.", newJob.Id);
    }

    private T? DeserializeEvent<T>(string json) where T : class
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialize event payload of type {Type}", typeof(T).Name);
            return null;
        }
    }
}
