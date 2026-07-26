using ND.SharedKernel.Primitives;

namespace ND.KioskUi.Domain.Entities;

public sealed class KioskRole : Entity
{
    public string RoleCode { get; private set; } = default!;  // ADMIN / SUPERVISOR / OPERATOR / QA
    public string DisplayName { get; private set; } = default!;

    private KioskRole() { }

    public static KioskRole Create(string roleCode, string displayName)
        => new() { RoleCode = roleCode, DisplayName = displayName };
}
