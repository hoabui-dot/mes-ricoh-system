using System.Collections.Concurrent;
using System.Linq;
using ND.DeviceSimulator.Application.Abstractions;
using ND.DeviceSimulator.Application.Dtos;

namespace ND.DeviceSimulator.Infrastructure.State;

/// <summary>
/// Thread-safe singleton holding live in-memory state for all 5 virtual devices.
/// Virtual device servers write here; the API reads it for GET /api/status.
/// </summary>
public sealed class SimulatorStateService : ISimulatorStateService
{
    // ── Laser ─────────────────────────────────────────────────────────────────
    private volatile bool _laserOnline;
    private int _laserCommandCount;
    private volatile string? _laserLastCommand;
    private volatile string? _laserLastResult;
    private volatile string? _laserLastCommandAt;
    private const int LaserPort = 8901;

    // ── Vision ────────────────────────────────────────────────────────────────
    private volatile bool _visionOnline = true;
    private int _visionRequestCount;
    private volatile int _visionPassRate = 95;
    private volatile int _visionFailureRate = 0;
    private volatile string? _visionLastResult;
    private volatile string? _visionLastRequestAt;

    // ── PLC ───────────────────────────────────────────────────────────────────
    private volatile bool _plcOnline;
    private int _plcEventCount;
    private volatile string? _plcLastEventAt;
    private const int PlcPort = 5020;

    private readonly ConcurrentDictionary<string, bool> _registers = new(StringComparer.OrdinalIgnoreCase)
    {
        ["START_BUTTON"] = false,
        ["STOP_BUTTON"] = false,
        ["SENSOR_IN"] = false,
        ["SENSOR_OUT"] = false,
        ["MACHINE_READY"] = false,
        ["REJECT_PRODUCT"] = false
    };

    // ── Gateway ───────────────────────────────────────────────────────────────
    private volatile bool _gatewayConnected;
    private volatile string? _gatewayBrokerHost;
    private volatile int _gatewayBrokerPort = 1883;
    private int _gatewayPublishCount;
    private int _gatewayReceiveCount;
    private volatile string? _gatewayLastEventAt;
    private volatile string? _gatewayLastTopic;

    private readonly ConcurrentDictionary<string, string> _scenarios = new(StringComparer.OrdinalIgnoreCase);
    private volatile string? _activeJobId;

    // ── Laser ─────────────────────────────────────────────────────────────────
    public void SetLaserOnline(bool online) => _laserOnline = online;

    public void RecordLaserCommand(string command, string result)
    {
        Interlocked.Increment(ref _laserCommandCount);
        _laserLastCommand = command;
        _laserLastResult = result;
        _laserLastCommandAt = DateTime.UtcNow.ToString("o");
    }

    public LaserStateDto GetLaserState() => new(
        _laserOnline, _laserCommandCount, _laserLastCommand,
        _laserLastResult, _laserLastCommandAt, LaserPort);

    // ── Vision ────────────────────────────────────────────────────────────────
    public void SetVisionOnline(bool online) => _visionOnline = online;
    
    public void SetVisionConfig(int passRate, int failureRate)
    {
        _visionPassRate = Math.Clamp(passRate, 0, 100);
        _visionFailureRate = Math.Clamp(failureRate, 0, 100);
    }

    public void RecordVisionResult(string result)
    {
        Interlocked.Increment(ref _visionRequestCount);
        _visionLastResult = result;
        _visionLastRequestAt = DateTime.UtcNow.ToString("o");
    }

    public VisionStateDto GetVisionState() => new(
        _visionOnline, _visionRequestCount, _visionPassRate,
        _visionFailureRate, _visionLastResult, _visionLastRequestAt);

    // ── PLC ───────────────────────────────────────────────────────────────────
    public void SetPlcOnline(bool online) => _plcOnline = online;

    public void SetRegister(string name, bool value) => _registers[name] = value;

    public bool GetRegister(string name) => _registers.TryGetValue(name, out var v) && v;

    public void RecordPlcEvent()
    {
        Interlocked.Increment(ref _plcEventCount);
        _plcLastEventAt = DateTime.UtcNow.ToString("o");
    }

    public PlcStateDto GetPlcState() => new(
        _plcOnline, _registers, _plcEventCount, _plcLastEventAt, PlcPort);

    // ── Gateway ───────────────────────────────────────────────────────────────
    public void SetGatewayConnected(bool connected, string? brokerHost = null, int brokerPort = 1883)
    {
        _gatewayConnected = connected;
        if (brokerHost is not null) _gatewayBrokerHost = brokerHost;
        _gatewayBrokerPort = brokerPort;
    }

    public void RecordGatewayPublish(string topic)
    {
        Interlocked.Increment(ref _gatewayPublishCount);
        _gatewayLastEventAt = DateTime.UtcNow.ToString("o");
        _gatewayLastTopic = topic;
    }

    public void RecordGatewayReceive(string topic)
    {
        Interlocked.Increment(ref _gatewayReceiveCount);
        _gatewayLastEventAt = DateTime.UtcNow.ToString("o");
        _gatewayLastTopic = topic;
    }

    public GatewayStateDto GetGatewayState() => new(
        _gatewayConnected, _gatewayBrokerHost, _gatewayBrokerPort,
        _gatewayPublishCount, _gatewayReceiveCount, _gatewayLastEventAt, _gatewayLastTopic);

    // ── Scenarios & Active Job ────────────────────────────────────────────────
    public void SetJobScenario(string jobId, string scenario)
    {
        _scenarios[jobId] = scenario;
    }

    public string? GetJobScenario(string jobId)
    {
        return _scenarios.TryGetValue(jobId, out var scenario) ? scenario : null;
    }

    public void SetActiveJobId(string jobId)
    {
        _activeJobId = jobId;
    }

    public string? GetActiveJobId()
    {
        return _activeJobId;
    }

    // ── Snapshot ──────────────────────────────────────────────────────────────
    public SimulatorStatusDto GetStatus() => new(
        GetLaserState(), GetVisionState(),
        GetPlcState(), GetGatewayState());
}
