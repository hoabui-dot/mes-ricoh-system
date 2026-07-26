using System.Diagnostics;
using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Logging;
using ND.LaserAdapter.Application.Interfaces;

namespace ND.LaserAdapter.Infrastructure.DeviceAdapters;

/// <summary>
/// TCP-based laser adapter.  
/// Connects to the virtual (or real) laser server and sends a text MARK command.
/// Protocol: send "MARK:{template}:{content}\n", read "SUCCESS:{ms}\n" or "FAILED:{reason}\n".
/// </summary>
public sealed class TcpLaserAdapter : ILaserAdapter
{
    private readonly ILogger<TcpLaserAdapter> _logger;

    public TcpLaserAdapter(ILogger<TcpLaserAdapter> logger)
    {
        _logger = logger;
    }

    public async Task<(bool Success, int DurationMs, string? Error)> MarkAsync(
        string endpoint,
        string template,
        string markContent,
        CancellationToken cancellationToken = default)
    {
        // Parse host:port
        var parts = endpoint.Split(':', 2);
        var host = parts[0];
        var port = parts.Length > 1 && int.TryParse(parts[1], out var p) ? p : 8901;

        var command = $"MARK:{template}:{markContent}";

        _logger.LogInformation("Sending laser command to {Host}:{Port} → {Command}", host, port, command);

        var sw = Stopwatch.StartNew();
        try
        {
            using var tcpClient = new TcpClient();
            tcpClient.SendTimeout = 5000;
            tcpClient.ReceiveTimeout = 15000; // laser takes up to ~3-5 s in simulator

            await tcpClient.ConnectAsync(host, port, cancellationToken);
            await using var stream = tcpClient.GetStream();

            // Send command
            var bytes = Encoding.ASCII.GetBytes(command + "\n");
            await stream.WriteAsync(bytes, cancellationToken);

            // Read response
            using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
            var response = await reader.ReadLineAsync(cancellationToken);
            sw.Stop();

            _logger.LogInformation("Laser response from {Host}:{Port} → {Response} ({Elapsed}ms)",
                host, port, response, sw.ElapsedMilliseconds);

            if (response is null)
                return (false, (int)sw.ElapsedMilliseconds, "No response from laser device");

            if (response.StartsWith("SUCCESS", StringComparison.OrdinalIgnoreCase))
                return (true, (int)sw.ElapsedMilliseconds, null);

            var errorPart = response.Contains(':') ? response[(response.IndexOf(':') + 1)..] : response;
            return (false, (int)sw.ElapsedMilliseconds, errorPart);
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "TCP error connecting to laser at {Host}:{Port}", host, port);
            return (false, (int)sw.ElapsedMilliseconds, ex.Message);
        }
    }
}
