using ND.SharedKernel.Primitives;

namespace ND.JobEngine.Domain.Entities;

public sealed class ProductionOrder : AuditableEntity
{
    public string OrderNo { get; private set; } = default!;
    public string ProductCode { get; private set; } = default!;
    public int PlannedQty { get; private set; }
    public string Status { get; private set; } = "CREATED"; // CREATED, IN_PROGRESS, COMPLETED, CANCELLED

    private ProductionOrder() { }

    public static ProductionOrder Create(string orderNo, string productCode, int plannedQty)
    {
        return new ProductionOrder
        {
            OrderNo = orderNo,
            ProductCode = productCode,
            PlannedQty = plannedQty,
            Status = "CREATED"
        };
    }

    public void Start()
    {
        Status = "IN_PROGRESS";
        Touch();
    }

    public void Complete()
    {
        Status = "COMPLETED";
        Touch();
    }
}
