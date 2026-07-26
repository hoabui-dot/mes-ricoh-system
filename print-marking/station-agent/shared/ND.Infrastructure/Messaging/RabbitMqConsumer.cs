using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace ND.Infrastructure.Messaging;

/// <summary>
/// Singleton RabbitMQ consumer backed by a single persistent AMQP connection.
/// Binds a durable queue to a topic exchange and processes messages one at a time.
///
/// Delivery guarantees:
///   - Acks the message on successful handler execution.
///   - Nacks (no requeue) on unhandled exception — message goes to dead-letter if configured.
///   - AutomaticRecoveryEnabled recovers the connection on transient failures.
/// </summary>
public sealed class RabbitMqConsumer : IRabbitMqConsumer, IAsyncDisposable
{
    private readonly RabbitMqOptions _options;
    private readonly ILogger<RabbitMqConsumer> _logger;

    private IConnection? _connection;
    private IChannel? _channel;

    public RabbitMqConsumer(
        IOptions<RabbitMqOptions> options,
        ILogger<RabbitMqConsumer> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task StartConsumingAsync(
        string exchange,
        string queue,
        string routingKeyPattern,
        Func<string, string, Task> onMessage,
        CancellationToken cancellationToken = default)
    {
        await EnsureConnectedAsync(cancellationToken);

        // Declare the topic exchange (idempotent)
        await _channel!.ExchangeDeclareAsync(
            exchange: exchange,
            type: ExchangeType.Topic,
            durable: true,
            autoDelete: false,
            arguments: null,
            cancellationToken: cancellationToken);

        // Declare the consumer queue (durable — survives broker restart)
        await _channel.QueueDeclareAsync(
            queue: queue,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null,
            cancellationToken: cancellationToken);

        // Bind queue to exchange with routing key pattern
        await _channel.QueueBindAsync(
            queue: queue,
            exchange: exchange,
            routingKey: routingKeyPattern,
            arguments: null,
            cancellationToken: cancellationToken);

        // One message at a time — do not dispatch next until current is acked
        await _channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 1, global: false,
            cancellationToken: cancellationToken);

        _logger.LogInformation(
            "RabbitMQ consumer started. exchange={Exchange} queue={Queue} pattern={Pattern}",
            exchange, queue, routingKeyPattern);

        var consumer = new AsyncEventingBasicConsumer(_channel);

        consumer.ReceivedAsync += async (_, args) =>
        {
            var routingKey = args.RoutingKey;
            var body = Encoding.UTF8.GetString(args.Body.Span);

            _logger.LogDebug(
                "RabbitMQ message received. routingKey={RoutingKey} bodyLength={Length}",
                routingKey, args.Body.Length);

            try
            {
                await onMessage(routingKey, body);
                await _channel.BasicAckAsync(args.DeliveryTag, multiple: false, cancellationToken);

                _logger.LogDebug("Message acked. routingKey={RoutingKey}", routingKey);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Error processing RabbitMQ message. routingKey={RoutingKey} — nacking (no requeue)",
                    routingKey);

                // Nack without requeue — avoids poison message loops.
                // Configure a dead-letter exchange in production for failed message inspection.
                await _channel.BasicNackAsync(args.DeliveryTag, multiple: false, requeue: false,
                    cancellationToken);
            }
        };

        await _channel.BasicConsumeAsync(
            queue: queue,
            autoAck: false,
            consumer: consumer,
            cancellationToken: cancellationToken);
    }

    private async Task EnsureConnectedAsync(CancellationToken cancellationToken)
    {
        if (_connection is { IsOpen: true } && _channel is { IsOpen: true })
            return;

        _logger.LogInformation(
            "Connecting RabbitMQ consumer to {Host}:{Port} vhost={VHost}",
            _options.Host, _options.Port, _options.VirtualHost);

        var factory = new ConnectionFactory
        {
            HostName = _options.Host,
            Port = _options.Port,
            UserName = _options.Username,
            Password = _options.Password,
            VirtualHost = _options.VirtualHost,
            AutomaticRecoveryEnabled = true,
            NetworkRecoveryInterval = TimeSpan.FromSeconds(10)
        };

        _connection = await factory.CreateConnectionAsync(cancellationToken);
        _channel = await _connection.CreateChannelAsync(cancellationToken: cancellationToken);

        _logger.LogInformation("RabbitMQ consumer connection established.");
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (_channel is not null)
        {
            await _channel.CloseAsync();
            _channel.Dispose();
        }

        if (_connection is not null)
        {
            await _connection.CloseAsync();
            _connection.Dispose();
        }
    }
}
