using ND.SharedKernel.Primitives;

namespace ND.KioskUi.Domain.Entities;

public sealed class KioskRolePermission : Entity
{
    public string RoleId { get; private set; } = default!;
    public string PermissionId { get; private set; } = default!;

    private KioskRolePermission() { }

    public static KioskRolePermission Create(string roleId, string permissionId)
        => new() { RoleId = roleId, PermissionId = permissionId };
}
