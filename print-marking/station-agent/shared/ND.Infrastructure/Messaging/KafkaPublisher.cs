using System.Text.Json;
using Confluent.Kafka;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ND.Infrastructure.Messaging;

public sealed class KafkaPublisher : IEventPublisher, IAsyncDisposable
{
    private readonly KafkaOptions _options;
    private readonly ILogger<KafkaPublisher> _logger;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private IProducer<string, string>? _producer;

    public bool IsConnected { get; private set; }

    public KafkaPublisher(IOptions<KafkaOptions> options, ILogger<KafkaPublisher> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task EnsureConnectedAsync(CancellationToken cancellationToken = default)
    {
        await _lock.WaitAsync(cancellationToken);
        try
        {
            if (_producer is not null && IsConnected) return;
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    _producer ??= new ProducerBuilder<string, string>(BuildConfig()).Build();
                    // Confluent.Kafka establishes the broker connection on the
                    // first produce; construction validates the client config.
                    IsConnected = true;
                    _logger.LogInformation("Kafka producer connected. bootstrap={Bootstrap} clientId={ClientId}", _options.EffectiveBootstrapServers, _options.ClientId);
                    return;
                }
                catch (Exception ex)
                {
                    IsConnected = false;
                    _logger.LogWarning(ex, "Kafka producer unavailable at {Bootstrap}; retrying in 10 seconds", _options.EffectiveBootstrapServers);
                    await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
                }
            }
            cancellationToken.ThrowIfCancellationRequested();
        }
        finally { _lock.Release(); }
    }

    public async Task PublishAsync(string exchange, string routingKey, string messageJson, CancellationToken cancellationToken = default)
    {
        await EnsureConnectedAsync(cancellationToken);
        var topic = string.Equals(exchange, KafkaTopicMap.DeadLetter, StringComparison.OrdinalIgnoreCase)
            ? KafkaTopicMap.DeadLetter
            : KafkaTopicMap.ForRoutingKey(routingKey);
        var envelope = KafkaEnvelope.Create(_options, routingKey, messageJson);
        var key = envelope.PartitionKey;
        try
        {
            await _producer!.ProduceAsync(topic, new Message<string, string>
            {
                Key = key,
                Value = JsonSerializer.Serialize(envelope),
                Headers = new Headers { { "event-type", System.Text.Encoding.UTF8.GetBytes(routingKey) }, { "event-version", "1"u8.ToArray() } }
            }, cancellationToken);
            IsConnected = true;
        }
        catch
        {
            IsConnected = false;
            throw;
        }
    }

    private ProducerConfig BuildConfig() => new()
    {
        BootstrapServers = _options.EffectiveBootstrapServers,
        ClientId = _options.ClientId,
        Acks = Acks.All,
        EnableIdempotence = _options.EnableIdempotence,
        MessageTimeoutMs = 30000,
        SocketKeepaliveEnable = true,
        SecurityProtocol = Enum.TryParse<SecurityProtocol>(_options.SecurityProtocol, true, out var protocol) ? protocol : SecurityProtocol.Plaintext,
        SaslMechanism = Enum.TryParse<SaslMechanism>(_options.SaslMechanism, true, out var mechanism) ? mechanism : SaslMechanism.Plain,
        SaslUsername = _options.SaslUsername,
        SaslPassword = _options.SaslPassword
    };

    public ValueTask DisposeAsync()
    {
        _producer?.Flush(TimeSpan.FromSeconds(5));
        _producer?.Dispose();
        _lock.Dispose();
        return ValueTask.CompletedTask;
    }
}

internal sealed record KafkaEnvelope(
    string EventId,
    string EventType,
    int EventVersion,
    DateTimeOffset OccurredAt,
    string Source,
    string CorrelationId,
    string? CausationId,
    string StationId,
    string? WorkstationId,
    string PartitionKey,
    JsonElement Payload)
{
    public static KafkaEnvelope Create(KafkaOptions options, string eventType, string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement.Clone();
        var eventId = ReadString(root, "eventId", "event_id") ?? Guid.NewGuid().ToString("D");
        var workstationId = ReadString(root, "workstationId", "workstation_id");
        var key = ReadString(root, "printStationId", "print_station_id") ?? workstationId ?? options.PrintStationId;
        return new(eventId, eventType, 1, DateTimeOffset.UtcNow, options.ClientId, eventId, null, options.PrintStationId, workstationId, key, root);
    }

    private static string? ReadString(JsonElement root, params string[] names)
        => names.Select(name => root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}
