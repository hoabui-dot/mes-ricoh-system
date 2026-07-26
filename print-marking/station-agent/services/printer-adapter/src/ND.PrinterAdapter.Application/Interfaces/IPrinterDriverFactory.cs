using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Domain.Entities;

namespace ND.PrinterAdapter.Application.Interfaces;

/// <summary>
/// Factory that resolves the correct IPrinterDriver for a given Printer entity.
/// Selection is based on Printer.DriverType or the global PRINT_DRIVER env var override.
/// </summary>
public interface IPrinterDriverFactory
{
    /// <summary>Resolves driver for the given printer configuration.</summary>
    IPrinterDriver Resolve(Printer printer);

    /// <summary>Resolves driver by DriverType string (e.g. from env var).</summary>
    IPrinterDriver ResolveByType(string driverType, string? ipAddress = null, int port = 9100, string? cupsQueueName = null);
}
