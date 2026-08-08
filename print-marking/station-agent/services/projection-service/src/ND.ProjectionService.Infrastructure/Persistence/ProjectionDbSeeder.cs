using Microsoft.EntityFrameworkCore;
using ND.ProjectionService.Domain.Entities;
using ND.ProjectionService.Domain.Alarms;

namespace ND.ProjectionService.Infrastructure.Persistence;

public static class ProjectionDbSeeder
{
    public static async Task SeedAsync(ProjectionDbContext db, bool seedAlarms = false)
    {
        if (!await db.DeviceStatuses.AnyAsync())
        {
            var nowStr = DateTime.UtcNow.ToString("o");
            var devices = new List<DeviceStatus>
            {
                DeviceStatus.Create("plc-01", "PLC", isOnline: true, nowStr),
                DeviceStatus.Create("printer-01", "PRINTER", isOnline: true, nowStr),
                DeviceStatus.Create("laser-01", "LASER", isOnline: true, nowStr),
                DeviceStatus.Create("camera-01", "VISION_CAMERA", isOnline: true, nowStr),
                DeviceStatus.Create("gateway-01", "GATEWAY", isOnline: true, nowStr)
            };

            await db.DeviceStatuses.AddRangeAsync(devices);
            await db.SaveChangesAsync();
        }

        if (seedAlarms)
        {
            foreach (var (id, type) in new[] { ("PRINTER-01", "PRINTER"), ("PRINTER-02", "PRINTER"),
                ("LASER-01", "LASER"), ("VISION-01", "VISION"), ("PLC-01", "PLC") })
                if (!await db.DeviceStatuses.AnyAsync(x => x.DeviceId == id))
                    await db.DeviceStatuses.AddAsync(DeviceStatus.Create(id, type, true, DateTime.UtcNow.ToString("o")));

            foreach (var (id, type, station) in new[] { ("seed-job-print", "PRINT_ONLY", "STATION-01"),
                ("seed-job-mark", "MARK_ONLY", "STATION-01"), ("seed-job-combined", "PRINT_AND_MARK", "STATION-01"),
                ("seed-job-verify", "VERIFY_ONLY", "STATION-02"), ("seed-job-rework", "REWORK", "STATION-02") })
                if (!await db.ProductionRecords.AnyAsync(x => x.JobId == id))
                    await db.ProductionRecords.AddAsync(ProductionRecord.Create(id, $"WO-{id}", "SKU-SEED",
                        $"SN-{id}", type, station, "PROCESSING"));
            await db.SaveChangesAsync();
            await SeedAlarmsAsync(db);
        }
    }

    private static async Task SeedAlarmsAsync(ProjectionDbContext db)
    {
        var at = new DateTime(2026, 8, 5, 0, 0, 0, DateTimeKind.Utc);
        Alarm Make(string id, string code, string severity, string category, string source, string sourceId,
            string station = "STATION-01", string? jobId = null) =>
            Alarm.Raise(code, $"{station}:{sourceId}:{code}:{id}", severity, category, station,
                "projection-service-seed", source, sourceId, $"alarm.{code.ToLowerInvariant()}.title",
                $"alarm.{code.ToLowerInvariant()}.message", "{}", at, "Deterministic development seed",
                correlationId: $"corr-{id}", deviceId: category is AlarmCategory.Device or AlarmCategory.Quality ? sourceId : null,
                jobId: jobId, workOrderNo: jobId is null ? null : $"WO-{jobId}", productCode: "SKU-SEED",
                productSerial: jobId is null ? null : $"SN-{jobId}", id: id,
                productionImpact: jobId is null ? null : "BLOCKED");

        var criticalPrinter = Make("seed-alarm-01-printer-critical", "PRINTER_OFFLINE", AlarmSeverity.Critical, AlarmCategory.Device, "PRINTER", "PRINTER-01", jobId: "seed-job-print");
        var highPrinter = Make("seed-alarm-02-printer-high", "PRINTER_OFFLINE", AlarmSeverity.High, AlarmCategory.Device, "PRINTER", "PRINTER-02");
        var paperOut = Make("seed-alarm-03-paper-out", "PRINTER_PAPER_OUT", AlarmSeverity.Medium, AlarmCategory.Device, "PRINTER", "PRINTER-01");
        var laserSdk = Make("seed-alarm-04-laser-sdk", "LASER_SDK_CONNECTION_FAILURE", AlarmSeverity.High, AlarmCategory.Device, "LASER", "LASER-01");
        var laserExecution = Make("seed-alarm-05-laser-execution", "LASER_EXECUTION_FAILURE", AlarmSeverity.Critical, AlarmCategory.Device, "LASER", "LASER-01", jobId: "seed-job-mark");
        var visionMismatch = Make("seed-alarm-06-vision-mismatch", "VISION_OCR_MISMATCH", AlarmSeverity.High, AlarmCategory.Quality, "VISION", "VISION-01", "STATION-02", "seed-job-verify");
        var visionExhausted = Make("seed-alarm-07-vision-exhausted", "VISION_RETRY_EXHAUSTED", AlarmSeverity.Critical, AlarmCategory.Quality, "VISION", "VISION-01", "STATION-02", "seed-job-verify");
        var plcFailure = Make("seed-alarm-08-plc", "PLC_COMMUNICATION_FAILURE", AlarmSeverity.High, AlarmCategory.Device, "PLC", "PLC-01");
        var kafkaDelay = Make("seed-alarm-09-kafka-delay", "KAFKA_OUTBOX_DELAY", AlarmSeverity.Medium, AlarmCategory.Network, "RABBITMQ_BRIDGE", "broker-01");
        var projectionLag = Make("seed-alarm-10-projection-lag", "PROJECTION_LAG", AlarmSeverity.Medium, AlarmCategory.System, "PROJECTION", "projection-01");
        var jobFailed = Make("seed-alarm-11-job-failed", "JOB_FAILED", AlarmSeverity.High, AlarmCategory.Job, "JOB", "seed-job-combined", jobId: "seed-job-combined");
        var jobRetryExhausted = Make("seed-alarm-12-job-retry", "JOB_RETRY_EXHAUSTED", AlarmSeverity.Critical, AlarmCategory.Job, "JOB", "seed-job-rework", "STATION-02", "seed-job-rework");
        var staleUi = Make("seed-alarm-13-signalr-stale", "SIGNALR_STALE_DATA", AlarmSeverity.Low, AlarmCategory.Network, "SIGNALR", "kiosk-01");
        var acknowledged = Make("seed-alarm-14-acknowledged", "PLC_INPUT_STUCK", AlarmSeverity.Medium, AlarmCategory.Device, "PLC", "PLC-01");
        acknowledged.Acknowledge("seed-supervisor", at.AddMinutes(1));
        var assigned = Make("seed-alarm-15-assigned", "PRINTER_RIBBON_LOW", AlarmSeverity.Low, AlarmCategory.Device, "PRINTER", "PRINTER-02");
        assigned.Assign("maintenance.seed", at.AddMinutes(1));
        var inProgress = Make("seed-alarm-16-in-progress", "LASER_CONNECTION_FAILURE", AlarmSeverity.High, AlarmCategory.Device, "LASER", "LASER-01");
        inProgress.StartWork("seed-maintainer", at.AddMinutes(1));
        var autoCleared = Make("seed-alarm-17-auto-cleared", "DEVICE_RECOVERED", AlarmSeverity.Low, AlarmCategory.Device, "PRINTER", "PRINTER-02");
        autoCleared.Clear("system", AlarmResolution.AutoRecovered, "Recovered automatically", at.AddMinutes(2));
        var manualCleared = Make("seed-alarm-18-manual-cleared", "PRINTER_HEAD_OPEN", AlarmSeverity.Medium, AlarmCategory.Device, "PRINTER", "PRINTER-01");
        manualCleared.Clear("supervisor.seed", AlarmResolution.ManualReset, "Manual reset verified", at.AddMinutes(2));
        var closed = Make("seed-alarm-19-closed", "JOB_STEP_FAILED", AlarmSeverity.High, AlarmCategory.Job, "JOB", "seed-job-combined", jobId: "seed-job-combined");
        closed.Clear("seed-supervisor", AlarmResolution.JobRetried, "Job retry completed", at.AddMinutes(2)); closed.Close("seed-supervisor", at.AddMinutes(3));
        var suppressed = Make("seed-alarm-20-suppressed", "MAINTENANCE_WINDOW", AlarmSeverity.Low, AlarmCategory.Maintenance, "PRINTER", "PRINTER-02");
        suppressed.Suppress("Planned deterministic maintenance", at.AddYears(10), at.AddMinutes(1));
        var repeated = Make("seed-alarm-21-repeated", "PRINTER_RIBBON_OUT", AlarmSeverity.Medium, AlarmCategory.Device, "PRINTER", "PRINTER-01");
        for (var i = 1; i <= 11; i++) repeated.Repeat(at.AddMinutes(i));
        var escalated = Make("seed-alarm-22-escalated", "PRINTER_TEMPERATURE_HIGH", AlarmSeverity.High, AlarmCategory.Device, "PRINTER", "PRINTER-01"); escalated.Escalate(1, at.AddMinutes(31));
        var reopened = Make("seed-alarm-23-reopened", "VISION_RESULT_MISSING", AlarmSeverity.High, AlarmCategory.Quality, "VISION", "VISION-01", "STATION-02", "seed-job-verify");
        reopened.Acknowledge("operator.seed", at.AddMinutes(1)); reopened.StartWork("operator.seed", at.AddMinutes(2));
        reopened.Clear("supervisor.seed", AlarmResolution.ManualReset, "Vision recovered", at.AddMinutes(3)); reopened.Reopen(at.AddMinutes(4));
        var bypass = Make("seed-alarm-24-vision-bypass", "VISION_BYPASS_AUDIT", AlarmSeverity.High, AlarmCategory.Quality, "VISION", "VISION-01", "STATION-02", "seed-job-rework");
        bypass.Clear("supervisor.seed", AlarmResolution.BypassedBySupervisor, "Seed reason: approved controlled bypass", at.AddMinutes(5));
        var concurrent = Make("seed-alarm-25-concurrent-ack", "CONCURRENT_ACK_TEST", AlarmSeverity.Medium, AlarmCategory.System, "TEST", "concurrency-01");

        var alarms = new[] { criticalPrinter, highPrinter, paperOut, laserSdk, laserExecution,
            visionMismatch, visionExhausted, plcFailure, kafkaDelay, projectionLag, jobFailed,
            jobRetryExhausted, staleUi, acknowledged, assigned, inProgress, autoCleared,
            manualCleared, closed, suppressed, repeated, escalated, reopened, bypass, concurrent };
        var existingIds = await db.Alarms.Where(x => x.Id.StartsWith("seed-alarm-"))
            .Select(x => x.Id).ToListAsync();
        await db.Alarms.AddRangeAsync(alarms.Where(x => !existingIds.Contains(x.Id)));
        await db.SaveChangesAsync();

        if (!await db.AlarmTimelineEvents.AnyAsync(x => x.AlarmId == reopened.Id))
        {
            var steps = new[] { (AlarmAction.Raised, (string?)null, AlarmState.Raised),
                (AlarmAction.Acknowledged, AlarmState.Raised, AlarmState.Acknowledged),
                (AlarmAction.Assigned, AlarmState.Acknowledged, AlarmState.Acknowledged),
                (AlarmAction.WorkStarted, AlarmState.Acknowledged, AlarmState.InProgress),
                (AlarmAction.Cleared, AlarmState.InProgress, AlarmState.Cleared),
                ("ALARM_REOPENED", AlarmState.Cleared, AlarmState.Raised),
                (AlarmAction.Repeated, AlarmState.Raised, AlarmState.Raised),
                (AlarmAction.Escalated, AlarmState.Raised, AlarmState.Raised) };
            var index = 0;
            await db.AlarmTimelineEvents.AddRangeAsync(steps.Select(x => AlarmTimelineEvent.Create(
                reopened.Id, x.Item1, x.Item2, x.Item3, "seed-user", "supervisor.seed", "SUPERVISOR",
                $"Deterministic timeline step {++index}", "{}", at.AddMinutes(index), $"corr-{reopened.Id}")));
            await db.SaveChangesAsync();
        }
    }
}
