using ND.ProjectionService.Application.Dtos;

namespace ND.ProjectionService.Application.Interfaces;

public interface IMesConnectionStatusProvider
{
    Task<MesConnectionStatusDto> GetAsync(CancellationToken cancellationToken = default);
}
