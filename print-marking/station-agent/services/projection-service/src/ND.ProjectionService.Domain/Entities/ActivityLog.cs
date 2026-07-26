using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

public sealed class ActivityLog : Entity
{
    public string EventType { get; private set; } = default!;
    public string JobId { get; private set; } = default!;
    public string JobNo { get; private set; } = default!;
    public string ProductCode { get; private set; } = default!;
    public string Status { get; private set; } = default!;
    public string Message { get; private set; } = default!;
    public string OccurredAt { get; private set; } = default!;

    private ActivityLog() { }

    public static ActivityLog Create(
        string eventType,
        string jobId,
        string jobNo,
        string productCode,
        string status,
        string message,
        string occurredAt)
    {
        return new ActivityLog
        {
            EventType = eventType,
            JobId = jobId,
            JobNo = jobNo,
            ProductCode = productCode,
            Status = status,
            Message = message,
            OccurredAt = occurredAt
        };
    }
}
