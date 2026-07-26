using ND.SharedKernel.Primitives;

namespace ND.KioskUi.Domain.Entities;

/// <summary>
/// Kiosk system user.
/// Table: kiosk_users
/// </summary>
public sealed class KioskUser : AuditableEntity
{
    public string Username { get; private set; } = default!;
    public string FullName { get; private set; } = default!;
    public string PasswordHash { get; private set; } = default!;
    public bool IsActive { get; private set; } = true;

    private KioskUser() { }

    public static KioskUser Create(string username, string fullName, string passwordHash)
    {
        return new KioskUser
        {
            Username = username,
            FullName = fullName,
            PasswordHash = passwordHash,
            IsActive = true
        };
    }

    public void Deactivate()
    {
        IsActive = false;
        Touch();
    }

    public void Activate()
    {
        IsActive = true;
        Touch();
    }

    public void UpdatePassword(string newPasswordHash)
    {
        PasswordHash = newPasswordHash;
        Touch();
    }
}
