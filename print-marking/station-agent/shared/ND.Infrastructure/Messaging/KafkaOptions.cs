namespace ND.Infrastructure.Messaging;

public sealed class KafkaOptions
{
    public const string SectionName = "Kafka";
    public string BootstrapServers { get; set; } = "localhost:19092";
    // Transitional aliases allow existing deployments to roll forward without
    // silently falling back to localhost while Compose files are updated.
    public string? Host { get; set; }
    public int Port { get; set; } = 9092;
    public string ClientId { get; set; } = "station-agent";
    public string GroupId { get; set; } = "station-agent";
    public string SecurityProtocol { get; set; } = "Plaintext";
    public string SaslMechanism { get; set; } = "Plain";
    public string? SaslUsername { get; set; }
    public string? SaslPassword { get; set; }
    public string AutoOffsetReset { get; set; } = "Earliest";
    public bool EnableIdempotence { get; set; } = true;
    public string SchemaRegistryUrl { get; set; } = "http://localhost:18081";
    public string PrintStationId { get; set; } = "PRINT-STATION-01";
    public string PrinterAdapterId { get; set; } = "PRINT-ADAPTER-01";
    public string EffectiveBootstrapServers => !string.IsNullOrWhiteSpace(Host) ? $"{Host}:{Port}" : BootstrapServers;
}
