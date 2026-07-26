using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

/// <summary>
/// A print execution record linked to a job attempt.
/// Table: printer_jobs
/// </summary>
public sealed class PrinterJob : Entity
{
    public string JobId { get; private set; } = default!;
    public string AttemptId { get; private set; } = default!;
    public string PrinterId { get; private set; } = default!;
    public string LabelTemplate { get; private set; } = default!;
    public string RenderedContent { get; private set; } = default!;
    public string PrintStatus { get; private set; } = "PENDING";
    public int Copies { get; private set; } = 1;
    public string? SentAt { get; private set; }
    public string? FinishedAt { get; private set; }
    public string? ErrorMessage { get; private set; }

    private PrinterJob() { }

    public static PrinterJob Create(
        string jobId, string attemptId, string printerId,
        string labelTemplate, string renderedContent, int copies = 1)
    {
        return new PrinterJob
        {
            JobId = jobId,
            AttemptId = attemptId,
            PrinterId = printerId,
            LabelTemplate = labelTemplate,
            RenderedContent = renderedContent,
            Copies = copies
        };
    }

    public void MarkSent()
    {
        PrintStatus = "SENT";
        SentAt = DateTime.UtcNow.ToString("o");
    }

    public void MarkSuccess()
    {
        PrintStatus = "SUCCESS";
        FinishedAt = DateTime.UtcNow.ToString("o");
    }

    public void MarkFailed(string error)
    {
        PrintStatus = "FAILED";
        ErrorMessage = error;
        FinishedAt = DateTime.UtcNow.ToString("o");
    }
}
