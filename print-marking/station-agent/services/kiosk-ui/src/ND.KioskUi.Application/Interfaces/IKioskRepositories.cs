using ND.KioskUi.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.KioskUi.Application.Interfaces;

public interface IKioskUserRepository : IRepository<KioskUser>
{
    Task<KioskUser?> GetByUsernameAsync(string username, CancellationToken cancellationToken = default);
}

public interface IKioskSessionRepository : IRepository<KioskSession>
{
    Task<KioskSession?> GetByTokenAsync(string token, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<KioskSession>> GetActiveByUserIdAsync(string userId, CancellationToken cancellationToken = default);
}

public interface IKioskAccessLogRepository : IRepository<KioskAccessLog>
{
    Task<IReadOnlyList<KioskAccessLog>> GetByUserIdAsync(string userId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<KioskAccessLog>> GetByTargetAsync(string targetType, string targetId, CancellationToken cancellationToken = default);
}

public interface IKioskRbacRepository
{
    Task<IReadOnlyList<string>> GetUserPermissionsAsync(string userId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetUserRolesAsync(string userId, CancellationToken cancellationToken = default);
}
