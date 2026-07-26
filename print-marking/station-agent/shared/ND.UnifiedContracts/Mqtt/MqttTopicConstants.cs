namespace ND.UnifiedContracts.Mqtt;

/// <summary>
/// Canonical MQTT topic definitions for ND Station Agent.
///
/// Inbound:  factory/commands/#
/// Outbound: factory/events/#
/// Ack:      factory/ack/#
/// Heartbeat:factory/heartbeat/#
/// </summary>
public static class MqttTopicConstants
{
    // ── Root prefixes ──────────────────────────────
    public const string CommandsRoot = "factory/commands";
    public const string EventsRoot = "factory/events";
    public const string AckRoot = "factory/ack";
    public const string HeartbeatRoot = "factory/heartbeat";

    // ── Inbound command topics ──────────────────────
    public const string CommandsAll = "factory/commands/#";

    public static string CommandJob(string stationId) =>
        $"factory/commands/{stationId}/job";

    public static string CommandPrinter(string stationId) =>
        $"factory/commands/{stationId}/printer";

    public static string CommandLaser(string stationId) =>
        $"factory/commands/{stationId}/laser";

    public static string CommandPlc(string stationId) =>
        $"factory/commands/{stationId}/plc";

    // ── Outbound event topics ───────────────────────
    public static string EventJobStatus(string stationId) =>
        $"factory/events/{stationId}/job/status";

    public static string EventPrinterStatus(string stationId) =>
        $"factory/events/{stationId}/printer/status";

    public static string EventLaserStatus(string stationId) =>
        $"factory/events/{stationId}/laser/status";

    public static string EventVisionResult(string stationId) =>
        $"factory/events/{stationId}/vision/result";

    public static string EventPlcAction(string stationId) =>
        $"factory/events/{stationId}/plc/action";

    // ── Ack topics ──────────────────────────────────
    public static string Ack(string stationId, string eventId) =>
        $"factory/ack/{stationId}/{eventId}";

    // ── Heartbeat topics ────────────────────────────
    public static string Heartbeat(string stationId) =>
        $"factory/heartbeat/{stationId}";

    public static string DeviceHeartbeat(string stationId, string deviceId) =>
        $"factory/heartbeat/{stationId}/{deviceId}";
}
