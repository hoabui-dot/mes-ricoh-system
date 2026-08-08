using ND.KioskUi.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ND.KioskUi.Infrastructure.Persistence;

/// <summary>
/// Seeds default roles, permissions, and an admin user on first startup.
/// </summary>
public static class KioskDbSeeder
{
    public static async Task SeedAsync(KioskDbContext context, bool seedAlarmDemoUsers = false, string? seedPassword = null)
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

        var alarmRoles = new Dictionary<string, string>
        {
            ["OPERATOR"] = "Nhân viên vận hành",
            ["SUPERVISOR"] = "Giám sát sản xuất",
            ["MAINTENANCE"] = "Nhân viên bảo trì"
        };
        foreach (var role in alarmRoles)
            if (!await context.Roles.AnyAsync(r => r.RoleCode == role.Key))
                await context.Roles.AddAsync(KioskRole.Create(role.Key, role.Value));

        await context.SaveChangesAsync();

        // 2. Permissions
        var permissions = new Dictionary<string, string>
        {
            { PermissionCodes.JobView, "Xem danh sách công việc" },
            { PermissionCodes.JobReprocess, "Làm lại / Xử lý lại sản phẩm" },
            { PermissionCodes.UserManage, "Quản lý người dùng" },
            { PermissionCodes.SystemAdmin, "Toàn quyền hệ thống" }
            ,{ PermissionCodes.AlarmView, "Xem cảnh báo" }
            ,{ PermissionCodes.AlarmAcknowledge, "Xác nhận cảnh báo" }
            ,{ PermissionCodes.AlarmAssign, "Nhận xử lý cảnh báo" }
            ,{ PermissionCodes.AlarmAssignOthers, "Phân công cảnh báo cho người khác" }
            ,{ PermissionCodes.AlarmStartWork, "Bắt đầu xử lý cảnh báo" }
            ,{ PermissionCodes.AlarmRetryDevice, "Yêu cầu thử lại thiết bị" }
            ,{ PermissionCodes.AlarmRetryJob, "Yêu cầu thử lại bước công việc" }
            ,{ PermissionCodes.AlarmClear, "Xóa cảnh báo thủ công" }
            ,{ PermissionCodes.AlarmClose, "Đóng cảnh báo" }
            ,{ PermissionCodes.AlarmSuppress, "Tạm ẩn cảnh báo" }
            ,{ PermissionCodes.AlarmEscalate, "Chuyển cấp cảnh báo" }
            ,{ PermissionCodes.AlarmVisionBypass, "Bỏ qua kiểm tra vision có kiểm soát" }
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


        var rolePermissions = new Dictionary<string, string[]>
        {
            ["OPERATOR"] = [PermissionCodes.AlarmView, PermissionCodes.AlarmAcknowledge,
                PermissionCodes.AlarmAssign, PermissionCodes.AlarmStartWork,
                PermissionCodes.AlarmRetryDevice, PermissionCodes.AlarmRetryJob],
            ["SUPERVISOR"] = [PermissionCodes.AlarmView, PermissionCodes.AlarmAcknowledge,
                PermissionCodes.AlarmAssign, PermissionCodes.AlarmAssignOthers, PermissionCodes.AlarmStartWork,
                PermissionCodes.AlarmRetryDevice, PermissionCodes.AlarmRetryJob, PermissionCodes.AlarmClear,
                PermissionCodes.AlarmClose, PermissionCodes.AlarmSuppress, PermissionCodes.AlarmEscalate,
                PermissionCodes.AlarmVisionBypass],
            ["MAINTENANCE"] = [PermissionCodes.AlarmView, PermissionCodes.AlarmAcknowledge,
                PermissionCodes.AlarmAssign, PermissionCodes.AlarmAssignOthers, PermissionCodes.AlarmStartWork,
                PermissionCodes.AlarmRetryDevice, PermissionCodes.AlarmRetryJob, PermissionCodes.AlarmClear,
                PermissionCodes.AlarmClose, PermissionCodes.AlarmSuppress, PermissionCodes.AlarmEscalate]
        };
        foreach (var mapping in rolePermissions)
        {
            var role = await context.Roles.FirstAsync(r => r.RoleCode == mapping.Key);
            foreach (var code in mapping.Value)
            {
                var permissionId = permMap[code];
                if (!await context.RolePermissions.AnyAsync(x => x.RoleId == role.Id && x.PermissionId == permissionId))
                    await context.RolePermissions.AddAsync(KioskRolePermission.Create(role.Id, permissionId));
            }
        }

        await context.SaveChangesAsync();

        // 4. Default admin123 user
        var adminUser = await context.Users.FirstOrDefaultAsync(u => u.Username == "admin123");
        if (adminUser == null)
        {
            adminUser = KioskUser.Create("admin123", "Quản trị hệ thống", BCrypt.Net.BCrypt.HashPassword("admin123"));
            await context.Users.AddAsync(adminUser);
            await context.SaveChangesAsync();

            // Assign SUPER_ADMIN role to admin123
            await context.UserRoles.AddAsync(KioskUserRole.Create(adminUser.Id, adminRole.Id, "system"));
            await context.SaveChangesAsync();
        }


        if (seedAlarmDemoUsers && !string.IsNullOrWhiteSpace(seedPassword))
        {
            var users = new[]
            {
                ("operator.seed", "Nhân viên vận hành mẫu", "OPERATOR"),
                ("supervisor.seed", "Giám sát mẫu", "SUPERVISOR"),
                ("maintenance.seed", "Bảo trì mẫu", "MAINTENANCE"),
                ("admin.seed", "Quản trị mẫu", "SUPER_ADMIN")
            };
            foreach (var (username, fullName, roleCode) in users)
            {
                var user = await context.Users.FirstOrDefaultAsync(x => x.Username == username);
                if (user is null)
                {
                    user = KioskUser.Create(username, fullName, BCrypt.Net.BCrypt.HashPassword(seedPassword));
                    await context.Users.AddAsync(user);
                    await context.SaveChangesAsync();
                }
                var role = await context.Roles.FirstAsync(x => x.RoleCode == roleCode);
                if (!await context.UserRoles.AnyAsync(x => x.UserId == user.Id && x.RoleId == role.Id))
                    await context.UserRoles.AddAsync(KioskUserRole.Create(user.Id, role.Id, "alarm-seed"));
            }
            await context.SaveChangesAsync();
        }
    }
}
