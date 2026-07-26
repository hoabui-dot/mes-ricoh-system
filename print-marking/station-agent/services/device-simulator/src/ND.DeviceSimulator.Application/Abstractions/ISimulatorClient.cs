using ND.DeviceSimulator.Application.Dtos;

namespace ND.DeviceSimulator.Application.Abstractions;

/// <summary>
/// Typed SignalR client interface — all virtual device events pushed from server to browser.
/// </summary>
public interface ISimulatorClient
{
    Task LaserCommandExecuted(LaserCommandDto cmd);
    Task VisionVerified(VisionResultDto result);
    Task PlcRegisterChanged(PlcRegisterDto register);
    Task GatewayEventOccurred(GatewayEventDto evt);
    Task TimelineEventAdded(TimelineEventDto evt);
    Task SimulatorStatusUpdated(SimulatorStatusDto status);
}
