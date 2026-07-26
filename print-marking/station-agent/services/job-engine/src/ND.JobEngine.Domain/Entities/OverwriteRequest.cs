using ND.JobEngine.Domain.Enums;
using ND.JobEngine.Domain.Exceptions;
using ND.SharedKernel.Primitives;

namespace ND.JobEngine.Domain.Entities;

/// <summary>
/// Manual override request (REPRINT, RELASER, FORCE_PASS, FORCE_COMPLETE).
/// Requires approval before taking effect.
/// Table: job_engine_overwrite_requests
/// </summary>
public sealed class OverwriteRequest : Entity
{
    public string JobId { get; private set; } = default!;
    public string OverwriteType { get; private set; } = default!;
    public string Reason { get; private set; } = default!;
    public string RequestedBy { get; private set; } = default!;
    public string? ApprovedBy { get; private set; }
    public string Status { get; private set; } = OverwriteStatus.Pending;
    public string RequestedAt { get; private set; } = DateTime.UtcNow.ToString("o");
    public string? ResolvedAt { get; private set; }

    private OverwriteRequest() { }

    public static OverwriteRequest Create(
        string jobId,
        string overwriteType,
        string reason,
        string requestedBy)
    {
        if (!IsValidType(overwriteType))
            throw new InvalidOverwriteTypeException(overwriteType);

        return new OverwriteRequest
        {
            JobId = jobId,
            OverwriteType = overwriteType,
            Reason = reason,
            RequestedBy = requestedBy
        };
    }

    public void Approve(string approvedBy)
    {
        if (Status != OverwriteStatus.Pending)
            throw new OverwriteRequestAlreadyResolvedException(Id, Status);

        Status = OverwriteStatus.Approved;
        ApprovedBy = approvedBy;
        ResolvedAt = DateTime.UtcNow.ToString("o");
    }

    public void Reject(string rejectedBy)
    {
        if (Status != OverwriteStatus.Pending)
            throw new OverwriteRequestAlreadyResolvedException(Id, Status);

        Status = OverwriteStatus.Rejected;
        ApprovedBy = rejectedBy;
        ResolvedAt = DateTime.UtcNow.ToString("o");
    }

    private static bool IsValidType(string type) =>
        type is Enums.OverwriteType.ForcePass or Enums.OverwriteType.Reprint
            or Enums.OverwriteType.Relaser or Enums.OverwriteType.ForceComplete;
}
