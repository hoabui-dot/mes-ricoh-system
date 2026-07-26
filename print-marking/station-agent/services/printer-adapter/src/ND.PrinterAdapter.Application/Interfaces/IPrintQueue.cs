using System.Threading.Tasks;

namespace ND.PrinterAdapter.Application.Interfaces;

public record PrintJob(
    string PrinterCode,
    string IpAddress,
    int Port,
    string Content,
    string JobId,
    string AttemptId,
    string LabelTemplate,
    int Copies,
    string TraceId,
    string CorrelationId,
    TaskCompletionSource<bool> CompletionSource,
    string? DriverType = null,
    string? CupsQueueName = null,
    string? DispatchTarget = null);

public interface IPrintQueue
{
    ValueTask<bool> QueuePrintJobAsync(PrintJob job);
}

