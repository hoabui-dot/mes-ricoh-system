using ND.SharedKernel.Primitives;

namespace ND.VisionService.Domain.Entities;

/// <summary>
/// Inspection result from a camera check.
/// Table: vision_results
/// </summary>
public sealed class VisionResult : Entity
{
    public string JobId { get; private set; } = default!;
    public string AttemptId { get; private set; } = default!;
    public string CameraId { get; private set; } = default!;
    public string InspectionResult { get; private set; } = default!; // PASS / FAIL
    public string? DefectCode { get; private set; }  // QR_MISSING / SERIAL_BLUR / OCR_ERROR
    public double? ConfidenceScore { get; private set; }
    public string? OcrText { get; private set; }
    public string? BarcodeValue { get; private set; }
    public string ImagePath { get; private set; } = default!;
    public string InspectedAt { get; private set; } = DateTime.UtcNow.ToString("o");

    private VisionResult() { }

    public static VisionResult CreatePass(
        string jobId, string attemptId, string cameraId,
        string imagePath, double? confidenceScore = null,
        string? ocrText = null, string? barcodeValue = null)
    {
        return new VisionResult
        {
            JobId = jobId,
            AttemptId = attemptId,
            CameraId = cameraId,
            InspectionResult = "PASS",
            ImagePath = imagePath,
            ConfidenceScore = confidenceScore,
            OcrText = ocrText,
            BarcodeValue = barcodeValue
        };
    }

    public static VisionResult CreateFail(
        string jobId, string attemptId, string cameraId,
        string imagePath, string defectCode, double? confidenceScore = null,
        string? ocrText = null)
    {
        return new VisionResult
        {
            JobId = jobId,
            AttemptId = attemptId,
            CameraId = cameraId,
            InspectionResult = "FAIL",
            DefectCode = defectCode,
            ImagePath = imagePath,
            ConfidenceScore = confidenceScore,
            OcrText = ocrText
        };
    }
}
