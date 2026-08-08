using Confluent.Kafka;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ND.PrinterAdapter.Infrastructure.Messaging;

public interface IPrinterEventBus
{
    Task PublishAsync(string topic, string key, string payload, CancellationToken cancellationToken);
}

/// <summary>Single Kafka producer used for Printer Adapter events and heartbeats.</summary>
public sealed class KafkaPrinterEventBus : IPrinterEventBus, IDisposable
{
    private readonly IProducer<string, string> _producer;
    private readonly ILogger<KafkaPrinterEventBus> _logger;

    public KafkaPrinterEventBus(IOptions<KafkaOptions> options, ILogger<KafkaPrinterEventBus> logger)
    {
        _logger = logger;
        var value = options.Value;
        _producer = new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = value.BootstrapServers,
            ClientId = value.ClientId,
            SecurityProtocol = ParseSecurityProtocol(value.SecurityProtocol),
            EnableIdempotence = true,
            MessageTimeoutMs = 5_000
        }).Build();
    }

    public async Task PublishAsync(string topic, string key, string payload, CancellationToken cancellationToken)
    {
        var result = await _producer.ProduceAsync(
            topic,
            new Message<string, string> { Key = key, Value = payload },
            cancellationToken);
        _logger.LogDebug("Kafka published topic={Topic} partition={Partition} offset={Offset}",
            topic, result.Partition, result.Offset);
    }

    public void Dispose()
    {
        _producer.Flush(TimeSpan.FromSeconds(5));
        _producer.Dispose();
    }

    private static SecurityProtocol ParseSecurityProtocol(string value) =>
        Enum.TryParse<SecurityProtocol>(value, ignoreCase: true, out var protocol)
            ? protocol
            : SecurityProtocol.Plaintext;
}
