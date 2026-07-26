using Microsoft.EntityFrameworkCore;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Domain.Entities;
using ND.JobEngine.Infrastructure.Persistence;

namespace ND.JobEngine.Infrastructure.Repositories;

public sealed class JobStepRepository : IJobStepRepository
{
    private readonly JobEngineDbContext _context;

    public JobStepRepository(JobEngineDbContext context) => _context = context;

    public async Task<JobStep?> GetByIdAsync(string id, CancellationToken ct = default)
        => await _context.JobSteps.FindAsync([id], ct);

    public async Task<IReadOnlyList<JobStep>> GetAllAsync(CancellationToken ct = default)
        => await _context.JobSteps.ToListAsync(ct);

    public async Task<IReadOnlyList<JobStep>> GetByAttemptIdAsync(string attemptId, CancellationToken ct = default)
        => await _context.JobSteps
            .Where(s => s.AttemptId == attemptId)
            .OrderBy(s => s.StepOrder)
            .ToListAsync(ct);

    public async Task AddAsync(JobStep entity, CancellationToken ct = default)
        => await _context.JobSteps.AddAsync(entity, ct);

    public Task UpdateAsync(JobStep entity, CancellationToken ct = default)
    {
        _context.JobSteps.Update(entity);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var entity = await GetByIdAsync(id, ct);
        if (entity is not null) _context.JobSteps.Remove(entity);
    }
}

public sealed class JobStateTransitionRepository : IJobStateTransitionRepository
{
    private readonly JobEngineDbContext _context;

    public JobStateTransitionRepository(JobEngineDbContext context) => _context = context;

    public async Task<JobStateTransition?> GetByIdAsync(string id, CancellationToken ct = default)
        => await _context.JobStateTransitions.FindAsync([id], ct);

    public async Task<IReadOnlyList<JobStateTransition>> GetAllAsync(CancellationToken ct = default)
        => await _context.JobStateTransitions.ToListAsync(ct);

    public async Task<IReadOnlyList<JobStateTransition>> GetByJobIdAsync(string jobId, CancellationToken ct = default)
        => await _context.JobStateTransitions
            .Where(t => t.JobId == jobId)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync(ct);

    public async Task AddAsync(JobStateTransition entity, CancellationToken ct = default)
        => await _context.JobStateTransitions.AddAsync(entity, ct);

    public Task UpdateAsync(JobStateTransition entity, CancellationToken ct = default)
    {
        _context.JobStateTransitions.Update(entity);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var entity = await GetByIdAsync(id, ct);
        if (entity is not null) _context.JobStateTransitions.Remove(entity);
    }
}
