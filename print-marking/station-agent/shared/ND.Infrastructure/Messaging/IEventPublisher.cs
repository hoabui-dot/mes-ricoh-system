namespace ND.Infrastructure.Messaging;

public interface IEventPublisher
{
    bool IsConnected { get; }
    Task EnsureConnectedAsync(CancellationToken cancellationToken = default);
    Task PublishAsync(string exchange, string routingKey, string messageJson, CancellationToken cancellationToken = default);
}
