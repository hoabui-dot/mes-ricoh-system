using Microsoft.EntityFrameworkCore;
using ND.Infrastructure.Messaging;
using ND.Infrastructure.Observability;
using ND.Infrastructure.Redis;
using ND.LaserAdapter.Application.Interfaces;
using ND.LaserAdapter.Infrastructure.DeviceAdapters;
using ND.LaserAdapter.Infrastructure.Messaging;
using ND.LaserAdapter.Infrastructure.Persistence;
using ND.SharedKernel.Abstractions;
using Serilog;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);
Log.Logger = SerilogConfiguration.Configure(new LoggerConfiguration(), builder.Configuration, "laser-adapter").CreateLogger();
builder.Host.UseSerilog();

// ── SQLite ───────────────────────────────────────────────────────────────────
var dbPath = builder.Configuration["SQLITE_LASER_PATH"] ?? "data/laser.db";
builder.Services.AddDbContext<LaserDbContext>(opts => opts.UseSqlite($"Data Source={dbPath}"));
builder.Services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<LaserDbContext>());

// ── Redis ────────────────────────────────────────────────────────────────────
var redisConnection = builder.Configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisConnection));
builder.Services.AddSingleton<IIdempotencyService, RedisIdempotencyService>();

// ── Laser device adapter ─────────────────────────────────────────────────────
builder.Services.AddSingleton<ILaserAdapter, TcpLaserAdapter>();

// ── RabbitMQ ─────────────────────────────────────────────────────────────────
builder.Services.Configure<RabbitMqOptions>(builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.AddSingleton<IRabbitMqConsumer, RabbitMqConsumer>();
builder.Services.AddSingleton<IRabbitMqPublisher, RabbitMqPublisher>();

// ── Hosted consumers ─────────────────────────────────────────────────────────
builder.Services.AddHostedService<JobMarkingConsumer>();
builder.Services.AddHostedService<HeartbeatHostedService>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

var app = builder.Build();

// ── DB init + seed ───────────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<LaserDbContext>();
    var dbDir = Path.GetDirectoryName(Path.GetFullPath(dbPath));
    if (!string.IsNullOrEmpty(dbDir)) Directory.CreateDirectory(dbDir);
    await db.Database.EnsureCreatedAsync();

    // Seed default laser device
    var laserHost = Environment.GetEnvironmentVariable("LASER_HOST") ?? app.Configuration["Laser:Host"] ?? "localhost";
    var laserPort = Environment.GetEnvironmentVariable("LASER_PORT") ?? app.Configuration["Laser:Port"] ?? "8901";
    await LaserDbSeeder.SeedAsync(db, $"{laserHost}:{laserPort}");
}

if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.MapGet("/api/lasers", async (LaserDbContext db, CancellationToken ct) =>
    Results.Ok(await db.Lasers.ToListAsync(ct)));
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "laser-adapter" }));
app.Run();

