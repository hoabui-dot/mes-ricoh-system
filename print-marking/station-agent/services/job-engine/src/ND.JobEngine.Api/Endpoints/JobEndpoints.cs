using ND.JobEngine.Application.Commands;
using ND.JobEngine.Application.Queries;
using ND.JobEngine.Application.Interfaces;
using ND.JobEngine.Application.Dtos;
using Microsoft.EntityFrameworkCore;
using ND.JobEngine.Infrastructure.Persistence;

namespace ND.JobEngine.Api.Endpoints;

public static class JobEndpointExtensions
{
    public static IEndpointRouteBuilder MapJobEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/jobs").WithTags("Jobs");

        group.MapGet("/", async (
            int page,
            int pageSize,
            string? status,
            string? serial,
            GetJobQueryHandler handler,
            CancellationToken ct) =>
        {
            var result = await handler.HandleGetPagedAsync(
                new GetJobsQuery(page, pageSize, status, serial), ct);
            return Results.Ok(result);
        });

        group.MapGet("/{id}", async (string id, GetJobQueryHandler handler, CancellationToken ct) =>
        {
            var result = await handler.HandleGetByIdAsync(new GetJobByIdQuery(id), ct);
            return Results.Ok(result);
        });

        group.MapGet("/by-job-no/{jobNo}", async (string jobNo, GetJobQueryHandler handler, CancellationToken ct) =>
        {
            var result = await handler.HandleGetByJobNoAsync(new GetJobByJobNoQuery(jobNo), ct);
            return Results.Ok(result);
        });

        group.MapGet("/{id}/history", async (string id, GetJobQueryHandler handler, CancellationToken ct) =>
        {
            var result = await handler.HandleGetHistoryAsync(new GetJobHistoryQuery(id), ct);
            return Results.Ok(result);
        });

        group.MapGet("/{id}/attempts", async (string id, GetJobQueryHandler handler, CancellationToken ct) =>
        {
            var result = await handler.HandleGetAttemptsAsync(new GetJobAttemptsQuery(id), ct);
            return Results.Ok(result);
        });

        group.MapGet("/attempts/{attemptId}/steps", async (string attemptId, IJobStepRepository repo, CancellationToken ct) =>
        {
            var steps = await repo.GetByAttemptIdAsync(attemptId, ct);
            var dtos = steps.Select(s => new JobStepDto(
                s.Id, s.AttemptId, s.StepName, s.StepOrder, s.Status,
                s.StartedAt, s.FinishedAt, s.ErrorMessage, s.ResultJson,
                s.ExecutionDurationMs, s.RetryCount, s.PayloadJsonStep, s.AssignedDeviceId, s.ExecutionResult)).ToList();
            return Results.Ok(dtos);
        });

        group.MapGet("/metrics", async (JobEngineDbContext db, CancellationToken ct) =>
        {
            var steps = await db.JobSteps
                .Where(s => s.Status == "Completed")
                .ToListAsync(ct);

            var averages = steps
                .GroupBy(s => s.StepName)
                .ToDictionary(
                    g => g.Key,
                    g => g.Average(s => s.ExecutionDurationMs)
                );

            var totalJobs = await db.Jobs.CountAsync(ct);
            var completedJobs = await db.Jobs.CountAsync(j => j.CurrentStatus == "Completed", ct);
            var failedJobs = await db.Jobs.CountAsync(j => j.CurrentStatus == "Failed", ct);

            return Results.Ok(new {
                averages,
                totalJobs,
                completedJobs,
                failedJobs
            });
        });

        group.MapPost("/", async (CreateJobCommand command, CreateJobHandler handler, CancellationToken ct) =>
        {
            var result = await handler.HandleAsync(command, ct);
            return Results.Created($"/api/jobs/{result.Id}", result);
        });

        group.MapPost("/{id}/process", async (string id, HttpContext ctx, ProcessJobHandler handler, CancellationToken ct) =>
        {
            string? dispatchTarget = null;
            if (ctx.Request.ContentLength > 0)
            {
                try
                {
                    using var reader = new System.IO.StreamReader(ctx.Request.Body);
                    var body = await reader.ReadToEndAsync(ct);
                    var doc = System.Text.Json.JsonDocument.Parse(body);
                    if (doc.RootElement.TryGetProperty("dispatchTarget", out var dt))
                        dispatchTarget = dt.GetString();
                }
                catch { /* ignore parse errors */ }
            }
            await handler.HandleAsync(new ProcessJobCommand(id, DispatchTarget: dispatchTarget), ct);
            return Results.Accepted();
        });


        return app;
    }
}
