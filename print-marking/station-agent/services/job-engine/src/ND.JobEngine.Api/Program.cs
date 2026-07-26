using Microsoft.EntityFrameworkCore;
using ND.Infrastructure.Observability;
using ND.JobEngine.Api.Extensions;
using ND.JobEngine.Infrastructure.DependencyInjection;
using ND.JobEngine.Infrastructure.Persistence;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Serilog
Log.Logger = SerilogConfiguration.Configure(
    new LoggerConfiguration(),
    builder.Configuration,
    "job-engine").CreateLogger();

builder.Host.UseSerilog();

// Infrastructure
builder.Services.AddJobEngineInfrastructure(builder.Configuration);

// API
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

var app = builder.Build();

// Ensure DB on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<JobEngineDbContext>();
    var dbPath = app.Configuration["SQLITE_JOB_ENGINE_PATH"] ?? "data/job_engine.db";
    var dbDir = Path.GetDirectoryName(Path.GetFullPath(dbPath));
    if (!string.IsNullOrEmpty(dbDir)) Directory.CreateDirectory(dbDir);
    await db.Database.EnsureCreatedAsync();

    // Safely add tracking/audit columns to existing sqlite database
    using (var command = db.Database.GetDbConnection().CreateCommand())
    {
        await db.Database.OpenConnectionAsync();
        
        command.CommandText = "ALTER TABLE job_engine_job_attempts ADD COLUMN parent_attempt_id TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_job_attempts ADD COLUMN retry_sequence INTEGER DEFAULT 0;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_job_attempts ADD COLUMN reason_code TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_job_attempts ADD COLUMN reason_description TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_jobs ADD COLUMN parent_job_id TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_jobs ADD COLUMN root_job_id TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_jobs ADD COLUMN retry_sequence INTEGER DEFAULT 0;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_jobs ADD COLUMN execution_type TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_jobs ADD COLUMN triggered_by_user_id TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_jobs ADD COLUMN reason_code TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_jobs ADD COLUMN reason_description TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        // Steps tracking columns
        command.CommandText = "ALTER TABLE job_engine_job_steps ADD COLUMN execution_duration_ms INTEGER NOT NULL DEFAULT 0;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_job_steps ADD COLUMN retry_count_step INTEGER NOT NULL DEFAULT 0;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_job_steps ADD COLUMN payload_json_step TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_job_steps ADD COLUMN assigned_device_id TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }

        command.CommandText = "ALTER TABLE job_engine_job_steps ADD COLUMN execution_result TEXT NULL;";
        try { await command.ExecuteNonQueryAsync(); } catch { }
    }
}

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

// Register endpoint groups
app.MapJobEndpoints();
app.MapOverwriteEndpoints();

app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "job-engine" }));

app.Run();
