using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Application.Interfaces;

namespace ND.PrinterAdapter.Infrastructure.DeviceAdapters;

/// <summary>
/// Sends ZPL content to a Zebra/compatible printer via TCP socket on port 9100.
/// </summary>
public sealed class ZplTcpPrinterAdapter : IPrinterAdapter
{
    private readonly ILogger<ZplTcpPrinterAdapter> _logger;

    public ZplTcpPrinterAdapter(ILogger<ZplTcpPrinterAdapter> logger)
    {
        _logger = logger;
    }

    public async Task<bool> PrintAsync(string ipAddress, int port, string content, CancellationToken cancellationToken = default)
    {
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync(ipAddress, port, cancellationToken);
            await using var stream = client.GetStream();

            var data = Encoding.UTF8.GetBytes(content);
            await stream.WriteAsync(data, cancellationToken);
            await stream.FlushAsync(cancellationToken);

            _logger.LogInformation("ZPL sent to {IpAddress}:{Port} ({Bytes} bytes)", ipAddress, port, data.Length);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to print to {IpAddress}:{Port}", ipAddress, port);
            return false;
        }
    }

    public async Task<bool> CheckHealthAsync(string ipAddress, int port, CancellationToken cancellationToken = default)
    {
        try
        {
            using var client = new TcpClient();
            var connectTask = client.ConnectAsync(ipAddress, port, cancellationToken).AsTask();
            await connectTask.WaitAsync(TimeSpan.FromSeconds(3), cancellationToken);
            return client.Connected;
        }
        catch
        {
            return false;
        }
    }
}
