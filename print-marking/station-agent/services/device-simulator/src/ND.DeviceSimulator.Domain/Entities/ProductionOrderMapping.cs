using ND.SharedKernel.Primitives;

namespace ND.DeviceSimulator.Domain.Entities;

/// <summary>
/// Mapping between MES ProductionOrderId / CorrelationId and Simulator MQTT EventId/JobNo.
/// Table: production_order_mappings
/// </summary>
public sealed class ProductionOrderMapping : Entity
{
    public string ProductionOrderId { get; private set; } = default!;
    public string OrderNumber { get; private set; } = default!;
    public string EventId { get; private set; } = default!; // The MQTT EventId / JobNo
    public string CorrelationId { get; private set; } = default!;
    public string OperationType { get; private set; } = default!;
    public string Station { get; private set; } = default!;
    public string Status { get; private set; } = default!;
    public string OccurredAt { get; private set; } = default!;

    private ProductionOrderMapping() { }

    public static ProductionOrderMapping Create(
        string productionOrderId,
        string orderNumber,
        string eventId,
        string correlationId,
        string operationType,
        string station,
        string status)
    {
        return new ProductionOrderMapping
        {
            ProductionOrderId = productionOrderId,
            OrderNumber = orderNumber,
            EventId = eventId,
            CorrelationId = correlationId,
            OperationType = operationType,
            Station = station,
            Status = status,
            OccurredAt = DateTime.UtcNow.ToString("o")
        };
    }

    public void UpdateStatus(string status)
    {
        Status = status;
        OccurredAt = DateTime.UtcNow.ToString("o");
    }
}
