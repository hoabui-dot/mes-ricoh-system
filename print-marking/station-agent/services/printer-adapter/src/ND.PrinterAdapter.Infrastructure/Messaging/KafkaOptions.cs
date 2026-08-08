namespace ND.PrinterAdapter.Infrastructure.Messaging;

/// <summary>Kafka configuration for the independently deployed Printer Adapter.</summary>
public sealed class KafkaOptions
{
    public const string SectionName = "Kafka";

    public string BootstrapServers { get; init; } = "127.0.0.1:9092";
    public string ClientId { get; init; } = "printer-adapter";
    public string SecurityProtocol { get; init; } = "Plaintext";
    public string JobEventsTopic { get; init; } = "station.job-events";
    public string DeviceHeartbeatsTopic { get; init; } = "station.device-heartbeats";
    public string BatchPrintCommandsTopic { get; init; } = "station.commands.printer";
    public string ManagementCommandsTopic { get; init; } = "station.commands.printer";
    public string ManagementEventsTopic { get; init; } = "station.events.printer";
    public string PrintStationId { get; init; } = "PRINT-STATION-01";
}
