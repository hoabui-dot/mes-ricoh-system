using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Domain.Entities;

namespace ND.PrinterAdapter.Infrastructure.DeviceAdapters;

/// <summary>
/// Resolves the correct IPrinterDriver for a Printer entity.
/// Global override: PRINT_DRIVER env var ("simulation" | "cups") overrides per-printer DriverType.
/// </summary>
public sealed class PrinterDriverFactory : IPrinterDriverFactory
{
    private readonly IPrinterAdapter _tcpAdapter;
    private readonly ICupsPrinterStateAggregator _aggregator;
    private readonly ILoggerFactory _loggerFactory;

    // Global override from env var (null means use per-printer DriverType)
    private static readonly string? GlobalDriverOverride =
        Environment.GetEnvironmentVariable("PRINT_DRIVER")?.Trim().ToLowerInvariant();

    public PrinterDriverFactory(
        IPrinterAdapter tcpAdapter,
        ICupsPrinterStateAggregator aggregator,
        ILoggerFactory loggerFactory)
    {
        _tcpAdapter  = tcpAdapter;
        _aggregator  = aggregator;
        _loggerFactory = loggerFactory;
    }

    public IPrinterDriver Resolve(Printer printer)
    {
        // Global env var overrides per-printer config
        var driverType = GlobalDriverOverride ?? printer.DriverType?.ToLowerInvariant() ?? "cups";

        return driverType switch
        {
            "cups" => BuildCupsDriver(printer.CupsQueueName
                       ?? Environment.GetEnvironmentVariable("CUPS_QUEUE")
                       ?? "Zebra_Technologies_ZTC_GK420t"),
            "tcp" => BuildTcpDriver(printer.PrinterCode, printer.IpAddress, printer.Port),
            _ => BuildTcpDriver(printer.PrinterCode, printer.IpAddress, printer.Port)
        };
    }

    public IPrinterDriver ResolveByType(
        string driverType,
        string? ipAddress = null,
        int port = 9100,
        string? cupsQueueName = null)
    {
        var type = (GlobalDriverOverride ?? driverType).ToLowerInvariant();
        return type switch
        {
            "cups" => BuildCupsDriver(cupsQueueName
                       ?? Environment.GetEnvironmentVariable("CUPS_QUEUE")
                       ?? "Zebra_Technologies_ZTC_GK420t"),
            _ => BuildTcpDriver("unknown", ipAddress ?? "127.0.0.1", port)
        };
    }

    private IPrinterDriver BuildCupsDriver(string queueName)
        => new CupsPrinterDriver(
            queueName,
            _aggregator,
            _loggerFactory.CreateLogger<CupsPrinterDriver>());

    private IPrinterDriver BuildTcpDriver(string printerCode, string ipAddress, int port)
        => new TcpPrinterDriver(
            printerCode,
            _tcpAdapter,
            ipAddress,
            port,
            _loggerFactory.CreateLogger<TcpPrinterDriver>());
}
