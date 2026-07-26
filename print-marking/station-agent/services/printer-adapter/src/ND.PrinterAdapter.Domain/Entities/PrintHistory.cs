using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

/// <summary>
/// A complete audit record of a single print execution.
/// Stores all data required for debugging: runtime data, ZPL, TCP traffic, timeline.
/// Table: print_history
/// </summary>
public sealed class PrintHistory : Entity
{
    public string TemplateId { get; private set; } = default!;
    public string TemplateName { get; private set; } = default!;
    public int TemplateVersion { get; private set; }
    public string PrinterCode { get; private set; } = default!;
    public string RuntimeDataJson { get; private set; } = default!;
    public string RenderedZpl { get; private set; } = default!;
    public string? TcpRequestHex { get; private set; }
    public string? TcpResponseHex { get; private set; }
    public string? PrinterResult { get; private set; }
    public string Status { get; private set; } = "PENDING";  // PENDING, SUCCESS, FAILED
    public long DurationMs { get; private set; }
    public int RetryCount { get; private set; }
    public string TraceId { get; private set; } = default!;
    public string CorrelationId { get; private set; } = default!;
    public string? ExceptionMessage { get; private set; }
    public string? TimelineJson { get; private set; }

    private PrintHistory() { }

    public static PrintHistory Create(
        string templateId,
        string templateName,
        int templateVersion,
        string printerCode,
        string runtimeDataJson,
        string renderedZpl,
        string traceId,
        string correlationId)
    {
        return new PrintHistory
        {
            TemplateId = templateId,
            TemplateName = templateName,
            TemplateVersion = templateVersion,
            PrinterCode = printerCode,
            RuntimeDataJson = runtimeDataJson,
            RenderedZpl = renderedZpl,
            TraceId = traceId,
            CorrelationId = correlationId,
            Status = "PENDING"
        };
    }

    public void RecordTcpTraffic(string? requestHex, string? responseHex)
    {
        TcpRequestHex = requestHex;
        TcpResponseHex = responseHex;
    }

    public void MarkSuccess(long durationMs, string printerResult, string? timelineJson = null)
    {
        Status = "SUCCESS";
        DurationMs = durationMs;
        PrinterResult = printerResult;
        TimelineJson = timelineJson;
    }

    public void MarkFailed(long durationMs, string exceptionMessage, int retryCount = 0, string? timelineJson = null)
    {
        Status = "FAILED";
        DurationMs = durationMs;
        ExceptionMessage = exceptionMessage;
        RetryCount = retryCount;
        TimelineJson = timelineJson;
    }

    public void IncrementRetry() => RetryCount += 1;
}
