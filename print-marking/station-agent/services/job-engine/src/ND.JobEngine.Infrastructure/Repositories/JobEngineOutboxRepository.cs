using Microsoft.EntityFrameworkCore;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Domain.Entities;
using ND.JobEngine.Infrastructure.Persistence;

namespace ND.JobEngine.Infrastructure.Repositories;

public sealed class JobEngineOutboxRepository : IJobEngineOutboxRepository
{
    private readonly JobEngineDbContext _context;

    public JobEngineOutboxRepository(JobEngineDbContext context)
    {
        _context = context;
    }

    public async Task<JobEngineOutboxEvent?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
        => await _context.JobEngineOutboxEvents.FindAsync([id], cancellationToken);

    public async Task<IReadOnlyList<JobEngineOutboxEvent>> GetAllAsync(CancellationToken cancellationToken = default)
        => await _context.JobEngineOutboxEvents.ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<JobEngineOutboxEvent>> GetPendingAsync(int batchSize, CancellationToken cancellationToken = default)
    {
        var nowIso = DateTime.UtcNow.ToString("o");
        var pending = await _context.JobEngineOutboxEvents
            .Where(e => e.Status == "PENDING")
            .OrderBy(e => e.CreatedAt)
            .ToListAsync(cancellationToken);

        return pending
            .Where(e => e.NextRetryAt == null ||
                        string.Compare(e.NextRetryAt, nowIso, StringComparison.Ordinal) <= 0)
            .Take(batchSize)
            .ToList();
    }

    public async Task AddAsync(JobEngineOutboxEvent entity, CancellationToken cancellationToken = default)
        => await _context.JobEngineOutboxEvents.AddAsync(entity, cancellationToken);

    public Task UpdateAsync(JobEngineOutboxEvent entity, CancellationToken cancellationToken = default)
    {
        _context.JobEngineOutboxEvents.Update(entity);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(string id, CancellationToken cancellationToken = default)
    {
        var entity = await GetByIdAsync(id, cancellationToken);
        if (entity is not null)
            _context.JobEngineOutboxEvents.Remove(entity);
    }
}
