using ND.SharedKernel.Primitives;

namespace ND.DeviceSimulator.Domain.Entities;

/// <summary>
/// Record of a vision verification result.
/// Table: vision_results
/// </summary>
public sealed class VisionResult : Entity
{
    public string JobId { get; private set; } = default!;
    public string Result { get; private set; } = default!;      // PASS / FAIL
    public string? DefectCode { get; private set; }             // DUPLICATE_CODE / LOW_CONTRAST / UNREADABLE
    public double? Confidence { get; private set; }             // 0.0 - 1.0
    public string? OcrText { get; private set; }
    public int DurationMs { get; private set; }
    public string VerifiedAt { get; private set; } = default!;

    private VisionResult() { }

    public static VisionResult Create(
        string jobId, string result, double? confidence,
        string? defectCode, string? ocrText, int durationMs)
        => new()
        {
            JobId = jobId,
            Result = result,
            DefectCode = defectCode,
            Confidence = confidence,
            OcrText = ocrText,
            DurationMs = durationMs,
            VerifiedAt = DateTime.UtcNow.ToString("o")
        };
}
