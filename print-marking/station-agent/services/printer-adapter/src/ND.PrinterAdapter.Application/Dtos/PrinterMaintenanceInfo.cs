namespace ND.PrinterAdapter.Application.Dtos;

public record PrinterMaintenanceInfo(
    string SerialNumber,
    long LifetimePrintLength, // labels printed or inches
    string LastMaintenanceDate,
    string RecommendedCleaning,
    bool ThermalWarning,
    double CurrentTemperature
);
