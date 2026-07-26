using ND.JobEngine.Application.Dtos;
using ND.JobEngine.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.JobEngine.Application.Interfaces;

public interface IJobRepository : IRepository<Job>
{
    Task<Job?> GetByJobNoAsync(string jobNo, CancellationToken cancellationToken = default);
    Task<Job?> GetByIdempotencyKeyAsync(string key, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Job>> GetByStatusAsync(string status, CancellationToken cancellationToken = default);
    Task<PagedResult<Job>> GetPagedAsync(int page, int pageSize, string? statusFilter, string? serialFilter = null, CancellationToken cancellationToken = default);
}

public interface IJobAttemptRepository : IRepository<JobAttempt>
{
    Task<IReadOnlyList<JobAttempt>> GetByJobIdAsync(string jobId, CancellationToken cancellationToken = default);
    Task<int> GetAttemptCountAsync(string jobId, CancellationToken cancellationToken = default);
}

public interface IJobStepRepository : IRepository<JobStep>
{
    Task<IReadOnlyList<JobStep>> GetByAttemptIdAsync(string attemptId, CancellationToken cancellationToken = default);
}

public interface IJobHistoryRepository : IRepository<JobHistory>
{
    Task<IReadOnlyList<JobHistory>> GetByJobIdAsync(string jobId, CancellationToken cancellationToken = default);
}

public interface IJobStateTransitionRepository : IRepository<JobStateTransition>
{
    Task<IReadOnlyList<JobStateTransition>> GetByJobIdAsync(string jobId, CancellationToken cancellationToken = default);
}

public interface IOverwriteRequestRepository : IRepository<OverwriteRequest>
{
    Task<IReadOnlyList<OverwriteRequest>> GetByJobIdAsync(string jobId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<OverwriteRequest>> GetPendingAsync(CancellationToken cancellationToken = default);
}

public interface IProductionOrderRepository : IRepository<ProductionOrder>
{
    Task<ProductionOrder?> GetByOrderNoAsync(string orderNo, CancellationToken cancellationToken = default);
}

public interface IProductionItemRepository : IRepository<ProductionItem>
{
    Task<IReadOnlyList<ProductionItem>> GetByOrderNoAsync(string orderNo, CancellationToken cancellationToken = default);
    Task<ProductionItem?> GetByProductSerialAsync(string serial, CancellationToken cancellationToken = default);
}
