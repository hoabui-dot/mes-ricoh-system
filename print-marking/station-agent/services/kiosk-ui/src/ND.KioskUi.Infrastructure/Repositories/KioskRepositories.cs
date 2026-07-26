using Microsoft.EntityFrameworkCore;
using ND.KioskUi.Application.Interfaces;
using ND.KioskUi.Domain.Entities;
using ND.KioskUi.Infrastructure.Persistence;

namespace ND.KioskUi.Infrastructure.Repositories;

public sealed class KioskUserRepository : IKioskUserRepository
{
    private readonly KioskDbContext _context;
    public KioskUserRepository(KioskDbContext context) => _context = context;

    public async Task<KioskUser?> GetByIdAsync(string id, CancellationToken ct = default) => await _context.Users.FindAsync([id], ct);
    public async Task<KioskUser?> GetByUsernameAsync(string username, CancellationToken ct = default)
        => await _context.Users.FirstOrDefaultAsync(u => u.Username == username, ct);
    public async Task<IReadOnlyList<KioskUser>> GetAllAsync(CancellationToken ct = default) => await _context.Users.ToListAsync(ct);
    public async Task AddAsync(KioskUser entity, CancellationToken ct = default) => await _context.Users.AddAsync(entity, ct);
    public Task UpdateAsync(KioskUser entity, CancellationToken ct = default) { _context.Users.Update(entity); return Task.CompletedTask; }
    public async Task DeleteAsync(string id, CancellationToken ct = default) { var e = await GetByIdAsync(id, ct); if (e is not null) _context.Users.Remove(e); }
}

public sealed class KioskSessionRepository : IKioskSessionRepository
{
    private readonly KioskDbContext _context;
    public KioskSessionRepository(KioskDbContext context) => _context = context;

    public async Task<KioskSession?> GetByIdAsync(string id, CancellationToken ct = default) => await _context.Sessions.FindAsync([id], ct);
    public async Task<KioskSession?> GetByTokenAsync(string token, CancellationToken ct = default)
        => await _context.Sessions.FirstOrDefaultAsync(s => s.Token == token && s.IsActive, ct);
    public async Task<IReadOnlyList<KioskSession>> GetActiveByUserIdAsync(string userId, CancellationToken ct = default)
        => await _context.Sessions.Where(s => s.UserId == userId && s.IsActive).ToListAsync(ct);
    public async Task<IReadOnlyList<KioskSession>> GetAllAsync(CancellationToken ct = default) => await _context.Sessions.ToListAsync(ct);
    public async Task AddAsync(KioskSession entity, CancellationToken ct = default) => await _context.Sessions.AddAsync(entity, ct);
    public Task UpdateAsync(KioskSession entity, CancellationToken ct = default) { _context.Sessions.Update(entity); return Task.CompletedTask; }
    public async Task DeleteAsync(string id, CancellationToken ct = default) { var e = await GetByIdAsync(id, ct); if (e is not null) _context.Sessions.Remove(e); }
}

public sealed class KioskAccessLogRepository : IKioskAccessLogRepository
{
    private readonly KioskDbContext _context;
    public KioskAccessLogRepository(KioskDbContext context) => _context = context;

    public async Task<KioskAccessLog?> GetByIdAsync(string id, CancellationToken ct = default) => await _context.AccessLogs.FindAsync([id], ct);
    public async Task<IReadOnlyList<KioskAccessLog>> GetAllAsync(CancellationToken ct = default) => await _context.AccessLogs.ToListAsync(ct);
    public async Task<IReadOnlyList<KioskAccessLog>> GetByUserIdAsync(string userId, CancellationToken ct = default)
        => await _context.AccessLogs.Where(l => l.UserId == userId).OrderByDescending(l => l.PerformedAt).Take(100).ToListAsync(ct);
    public async Task<IReadOnlyList<KioskAccessLog>> GetByTargetAsync(string targetType, string targetId, CancellationToken ct = default)
        => await _context.AccessLogs.Where(l => l.TargetType == targetType && l.TargetId == targetId).ToListAsync(ct);
    public async Task AddAsync(KioskAccessLog entity, CancellationToken ct = default) => await _context.AccessLogs.AddAsync(entity, ct);
    public Task UpdateAsync(KioskAccessLog entity, CancellationToken ct = default) { _context.AccessLogs.Update(entity); return Task.CompletedTask; }
    public async Task DeleteAsync(string id, CancellationToken ct = default) { var e = await GetByIdAsync(id, ct); if (e is not null) _context.AccessLogs.Remove(e); }
}

public sealed class KioskRbacRepository : IKioskRbacRepository
{
    private readonly KioskDbContext _context;
    public KioskRbacRepository(KioskDbContext context) => _context = context;

    public async Task<IReadOnlyList<string>> GetUserRolesAsync(string userId, CancellationToken ct = default)
    {
        var roleIds = await _context.UserRoles.Where(ur => ur.UserId == userId).Select(ur => ur.RoleId).ToListAsync(ct);
        return await _context.Roles.Where(r => roleIds.Contains(r.Id)).Select(r => r.RoleCode).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<string>> GetUserPermissionsAsync(string userId, CancellationToken ct = default)
    {
        var roleIds = await _context.UserRoles.Where(ur => ur.UserId == userId).Select(ur => ur.RoleId).ToListAsync(ct);
        var rolePermIds = await _context.RolePermissions.Where(rp => roleIds.Contains(rp.RoleId)).Select(rp => rp.PermissionId).Distinct().ToListAsync(ct);
        var directPermIds = await _context.UserPermissions.Where(up => up.UserId == userId).Select(up => up.PermissionId).ToListAsync(ct);
        var allPermIds = rolePermIds.Union(directPermIds).Distinct().ToList();
        return await _context.Permissions.Where(p => allPermIds.Contains(p.Id)).Select(p => p.PermissionCode).ToListAsync(ct);
    }
}
