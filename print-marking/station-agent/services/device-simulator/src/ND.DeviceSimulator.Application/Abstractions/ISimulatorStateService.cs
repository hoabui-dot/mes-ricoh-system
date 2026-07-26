using ND.DeviceSimulator.Application.Dtos;

namespace ND.DeviceSimulator.Application.Abstractions;

/// <summary>
/// Singleton in-memory state for laser, vision, PLC, and gateway virtual devices.
/// Printer simulation has been moved to printer-adapter (VirtualPrinterSimulator).
/// </summary>
public interface ISimulatorStateService
{
    // ── Laser ─────────────────────────────────────────────────────────────────
    void SetLaserOnline(bool online);
    void RecordLaserCommand(string command, string result);
    LaserStateDto GetLaserState();

    // ── Vision ────────────────────────────────────────────────────────────────
    void SetVisionOnline(bool online);
    void SetVisionConfig(int passRate, int failureRate);
    void RecordVisionResult(string result);
    VisionStateDto GetVisionState();

    // ── PLC ───────────────────────────────────────────────────────────────────
    void SetPlcOnline(bool online);
    void SetRegister(string name, bool value);
    bool GetRegister(string name);
    void RecordPlcEvent();
    PlcStateDto GetPlcState();

    // ── Gateway ───────────────────────────────────────────────────────────────
    void SetGatewayConnected(bool connected, string? brokerHost = null, int brokerPort = 1883);
    void RecordGatewayPublish(string topic);
    void RecordGatewayReceive(string topic);
    GatewayStateDto GetGatewayState();

    // ── Scenarios & Active Job ────────────────────────────────────────────────
    void SetJobScenario(string jobId, string scenario);
    string? GetJobScenario(string jobId);
    void SetActiveJobId(string jobId);
    string? GetActiveJobId();

    // ── Snapshot ──────────────────────────────────────────────────────────────
    SimulatorStatusDto GetStatus();
}
