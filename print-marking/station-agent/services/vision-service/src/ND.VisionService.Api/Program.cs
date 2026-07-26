using Microsoft.EntityFrameworkCore;
using ND.Infrastructure.Observability;
using ND.Infrastructure.Redis;
using ND.SharedKernel.Abstractions;
using ND.VisionService.Infrastructure.Persistence;
using Serilog;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);
Log.Logger = SerilogConfiguration.Configure(new LoggerConfiguration(), builder.Configuration, "vision-service").CreateLogger();
builder.Host.UseSerilog();

var dbPath = builder.Configuration["SQLITE_VISION_PATH"] ?? "data/vision.db";
builder.Services.AddDbContext<VisionDbContext>(opts => opts.UseSqlite($"Data Source={dbPath}"));
builder.Services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<VisionDbContext>());

var redisConnection = builder.Configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisConnection));
builder.Services.AddSingleton<IIdempotencyService, RedisIdempotencyService>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<VisionDbContext>();
    var dbDir = Path.GetDirectoryName(Path.GetFullPath(dbPath));
    if (!string.IsNullOrEmpty(dbDir)) Directory.CreateDirectory(dbDir);
    await db.Database.EnsureCreatedAsync();
}
if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.MapGet("/api/cameras", async (VisionDbContext db, CancellationToken ct) => Results.Ok(await db.Cameras.ToListAsync(ct)));
app.MapGet("/api/vision-results/by-job/{jobId}", async (string jobId, VisionDbContext db, CancellationToken ct) =>
    Results.Ok(await db.VisionResults.Where(v => v.JobId == jobId).ToListAsync(ct)));
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "vision-service" }));
app.Run();
