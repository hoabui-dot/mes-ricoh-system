using System.Text;
using System.Text.Json;
using Confluent.Kafka;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ND.Infrastructure.Messaging;

public sealed class KafkaConsumer : IEventConsumer, IAsyncDisposable
{
    private readonly KafkaOptions _options;
    private readonly ILogger<KafkaConsumer> _logger;
    private readonly IEventPublisher _publisher;
    private readonly List<Task> _loops = [];
    private readonly CancellationTokenSource _shutdown = new();
    public bool IsConnected { get; private set; }

    public KafkaConsumer(IOptions<KafkaOptions> options, IEventPublisher publisher, ILogger<KafkaConsumer> logger)
    { _options = options.Value; _publisher = publisher; _logger = logger; }

    public async Task StartConsumingAsync(string exchange, string queue, string routingKeyPattern, Func<string, string, Task> onMessage, CancellationToken cancellationToken = default)
    {
        var topic = KafkaTopicMap.ForSubscription(routingKeyPattern);
        var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _shutdown.Token);
        var config = new ConsumerConfig
        {
            BootstrapServers = _options.EffectiveBootstrapServers,
            ClientId = _options.ClientId,
            GroupId = queue,
            EnableAutoCommit = false,
            AutoOffsetReset = Enum.TryParse<AutoOffsetReset>(_options.AutoOffsetReset, true, out var reset) ? reset : AutoOffsetReset.Earliest,
            EnablePartitionEof = false,
            SecurityProtocol = Enum.TryParse<SecurityProtocol>(_options.SecurityProtocol, true, out var protocol) ? protocol : SecurityProtocol.Plaintext,
            SaslMechanism = Enum.TryParse<SaslMechanism>(_options.SaslMechanism, true, out var mechanism) ? mechanism : SaslMechanism.Plain,
            SaslUsername = _options.SaslUsername,
            SaslPassword = _options.SaslPassword
        };
        var consumer = new ConsumerBuilder<string, string>(config).Build();
        consumer.Subscribe(topic);
        IsConnected = true;
        _logger.LogInformation("Kafka consumer started. topic={Topic} group={Group} pattern={Pattern}", topic, queue, routingKeyPattern);
        _loops.Add(Task.Run(async () => await ConsumeLoopAsync(consumer, topic, routingKeyPattern, onMessage, linked.Token), linked.Token));
        await Task.CompletedTask;
    }

    private async Task ConsumeLoopAsync(IConsumer<string, string> consumer, string topic, string pattern, Func<string, string, Task> handler, CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    var result = consumer.Consume(TimeSpan.FromSeconds(1));
                    if (result is null) continue;
                    var routingKey = result.Message.Headers.FirstOrDefault(h => h.Key == "event-type")?.GetValueBytes() is { } header
                        ? Encoding.UTF8.GetString(header) : string.Empty;
                    if (!Matches(pattern, routingKey)) { consumer.Commit(result); continue; }
                    var payload = Unwrap(result.Message.Value);
                    try
                    {
                        await handler(routingKey, payload);
                        consumer.Commit(result);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Kafka message failed. topic={Topic} partition={Partition} offset={Offset}; sending to DLQ", topic, result.Partition, result.Offset);
                        await _publisher.PublishAsync(KafkaTopicMap.DeadLetter, routingKey + ".failed", result.Message.Value, ct);
                        consumer.Commit(result);
                    }
                }
                catch (ConsumeException ex)
                {
                    IsConnected = false;
                    _logger.LogWarning(ex, "Kafka consume failure for {Topic}; reconnecting", topic);
                    await Task.Delay(TimeSpan.FromSeconds(2), ct);
                    IsConnected = true;
                }
            }
        }
        finally { consumer.Close(); consumer.Dispose(); }
    }

    private static string Unwrap(string value)
    {
        try
        {
            using var doc = JsonDocument.Parse(value);
            if (doc.RootElement.TryGetProperty("payload", out var payload)
                || doc.RootElement.TryGetProperty("Payload", out payload)) return payload.GetRawText();
        }
        catch (JsonException) { }
        return value;
    }

    private static bool Matches(string pattern, string key)
    {
        var p = pattern.Split('.', StringSplitOptions.RemoveEmptyEntries);
        var k = key.Split('.', StringSplitOptions.RemoveEmptyEntries);
        var i = 0;
        for (; i < p.Length; i++)
        {
            if (p[i] == "#") return true;
            if (i >= k.Length || (p[i] != "*" && !p[i].Equals(k[i], StringComparison.OrdinalIgnoreCase))) return false;
        }
        return i == k.Length;
    }

    public async ValueTask DisposeAsync()
    { _shutdown.Cancel(); try { await Task.WhenAll(_loops); } catch { } _shutdown.Dispose(); }
}
