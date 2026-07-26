using Microsoft.EntityFrameworkCore;
using ND.LaserAdapter.Domain.Entities;

namespace ND.LaserAdapter.Infrastructure.Persistence;

public static class LaserDbSeeder
{
    public static async Task SeedAsync(LaserDbContext db, string endpoint)
    {
        if (!await db.Lasers.AnyAsync())
        {
            var laser = Laser.Create("laser-01", "Virtual Laser Marker", "TCP", endpoint, "SIMULATED");
            laser.SetOnline();
            await db.Lasers.AddAsync(laser);
            await db.SaveChangesAsync();
        }
    }
}
