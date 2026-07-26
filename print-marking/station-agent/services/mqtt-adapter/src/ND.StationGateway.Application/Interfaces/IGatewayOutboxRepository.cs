using ND.StationGateway.Domain.Entities;

namespace ND.StationGateway.Application.Interfaces;

public interface IGatewayOutboxRepository
{
    Task AddAsync(GatewayOutboxEvent outboxEvent, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<GatewayOutboxEvent>> GetPendingAsync(int batchSize, CancellationToken cancellationToken = default);
    Task UpdateAsync(GatewayOutboxEvent outboxEvent, CancellationToken cancellationToken = default);
}
