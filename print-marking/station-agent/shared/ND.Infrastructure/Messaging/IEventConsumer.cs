namespace ND.Infrastructure.Messaging;

public interface IEventConsumer
{
    bool IsConnected { get; }
    Task StartConsumingAsync(string exchange, string queue, string routingKeyPattern, Func<string, string, Task> onMessage, CancellationToken cancellationToken = default);
}
