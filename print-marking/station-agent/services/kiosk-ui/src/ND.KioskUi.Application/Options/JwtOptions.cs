namespace ND.KioskUi.Application.Options;

/// <summary>
/// JWT configuration options. Defined in Application layer so LoginHandler
/// can use it without creating a circular dependency on Infrastructure.
/// </summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Secret { get; set; } = "change_me_to_a_long_random_secret_at_least_32_chars";
    public string Issuer { get; set; } = "nd-station-agent";
    public string Audience { get; set; } = "nd-kiosk";
    public int ExpiryMinutes { get; set; } = 480;
}
