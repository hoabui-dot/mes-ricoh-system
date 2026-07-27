using ND.KioskUi.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ND.KioskUi.Infrastructure.Persistence;

/// <summary>
/// Seeds default roles, permissions, and an admin user on first startup.
/// </summary>
public static class KioskDbSeeder
{
    public static async Task SeedAsync(KioskDbContext context)
    {
        // 1. Roles
        var adminRole = await context.Roles.FirstOrDefaultAsync(r => r.RoleCode == "SUPER_ADMIN");
        if (adminRole == null)
        {
            adminRole = KioskRole.Create("SUPER_ADMIN", "Quản trị hệ thống");
            await context.Roles.AddAsync(adminRole);
        }

        var memberRole = await context.Roles.FirstOrDefaultAsync(r => r.RoleCode == "MEMBER");
        if (memberRole == null)
        {
            memberRole = KioskRole.Create("MEMBER", "Nhân viên vận hành");
            await context.Roles.AddAsync(memberRole);
        }

        await context.SaveChangesAsync();

        // 2. Permissions
        var permissions = new Dictionary<string, string>
        {
            { PermissionCodes.JobView, "Xem danh sách công việc" },
            { PermissionCodes.JobReprocess, "Làm lại / Xử lý lại sản phẩm" },
            { PermissionCodes.UserManage, "Quản lý người dùng" },
            { PermissionCodes.SystemAdmin, "Toàn quyền hệ thống" }
        };

        foreach (var p in permissions)
        {
            var exists = await context.Permissions.AnyAsync(pe => pe.PermissionCode == p.Key);
            if (!exists)
            {
                await context.Permissions.AddAsync(KioskPermission.Create(p.Key, p.Value));
            }
        }
        await context.SaveChangesAsync();

        var permissionEntities = await context.Permissions.ToListAsync();
        var permMap = permissionEntities.ToDictionary(p => p.PermissionCode, p => p.Id);

        // 3. Role-Permission mappings
        // SUPER_ADMIN gets all permissions
        foreach (var perm in permissionEntities)
        {
            var exists = await context.RolePermissions.AnyAsync(rp => rp.RoleId == adminRole.Id && rp.PermissionId == perm.Id);
            if (!exists)
            {
                await context.RolePermissions.AddAsync(KioskRolePermission.Create(adminRole.Id, perm.Id));
            }
        }

        // MEMBER gets JOB_VIEW by default
        if (permMap.TryGetValue(PermissionCodes.JobView, out var pidJobViewMember))
        {
            var exists = await context.RolePermissions.AnyAsync(rp => rp.RoleId == memberRole.Id && rp.PermissionId == pidJobViewMember);
            if (!exists)
            {
                await context.RolePermissions.AddAsync(KioskRolePermission.Create(memberRole.Id, pidJobViewMember));
            }
        }

        await context.SaveChangesAsync();

        // 4. Canonical demo admin and legacy compatibility account.
        // Keep both accounts idempotent so existing installations can move to
        // the documented `admin` login without breaking older test fixtures.
        var defaultAdmins = new[]
        {
            (Username: "admin", FullName: "Quản trị hệ thống"),
            (Username: "admin123", FullName: "Quản trị hệ thống (Legacy)")
        };

        foreach (var defaultAdmin in defaultAdmins)
        {
            var adminUser = await context.Users.FirstOrDefaultAsync(u => u.Username == defaultAdmin.Username);
            if (adminUser == null)
            {
                adminUser = KioskUser.Create(defaultAdmin.Username, defaultAdmin.FullName,
                    BCrypt.Net.BCrypt.HashPassword("admin123"));
                await context.Users.AddAsync(adminUser);
                await context.SaveChangesAsync();
            }
            else
            {
                if (!adminUser.IsActive) adminUser.Activate();
                if (!BCrypt.Net.BCrypt.Verify("admin123", adminUser.PasswordHash))
                    adminUser.UpdatePassword(BCrypt.Net.BCrypt.HashPassword("admin123"));
                await context.SaveChangesAsync();
            }

            var hasAdminRole = await context.UserRoles.AnyAsync(ur =>
                ur.UserId == adminUser.Id && ur.RoleId == adminRole.Id);
            if (!hasAdminRole)
                await context.UserRoles.AddAsync(KioskUserRole.Create(adminUser.Id, adminRole.Id, "system"));

            await context.SaveChangesAsync();
        }
    }
}
