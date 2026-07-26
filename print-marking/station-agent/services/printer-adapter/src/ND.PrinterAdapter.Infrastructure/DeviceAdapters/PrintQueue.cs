using System.Threading.Channels;
using ND.PrinterAdapter.Application.Interfaces;

namespace ND.PrinterAdapter.Infrastructure.DeviceAdapters;

public sealed class PrintQueue : IPrintQueue
{
    private readonly Channel<PrintJob> _channel;

    public PrintQueue()
    {
        _channel = Channel.CreateUnbounded<PrintJob>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });
    }

    public ValueTask<bool> QueuePrintJobAsync(PrintJob job)
    {
        return new ValueTask<bool>(_channel.Writer.TryWrite(job));
    }

    public ChannelReader<PrintJob> Reader => _channel.Reader;
}
