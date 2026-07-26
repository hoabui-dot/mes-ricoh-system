using Microsoft.EntityFrameworkCore;
using ND.ProjectionService.Domain.Entities;

namespace ND.ProjectionService.Infrastructure.Persistence;

public static class ProjectionDbSeeder
{
    public static async Task SeedAsync(ProjectionDbContext db)
    {
        if (!await db.DeviceStatuses.AnyAsync())
        {
            var nowStr = DateTime.UtcNow.ToString("o");
            var devices = new List<DeviceStatus>
            {
                DeviceStatus.Create("plc-01", "PLC", isOnline: true, nowStr),
                DeviceStatus.Create("printer-01", "PRINTER", isOnline: true, nowStr),
                DeviceStatus.Create("laser-01", "LASER", isOnline: true, nowStr),
                DeviceStatus.Create("camera-01", "VISION_CAMERA", isOnline: true, nowStr),
                DeviceStatus.Create("gateway-01", "GATEWAY", isOnline: true, nowStr)
            };

            await db.DeviceStatuses.AddRangeAsync(devices);
            await db.SaveChangesAsync();
        }
    }
}
