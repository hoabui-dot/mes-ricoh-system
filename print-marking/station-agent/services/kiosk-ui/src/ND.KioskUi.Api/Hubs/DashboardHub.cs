using Microsoft.AspNetCore.SignalR;

namespace ND.KioskUi.Api.Hubs;

/// <summary>
/// SignalR hub for real-time kiosk dashboard.
/// Clients subscribe to job status, printer/laser/PLC health updates.
/// </summary>
public sealed class DashboardHub : Hub
{
    public async Task JoinStationGroup(string stationId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"station:{stationId}");
    }

    public async Task LeaveStationGroup(string stationId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"station:{stationId}");
    }
}

/// <summary>
/// Typed client interface for DashboardHub.
/// </summary>
public interface IDashboardClient
{
    Task JobStatusChanged(object jobStatus);
    Task PrinterStatusChanged(object printerStatus);
    Task LaserStatusChanged(object laserStatus);
    Task PlcStatusChanged(object plcStatus);
    Task VisionResultReceived(object visionResult);
}
