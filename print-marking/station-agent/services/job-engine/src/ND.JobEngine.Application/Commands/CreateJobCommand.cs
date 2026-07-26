using Microsoft.Extensions.Logging;
using ND.JobEngine.Application.Dtos;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Domain.Entities;
using ND.JobEngine.Domain.Enums;
using ND.JobEngine.Domain.Exceptions;
using ND.SharedKernel.Abstractions;
using ND.UnifiedContracts.Events;

namespace ND.JobEngine.Application.Commands;

public record CreateJobCommand(
    string JobNo,
    string SourceSystem,
    string JobType,
    string ProductCode,
    string IdempotencyKey,
    string PayloadJson,
    string? ProductSerial = null,
    int Priority = 0,
    int PlannedQty = 1);

public sealed class CreateJobHandler
{
    private readonly IJobRepository _jobRepository;
    private readonly IJobHistoryRepository _historyRepository;
    private readonly IJobStateTransitionRepository _transitionRepository;
    private readonly IIdempotencyService _idempotency;
    private readonly IJobEngineOutboxRepository _outboxRepository;
    private readonly IProductionOrderRepository _orderRepository;
    private readonly IProductionItemRepository _itemRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<CreateJobHandler> _logger;

    public CreateJobHandler(
        IJobRepository jobRepository,
        IJobHistoryRepository historyRepository,
        IJobStateTransitionRepository transitionRepository,
        IIdempotencyService idempotency,
        IJobEngineOutboxRepository outboxRepository,
        IProductionOrderRepository orderRepository,
        IProductionItemRepository itemRepository,
        IUnitOfWork unitOfWork,
        ILogger<CreateJobHandler> logger)
    {
        _jobRepository = jobRepository;
        _historyRepository = historyRepository;
        _transitionRepository = transitionRepository;
        _idempotency = idempotency;
        _outboxRepository = outboxRepository;
        _orderRepository = orderRepository;
        _itemRepository = itemRepository;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task<JobDto> HandleAsync(CreateJobCommand command, CancellationToken cancellationToken = default)
    {
        // 1. Check if the ProductionOrder already exists
        var existingOrder = await _orderRepository.GetByOrderNoAsync(command.JobNo, cancellationToken);
        if (existingOrder != null)
        {
            _logger.LogInformation("ProductionOrder {OrderNo} already exists, skipping creation.", command.JobNo);
            var existingJobs = await _jobRepository.GetByStatusAsync(JobStatus.Queued, cancellationToken);
            var firstJob = existingJobs.FirstOrDefault(j => j.JobNo == command.JobNo);
            if (firstJob != null)
            {
                return MapToDto(firstJob);
            }
            // fallback to get by idempotency
            var existingByIdemp = await _jobRepository.GetByIdempotencyKeyAsync(command.IdempotencyKey, cancellationToken);
            if (existingByIdemp != null)
            {
                return MapToDto(existingByIdemp);
            }
            throw new System.Exception($"ProductionOrder {command.JobNo} exists but has no matching jobs.");
        }

        // 2. Create the ProductionOrder
        var prodOrder = ProductionOrder.Create(command.JobNo, command.ProductCode, command.PlannedQty);
        SetEntityId(prodOrder, Guid.NewGuid().ToString());
        await _orderRepository.AddAsync(prodOrder, cancellationToken);

        Job? firstCreatedJob = null;

        // 3. Expand items and jobs
        for (int i = 0; i < command.PlannedQty; i++)
        {
            var jobId = Guid.NewGuid().ToString();
            var serial = string.IsNullOrEmpty(command.ProductSerial)
                ? $"{command.ProductCode}-{i + 1}"
                : $"{command.ProductSerial}-{i + 1}";
            var itemIdempotencyKey = $"{command.IdempotencyKey}:{i}";

            // Register idempotency key per item job
            var isNew = await _idempotency.TryRegisterAsync($"idempotency:job:{itemIdempotencyKey}", TimeSpan.FromHours(24), cancellationToken);

            var item = ProductionItem.Create(command.JobNo, i + 1, serial);
            SetEntityId(item, Guid.NewGuid().ToString());
            item.AssignJob(jobId);
            await _itemRepository.AddAsync(item, cancellationToken);

            var job = Job.Create(
                command.JobNo,
                command.SourceSystem,
                command.JobType,
                command.ProductCode,
                itemIdempotencyKey,
                command.PayloadJson,
                serial,
                command.Priority);
            
            SetEntityId(job, jobId);
            job.Queue();

            await _jobRepository.AddAsync(job, cancellationToken);

            if (firstCreatedJob == null)
            {
                firstCreatedJob = job;
            }

            // Record history
            var history = JobHistory.Record(job.Id, JobStatus.Created, JobStatus.Queued, "CREATE_JOB");
            await _historyRepository.AddAsync(history, cancellationToken);

            var transition = JobStateTransition.Record(job.Id, JobStatus.Created, JobStatus.Queued, "CREATE_JOB");
            await _transitionRepository.AddAsync(transition, cancellationToken);

            // Record outbox event for job creation
            var jobEvent = JobCreatedEvent.From(
                job.Id,
                job.JobNo,
                job.JobType,
                job.ProductCode,
                job.ProductSerial,
                job.SourceSystem,
                job.IdempotencyKey);

            var outboxEvent = JobEngineOutboxEvent.Create(
                nameof(Job),
                job.Id,
                jobEvent.EventType,
                JobEventRoutingKeys.Created,
                System.Text.Json.JsonSerializer.Serialize(jobEvent));

            await _outboxRepository.AddAsync(outboxEvent, cancellationToken);
        }

        // 4. Record outbox event for production order creation
        var orderEvent = ProductionOrderCreatedEvent.From(
            command.JobNo,
            command.ProductCode,
            command.PlannedQty,
            command.SourceSystem);

        var orderOutboxEvent = JobEngineOutboxEvent.Create(
            nameof(ProductionOrder),
            command.JobNo,
            orderEvent.EventType,
            JobEventRoutingKeys.ProductionOrderCreated,
            System.Text.Json.JsonSerializer.Serialize(orderEvent));

        await _outboxRepository.AddAsync(orderOutboxEvent, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("ProductionOrder {OrderNo} created with {Qty} jobs.", command.JobNo, command.PlannedQty);

        return MapToDto(firstCreatedJob!);
    }

    private static void SetEntityId(object entity, string id)
    {
        var prop = typeof(ND.SharedKernel.Primitives.Entity).GetProperty("Id");
        prop?.SetValue(entity, id);
    }

    private static JobDto MapToDto(Job job) => new(
        job.Id, job.JobNo, job.SourceSystem, job.JobType,
        job.CurrentStatus, job.ProductCode, job.ProductSerial,
        job.Priority, job.CreatedAt, job.CompletedAt);
}
