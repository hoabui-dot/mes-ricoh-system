using System.Text;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using ND.Infrastructure.Observability;
using ND.Infrastructure.Messaging;
using ND.UnifiedContracts.Events;
using ND.KioskUi.Api.Hubs;
using ND.KioskUi.Application.Commands;
using ND.KioskUi.Domain.Entities;
using ND.KioskUi.Infrastructure.DependencyInjection;
using ND.KioskUi.Application.Options;
using ND.KioskUi.Infrastructure.Persistence;
using Serilog;
using Yarp.ReverseProxy.Configuration;

var builder = WebApplication.CreateBuilder(args);

Log.Logger = SerilogConfiguration.Configure(
    new LoggerConfiguration(), builder.Configuration, "kiosk-ui").CreateLogger();
builder.Host.UseSerilog();

// Infrastructure
builder.Services.AddKioskInfrastructure(builder.Configuration);

// JWT Auth
var jwtSection = builder.Configuration.GetSection(JwtOptions.SectionName);
var jwtSecret = jwtSection["Secret"] ?? "change_me_to_a_long_random_secret_at_least_32_chars";
var jwtIssuer = jwtSection["Issuer"] ?? "nd-station-agent";
var jwtAudience = jwtSection["Audience"] ?? "nd-kiosk";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts =>
    {
        opts.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
        // Allow JWT from query string for SignalR connections
        opts.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                    context.Token = accessToken;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// SignalR
builder.Services.AddSignalR();

// CORS for React frontend
var corsOriginsEnv = Environment.GetEnvironmentVariable("CORS_ORIGINS") ?? builder.Configuration["CorsOrigins"];
var origins = string.IsNullOrEmpty(corsOriginsEnv)
    ? new[] { "http://localhost:5222", "http://localhost:3000" }
    : corsOriginsEnv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(opts =>
    opts.AddDefaultPolicy(policy =>
        policy.WithOrigins(origins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

// Reverse Proxy to Projection Service
var projectionServiceUrl = Environment.GetEnvironmentVariable("PROJECTION_SERVICE_URL") ?? "http://localhost:5009";
builder.Services.AddReverseProxy()
    .LoadFromMemory(
        new[]
        {
            new RouteConfig
            {
                RouteId = "projection-api",
                ClusterId = "projection-cluster",
                Match = new RouteMatch { Path = "/api/projection/{**catch-all}" }
            },
            new RouteConfig
            {
                RouteId = "projection-hub",
                ClusterId = "projection-cluster",
                Match = new RouteMatch { Path = "/hubs/production/{**catch-all}" }
            }
        },
        new[]
        {
            new ClusterConfig
            {
                ClusterId = "projection-cluster",
                Destinations = new Dictionary<string, DestinationConfig>(StringComparer.OrdinalIgnoreCase)
                {
                    { "destination1", new DestinationConfig { Address = projectionServiceUrl } }
                }
            }
        });

var app = builder.Build();

async Task MigratePermissionsAsync(KioskDbContext db)
{
    try
    {
        // 1. Ensure JOB_REPROCESS exists
        var reprocessPerm = await db.Permissions.FirstOrDefaultAsync(p => p.PermissionCode == "JOB_REPROCESS");
        if (reprocessPerm == null)
        {
            reprocessPerm = KioskPermission.Create("JOB_REPROCESS", "Làm lại / Xử lý lại sản phẩm");
            await db.Permissions.AddAsync(reprocessPerm);
            await db.SaveChangesAsync();
        }

        // 2. Identify target permission codes to migrate
        var oldPermCodes = new[] { "JOB_REPRINT", "JOB_RELASER", "JOB_RETRY" };
        var oldPerms = await db.Permissions.Where(p => oldPermCodes.Contains(p.PermissionCode)).ToListAsync();
        var oldPermIds = oldPerms.Select(p => p.Id).ToList();

        var removePermCodes = new[] { "JOB_FORCE_PASS", "JOB_FORCE_COMPLETE" };
        var removePerms = await db.Permissions.Where(p => removePermCodes.Contains(p.PermissionCode)).ToListAsync();
        var removePermIds = removePerms.Select(p => p.Id).ToList();

        if (oldPermIds.Any())
        {
            // Map User Permissions: if a user had any of the old permissions, give them JOB_REPROCESS
            var userPermsToMigrate = await db.UserPermissions
                .Where(up => oldPermIds.Contains(up.PermissionId))
                .ToListAsync();

            var userIdsWithOldPerms = userPermsToMigrate.Select(up => up.UserId).Distinct().ToList();
            foreach (var userId in userIdsWithOldPerms)
            {
                var alreadyHasNew = await db.UserPermissions.AnyAsync(up => up.UserId == userId && up.PermissionId == reprocessPerm.Id);
                if (!alreadyHasNew)
                {
                    await db.UserPermissions.AddAsync(KioskUserPermission.Create(userId, reprocessPerm.Id));
                }
            }

            // Map Role Permissions: if a role had any of the old permissions, give it JOB_REPROCESS
            var rolePermsToMigrate = await db.RolePermissions
                .Where(rp => oldPermIds.Contains(rp.PermissionId))
                .ToListAsync();

            var roleIdsWithOldPerms = rolePermsToMigrate.Select(rp => rp.RoleId).Distinct().ToList();
            foreach (var roleId in roleIdsWithOldPerms)
            {
                var alreadyHasNew = await db.RolePermissions.AnyAsync(rp => rp.RoleId == roleId && rp.PermissionId == reprocessPerm.Id);
                if (!alreadyHasNew)
                {
                    await db.RolePermissions.AddAsync(KioskRolePermission.Create(roleId, reprocessPerm.Id));
                }
            }

            await db.SaveChangesAsync();

            // Clean up old user permissions
            var userPermsToDelete = await db.UserPermissions
                .Where(up => oldPermIds.Contains(up.PermissionId) || removePermIds.Contains(up.PermissionId))
                .ToListAsync();
            db.UserPermissions.RemoveRange(userPermsToDelete);

            // Clean up old role permissions
            var rolePermsToDelete = await db.RolePermissions
                .Where(rp => oldPermIds.Contains(rp.PermissionId) || removePermIds.Contains(rp.PermissionId))
                .ToListAsync();
            db.RolePermissions.RemoveRange(rolePermsToDelete);

            await db.SaveChangesAsync();

            // Delete old permissions
            db.Permissions.RemoveRange(oldPerms);
        }

        if (removePerms.Any())
        {
            var userPermsToRemove = await db.UserPermissions.Where(up => removePermIds.Contains(up.PermissionId)).ToListAsync();
            db.UserPermissions.RemoveRange(userPermsToRemove);

            var rolePermsToRemove = await db.RolePermissions.Where(rp => removePermIds.Contains(rp.PermissionId)).ToListAsync();
            db.RolePermissions.RemoveRange(rolePermsToRemove);

            db.Permissions.RemoveRange(removePerms);
        }

        await db.SaveChangesAsync();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error running permission migration: {ex.Message}");
    }
}

async Task WriteAuditLogAsync(
    KioskDbContext db,
    string userId,
    string sessionId,
    string actionType,
    string targetEntity,
    string targetEntityId,
    string result,
    string reason,
    string oldValue = "",
    string newValue = "",
    string correlationId = "")
{
    try
    {
        var user = await db.Users.FindAsync(userId);
        var username = user?.Username ?? "unknown";
        var timestamp = DateTime.UtcNow.ToString("o");
        
        if (string.IsNullOrEmpty(correlationId))
        {
            correlationId = Guid.NewGuid().ToString();
        }

        var auditDetail = new
        {
            Timestamp = timestamp,
            UserId = userId,
            Username = username,
            ActionType = actionType,
            TargetEntity = targetEntity,
            TargetEntityId = targetEntityId,
            Reason = reason,
            OldValue = oldValue,
            NewValue = newValue,
            Result = result,
            CorrelationId = correlationId
        };

        var accessLog = KioskAccessLog.Create(
            userId,
            sessionId,
            actionType,
            targetEntity,
            targetEntityId,
            result,
            detailJson: System.Text.Json.JsonSerializer.Serialize(auditDetail));

        await db.AccessLogs.AddAsync(accessLog);
        await db.SaveChangesAsync();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error writing audit log: {ex.Message}");
    }
}

if (System.Linq.Enumerable.Contains(args, "--seed-only"))
{
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<KioskDbContext>();
        var kioskDbPath = app.Configuration["SQLITE_KIOSK_PATH"] ?? "data/kiosk.db";
        var kioskDbDir = Path.GetDirectoryName(Path.GetFullPath(kioskDbPath));
        if (!string.IsNullOrEmpty(kioskDbDir)) Directory.CreateDirectory(kioskDbDir);
        await db.Database.EnsureCreatedAsync();
        await KioskDbSeeder.SeedAsync(db);
        await MigratePermissionsAsync(db);
    }
    Console.WriteLine("Database initialized and seeded successfully.");
    return;
}

// Ensure DB on startup with seed data
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<KioskDbContext>();
    var kioskDbPath = app.Configuration["SQLITE_KIOSK_PATH"] ?? "data/kiosk.db";
    var kioskDbDir = Path.GetDirectoryName(Path.GetFullPath(kioskDbPath));
    if (!string.IsNullOrEmpty(kioskDbDir)) Directory.CreateDirectory(kioskDbDir);
    await db.Database.EnsureCreatedAsync();
    await KioskDbSeeder.SeedAsync(db);
    await MigratePermissionsAsync(db);
}

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapReverseProxy();

// Endpoints
app.MapPost("/api/auth/login", async (
    LoginCommand command,
    LoginHandler handler,
    HttpContext httpContext,
    CancellationToken ct) =>
{
    var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    var ua = httpContext.Request.Headers.UserAgent.ToString();
    var result = await handler.HandleAsync(command with { IpAddress = ip, UserAgent = ua }, ct);
    return result is null
        ? Results.Unauthorized()
        : Results.Ok(result);
});

app.MapGet("/api/auth/me", async (
    HttpContext ctx,
    ND.KioskUi.Application.Interfaces.IKioskRbacRepository rbac,
    CancellationToken ct) =>
{
    var userId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    var username = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value;
    if (userId is null) return Results.Unauthorized();
    var permissions = await rbac.GetUserPermissionsAsync(userId, ct);
    var roles = await rbac.GetUserRolesAsync(userId, ct);
    return Results.Ok(new { userId, username, roles, permissions });
}).RequireAuthorization();

// ── RBAC Management Endpoints ──────────────────────────────────────────────
app.MapGet("/api/rbac/users", async (KioskDbContext db, HttpContext ctx, CancellationToken ct) =>
{
    var isSuper = ctx.User.HasClaim(c => c.Type == "permission" && c.Value == "SYSTEM_ADMIN");
    if (!isSuper) return Results.Forbid();

    var users = await db.Users.ToListAsync(ct);
    var result = new List<object>();
    foreach (var user in users)
    {
        var roleIds = await db.UserRoles.Where(ur => ur.UserId == user.Id).Select(ur => ur.RoleId).ToListAsync(ct);
        var roles = await db.Roles.Where(r => roleIds.Contains(r.Id)).Select(r => r.RoleCode).ToListAsync(ct);
        
        var directPermIds = await db.UserPermissions.Where(up => up.UserId == user.Id).Select(up => up.PermissionId).ToListAsync(ct);
        var directPermissions = await db.Permissions.Where(p => directPermIds.Contains(p.Id)).Select(p => p.PermissionCode).ToListAsync(ct);
        
        var rolePermIds = await db.RolePermissions.Where(rp => roleIds.Contains(rp.RoleId)).Select(rp => rp.PermissionId).ToListAsync(ct);
        var rolePermissions = await db.Permissions.Where(p => rolePermIds.Contains(p.Id)).Select(p => p.PermissionCode).ToListAsync(ct);
        
        var allPermissions = rolePermissions.Union(directPermissions).Distinct().ToList();

        result.Add(new
        {
            id = user.Id,
            username = user.Username,
            fullName = user.FullName,
            isActive = user.IsActive,
            updatedAt = user.UpdatedAt,
            roles,
            directPermissions,
            allPermissions
        });
    }
    return Results.Ok(result);
}).RequireAuthorization();

app.MapPost("/api/rbac/users", async (CreateUserRequest req, KioskDbContext db, HttpContext ctx, CancellationToken ct) =>
{
    var isSuper = ctx.User.HasClaim(c => c.Type == "permission" && c.Value == "SYSTEM_ADMIN");
    if (!isSuper) return Results.Forbid();

    if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password) || string.IsNullOrWhiteSpace(req.RoleCode))
        return Results.BadRequest(new { error = "Username, password and role are required" });

    var existing = await db.Users.AnyAsync(u => u.Username == req.Username, ct);
    if (existing) return Results.BadRequest(new { error = "Username already exists" });

    var role = await db.Roles.FirstOrDefaultAsync(r => r.RoleCode == req.RoleCode, ct);
    if (role is null) return Results.BadRequest(new { error = $"Role {req.RoleCode} does not exist" });

    var user = KioskUser.Create(req.Username, req.FullName, BCrypt.Net.BCrypt.HashPassword(req.Password));
    await db.Users.AddAsync(user, ct);
    await db.SaveChangesAsync(ct);

    var userRole = KioskUserRole.Create(user.Id, role.Id, "admin");
    await db.UserRoles.AddAsync(userRole, ct);
    await db.SaveChangesAsync(ct);

    // Audit user creation
    var adminId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    var authHeader = ctx.Request.Headers.Authorization.ToString();
    var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) 
        ? authHeader.Substring(7).Trim() 
        : "";
    var session = await db.Sessions.FirstOrDefaultAsync(s => s.Token == token && s.IsActive, ct);
    var sessionId = session?.Id ?? "none";

    await WriteAuditLogAsync(
        db,
        adminId ?? "system",
        sessionId,
        "USER_CREATED",
        "USER",
        user.Id,
        "SUCCESS",
        $"Tạo tài khoản mới: {user.Username} ({role.RoleCode})",
        oldValue: "",
        newValue: user.Username);

    return Results.Ok(new { id = user.Id, username = user.Username, fullName = user.FullName });
}).RequireAuthorization();

app.MapDelete("/api/rbac/users/{id}", async (string id, KioskDbContext db, HttpContext ctx, CancellationToken ct) =>
{
    var isSuper = ctx.User.HasClaim(c => c.Type == "permission" && c.Value == "SYSTEM_ADMIN");
    if (!isSuper) return Results.Forbid();

    var user = await db.Users.FindAsync([id], ct);
    if (user is null) return Results.NotFound();

    if (user.Username == "admin123")
        return Results.BadRequest(new { error = "Cannot delete the default super admin user" });

    var deletedUsername = user.Username;

    db.Users.Remove(user);
    var uroles = await db.UserRoles.Where(ur => ur.UserId == id).ToListAsync(ct);
    db.UserRoles.RemoveRange(uroles);
    var uperms = await db.UserPermissions.Where(up => up.UserId == id).ToListAsync(ct);
    db.UserPermissions.RemoveRange(uperms);

    await db.SaveChangesAsync(ct);

    // Audit user deletion
    var adminId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    var authHeader = ctx.Request.Headers.Authorization.ToString();
    var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) 
        ? authHeader.Substring(7).Trim() 
        : "";
    var session = await db.Sessions.FirstOrDefaultAsync(s => s.Token == token && s.IsActive, ct);
    var sessionId = session?.Id ?? "none";

    await WriteAuditLogAsync(
        db,
        adminId ?? "system",
        sessionId,
        "USER_DELETED",
        "USER",
        id,
        "SUCCESS",
        $"Xóa tài khoản: {deletedUsername}",
        oldValue: deletedUsername,
        newValue: "");

    return Results.Ok();
}).RequireAuthorization();

app.MapPost("/api/rbac/users/{userId}/toggle-active", async (string userId, KioskDbContext db, HttpContext ctx, CancellationToken ct) =>
{
    var isSuper = ctx.User.HasClaim(c => c.Type == "permission" && c.Value == "SYSTEM_ADMIN");
    if (!isSuper) return Results.Forbid();

    var user = await db.Users.FindAsync([userId], ct);
    if (user is null) return Results.NotFound();

    if (user.Username == "admin123")
        return Results.BadRequest(new { error = "Cannot modify the default super admin user" });

    var oldVal = user.IsActive ? "ACTIVE" : "DISABLED";
    if (user.IsActive)
    {
        user.Deactivate();
    }
    else
    {
        user.Activate();
    }
    await db.SaveChangesAsync(ct);

    var newVal = user.IsActive ? "ACTIVE" : "DISABLED";
    var action = user.IsActive ? "USER_ENABLED" : "USER_DISABLED";
    var desc = user.IsActive ? "Kích hoạt lại tài khoản" : "Vô hiệu hóa tài khoản";

    // Audit action
    var adminId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    var authHeader = ctx.Request.Headers.Authorization.ToString();
    var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) 
        ? authHeader.Substring(7).Trim() 
        : "";
    var session = await db.Sessions.FirstOrDefaultAsync(s => s.Token == token && s.IsActive, ct);
    var sessionId = session?.Id ?? "none";

    await WriteAuditLogAsync(
        db,
        adminId ?? "system",
        sessionId,
        action,
        "USER",
        userId,
        "SUCCESS",
        $"{desc}: {user.Username}",
        oldValue: oldVal,
        newValue: newVal);

    return Results.Ok(new { id = user.Id, username = user.Username, isActive = user.IsActive });
}).RequireAuthorization();

app.MapGet("/api/rbac/users/{userId}/audit-logs", async (string userId, KioskDbContext db, HttpContext ctx, CancellationToken ct) =>
{
    var isSuper = ctx.User.HasClaim(c => c.Type == "permission" && c.Value == "SYSTEM_ADMIN");
    if (!isSuper) return Results.Forbid();

    var logs = await db.AccessLogs
        .Where(l => l.UserId == userId || (l.TargetType == "USER" && l.TargetId == userId))
        .OrderByDescending(l => l.PerformedAt)
        .ToListAsync(ct);

    var result = logs.Select(l => {
        object? detail = null;
        if (!string.IsNullOrEmpty(l.DetailJson))
        {
            try
            {
                detail = System.Text.Json.JsonSerializer.Deserialize<object>(l.DetailJson);
            }
            catch {}
        }
        return new
        {
            id = l.Id,
            userId = l.UserId,
            actionName = l.ActionName,
            targetType = l.TargetType,
            targetId = l.TargetId,
            result = l.Result,
            performedAt = l.PerformedAt,
            detail
        };
    }).ToList();

    return Results.Ok(result);
}).RequireAuthorization();

app.MapPost("/api/rbac/users/{userId}/reset-password", async (
    string userId,
    ResetPasswordRequest req,
    KioskDbContext db,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var isSuper = ctx.User.HasClaim(c => c.Type == "permission" && c.Value == "SYSTEM_ADMIN");
    if (!isSuper) return Results.Forbid();

    var adminId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    if (adminId is null) return Results.Unauthorized();

    var authHeader = ctx.Request.Headers.Authorization.ToString();
    var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) 
        ? authHeader.Substring(7).Trim() 
        : "";
    var session = await db.Sessions.FirstOrDefaultAsync(s => s.Token == token && s.IsActive, ct);
    var sessionId = session?.Id ?? "none";

    if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 6)
    {
        return Results.BadRequest(new { error = "Mật khẩu phải dài từ 6 ký tự trở lên" });
    }

    var targetUser = await db.Users.FindAsync([userId], ct);
    if (targetUser is null) return Results.NotFound();

    var oldHash = targetUser.PasswordHash;
    var newHash = BCrypt.Net.BCrypt.HashPassword(req.Password);

    targetUser.UpdatePassword(newHash);
    await db.SaveChangesAsync(ct);

    // Write audit log
    await WriteAuditLogAsync(
        db,
        adminId,
        sessionId,
        "PASSWORD_RESET",
        "USER",
        userId,
        "SUCCESS",
        req.Reason ?? "Reset password by Admin",
        oldValue: oldHash,
        newValue: newHash);

    return Results.Ok();
}).RequireAuthorization();

app.MapGet("/api/rbac/permissions", async (KioskDbContext db, HttpContext ctx, CancellationToken ct) =>
{
    var isSuper = ctx.User.HasClaim(c => c.Type == "permission" && c.Value == "SYSTEM_ADMIN");
    if (!isSuper) return Results.Forbid();

    var perms = await db.Permissions.OrderBy(p => p.PermissionCode).ToListAsync(ct);
    return Results.Ok(perms.Select(p => new { code = p.PermissionCode, description = p.Description }));
}).RequireAuthorization();

app.MapPost("/api/rbac/users/{userId}/permissions", async (string userId, UpdateUserPermissionsRequest req, KioskDbContext db, HttpContext ctx, CancellationToken ct) =>
{
    var isSuper = ctx.User.HasClaim(c => c.Type == "permission" && c.Value == "SYSTEM_ADMIN");
    if (!isSuper) return Results.Forbid();

    var user = await db.Users.FindAsync([userId], ct);
    if (user is null) return Results.NotFound();

    var adminId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    var authHeader = ctx.Request.Headers.Authorization.ToString();
    var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) 
        ? authHeader.Substring(7).Trim() 
        : "";
    var session = await db.Sessions.FirstOrDefaultAsync(s => s.Token == token && s.IsActive, ct);
    var sessionId = session?.Id ?? "none";

    var existing = await db.UserPermissions.Where(up => up.UserId == userId).ToListAsync(ct);
    var existingPermIds = existing.Select(up => up.PermissionId).ToList();
    var existingPermCodes = await db.Permissions.Where(p => existingPermIds.Contains(p.Id)).Select(p => p.PermissionCode).ToListAsync(ct);
    var oldVal = string.Join(",", existingPermCodes);

    db.UserPermissions.RemoveRange(existing);
    await db.SaveChangesAsync(ct);

    if (req.PermissionCodes != null)
    {
        foreach (var code in req.PermissionCodes)
        {
            var perm = await db.Permissions.FirstOrDefaultAsync(p => p.PermissionCode == code, ct);
            if (perm != null)
            {
                var up = KioskUserPermission.Create(userId, perm.Id);
                await db.UserPermissions.AddAsync(up, ct);
            }
        }
        await db.SaveChangesAsync(ct);
    }

    var newVal = string.Join(",", req.PermissionCodes ?? new List<string>());

    await WriteAuditLogAsync(
        db,
        adminId ?? "system",
        sessionId,
        "UPDATE_PERMISSIONS",
        "USER",
        userId,
        "SUCCESS",
        "Thay đổi phân quyền người dùng",
        oldValue: oldVal,
        newValue: newVal);

    return Results.Ok();
}).RequireAuthorization();

app.MapGet("/api/access-logs", async (
    ND.KioskUi.Application.Interfaces.IKioskAccessLogRepository repo,
    CancellationToken ct) =>
{
    var logs = await repo.GetAllAsync(ct);
    return Results.Ok(logs);
}).RequireAuthorization();

// ── Job Engine proxy endpoints ──────────────────────────────────────────────
async Task<IResult> ProxyGetAsync(string relativePath, HttpContext ctx, CancellationToken ct)
{
    var userId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    if (userId is null) return Results.Unauthorized();
    
    var rbac = ctx.RequestServices.GetRequiredService<ND.KioskUi.Application.Interfaces.IKioskRbacRepository>();
    var permissions = await rbac.GetUserPermissionsAsync(userId, ct);
    var hasView = permissions.Contains("JOB_VIEW") || permissions.Contains("SYSTEM_ADMIN");
    if (!hasView) return Results.Forbid();

    var queryString = ctx.Request.QueryString.Value;
    var jobEngineHost = Environment.GetEnvironmentVariable("JOB_ENGINE_HOST") ?? builder.Configuration["JobEngine:Host"] ?? "localhost";
    var jobEnginePort = Environment.GetEnvironmentVariable("JOB_ENGINE_PORT") ?? builder.Configuration["JobEngine:Port"] ?? "5002";
    var targetUrl = $"http://{jobEngineHost}:{jobEnginePort}/{relativePath}{queryString}";

    try
    {
        using var httpClient = new HttpClient();
        var request = new HttpRequestMessage(HttpMethod.Get, targetUrl);
        var response = await httpClient.SendAsync(request, ct);
        var content = await response.Content.ReadAsStringAsync(ct);
        return Results.Content(content, response.Content.Headers.ContentType?.ToString() ?? "application/json", statusCode: (int)response.StatusCode);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: 502);
    }
}

app.MapGet("/api/jobs", async (HttpContext ctx, CancellationToken ct) => 
    await ProxyGetAsync("api/jobs", ctx, ct)).RequireAuthorization();

app.MapGet("/api/jobs/{*path}", async (string path, HttpContext ctx, CancellationToken ct) => 
    await ProxyGetAsync($"api/jobs/{path}", ctx, ct)).RequireAuthorization();

app.MapGet("/api/jobs/{id}/attempts", async (
    string id,
    HttpContext ctx,
    KioskDbContext db,
    CancellationToken ct) =>
{
    var userId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    if (userId is null) return Results.Unauthorized();
    
    var rbac = ctx.RequestServices.GetRequiredService<ND.KioskUi.Application.Interfaces.IKioskRbacRepository>();
    var permissions = await rbac.GetUserPermissionsAsync(userId, ct);
    var hasView = permissions.Contains("JOB_VIEW") || permissions.Contains("SYSTEM_ADMIN");
    if (!hasView) return Results.Forbid();

    var jobEngineHost = Environment.GetEnvironmentVariable("JOB_ENGINE_HOST") ?? builder.Configuration["JobEngine:Host"] ?? "localhost";
    var jobEnginePort = Environment.GetEnvironmentVariable("JOB_ENGINE_PORT") ?? builder.Configuration["JobEngine:Port"] ?? "5002";
    var targetUrl = $"http://{jobEngineHost}:{jobEnginePort}/api/jobs/{id}/attempts";

    try
    {
        using var httpClient = new HttpClient();
        var response = await httpClient.GetAsync(targetUrl, ct);
        if (!response.IsSuccessStatusCode)
        {
            return Results.StatusCode((int)response.StatusCode);
        }

        var content = await response.Content.ReadAsStringAsync(ct);
        var attempts = JsonSerializer.Deserialize<List<JsonObject>>(content, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        
        if (attempts != null)
        {
            var userDict = await db.Users.AsNoTracking()
                .ToDictionaryAsync(u => u.Id, u => u.Username, ct);

            foreach (var attempt in attempts)
            {
                if (attempt.TryGetPropertyValue("triggeredByUserId", out var node) && node != null)
                {
                    var triggerUserId = node.ToString();
                    if (userDict.TryGetValue(triggerUserId, out var username))
                    {
                        attempt["triggeredByUserId"] = username;
                    }
                }
            }
            
            return Results.Ok(attempts);
        }

        return Results.Content(content, "application/json");
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: 502);
    }
}).RequireAuthorization();

app.MapGet("/api/overwrite-requests", async (HttpContext ctx, CancellationToken ct) => 
    await ProxyGetAsync("api/overwrite-requests", ctx, ct)).RequireAuthorization();

app.MapGet("/api/overwrite-requests/{*path}", async (string path, HttpContext ctx, CancellationToken ct) => 
    await ProxyGetAsync($"api/overwrite-requests/{path}", ctx, ct)).RequireAuthorization();

app.MapPost("/api/overwrite-requests", async (
    HttpContext ctx,
    KioskDbContext db,
    ND.KioskUi.Application.Interfaces.IKioskRbacRepository rbac,
    CancellationToken ct) =>
{
    var userId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    if (userId is null) return Results.Unauthorized();

    // Resolve sessionId from active session of current user
    var authHeader = ctx.Request.Headers.Authorization.ToString();
    var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) 
        ? authHeader.Substring(7).Trim() 
        : "";
    var session = await db.Sessions.FirstOrDefaultAsync(s => s.Token == token && s.IsActive, ct);
    var sessionId = session?.Id ?? "none";

    // Read and parse JSON request body
    using var reader = new StreamReader(ctx.Request.Body);
    var body = await reader.ReadToEndAsync(ct);
    System.Text.Json.Nodes.JsonObject? reqData = null;
    try
    {
        reqData = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.Nodes.JsonObject>(body);
    }
    catch { }
    
    if (reqData is null) 
    {
        return Results.BadRequest(new { error = "Yêu cầu không hợp lệ" });
    }

    var jobId = reqData["jobId"]?.ToString() ?? reqData["JobId"]?.ToString();
    var overwriteType = reqData["overwriteType"]?.ToString() ?? reqData["OverwriteType"]?.ToString();
    var reason = reqData["reason"]?.ToString() ?? reqData["Reason"]?.ToString() ?? "";

    if (string.IsNullOrEmpty(jobId) || string.IsNullOrEmpty(overwriteType))
    {
        return Results.BadRequest(new { error = "Mã công việc và loại ghi đè là bắt buộc" });
    }
    // Map overwriteType to the required permission code
    string requiredPerm = "JOB_REPROCESS";

    var permissions = await rbac.GetUserPermissionsAsync(userId, ct);
    var hasPermission = permissions.Contains(requiredPerm) || permissions.Contains("SYSTEM_ADMIN");
    if (!hasPermission)
    {
        // Audit denied request
        await WriteAuditLogAsync(db, userId, sessionId, $"OVERWRITE_{overwriteType}", "JOB", jobId, "DENIED", "Từ chối: Không đủ quyền hạn");
        return Results.Forbid();
    }

    // Construct forward payload
    var commandPayload = new
    {
        jobId,
        overwriteType,
        reason,
        requestedBy = userId
    };

    var jobEngineHost = Environment.GetEnvironmentVariable("JOB_ENGINE_HOST") ?? builder.Configuration["JobEngine:Host"] ?? "localhost";
    var jobEnginePort = Environment.GetEnvironmentVariable("JOB_ENGINE_PORT") ?? builder.Configuration["JobEngine:Port"] ?? "5002";
    var targetUrl = $"http://{jobEngineHost}:{jobEnginePort}/api/overwrite-requests";
    try
    {
        using var httpClient = new HttpClient();
        var response = await httpClient.PostAsJsonAsync(targetUrl, commandPayload, ct);
        var content = await response.Content.ReadAsStringAsync(ct);
        
        var isSuccess = response.IsSuccessStatusCode;
        var auditResult = isSuccess ? "SUCCESS" : "FAILED";
        var auditMsg = isSuccess ? $"Lý do: {reason}" : $"Lỗi từ Job Engine: HTTP {response.StatusCode} - {content}";
        
        await WriteAuditLogAsync(db, userId, sessionId, $"OVERWRITE_{overwriteType}", "JOB", jobId, auditResult, auditMsg);

        return Results.Content(content, response.Content.Headers.ContentType?.ToString() ?? "application/json", statusCode: (int)response.StatusCode);
    }
    catch (Exception ex)
    {
        // Audit exception
        await WriteAuditLogAsync(db, userId, sessionId, $"OVERWRITE_{overwriteType}", "JOB", jobId, "FAILED", $"Lỗi kết nối Job Engine: {ex.Message}");
        return Results.Problem(ex.Message, statusCode: 502);
    }
}).RequireAuthorization();
app.MapPost("/api/commands/manual-override", async (
    HttpContext ctx,
    KioskDbContext db,
    ND.KioskUi.Application.Interfaces.IKioskRbacRepository rbac,
    IRabbitMqPublisher publisher,
    IConfiguration config,
    CancellationToken ct) =>
{
    var userId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    if (userId is null) return Results.Unauthorized();

    var authHeader = ctx.Request.Headers.Authorization.ToString();
    var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) 
        ? authHeader.Substring(7).Trim() 
        : "";
    var session = await db.Sessions.FirstOrDefaultAsync(s => s.Token == token && s.IsActive, ct);
    var sessionId = session?.Id ?? "none";

    using var reader = new StreamReader(ctx.Request.Body);
    var body = await reader.ReadToEndAsync(ct);
    System.Text.Json.Nodes.JsonObject? reqData = null;
    try
    {
        reqData = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.Nodes.JsonObject>(body);
    }
    catch { }
    
    if (reqData is null) 
    {
        return Results.BadRequest(new { error = "Yêu cầu không hợp lệ" });
    }

    var jobId = reqData["jobId"]?.ToString() ?? reqData["JobId"]?.ToString();
    var jobNo = reqData["jobNo"]?.ToString() ?? reqData["JobNo"]?.ToString() ?? reqData["workOrder"]?.ToString() ?? reqData["WorkOrder"]?.ToString();
    var productCode = reqData["productCode"]?.ToString() ?? reqData["ProductCode"]?.ToString() ?? "UNKNOWN";
    var parentAttemptId = reqData["parentAttemptId"]?.ToString() ?? reqData["ParentAttemptId"]?.ToString() ?? "none";
    var reasonCode = reqData["reasonCode"]?.ToString() ?? reqData["ReasonCode"]?.ToString() ?? "OTHER";
    var reasonDescription = reqData["reasonDescription"]?.ToString() ?? reqData["ReasonDescription"]?.ToString() ?? "";
    var overrideType = reqData["overrideType"]?.ToString() ?? reqData["OverrideType"]?.ToString() ?? "REPROCESS";

    if (string.IsNullOrEmpty(jobId) || string.IsNullOrEmpty(jobNo))
    {
        return Results.BadRequest(new { error = "Mã công việc và số WO là bắt buộc" });
    }

    // All manual overrides (reprint, relaser, reprocess) require JOB_REPROCESS
    string requiredPerm = "JOB_REPROCESS";

    var permissions = await rbac.GetUserPermissionsAsync(userId, ct);
    var hasPermission = permissions.Contains(requiredPerm) || permissions.Contains("SYSTEM_ADMIN");
    if (!hasPermission)
    {
        await WriteAuditLogAsync(db, userId, sessionId, $"MANUAL_OVERRIDE_{overrideType}", "JOB", jobId, "DENIED", $"Từ chối: Không đủ quyền hạn ({requiredPerm})");
        return Results.Forbid();
    }

    var stationId = config["STATION_ID"] ?? "STATION-01";
    string routingKey;
    string eventJson;
    string eventId;

    if (overrideType.Equals("REPRINT", StringComparison.OrdinalIgnoreCase))
    {
        var evt = ManualReprintRequestedEvent.Create(
            stationId: stationId,
            jobId: jobId,
            jobNo: jobNo,
            productCode: productCode,
            parentAttemptId: parentAttemptId,
            requestedBy: userId,
            reasonCode: reasonCode,
            reasonDescription: reasonDescription);
        
        eventId = evt.EventId;
        routingKey = JobEventRoutingKeys.ManualReprint;
        eventJson = System.Text.Json.JsonSerializer.Serialize(evt);
    }
    else if (overrideType.Equals("RELASER", StringComparison.OrdinalIgnoreCase))
    {
        var evt = ManualRemarkingRequestedEvent.Create(
            stationId: stationId,
            jobId: jobId,
            jobNo: jobNo,
            productCode: productCode,
            parentAttemptId: parentAttemptId,
            requestedBy: userId,
            reasonCode: reasonCode,
            reasonDescription: reasonDescription);

        eventId = evt.EventId;
        routingKey = JobEventRoutingKeys.ManualRemarking;
        eventJson = System.Text.Json.JsonSerializer.Serialize(evt);
    }
    else
    {
        var evt = ManualReprocessingRequestedEvent.Create(
            stationId: stationId,
            jobId: jobId,
            jobNo: jobNo,
            productCode: productCode,
            parentAttemptId: parentAttemptId,
            requestedBy: userId,
            reasonCode: reasonCode,
            reasonDescription: reasonDescription);

        eventId = evt.EventId;
        routingKey = JobEventRoutingKeys.ManualReprocess;
        eventJson = System.Text.Json.JsonSerializer.Serialize(evt);
    }
    
    try
    {
        await publisher.PublishAsync(
            exchange: "station.events",
            routingKey: routingKey,
            messageJson: eventJson,
            cancellationToken: ct);

        await WriteAuditLogAsync(db, userId, sessionId, $"MANUAL_OVERRIDE_{overrideType}", "JOB", jobId, "SUCCESS", $"Đã gửi yêu cầu ({overrideType}). Lý do: [{reasonCode}] {reasonDescription}");

        return Results.Ok(new { success = true, eventId = eventId });
    }
    catch (Exception ex)
    {
        await WriteAuditLogAsync(db, userId, sessionId, $"MANUAL_OVERRIDE_{overrideType}", "JOB", jobId, "FAILED", $"Lỗi gửi RabbitMQ: {ex.Message}");

        return Results.Problem(ex.Message, statusCode: 502);
    }
}).RequireAuthorization();

// ── Dispatch Order command ──────────────────────────────────────────────────
// Triggered by the Dispatch Dialog in the frontend. Takes a production order
// and a dispatchTarget ("simulation" | "production-printer"), fetches queued
// jobs for that order from the job engine, then triggers each one.
app.MapPost("/api/commands/dispatch-order", async (
    HttpContext ctx,
    KioskDbContext db,
    ND.KioskUi.Application.Interfaces.IKioskRbacRepository rbac,
    IConfiguration config,
    ILogger<Program> logger,
    CancellationToken ct) =>
{
    var userId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    if (userId is null) return Results.Unauthorized();

    var permissions = await rbac.GetUserPermissionsAsync(userId, ct);
    var hasPermission = permissions.Contains("JOB_CREATE") || permissions.Contains("JOB_REPROCESS") || permissions.Contains("SYSTEM_ADMIN");
    if (!hasPermission) return Results.Forbid();

    using var reader = new StreamReader(ctx.Request.Body);
    var body = await reader.ReadToEndAsync(ct);
    System.Text.Json.Nodes.JsonObject? reqData = null;
    try { reqData = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.Nodes.JsonObject>(body); }
    catch { }

    if (reqData is null) return Results.BadRequest(new { error = "Invalid request body" });

    var orderNo = reqData["orderNo"]?.ToString();
    var dispatchTarget = reqData["dispatchTarget"]?.ToString() ?? "simulation";
    var notes = reqData["notes"]?.ToString() ?? "";

    if (string.IsNullOrEmpty(orderNo))
        return Results.BadRequest(new { error = "orderNo is required" });

    var jobEngineHost = Environment.GetEnvironmentVariable("JOB_ENGINE_HOST") ?? config["JobEngine:Host"] ?? "localhost";
    var jobEnginePort = Environment.GetEnvironmentVariable("JOB_ENGINE_PORT") ?? config["JobEngine:Port"] ?? "5002";

    try
    {
        using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

        // 1. Fetch queued jobs for this order from the job engine
        var listUrl = $"http://{jobEngineHost}:{jobEnginePort}/api/jobs?jobNo={Uri.EscapeDataString(orderNo)}&status=QUEUED&pageSize=100";
        var listResponse = await httpClient.GetAsync(listUrl, ct);

        if (!listResponse.IsSuccessStatusCode)
        {
            logger.LogWarning("Could not fetch jobs for order {OrderNo}: {Status}", orderNo, listResponse.StatusCode);
            return Results.Problem($"Could not fetch jobs from job engine (HTTP {(int)listResponse.StatusCode})", statusCode: 502);
        }

        var listContent = await listResponse.Content.ReadAsStringAsync(ct);
        var jobsDoc = System.Text.Json.JsonDocument.Parse(listContent);

        // Support both array root and { items: [...] } structure
        System.Text.Json.JsonElement[] jobs;
        if (jobsDoc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
            jobs = jobsDoc.RootElement.EnumerateArray().ToArray();
        else if (jobsDoc.RootElement.TryGetProperty("items", out var items))
            jobs = items.EnumerateArray().ToArray();
        else
            jobs = [];

        // 2. Trigger each queued job with the chosen dispatchTarget
        var dispatched = 0;
        var dispatchBody = System.Text.Json.JsonSerializer.Serialize(new { dispatchTarget, notes });
        var dispatchContent = new StringContent(dispatchBody, System.Text.Encoding.UTF8, "application/json");

        foreach (var job in jobs)
        {
            if (!job.TryGetProperty("id", out var idProp)) continue;
            var jobId = idProp.GetString();
            if (string.IsNullOrEmpty(jobId)) continue;

            try
            {
                var processUrl = $"http://{jobEngineHost}:{jobEnginePort}/api/jobs/{jobId}/process";
                var processContent = new StringContent(dispatchBody, System.Text.Encoding.UTF8, "application/json");
                var processResp = await httpClient.PostAsync(processUrl, processContent, ct);
                if (processResp.IsSuccessStatusCode) dispatched++;
                else logger.LogWarning("Failed to process job {JobId}: {Status}", jobId, processResp.StatusCode);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error dispatching job {JobId}", jobId);
            }
        }

        logger.LogInformation("Dispatched {Count}/{Total} jobs for order {OrderNo} to {Target}",
            dispatched, jobs.Length, orderNo, dispatchTarget);

        return Results.Ok(new
        {
            success = true,
            orderNo,
            dispatchTarget,
            dispatched,
            total = jobs.Length
        });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error in dispatch-order for {OrderNo}", orderNo);
        return Results.Problem(ex.Message, statusCode: 502);
    }
}).RequireAuthorization();

// ── Printer Adapter proxy endpoints ──────────────────────────────────────────
async Task<IResult> ProxyPrinterAdapterGetAsync(string relativePath, HttpContext ctx, CancellationToken ct)
{
    var userId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    if (userId is null) return Results.Unauthorized();

    var printerHost = Environment.GetEnvironmentVariable("PRINTER_ADAPTER_HOST") ?? builder.Configuration["PrinterAdapter:Host"] ?? "localhost";
    var printerPort = Environment.GetEnvironmentVariable("PRINTER_ADAPTER_PORT") ?? builder.Configuration["PrinterAdapter:Port"] ?? "5004";
    var targetUrl = $"http://{printerHost}:{printerPort}/{relativePath}{ctx.Request.QueryString.Value}";

    try
    {
        using var httpClient = new HttpClient();
        var request = new HttpRequestMessage(HttpMethod.Get, targetUrl);
        var response = await httpClient.SendAsync(request, ct);
        
        var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/json";
        if (contentType.Contains("application/json") || contentType.Contains("text/"))
        {
            var content = await response.Content.ReadAsStringAsync(ct);
            return Results.Content(content, contentType, statusCode: (int)response.StatusCode);
        }
        else
        {
            var bytes = await response.Content.ReadAsByteArrayAsync(ct);
            return Results.File(bytes, contentType);
        }
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: 502);
    }
}

async Task<IResult> ProxyPrinterAdapterPostAsync(string relativePath, HttpContext ctx, CancellationToken ct)
{
    var userId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    if (userId is null) return Results.Unauthorized();

    var printerHost = Environment.GetEnvironmentVariable("PRINTER_ADAPTER_HOST") ?? builder.Configuration["PrinterAdapter:Host"] ?? "localhost";
    var printerPort = Environment.GetEnvironmentVariable("PRINTER_ADAPTER_PORT") ?? builder.Configuration["PrinterAdapter:Port"] ?? "5004";
    var targetUrl = $"http://{printerHost}:{printerPort}/{relativePath}";

    try
    {
        using var httpClient = new HttpClient();
        var request = new HttpRequestMessage(HttpMethod.Post, targetUrl);
        
        ctx.Request.EnableBuffering();
        using var reader = new StreamReader(ctx.Request.Body, System.Text.Encoding.UTF8, true, 1024, true);
        var bodyStr = await reader.ReadToEndAsync(ct);
        ctx.Request.Body.Position = 0;
        
        request.Content = new StringContent(bodyStr, System.Text.Encoding.UTF8, "application/json");
        
        var response = await httpClient.SendAsync(request, ct);
        var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/json";
        if (contentType.Contains("image/") || contentType.Contains("application/octet-stream"))
        {
            var bytes = await response.Content.ReadAsByteArrayAsync(ct);
            return Results.File(bytes, contentType);
        }
        
        var content = await response.Content.ReadAsStringAsync(ct);
        return Results.Content(content, contentType, statusCode: (int)response.StatusCode);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: 502);
    }
}

async Task<IResult> ProxyPrinterAdapterPutAsync(string relativePath, HttpContext ctx, CancellationToken ct)
{
    var userId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    if (userId is null) return Results.Unauthorized();

    var printerHost = Environment.GetEnvironmentVariable("PRINTER_ADAPTER_HOST") ?? builder.Configuration["PrinterAdapter:Host"] ?? "localhost";
    var printerPort = Environment.GetEnvironmentVariable("PRINTER_ADAPTER_PORT") ?? builder.Configuration["PrinterAdapter:Port"] ?? "5004";
    var targetUrl = $"http://{printerHost}:{printerPort}/{relativePath}";

    try
    {
        using var httpClient = new HttpClient();
        var request = new HttpRequestMessage(HttpMethod.Put, targetUrl);
        
        ctx.Request.EnableBuffering();
        using var reader = new StreamReader(ctx.Request.Body, System.Text.Encoding.UTF8, true, 1024, true);
        var bodyStr = await reader.ReadToEndAsync(ct);
        ctx.Request.Body.Position = 0;
        
        request.Content = new StringContent(bodyStr, System.Text.Encoding.UTF8, "application/json");
        
        var response = await httpClient.SendAsync(request, ct);
        var content = await response.Content.ReadAsStringAsync(ct);
        return Results.Content(content, response.Content.Headers.ContentType?.ToString() ?? "application/json", statusCode: (int)response.StatusCode);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: 502);
    }
}

async Task<IResult> ProxyPrinterAdapterDeleteAsync(string relativePath, HttpContext ctx, CancellationToken ct)
{
    var userId = ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    if (userId is null) return Results.Unauthorized();

    var printerHost = Environment.GetEnvironmentVariable("PRINTER_ADAPTER_HOST") ?? builder.Configuration["PrinterAdapter:Host"] ?? "localhost";
    var printerPort = Environment.GetEnvironmentVariable("PRINTER_ADAPTER_PORT") ?? builder.Configuration["PrinterAdapter:Port"] ?? "5004";
    var targetUrl = $"http://{printerHost}:{printerPort}/{relativePath}";

    try
    {
        using var httpClient = new HttpClient();
        var request = new HttpRequestMessage(HttpMethod.Delete, targetUrl);
        var response = await httpClient.SendAsync(request, ct);
        var content = await response.Content.ReadAsStringAsync(ct);
        return Results.Content(content, response.Content.Headers.ContentType?.ToString() ?? "application/json", statusCode: (int)response.StatusCode);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: 502);
    }
}

app.MapGet("/api/label-templates", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync("api/label-templates", ctx, ct)).RequireAuthorization();

app.MapGet("/api/label-templates/default", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync("api/label-templates/default", ctx, ct)).RequireAuthorization();

app.MapGet("/api/label-templates/active", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync("api/label-templates/active", ctx, ct)).RequireAuthorization();

app.MapPost("/api/label-templates/preview", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync("api/label-templates/preview", ctx, ct)).RequireAuthorization();

app.MapPost("/api/label-templates/render", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync("api/label-templates/render", ctx, ct)).RequireAuthorization();

app.MapPost("/api/label-templates", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync("api/label-templates", ctx, ct)).RequireAuthorization();

app.MapGet("/api/label-templates/{id}", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync($"api/label-templates/{id}", ctx, ct)).RequireAuthorization();

app.MapPut("/api/label-templates/{id}", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPutAsync($"api/label-templates/{id}", ctx, ct)).RequireAuthorization();

app.MapDelete("/api/label-templates/{id}", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterDeleteAsync($"api/label-templates/{id}", ctx, ct)).RequireAuthorization();

app.MapPost("/api/label-templates/{id}/duplicate", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync($"api/label-templates/{id}/duplicate", ctx, ct)).RequireAuthorization();

app.MapPost("/api/label-templates/{id}/publish", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync($"api/label-templates/{id}/publish", ctx, ct)).RequireAuthorization();

app.MapPost("/api/label-templates/{id}/archive", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync($"api/label-templates/{id}/archive", ctx, ct)).RequireAuthorization();

app.MapPost("/api/label-templates/{id}/set-default", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync($"api/label-templates/{id}/set-default", ctx, ct)).RequireAuthorization();

app.MapGet("/api/label-templates/{id}/export", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync($"api/label-templates/{id}/export", ctx, ct)).RequireAuthorization();

app.MapPost("/api/label-templates/import", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync("api/label-templates/import", ctx, ct)).RequireAuthorization();

app.MapGet("/api/label-templates/{id}/versions", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync($"api/label-templates/{id}/versions", ctx, ct)).RequireAuthorization();

app.MapGet("/api/label-templates/{id}/versions/{version:int}", async (string id, int version, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync($"api/label-templates/{id}/versions/{version}", ctx, ct)).RequireAuthorization();

app.MapPost("/api/label-templates/{id}/print-test", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync($"api/label-templates/{id}/print-test", ctx, ct)).RequireAuthorization();

// ── Printer assignments proxy endpoints ──────────────────────────────────────
app.MapGet("/api/printer-template-assignments", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync("api/printer-template-assignments", ctx, ct)).RequireAuthorization();

app.MapGet("/api/printer-template-assignments/{printerCode}", async (string printerCode, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync($"api/printer-template-assignments/{printerCode}", ctx, ct)).RequireAuthorization();

app.MapPost("/api/printer-template-assignments", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync("api/printer-template-assignments", ctx, ct)).RequireAuthorization();

app.MapDelete("/api/printer-template-assignments/{printerCode}", async (string printerCode, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterDeleteAsync($"api/printer-template-assignments/{printerCode}", ctx, ct)).RequireAuthorization();

// ── Print history proxy endpoints ────────────────────────────────────────────
app.MapGet("/api/print-history", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync("api/print-history", ctx, ct)).RequireAuthorization();

app.MapGet("/api/print-history/{id}", async (string id, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync($"api/print-history/{id}", ctx, ct)).RequireAuthorization();

// ── Printer management endpoints ──────────────────────────────────────────────
app.MapGet("/api/printers", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync("api/printers", ctx, ct)).RequireAuthorization();

app.MapGet("/api/printers/discover", async (HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync("api/printers/discover", ctx, ct)).RequireAuthorization();

app.MapGet("/api/printers/{code}/health", async (string code, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterGetAsync($"api/printers/{code}/health", ctx, ct)).RequireAuthorization();

app.MapPost("/api/printers/{code}/test-connection", async (string code, HttpContext ctx, CancellationToken ct) =>
    await ProxyPrinterAdapterPostAsync($"api/printers/{code}/test-connection", ctx, ct)).RequireAuthorization();


app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "kiosk-ui" }));

// SignalR hub
app.MapHub<DashboardHub>("/hubs/dashboard");

// Serve React static files
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();

// Request records for RBAC endpoints
public record CreateUserRequest(string Username, string Password, string FullName, string RoleCode);
public record UpdateUserPermissionsRequest(List<string> PermissionCodes);
public record ResetPasswordRequest(string Password, string Reason);
