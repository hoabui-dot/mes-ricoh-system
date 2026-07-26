using ND.JobEngine.Application.Commands;
using ND.JobEngine.Application.Queries;

namespace ND.JobEngine.Api.Endpoints;

public static class OverwriteEndpointExtensions
{
    public static IEndpointRouteBuilder MapOverwriteEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/overwrite-requests").WithTags("Overwrite");

        group.MapGet("/pending", async (GetJobQueryHandler handler, CancellationToken ct) =>
        {
            var result = await handler.HandleGetPendingOverwritesAsync(
                new GetPendingOverwriteRequestsQuery(), ct);
            return Results.Ok(result);
        });

        group.MapPost("/", async (
            CreateOverwriteRequestCommand command,
            CreateOverwriteRequestHandler handler,
            CancellationToken ct) =>
        {
            var result = await handler.HandleAsync(command, ct);
            return Results.Created($"/api/overwrite-requests/{result.Id}", result);
        });

        return app;
    }
}
