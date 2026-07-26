using ND.SharedKernel.Primitives;

namespace ND.JobEngine.Domain.Entities;

public sealed class ProductionItem : AuditableEntity
{
    public string OrderNo { get; private set; } = default!;
    public int SequenceNo { get; private set; }
    public string ProductSerial { get; private set; } = default!;
    public string Status { get; private set; } = "PENDING"; // PENDING, PROCESSING, COMPLETED, FAILED
    public string? CurrentJobId { get; private set; }

    private ProductionItem() { }

    public static ProductionItem Create(string orderNo, int sequenceNo, string productSerial)
    {
        return new ProductionItem
        {
            OrderNo = orderNo,
            SequenceNo = sequenceNo,
            ProductSerial = productSerial,
            Status = "PENDING"
        };
    }

    public void AssignJob(string jobId)
    {
        CurrentJobId = jobId;
        Touch();
    }

    public void StartProcessing()
    {
        Status = "PROCESSING";
        Touch();
    }

    public void Complete()
    {
        Status = "COMPLETED";
        Touch();
    }

    public void Fail()
    {
        Status = "FAILED";
        Touch();
    }
}
