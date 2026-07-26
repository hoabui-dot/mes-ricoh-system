using Microsoft.EntityFrameworkCore;
using ND.Infrastructure.Observability;
using ND.Infrastructure.Redis;
using ND.PlcAdapter.Infrastructure.Persistence;
using ND.SharedKernel.Abstractions;
using Serilog;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);
Log.Logger = SerilogConfiguration.Configure(new LoggerConfiguration(), builder.Configuration, "plc-adapter").CreateLogger();
builder.Host.UseSerilog();

var dbPath = builder.Configuration["SQLITE_PLC_PATH"] ?? "data/plc.db";
builder.Services.AddDbContext<PlcDbContext>(opts => opts.UseSqlite($"Data Source={dbPath}"));
builder.Services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<PlcDbContext>());

var redisConnection = builder.Configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisConnection));
builder.Services.AddSingleton<IIdempotencyService, RedisIdempotencyService>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PlcDbContext>();
    var dbDir = Path.GetDirectoryName(Path.GetFullPath(dbPath));
    if (!string.IsNullOrEmpty(dbDir)) Directory.CreateDirectory(dbDir);
    await db.Database.EnsureCreatedAsync();
}
if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.MapGet("/api/plc-devices", async (PlcDbContext db, CancellationToken ct) => Results.Ok(await db.PlcDevices.ToListAsync(ct)));
app.MapGet("/api/plc-robot-picks/by-job/{jobId}", async (string jobId, PlcDbContext db, CancellationToken ct) =>
    Results.Ok(await db.PlcRobotPickEvents.Where(r => r.JobId == jobId).ToListAsync(ct)));
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "plc-adapter" }));
app.Run();
