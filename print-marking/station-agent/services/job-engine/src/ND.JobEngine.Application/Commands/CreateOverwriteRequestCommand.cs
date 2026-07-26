using Microsoft.Extensions.Logging;
using ND.JobEngine.Application.Dtos;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Domain.Entities;
using ND.JobEngine.Domain.Exceptions;
using ND.SharedKernel.Abstractions;

namespace ND.JobEngine.Application.Commands;

public record CreateOverwriteRequestCommand(
    string JobId,
    string OverwriteType,
    string Reason,
    string RequestedBy);

public sealed class CreateOverwriteRequestHandler
{
    private readonly IJobRepository _jobRepository;
    private readonly IOverwriteRequestRepository _overwriteRepository;
    private readonly IJobHistoryRepository _historyRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<CreateOverwriteRequestHandler> _logger;

    public CreateOverwriteRequestHandler(
        IJobRepository jobRepository,
        IOverwriteRequestRepository overwriteRepository,
        IJobHistoryRepository historyRepository,
        IUnitOfWork unitOfWork,
        ILogger<CreateOverwriteRequestHandler> logger)
    {
        _jobRepository = jobRepository;
        _overwriteRepository = overwriteRepository;
        _historyRepository = historyRepository;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task<OverwriteRequestDto> HandleAsync(
        CreateOverwriteRequestCommand command,
        CancellationToken cancellationToken = default)
    {
        var job = await _jobRepository.GetByIdAsync(command.JobId, cancellationToken)
            ?? throw new JobNotFoundException(command.JobId);

        var request = OverwriteRequest.Create(
            job.Id,
            command.OverwriteType,
            command.Reason,
            command.RequestedBy);

        await _overwriteRepository.AddAsync(request, cancellationToken);

        var history = JobHistory.Record(
            job.Id, job.CurrentStatus, job.CurrentStatus,
            $"OVERWRITE_REQUESTED:{command.OverwriteType}",
            command.RequestedBy,
            note: command.Reason);

        await _historyRepository.AddAsync(history, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Overwrite request created: {OverwriteType} for job {JobId} by {RequestedBy}",
            command.OverwriteType, command.JobId, command.RequestedBy);

        return new OverwriteRequestDto(
            request.Id, request.JobId, request.OverwriteType, request.Reason,
            request.RequestedBy, request.ApprovedBy, request.Status,
            request.RequestedAt, request.ResolvedAt);
    }
}
