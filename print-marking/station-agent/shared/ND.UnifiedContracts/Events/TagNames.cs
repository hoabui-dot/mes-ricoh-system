namespace ND.UnifiedContracts.Events;

/// <summary>
/// Canonical tag name constants used across all services.
/// Prevents magic strings scattered through the codebase.
/// </summary>
public static class TagNames
{
    // Job lifecycle
    public const string JobNo = "job.no";
    public const string JobType = "job.type";
    public const string JobStatus = "job.status";
    public const string JobAttemptNo = "job.attempt_no";
    public const string JobProductCode = "job.product_code";
    public const string JobProductSerial = "job.product_serial";
    public const string JobErrorMessage = "job.error_message";

    // Marking / print
    public const string MarkingType = "marking.type";
    public const string MarkingTemplate = "marking.template";
    public const string MarkingStatus = "marking.status";
    public const string MarkingContent = "marking.content";

    // Print
    public const string PrintTemplate = "print.template";
    public const string PrintStatus = "print.status";
    public const string PrintCopies = "print.copies";

    // Vision
    public const string VisionResult = "vision.result";
    public const string VisionDefectCode = "vision.defect_code";
    public const string VisionConfidence = "vision.confidence";
    public const string VisionOcrText = "vision.ocr_text";
    public const string VisionBarcodeValue = "vision.barcode_value";

    // PLC
    public const string PlcCommand = "plc.command";
    public const string PlcStatus = "plc.status";
    public const string PlcPickResult = "plc.pick_result";

    // Device health
    public const string DeviceId = "device.id";
    public const string DeviceStatus = "device.status";
    public const string DeviceHeartbeat = "device.heartbeat";

    // Station
    public const string StationId = "station.id";
    public const string StationStatus = "station.status";
}
