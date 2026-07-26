using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

public sealed class ProductionView : Entity
{
    public string StationId { get; private set; } = default!;
    public string JobId { get; private set; } = default!;
    public string WorkOrderNo { get; private set; } = default!;
    public string ProductCode { get; private set; } = default!;
    public string? ProductSerial { get; private set; }
    public string JobStatus { get; private set; } = default!;
    public string UpdatedAt { get; private set; } = default!;

    private ProductionView() { }

    public static ProductionView Create(
        string stationId,
        string jobId,
        string workOrderNo,
        string productCode,
        string? productSerial,
        string jobStatus)
    {
        return new ProductionView
        {
            Id = stationId,
            StationId = stationId,
            JobId = jobId,
            WorkOrderNo = workOrderNo,
            ProductCode = productCode,
            ProductSerial = productSerial,
            JobStatus = jobStatus,
            UpdatedAt = DateTime.UtcNow.ToString("o")
        };
    }

    public void Update(
        string jobId,
        string workOrderNo,
        string productCode,
        string? productSerial,
        string jobStatus)
    {
        JobId = jobId;
        WorkOrderNo = workOrderNo;
        ProductCode = productCode;
        ProductSerial = productSerial;
        JobStatus = jobStatus;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public void UpdateStatus(string jobStatus)
    {
        JobStatus = jobStatus;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }
}
