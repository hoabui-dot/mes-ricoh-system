namespace ND.Infrastructure.Messaging;

/// <summary>
/// Configuration options for RabbitMQ connection.
/// Bound from the "RabbitMq" configuration section.
/// </summary>
public sealed class RabbitMqOptions
{
    public const string SectionName = "RabbitMq";

    /// <summary>Hostname of the RabbitMQ broker. Default: localhost</summary>
    public string Host { get; set; } = "localhost";

    /// <summary>AMQP port. Default: 5672</summary>
    public int Port { get; set; } = 5672;

    /// <summary>RabbitMQ username. Default: guest</summary>
    public string Username { get; set; } = "guest";

    /// <summary>RabbitMQ password. Default: guest</summary>
    public string Password { get; set; } = "guest";

    /// <summary>Virtual host. Default: /</summary>
    public string VirtualHost { get; set; } = "/";

    /// <summary>
    /// Default topic exchange name used for publishing events.
    /// Consumers declare their own queues and bind to this exchange.
    /// </summary>
    public string DefaultExchange { get; set; } = "station.events";
}
