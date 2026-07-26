using ND.SharedKernel.Primitives;

namespace ND.KioskUi.Domain.Entities;

/// <summary>
/// Login session for a kiosk user.
/// Table: kiosk_sessions
/// </summary>
public sealed class KioskSession : Entity
{
    public string UserId { get; private set; } = default!;
    public string Token { get; private set; } = default!;
    public string IpAddress { get; private set; } = default!;
    public string UserAgent { get; private set; } = default!;
    public string LoginAt { get; private set; } = DateTime.UtcNow.ToString("o");
    public string ExpiresAt { get; private set; } = default!;
    public string? LogoutAt { get; private set; }
    public bool IsActive { get; private set; } = true;

    private KioskSession() { }

    public static KioskSession Create(
        string userId, string token, string ipAddress, string userAgent, int expiryMinutes = 480)
    {
        return new KioskSession
        {
            UserId = userId,
            Token = token,
            IpAddress = ipAddress,
            UserAgent = userAgent,
            LoginAt = DateTime.UtcNow.ToString("o"),
            ExpiresAt = DateTime.UtcNow.AddMinutes(expiryMinutes).ToString("o"),
            IsActive = true
        };
    }

    public void Logout()
    {
        IsActive = false;
        LogoutAt = DateTime.UtcNow.ToString("o");
    }

    public bool IsExpired() =>
        DateTime.TryParse(ExpiresAt, out var expiry) && expiry < DateTime.UtcNow;
}
