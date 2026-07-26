using ND.SharedKernel.Exceptions;

namespace ND.JobEngine.Domain.Exceptions;

public sealed class JobNotFoundException : NotFoundException
{
    public JobNotFoundException(string jobId) : base("Job", jobId) { }
}

public sealed class JobNoNotFoundException : DomainException
{
    public JobNoNotFoundException(string jobNo)
        : base("JOB_NOT_FOUND", $"Job with job number '{jobNo}' was not found.") { }
}

public sealed class InvalidJobTransitionException : DomainException
{
    public InvalidJobTransitionException(string jobId, string currentStatus, string targetStatus)
        : base("INVALID_TRANSITION",
            $"Job '{jobId}' cannot transition from '{currentStatus}' to '{targetStatus}'.") { }
}

public sealed class DuplicateJobException : DomainException
{
    public DuplicateJobException(string idempotencyKey)
        : base("DUPLICATE_JOB", $"Job with idempotency key '{idempotencyKey}' already exists.") { }
}

public sealed class InvalidOverwriteTypeException : DomainException
{
    public InvalidOverwriteTypeException(string type)
        : base("INVALID_OVERWRITE_TYPE", $"Overwrite type '{type}' is not valid.") { }
}

public sealed class OverwriteRequestAlreadyResolvedException : DomainException
{
    public OverwriteRequestAlreadyResolvedException(string requestId, string currentStatus)
        : base("OVERWRITE_ALREADY_RESOLVED",
            $"Overwrite request '{requestId}' is already in status '{currentStatus}'.") { }
}
