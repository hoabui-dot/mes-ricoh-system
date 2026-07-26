namespace ND.Infrastructure.Messaging;

/// <summary>
/// Abstraction for consuming messages from a RabbitMQ topic exchange.
/// Implementations must be thread-safe.
/// </summary>
public interface IRabbitMqConsumer
{
    /// <summary>
    /// Bind a durable queue to the topic exchange and start consuming messages.
    /// The <paramref name="onMessage"/> callback receives (routingKey, payloadJson).
    /// Acks the message on success; nacks without requeue on unhandled exception.
    /// </summary>
    Task StartConsumingAsync(
        string exchange,
        string queue,
        string routingKeyPattern,
        Func<string, string, Task> onMessage,
        CancellationToken cancellationToken = default);
}
