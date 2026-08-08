using System.Text;
using System.Text.Json;
using Confluent.Kafka;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ND.PrinterAdapter.Infrastructure.Messaging;

/// <summary>Creates one Kafka consumer per hosted message handler.</summary>
public sealed class KafkaMessageConsumer
{
    private readonly KafkaOptions _options;
    private readonly ILogger<KafkaMessageConsumer> _logger;

    public KafkaMessageConsumer(IOptions<KafkaOptions> options, ILogger<KafkaMessageConsumer> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task ConsumeAsync(
        string topic,
        string groupId,
        string? expectedEventType,
        Func<string, CancellationToken, Task> handler,
        CancellationToken cancellationToken)
    {
        var config = new ConsumerConfig
        {
            BootstrapServers = _options.BootstrapServers,
            ClientId = _options.ClientId,
            GroupId = groupId,
            SecurityProtocol = ParseSecurityProtocol(_options.SecurityProtocol),
            EnableAutoCommit = false,
            AutoOffsetReset = AutoOffsetReset.Earliest,
            AllowAutoCreateTopics = false
        };

        using var consumer = new ConsumerBuilder<string, string>(config)
            .SetErrorHandler((_, error) => _logger.LogWarning("Kafka consumer error: {Reason}", error.Reason))
            .Build();
        consumer.Subscribe(topic);
        _logger.LogInformation("Kafka consumer started. topic={Topic} group={GroupId}", topic, groupId);

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var result = consumer.Consume(cancellationToken);
                if (result?.Message?.Value is null)
                    continue;

                if (!MatchesEventType(result.Message.Headers, result.Message.Value, expectedEventType))
                {
                    consumer.Commit(result);
                    continue;
                }

                await handler(UnwrapPayload(result.Message.Value), cancellationToken);
                consumer.Commit(result);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (ConsumeException ex)
            {
                _logger.LogWarning(ex, "Kafka unavailable; consumer will retry in 5 seconds");
                await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Kafka message handling failed; message remains uncommitted for retry");
                await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);
            }
        }

        consumer.Close();
    }

    private static SecurityProtocol ParseSecurityProtocol(string value) =>
        Enum.TryParse<SecurityProtocol>(value, ignoreCase: true, out var protocol)
            ? protocol
            : SecurityProtocol.Plaintext;

    private static bool MatchesEventType(Headers? headers, string payload, string? expectedEventType)
    {
        if (string.IsNullOrWhiteSpace(expectedEventType))
            return true;

        var header = headers?.FirstOrDefault(value => string.Equals(value.Key, "event-type", StringComparison.OrdinalIgnoreCase));
        if (header is not null)
            return string.Equals(Encoding.UTF8.GetString(header.GetValueBytes()), expectedEventType, StringComparison.OrdinalIgnoreCase);

        try
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            if (root.TryGetProperty("event_type", out var eventType) && eventType.ValueKind == JsonValueKind.String)
                return string.Equals(eventType.GetString(), expectedEventType, StringComparison.OrdinalIgnoreCase);
            if (root.TryGetProperty("eventType", out eventType) && eventType.ValueKind == JsonValueKind.String)
                return string.Equals(eventType.GetString(), expectedEventType, StringComparison.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            // Invalid messages are not a command for this consumer; commit them
            // instead of retrying the same unrelated offset forever.
        }
        return false;
    }

    private static string UnwrapPayload(string value)
    {
        using var document = JsonDocument.Parse(value);
        return document.RootElement.TryGetProperty("payload", out var payload) || document.RootElement.TryGetProperty("Payload", out payload)
            ? payload.GetRawText()
            : value;
    }
}
