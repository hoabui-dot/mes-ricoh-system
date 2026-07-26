using ND.JobEngine.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.JobEngine.Application.Interfaces;

public interface IJobEngineOutboxRepository : IRepository<JobEngineOutboxEvent>
{
    Task<IReadOnlyList<JobEngineOutboxEvent>> GetPendingAsync(int batchSize, CancellationToken cancellationToken = default);
}
