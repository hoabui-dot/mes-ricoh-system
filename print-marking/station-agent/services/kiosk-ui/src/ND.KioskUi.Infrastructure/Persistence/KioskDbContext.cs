using Microsoft.EntityFrameworkCore;
using ND.KioskUi.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.KioskUi.Infrastructure.Persistence;

public sealed class KioskDbContext : DbContext, IUnitOfWork
{
    public KioskDbContext(DbContextOptions<KioskDbContext> options) : base(options) { }

    public DbSet<KioskUser> Users => Set<KioskUser>();
    public DbSet<KioskRole> Roles => Set<KioskRole>();
    public DbSet<KioskPermission> Permissions => Set<KioskPermission>();
    public DbSet<KioskUserRole> UserRoles => Set<KioskUserRole>();
    public DbSet<KioskRolePermission> RolePermissions => Set<KioskRolePermission>();
    public DbSet<KioskUserPermission> UserPermissions => Set<KioskUserPermission>();
    public DbSet<KioskSession> Sessions => Set<KioskSession>();
    public DbSet<KioskAccessLog> AccessLogs => Set<KioskAccessLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<KioskUser>(e =>
        {
            e.ToTable("kiosk_users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Username).HasColumnName("username").IsRequired();
            e.HasIndex(x => x.Username).IsUnique();
            e.Property(x => x.FullName).HasColumnName("full_name").IsRequired();
            e.Property(x => x.PasswordHash).HasColumnName("password_hash").IsRequired();
            e.Property(x => x.IsActive).HasColumnName("is_active");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        });

        modelBuilder.Entity<KioskRole>(e =>
        {
            e.ToTable("kiosk_roles");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.RoleCode).HasColumnName("role_code").IsRequired();
            e.HasIndex(x => x.RoleCode).IsUnique();
            e.Property(x => x.DisplayName).HasColumnName("display_name").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<KioskPermission>(e =>
        {
            e.ToTable("kiosk_permissions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PermissionCode).HasColumnName("permission_code").IsRequired();
            e.HasIndex(x => x.PermissionCode).IsUnique();
            e.Property(x => x.Description).HasColumnName("description").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<KioskUserRole>(e =>
        {
            e.ToTable("kiosk_user_roles");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
            e.Property(x => x.RoleId).HasColumnName("role_id").IsRequired();
            e.Property(x => x.AssignedAt).HasColumnName("assigned_at").IsRequired();
            e.Property(x => x.AssignedBy).HasColumnName("assigned_by").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<KioskRolePermission>(e =>
        {
            e.ToTable("kiosk_role_permissions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.RoleId).HasColumnName("role_id").IsRequired();
            e.Property(x => x.PermissionId).HasColumnName("permission_id").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<KioskUserPermission>(e =>
        {
            e.ToTable("kiosk_user_permissions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
            e.Property(x => x.PermissionId).HasColumnName("permission_id").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.HasIndex(x => new { x.UserId, x.PermissionId }).IsUnique();
        });

        modelBuilder.Entity<KioskSession>(e =>
        {
            e.ToTable("kiosk_sessions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
            e.Property(x => x.Token).HasColumnName("token").IsRequired();
            e.HasIndex(x => x.Token).IsUnique();
            e.Property(x => x.IpAddress).HasColumnName("ip_address").IsRequired();
            e.Property(x => x.UserAgent).HasColumnName("user_agent").IsRequired();
            e.Property(x => x.LoginAt).HasColumnName("login_at").IsRequired();
            e.Property(x => x.ExpiresAt).HasColumnName("expires_at").IsRequired();
            e.Property(x => x.LogoutAt).HasColumnName("logout_at");
            e.Property(x => x.IsActive).HasColumnName("is_active");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<KioskAccessLog>(e =>
        {
            e.ToTable("kiosk_access_logs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
            e.Property(x => x.SessionId).HasColumnName("session_id").IsRequired();
            e.Property(x => x.ActionName).HasColumnName("action_name").IsRequired();
            e.Property(x => x.TargetType).HasColumnName("target_type").IsRequired();
            e.Property(x => x.TargetId).HasColumnName("target_id").IsRequired();
            e.Property(x => x.Result).HasColumnName("result").IsRequired();
            e.Property(x => x.DetailJson).HasColumnName("detail_json");
            e.Property(x => x.PerformedAt).HasColumnName("performed_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });
    }
}
