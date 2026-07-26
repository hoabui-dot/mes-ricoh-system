using ND.StationGateway.Domain.Entities;

namespace ND.StationGateway.Application.Interfaces;

public interface IGatewayRequestRepository
{
    Task AddAsync(GatewayRequest request, CancellationToken cancellationToken = default);
}
