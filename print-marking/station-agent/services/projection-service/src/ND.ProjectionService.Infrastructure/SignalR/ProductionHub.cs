using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace ND.ProjectionService.Infrastructure.SignalR;

public sealed class ProductionHub : Hub
{
    private readonly ILogger<ProductionHub> _logger;

    public ProductionHub(ILogger<ProductionHub> logger)
    {
        _logger = logger;
    }

    public async Task SubscribeToStation(string stationId)
    {
        if (string.IsNullOrWhiteSpace(stationId))
            return;

        await Groups.AddToGroupAsync(Context.ConnectionId, stationId);
        _logger.LogInformation("Client {ConnectionId} subscribed to station: {StationId}", Context.ConnectionId, stationId);
    }

    public async Task UnsubscribeFromStation(string stationId)
    {
        if (string.IsNullOrWhiteSpace(stationId))
            return;

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, stationId);
        _logger.LogInformation("Client {ConnectionId} unsubscribed from station: {StationId}", Context.ConnectionId, stationId);
    }
}
