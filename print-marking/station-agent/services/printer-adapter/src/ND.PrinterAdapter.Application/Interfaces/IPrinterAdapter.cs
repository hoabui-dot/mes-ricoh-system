namespace ND.PrinterAdapter.Application.Interfaces;

/// <summary>
/// Abstraction for sending commands to a physical printer.
/// Implementations: ZplTcpPrinterAdapter, TsplTcpPrinterAdapter
/// </summary>
public interface IPrinterAdapter
{
    Task<bool> PrintAsync(string ipAddress, int port, string content, CancellationToken cancellationToken = default);
    Task<bool> CheckHealthAsync(string ipAddress, int port, CancellationToken cancellationToken = default);
}
