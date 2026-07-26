using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using ND.KioskUi.Application.Dtos;
using ND.KioskUi.Application.Interfaces;
using ND.KioskUi.Domain.Entities;
using ND.KioskUi.Application.Options;
using ND.SharedKernel.Abstractions;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace ND.KioskUi.Application.Commands;

public record LoginCommand(string Username, string Password, string IpAddress, string UserAgent);
public record LoginResult(string Token, string UserId, string Username, string FullName, string ExpiresAt);

public sealed class LoginHandler
{
    private readonly IKioskUserRepository _userRepository;
    private readonly IKioskSessionRepository _sessionRepository;
    private readonly IKioskAccessLogRepository _accessLogRepository;
    private readonly IKioskRbacRepository _rbacRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly JwtOptions _jwtOptions;
    private readonly ILogger<LoginHandler> _logger;

    public LoginHandler(
        IKioskUserRepository userRepository,
        IKioskSessionRepository sessionRepository,
        IKioskAccessLogRepository accessLogRepository,
        IKioskRbacRepository rbacRepository,
        IUnitOfWork unitOfWork,
        IOptions<JwtOptions> jwtOptions,
        ILogger<LoginHandler> logger)
    {
        _userRepository = userRepository;
        _sessionRepository = sessionRepository;
        _accessLogRepository = accessLogRepository;
        _rbacRepository = rbacRepository;
        _unitOfWork = unitOfWork;
        _jwtOptions = jwtOptions.Value;
        _logger = logger;
    }

    public async Task<LoginResult?> HandleAsync(LoginCommand command, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.GetByUsernameAsync(command.Username, cancellationToken);

        if (user is null || !user.IsActive || !BCrypt.Net.BCrypt.Verify(command.Password, user.PasswordHash))
        {
            _logger.LogWarning("Failed login attempt for username: {Username}", command.Username);

            if (user is not null)
            {
                var failLog = KioskAccessLog.Create(
                    user.Id, "none", "LOGIN", "USER", user.Id, "FAILED");
                await _accessLogRepository.AddAsync(failLog, cancellationToken);
                await _unitOfWork.SaveChangesAsync(cancellationToken);
            }

            return null;
        }

        // Get user roles and permissions
        var permissions = await _rbacRepository.GetUserPermissionsAsync(user.Id, cancellationToken);

        // Generate JWT
        var token = GenerateJwt(user, permissions);
        var session = KioskSession.Create(user.Id, token, command.IpAddress, command.UserAgent, _jwtOptions.ExpiryMinutes);

        await _sessionRepository.AddAsync(session, cancellationToken);

        var accessLog = KioskAccessLog.Create(
            user.Id, session.Id, "LOGIN", "USER", user.Id, "SUCCESS");
        await _accessLogRepository.AddAsync(accessLog, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("User {Username} logged in successfully", command.Username);

        return new LoginResult(token, user.Id, user.Username, user.FullName, session.ExpiresAt);
    }

    private string GenerateJwt(KioskUser user, IReadOnlyList<string> permissions)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.Secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.UniqueName, user.Username),
            new("fullName", user.FullName),
        };

        claims.AddRange(permissions.Select(p => new Claim("permission", p)));

        var token = new JwtSecurityToken(
            issuer: _jwtOptions.Issuer,
            audience: _jwtOptions.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_jwtOptions.ExpiryMinutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
