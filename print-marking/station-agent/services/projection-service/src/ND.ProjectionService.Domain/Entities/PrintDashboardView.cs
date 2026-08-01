using ND.SharedKernel.Primitives;

namespace ND.ProjectionService.Domain.Entities;

/// <summary>
/// Current, server-owned projection for the active MES work-order print flow.
/// It is intentionally separate from the legacy per-label production tables.
/// </summary>
public sealed class PrintDashboardView : Entity
{
    public string StationId { get; private set; } = default!;
    public string WorkOrderId { get; private set; } = default!;
    public string WorkOrderCode { get; private set; } = default!;
    public string WorkOrderStatus { get; private set; } = "UNKNOWN";
    public string ProductCode { get; private set; } = default!;
    public string? ProductName { get; private set; }
    public string? OperationCode { get; private set; }
    public string? OperationName { get; private set; }
    public string? WorkstationCode { get; private set; }
    public string? PrintStationCode { get; private set; }
    public string? PrinterCode { get; private set; }
    public decimal RequestedQuantity { get; private set; }
    public decimal RequiredLabelQuantity { get; private set; }
    public decimal TotalLabelCount { get; private set; }
    public decimal QueuedLabelCount { get; private set; }
    public decimal PrintedLabelCount { get; private set; }
    public decimal FailedLabelCount { get; private set; }
    public decimal RemainingLabelCount { get; private set; }
    public string? PrintJobId { get; private set; }
    public string PrintJobStatus { get; private set; } = "Unknown";
    public int BatchSize { get; private set; }
    public int TotalBatches { get; private set; }
    public int CompletedBatches { get; private set; }
    public string? LastKafkaEventId { get; private set; }
    public string? LastKafkaEventType { get; private set; }
    public string? LastKafkaEventAt { get; private set; }
    public string? LastPrinterResultAt { get; private set; }
    public string UpdatedAt { get; private set; } = default!;

    private PrintDashboardView() { }

    public static PrintDashboardView Create(string stationId, string workOrderId, string workOrderCode, string productCode)
    {
        var now = DateTimeOffset.UtcNow.ToString("o");
        return new PrintDashboardView
        {
            Id = $"{stationId}:{workOrderId}",
            StationId = stationId,
            WorkOrderId = workOrderId,
            WorkOrderCode = workOrderCode,
            ProductCode = productCode,
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    public void Apply(
        string workOrderCode,
        string productCode,
        string? operationCode,
        string? operationName,
        string? workstationCode,
        string? printStationCode,
        string? printerCode,
        decimal? requestedQuantity,
        decimal? requiredLabelQuantity,
        decimal? totalLabelCount,
        decimal? queuedLabelCount,
        decimal? printedLabelCount,
        decimal? failedLabelCount,
        decimal? remainingLabelCount,
        string? printJobId,
        string? printJobStatus,
        int? batchSize,
        int? totalBatches,
        int? completedBatches,
        string workOrderStatus,
        string eventId,
        string eventType,
        string eventAt,
        string? printerResultAt = null,
        string? productName = null)
    {
        WorkOrderCode = string.IsNullOrWhiteSpace(workOrderCode) ? WorkOrderCode : workOrderCode;
        ProductCode = string.IsNullOrWhiteSpace(productCode) ? ProductCode : productCode;
        ProductName ??= productName;
        OperationCode = operationCode ?? OperationCode;
        OperationName = operationName ?? OperationName;
        WorkstationCode = workstationCode ?? WorkstationCode;
        PrintStationCode = printStationCode ?? PrintStationCode;
        PrinterCode = printerCode ?? PrinterCode;
        RequestedQuantity = requestedQuantity ?? RequestedQuantity;
        RequiredLabelQuantity = requiredLabelQuantity ?? RequiredLabelQuantity;
        TotalLabelCount = totalLabelCount ?? TotalLabelCount;
        QueuedLabelCount = queuedLabelCount ?? QueuedLabelCount;
        PrintedLabelCount = printedLabelCount ?? PrintedLabelCount;
        FailedLabelCount = failedLabelCount ?? FailedLabelCount;
        RemainingLabelCount = remainingLabelCount ?? RemainingLabelCount;
        PrintJobId = printJobId ?? PrintJobId;
        if (!string.IsNullOrWhiteSpace(printJobStatus)) PrintJobStatus = printJobStatus;
        BatchSize = batchSize ?? BatchSize;
        TotalBatches = totalBatches ?? TotalBatches;
        CompletedBatches = completedBatches ?? CompletedBatches;
        WorkOrderStatus = workOrderStatus;
        LastKafkaEventId = eventId;
        LastKafkaEventType = eventType;
        LastKafkaEventAt = eventAt;
        LastPrinterResultAt = printerResultAt ?? LastPrinterResultAt;
        UpdatedAt = DateTimeOffset.UtcNow.ToString("o");
    }
}
