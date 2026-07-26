namespace ND.Contracts.Mqtt;

/// <summary>
/// Centralized MQTT topic definitions.
/// Format: station/{stationId}/domain/action
/// </summary>
public static class MqttTopics
{
    public static string JobCreate(string stationId) => $"station/{stationId}/job/create";
    public static string JobStatus(string stationId) => $"station/{stationId}/job/status";
    public static string PrinterStatus(string stationId) => $"station/{stationId}/printer/status";
    public static string LaserStatus(string stationId) => $"station/{stationId}/laser/status";
    public static string VisionResult(string stationId) => $"station/{stationId}/vision/result";
    public static string PlcEvent(string stationId) => $"station/{stationId}/plc/event";
}
