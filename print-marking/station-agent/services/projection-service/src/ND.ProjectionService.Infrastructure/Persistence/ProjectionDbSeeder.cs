using Microsoft.EntityFrameworkCore;
using ND.ProjectionService.Domain.Entities;

namespace ND.ProjectionService.Infrastructure.Persistence;

public static class ProjectionDbSeeder
{
    public static async Task SeedAsync(ProjectionDbContext db)
    {
        // Runtime devices must be created by real Kafka heartbeats. The previous
        // seeded PLC/laser/camera/gateway rows were simulation data and caused the
        // kiosk to display healthy hardware that did not exist at the station.
        var legacyDeviceIds = new[] { "plc-01", "laser-01", "camera-01", "gateway-01", "printer-01", "printer-02", "printer-03" };
        var stale = await db.DeviceStatuses
            .Where(d => legacyDeviceIds.Contains(d.DeviceId))
            .ToListAsync();
        db.DeviceStatuses.RemoveRange(stale);
        await db.SaveChangesAsync();
    }
}
