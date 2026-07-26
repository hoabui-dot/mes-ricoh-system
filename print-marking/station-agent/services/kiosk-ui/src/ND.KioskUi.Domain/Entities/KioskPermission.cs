using ND.SharedKernel.Primitives;

namespace ND.KioskUi.Domain.Entities;

public sealed class KioskPermission : Entity
{
    public string PermissionCode { get; private set; } = default!;
    public string Description { get; private set; } = default!;

    private KioskPermission() { }

    public static KioskPermission Create(string permissionCode, string description)
        => new() { PermissionCode = permissionCode, Description = description };
}

public static class PermissionCodes
{
    public const string JobView = "JOB_VIEW";
    public const string JobReprocess = "JOB_REPROCESS";
    public const string UserManage = "USER_MANAGE";
    public const string SystemAdmin = "SYSTEM_ADMIN";
}
