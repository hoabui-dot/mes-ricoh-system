using ND.JobEngine.Api.Endpoints;

namespace ND.JobEngine.Api.Extensions;

public static class EndpointExtensions
{
    public static IEndpointRouteBuilder MapJobEndpoints(this IEndpointRouteBuilder app)
        => JobEndpointExtensions.MapJobEndpoints(app);

    public static IEndpointRouteBuilder MapOverwriteEndpoints(this IEndpointRouteBuilder app)
        => OverwriteEndpointExtensions.MapOverwriteEndpoints(app);
}
