using Microsoft.AspNetCore.SignalR;
using ND.DeviceSimulator.Application.Abstractions;

namespace ND.DeviceSimulator.Infrastructure.Hubs;

/// <summary>
/// SignalR hub — all 5 virtual device events streamed to connected dashboards.
/// </summary>
public sealed class SimulatorHub : Hub<ISimulatorClient>
{
    public override async Task OnConnectedAsync()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, "simulator");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, "simulator");
        await base.OnDisconnectedAsync(exception);
    }
}
