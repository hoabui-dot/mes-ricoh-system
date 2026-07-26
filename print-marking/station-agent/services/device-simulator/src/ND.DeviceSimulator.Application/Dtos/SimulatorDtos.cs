namespace ND.DeviceSimulator.Application.Dtos;

// ── Device State Snapshots (polled or pushed via SignalR) ─────────────────────

public record LaserStateDto(
    bool Online,
    int CommandCount,
    string? LastCommand,
    string? LastResult,        // SUCCESS / FAILED
    string? LastCommandAt,
    int Port);

public record VisionStateDto(
    bool Online,
    int RequestCount,
    int PassRate,
    int FailureRate,
    string? LastResult,
    string? LastRequestAt);

public record PlcStateDto(
    bool Online,
    IReadOnlyDictionary<string, bool> Registers,
    int EventCount,
    string? LastEventAt,
    int Port);

public record GatewayStateDto(
    bool Connected,
    string? BrokerHost,
    int BrokerPort,
    int PublishCount,
    int ReceiveCount,
    string? LastEventAt,
    string? LastTopic);

public record SimulatorStatusDto(
    LaserStateDto Laser,
    VisionStateDto Vision,
    PlcStateDto Plc,
    GatewayStateDto Gateway);

// ── Event DTOs (broadcast via SignalR) ───────────────────────────────────────

public record LaserCommandDto(
    string Id,
    string RawCommand,
    string Status,
    int DurationMs,
    string ExecutedAt);

public record VisionResultDto(
    string Id,
    string JobId,
    string Result,
    string? DefectCode,
    double? Confidence,
    string? OcrText,
    int DurationMs,
    string VerifiedAt);

public record PlcRegisterDto(
    string Name,
    bool Value,
    string Source,
    string OccurredAt);

public record GatewayEventDto(
    string Id,
    string Direction,
    string Topic,
    string PayloadJson,
    string OccurredAt);

public record TimelineEventDto(
    string Id,
    string Stage,
    string Status,
    string Detail,
    string OccurredAt);

// ── API Request DTOs ──────────────────────────────────────────────────────────

public record VisionVerifyRequest(
    string JobId,
    string? CorrelationId = null);

public record GatewayPublishRequest(
    string Topic,
    string Site,
    string Area,
    string Line,
    string Machine,
    string EdgeId,
    IReadOnlyList<UnifiedTagRequest> Data);

public record UnifiedTagRequest(
    string Tag,
    string Value,
    string Quality = "GOOD");

public record PlcRegisterUpdateRequest(bool Value);

public record UpdateVisionConfigRequest(int PassRate, int FailureRate);

public record UpdateConfigValueRequest(string Value);

public record ConnectionStatusDto(
    string ConnectionName,
    string Status,
    string? Detail,
    string CheckedAt);

public record ConfigValueDto(
    string Id,
    string Key,
    string Value,
    string? Description,
    bool IsEditable);
