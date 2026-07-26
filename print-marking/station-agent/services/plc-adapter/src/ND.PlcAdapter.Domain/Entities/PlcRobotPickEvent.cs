using ND.SharedKernel.Primitives;

namespace ND.PlcAdapter.Domain.Entities;

/// <summary>
/// Robot pick result — used for traceability of reject operations.
/// Table: plc_robot_pick_events
/// </summary>
public sealed class PlcRobotPickEvent : Entity
{
    public string JobId { get; private set; } = default!;
    public string AttemptId { get; private set; } = default!;
    public string PlcId { get; private set; } = default!;
    public string PickResult { get; private set; } = default!; // SUCCESS / FAIL
    public string? PickPosition { get; private set; }
    public string? ErrorCode { get; private set; }
    public string OccurredAt { get; private set; } = DateTime.UtcNow.ToString("o");

    private PlcRobotPickEvent() { }

    public static PlcRobotPickEvent CreateSuccess(string jobId, string attemptId, string plcId, string? pickPosition = null)
        => new() { JobId = jobId, AttemptId = attemptId, PlcId = plcId, PickResult = "SUCCESS", PickPosition = pickPosition };

    public static PlcRobotPickEvent CreateFail(string jobId, string attemptId, string plcId, string errorCode, string? pickPosition = null)
        => new() { JobId = jobId, AttemptId = attemptId, PlcId = plcId, PickResult = "FAIL", ErrorCode = errorCode, PickPosition = pickPosition };
}
