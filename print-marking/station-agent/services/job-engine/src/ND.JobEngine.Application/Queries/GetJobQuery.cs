using ND.JobEngine.Application.Dtos;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Domain.Exceptions;
using ND.JobEngine.Domain.Entities;

namespace ND.JobEngine.Application.Queries;

public record GetJobByIdQuery(string JobId);
public record GetJobByJobNoQuery(string JobNo);
public record GetJobsQuery(int Page = 1, int PageSize = 20, string? StatusFilter = null, string? SerialFilter = null);
public record GetJobHistoryQuery(string JobId);
public record GetJobAttemptsQuery(string JobId);
public record GetPendingOverwriteRequestsQuery;

public sealed class GetJobQueryHandler
{
    private readonly IJobRepository _jobRepository;
    private readonly IJobHistoryRepository _historyRepository;
    private readonly IJobAttemptRepository _attemptRepository;
    private readonly IOverwriteRequestRepository _overwriteRepository;

    public GetJobQueryHandler(
        IJobRepository jobRepository,
        IJobHistoryRepository historyRepository,
        IJobAttemptRepository attemptRepository,
        IOverwriteRequestRepository overwriteRepository)
    {
        _jobRepository = jobRepository;
        _historyRepository = historyRepository;
        _attemptRepository = attemptRepository;
        _overwriteRepository = overwriteRepository;
    }

    public async Task<JobDto> HandleGetByIdAsync(GetJobByIdQuery query, CancellationToken cancellationToken = default)
    {
        var job = await _jobRepository.GetByIdAsync(query.JobId, cancellationToken)
            ?? throw new JobNotFoundException(query.JobId);
        return MapJobToDto(job);
    }

    public async Task<JobDto> HandleGetByJobNoAsync(GetJobByJobNoQuery query, CancellationToken cancellationToken = default)
    {
        var job = await _jobRepository.GetByJobNoAsync(query.JobNo, cancellationToken)
            ?? throw new JobNoNotFoundException(query.JobNo);
        return MapJobToDto(job);
    }

    public async Task<PagedResult<JobDto>> HandleGetPagedAsync(GetJobsQuery query, CancellationToken cancellationToken = default)
    {
        var result = await _jobRepository.GetPagedAsync(query.Page, query.PageSize, query.StatusFilter, query.SerialFilter, cancellationToken);
        return new PagedResult<JobDto>(
            result.Items.Select(MapJobToDto).ToList(),
            result.Total, result.Page, result.PageSize);
    }

    public async Task<IReadOnlyList<JobHistoryDto>> HandleGetHistoryAsync(
        GetJobHistoryQuery query, CancellationToken cancellationToken = default)
    {
        var targetJob = await _jobRepository.GetByIdAsync(query.JobId, cancellationToken);
        if (targetJob is null) return new List<JobHistoryDto>();

        var rootJobId = targetJob.RootJobId ?? targetJob.Id;

        var allJobs = await _jobRepository.GetAllAsync(cancellationToken);
        var familyJobIds = allJobs
            .Where(j => j.RootJobId == rootJobId || j.Id == rootJobId)
            .Select(j => j.Id)
            .ToList();

        var allHistory = new List<JobHistory>();
        foreach (var jobId in familyJobIds)
        {
            var history = await _historyRepository.GetByJobIdAsync(jobId, cancellationToken);
            allHistory.AddRange(history);
        }

        return allHistory
            .OrderBy(h => h.CreatedAt)
            .Select(h => new JobHistoryDto(
                h.Id, h.JobId, h.AttemptId, h.OldStatus, h.NewStatus,
                h.ActionName, h.PerformedBy, h.Note, h.CreatedAt)).ToList();
    }

    public async Task<IReadOnlyList<JobAttemptDto>> HandleGetAttemptsAsync(
        GetJobAttemptsQuery query, CancellationToken cancellationToken = default)
    {
        var targetJob = await _jobRepository.GetByIdAsync(query.JobId, cancellationToken);
        if (targetJob is null) return new List<JobAttemptDto>();

        var rootJobId = targetJob.RootJobId ?? targetJob.Id;

        var allJobs = await _jobRepository.GetAllAsync(cancellationToken);
        var familyJobs = allJobs
            .Where(j => j.RootJobId == rootJobId || j.Id == rootJobId)
            .OrderBy(j => j.CreatedAt)
            .ToList();

        var familyJobIds = familyJobs.Select(j => j.Id).ToList();

        var allAttempts = new List<JobAttempt>();
        foreach (var jobId in familyJobIds)
        {
            var attempts = await _attemptRepository.GetByJobIdAsync(jobId, cancellationToken);
            allAttempts.AddRange(attempts);
        }

        var sortedAttempts = allAttempts.OrderBy(a => a.StartedAt).ToList();

        var dtos = new List<JobAttemptDto>();
        for (int i = 0; i < sortedAttempts.Count; i++)
        {
            var a = sortedAttempts[i];
            dtos.Add(new JobAttemptDto(
                a.Id, 
                a.JobId, 
                i + 1, 
                a.TriggerType, 
                a.TriggeredByUserId,
                a.ResultStatus, 
                a.StartedAt, 
                a.FinishedAt, 
                a.ErrorMessage,
                a.ParentAttemptId, 
                a.RetrySequence, 
                a.ReasonCode, 
                a.ReasonDescription));
        }

        return dtos;
    }

    public async Task<IReadOnlyList<OverwriteRequestDto>> HandleGetPendingOverwritesAsync(
        GetPendingOverwriteRequestsQuery query, CancellationToken cancellationToken = default)
    {
        var requests = await _overwriteRepository.GetPendingAsync(cancellationToken);
        return requests.Select(r => new OverwriteRequestDto(
            r.Id, r.JobId, r.OverwriteType, r.Reason, r.RequestedBy,
            r.ApprovedBy, r.Status, r.RequestedAt, r.ResolvedAt)).ToList();
    }

    private static JobDto MapJobToDto(Domain.Entities.Job job) => new(
        job.Id, job.JobNo, job.SourceSystem, job.JobType,
        job.CurrentStatus, job.ProductCode, job.ProductSerial,
        job.Priority, job.CreatedAt, job.CompletedAt,
        job.ParentJobId, job.RootJobId, job.RetrySequence, job.ExecutionType,
        job.TriggeredByUserId, job.ReasonCode, job.ReasonDescription,
        job.PayloadJson);
}
