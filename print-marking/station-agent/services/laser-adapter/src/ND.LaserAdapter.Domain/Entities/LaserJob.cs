using ND.SharedKernel.Primitives;

namespace ND.LaserAdapter.Domain.Entities;

public sealed class LaserJob : Entity
{
    public string JobId { get; private set; } = default!;
    public string AttemptId { get; private set; } = default!;
    public string LaserId { get; private set; } = default!;
    public string TemplateName { get; private set; } = default!;
    public string MarkContent { get; private set; } = default!;
    public string MarkStatus { get; private set; } = "PENDING";
    public string? SentAt { get; private set; }
    public string? FinishedAt { get; private set; }
    public string? ErrorMessage { get; private set; }

    private LaserJob() { }

    public static LaserJob Create(string jobId, string attemptId, string laserId, string templateName, string markContent)
        => new() { JobId = jobId, AttemptId = attemptId, LaserId = laserId, TemplateName = templateName, MarkContent = markContent };

    public void MarkSent() { MarkStatus = "SENT"; SentAt = DateTime.UtcNow.ToString("o"); }
    public void MarkSuccess() { MarkStatus = "SUCCESS"; FinishedAt = DateTime.UtcNow.ToString("o"); }
    public void MarkFailed(string error) { MarkStatus = "FAILED"; ErrorMessage = error; FinishedAt = DateTime.UtcNow.ToString("o"); }
}
