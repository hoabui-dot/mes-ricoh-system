namespace ND.StationGateway.Infrastructure.Options;

public sealed class GatewayOptions
{
    public const string SectionName = "Gateway";

    public int OutboxBatchSize { get; set; } = 10;
    public int OutboxIntervalSeconds { get; set; } = 5;
}
