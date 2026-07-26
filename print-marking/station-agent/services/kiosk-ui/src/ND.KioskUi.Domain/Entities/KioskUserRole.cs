using ND.SharedKernel.Primitives;

namespace ND.KioskUi.Domain.Entities;

public sealed class KioskUserRole : Entity
{
    public string UserId { get; private set; } = default!;
    public string RoleId { get; private set; } = default!;
    public string AssignedAt { get; private set; } = DateTime.UtcNow.ToString("o");
    public string AssignedBy { get; private set; } = default!;

    private KioskUserRole() { }

    public static KioskUserRole Create(string userId, string roleId, string assignedBy)
        => new() { UserId = userId, RoleId = roleId, AssignedBy = assignedBy };
}
