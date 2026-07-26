using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ND.DeviceSimulator.Application.Abstractions;
using ND.DeviceSimulator.Application.Dtos;
using ND.DeviceSimulator.Domain.Entities;
using ND.DeviceSimulator.Infrastructure.Hubs;
using ND.DeviceSimulator.Infrastructure.Persistence;

namespace ND.DeviceSimulator.Infrastructure.VirtualDevices;

/// <summary>
/// Virtual vision inspection service.
/// Called via HTTP POST /api/vision/verify — not a TCP server.
/// Pass rate and failure rate are configurable at runtime.
/// </summary>
public sealed class VirtualVisionService
{
    private static readonly Random Rng = new();
    private static readonly string[] DefectCodes = ["DUPLICATE_CODE", "LOW_CONTRAST", "UNREADABLE"];

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ISimulatorStateService _state;
    private readonly IHubContext<SimulatorHub, ISimulatorClient> _hub;
    private readonly ILogger<VirtualVisionService> _logger;

    public VirtualVisionService(
        IServiceScopeFactory scopeFactory,
        ISimulatorStateService state,
        IHubContext<SimulatorHub, ISimulatorClient> hub,
        ILogger<VirtualVisionService> logger)
    {
        _scopeFactory = scopeFactory;
        _state = state;
        _hub = hub;
        _logger = logger;
    }

    public async Task<VisionResultDto> VerifyAsync(string jobId, int delayMs, CancellationToken ct = default)
    {
        var vState = _state.GetVisionState();
        if (!vState.Online)
        {
            throw new InvalidOperationException("Vision camera is offline/disconnected.");
        }

        var sw = System.Diagnostics.Stopwatch.StartNew();
        await Task.Delay(delayMs, ct);
        sw.Stop();
        var duration = (int)sw.ElapsedMilliseconds;

        VisionResult entity;
        var scenario = _state.GetJobScenario(jobId);
        if (string.IsNullOrEmpty(scenario) && jobId.Contains(':'))
        {
            var parts = jobId.Split(':');
            scenario = _state.GetJobScenario(parts[0]);
        }

        if (string.IsNullOrEmpty(scenario))
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<SimulatorDbContext>();
                var mapping = await db.ProductionOrderMappings
                    .Where(m => m.OrderNumber == jobId || m.ProductionOrderId == jobId || m.EventId == jobId)
                    .OrderByDescending(m => m.OccurredAt)
                    .FirstOrDefaultAsync(ct);

                if (mapping != null)
                {
                    scenario = _state.GetJobScenario(mapping.EventId);
                    if (string.IsNullOrEmpty(scenario) && mapping.EventId.Contains(':'))
                    {
                        var parts = mapping.EventId.Split(':');
                        scenario = _state.GetJobScenario(parts[0]);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to look up production order mapping in VirtualVisionService");
            }
        }

        if (!string.IsNullOrEmpty(scenario))
        {
            _logger.LogInformation("Vision verification for Job {JobId} using scenario {Scenario}", jobId, scenario);
            if (scenario.Equals("success", StringComparison.OrdinalIgnoreCase))
            {
                var confidence = 0.90 + Rng.NextDouble() * 0.09;
                entity = VisionResult.Create(jobId, "PASS", Math.Round(confidence, 3), null, "FC-2026-001", duration);
            }
            else if (scenario.Equals("fail_qr_mismatch", StringComparison.OrdinalIgnoreCase))
            {
                entity = VisionResult.Create(jobId, "FAIL", 0.95, "QR Code mismatch", "FC-2026-007", duration);
            }
            else if (scenario.Equals("fail_unreadable", StringComparison.OrdinalIgnoreCase))
            {
                entity = VisionResult.Create(jobId, "FAIL", 0.42, "Unreadable marking", null, duration);
            }
            else if (scenario.Equals("fail_missing", StringComparison.OrdinalIgnoreCase))
            {
                entity = VisionResult.Create(jobId, "FAIL", 0.0, "Missing marking", null, duration);
            }
            else
            {
                entity = VisionResult.Create(jobId, "FAIL", 0.0, "Unknown scenario defect", null, duration);
            }
        }
        else
        {
            var hardFail = Rng.Next(100) < vState.FailureRate;
            var pass = !hardFail && Rng.Next(100) < vState.PassRate;

            if (hardFail)
            {
                entity = VisionResult.Create(jobId, "FAIL", 0.0, "UNREADABLE", null, duration);
            }
            else if (pass)
            {
                var confidence = 0.90 + Rng.NextDouble() * 0.09;
                var ocrText = $"FC-{Rng.Next(10000, 99999)}";
                entity = VisionResult.Create(jobId, "PASS", Math.Round(confidence, 3), null, ocrText, duration);
            }
            else
            {
                var defect = DefectCodes[Rng.Next(DefectCodes.Length)];
                var confidence = Rng.NextDouble() * 0.5;
                entity = VisionResult.Create(jobId, "FAIL", Math.Round(confidence, 3), defect, null, duration);
            }
        }

        _state.RecordVisionResult(entity.Result);
        await PersistAsync(entity, ct);

        var dto = new VisionResultDto(entity.Id, entity.JobId, entity.Result, entity.DefectCode,
            entity.Confidence, entity.OcrText, entity.DurationMs, entity.VerifiedAt);

        await _hub.Clients.All.VisionVerified(dto);
        await _hub.Clients.All.SimulatorStatusUpdated(_state.GetStatus());
        await AddTimelineAsync(entity.Result == "PASS" ? "OK" : "FAILED",
            $"Vision job={jobId} → {entity.Result}" + (entity.DefectCode is not null ? $" ({entity.DefectCode})" : ""), ct);

        _logger.LogInformation("Vision job={JobId} result={Result} conf={Conf:P1}", jobId, entity.Result, entity.Confidence);
        return dto;
    }

    public void UpdateConfig(int passRate, int failureRate) =>
        _state.SetVisionConfig(passRate, failureRate);

    private async Task PersistAsync(VisionResult entity, CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SimulatorDbContext>();
        db.VisionResults.Add(entity);

        var count = await db.VisionResults.CountAsync(ct);
        if (count > 500)
        {
            var oldest = await db.VisionResults.OrderBy(r => r.VerifiedAt).Take(count - 500).ToListAsync(ct);
            db.VisionResults.RemoveRange(oldest);
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task AddTimelineAsync(string status, string detail, CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SimulatorDbContext>();
        var evt = TimelineEvent.Create("VISION_VERIFIED", status, detail);
        db.TimelineEvents.Add(evt);
        await db.SaveChangesAsync(ct);
        await _hub.Clients.All.TimelineEventAdded(new TimelineEventDto(evt.Id, evt.Stage, evt.Status, evt.Detail, evt.OccurredAt));
    }
}
