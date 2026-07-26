namespace ND.Infrastructure.Messaging;

/// <summary>
/// Abstraction for publishing messages to a RabbitMQ topic exchange.
/// Implementations must be thread-safe — the publisher is registered as a singleton.
/// </summary>
public interface IRabbitMqPublisher
{
    /// <summary>
    /// Publish a JSON message to the specified exchange using the given routing key.
    /// </summary>
    /// <param name="exchange">Target exchange name (topic exchange).</param>
    /// <param name="routingKey">Routing key, e.g. "mqtt.job.JobCreateRequested".</param>
    /// <param name="messageJson">Serialized JSON payload.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task PublishAsync(
        string exchange,
        string routingKey,
        string messageJson,
        CancellationToken cancellationToken = default);
}
