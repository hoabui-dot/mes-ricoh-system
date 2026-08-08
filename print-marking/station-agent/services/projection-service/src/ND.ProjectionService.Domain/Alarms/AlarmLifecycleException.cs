using ND.SharedKernel.Exceptions;

namespace ND.ProjectionService.Domain.Alarms;

public sealed class AlarmLifecycleException : DomainException
{
    public AlarmLifecycleException(string message) : base("ALARM_LIFECYCLE_CONFLICT", message) { }
}
