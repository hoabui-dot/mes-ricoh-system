using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

public sealed class ProductionOrderView : Entity
{
    public string OrderNo { get; private set; } = default!;
    public string ProductCode { get; private set; } = default!;
    public int PlannedQty { get; private set; }
    public int CompletedQty { get; private set; }
    public int RemainingQty { get; private set; }
    public string Status { get; private set; } = "CREATED"; // CREATED, IN_PROGRESS, COMPLETED
    public string UpdatedAt { get; private set; } = default!;

    private ProductionOrderView() { }

    public static ProductionOrderView Create(string orderNo, string productCode, int plannedQty)
    {
        var now = DateTimeOffset.UtcNow.ToString("o");
        return new ProductionOrderView
        {
            Id = orderNo,
            OrderNo = orderNo,
            ProductCode = productCode,
            PlannedQty = plannedQty,
            CompletedQty = 0,
            RemainingQty = plannedQty,
            Status = "CREATED",
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    public void IncrementCompleted()
    {
        CompletedQty++;
        RemainingQty = Math.Max(0, PlannedQty - CompletedQty);
        if (CompletedQty >= PlannedQty)
        {
            Status = "COMPLETED";
        }
        else
        {
            Status = "IN_PROGRESS";
        }
        UpdatedAt = DateTimeOffset.UtcNow.ToString("o");
    }

    public void UpdateProgress(int completed, int remaining, string status)
    {
        CompletedQty = completed;
        RemainingQty = remaining;
        Status = status;
        UpdatedAt = DateTimeOffset.UtcNow.ToString("o");
    }
}
