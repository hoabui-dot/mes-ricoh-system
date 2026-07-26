namespace ND.KioskUi.Application.Dtos;

public record UserDto(
    string Id,
    string Username,
    string FullName,
    bool IsActive,
    string CreatedAt,
    IReadOnlyList<string> Roles);

public record AccessLogDto(
    string Id,
    string UserId,
    string SessionId,
    string ActionName,
    string TargetType,
    string TargetId,
    string Result,
    string? DetailJson,
    string PerformedAt);
