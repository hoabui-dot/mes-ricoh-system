using System;
using ND.SharedKernel.Primitives;

namespace ND.KioskUi.Domain.Entities;

/// <summary>
/// Direct user permission mapping for RBAC.
/// Table: kiosk_user_permissions
/// </summary>
public sealed class KioskUserPermission : Entity
{
    public string UserId { get; private set; } = default!;
    public string PermissionId { get; private set; } = default!;

    private KioskUserPermission() { }

    public static KioskUserPermission Create(string userId, string permissionId)
    {
        return new KioskUserPermission
        {
            Id = Guid.NewGuid().ToString(),
            UserId = userId,
            PermissionId = permissionId
        };
    }
}
