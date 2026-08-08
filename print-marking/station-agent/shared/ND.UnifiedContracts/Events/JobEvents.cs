using System.Text.Json.Serialization;

namespace ND.UnifiedContracts.Events;

/// <summary>
/// Base record shared by all Job Engine domain events.
/// Consumers can deserialise to this type to inspect <see cref="EventType"/>
/// before deciding which specific event to map to.
/// </summary>
public record JobEventBase
{
    [JsonPropertyName("event_type")]
    public required string EventType { get; init; }

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("job_id")]
    public required string JobId { get; init; }

    [JsonPropertyName("job_no")]
    public required string JobNo { get; init; }

    [JsonPropertyName("job_type")]
    public required string JobType { get; init; }

    [JsonPropertyName("product_code")]
    public required string ProductCode { get; init; }

    [JsonPropertyName("product_serial")]
    public string? ProductSerial { get; init; }

    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("source_system")]
    public required string SourceSystem { get; init; }

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }
}

/// <summary>
/// Published when a new Production Order is created.
/// RabbitMQ routing key: <c>production.order.created</c>
/// </summary>
public sealed record ProductionOrderCreatedEvent : JobEventBase
{
    [JsonPropertyName("planned_qty")]
    public required int PlannedQty { get; init; }

    public static ProductionOrderCreatedEvent From(
        string orderNo,
        string productCode,
        int plannedQty,
        string sourceSystem)
    {
        return new ProductionOrderCreatedEvent
        {
            EventType = "ProductionOrderCreated",
            EventId = $"evt-order-created-{Guid.NewGuid():N}",
            JobId = orderNo,
            JobNo = orderNo,
            JobType = "PRODUCTION_ORDER",
            ProductCode = productCode,
            Status = "CREATED",
            SourceSystem = sourceSystem,
            PlannedQty = plannedQty,
            Timestamp = DateTimeOffset.UtcNow.ToString("o")
        };
    }
}

/// <summary>
/// Published when a new Job is created in the Job Engine.
/// RabbitMQ routing key: <c>job.created</c>
/// </summary>
public sealed record JobCreatedEvent : JobEventBase
{
    [JsonPropertyName("idempotency_key")]
    public string? IdempotencyKey { get; init; }

    public static JobCreatedEvent From(
        string jobId,
        string jobNo,
        string jobType,
        string productCode,
        string? productSerial,
        string sourceSystem,
        string? idempotencyKey = null)
    {
        return new JobCreatedEvent
        {
            EventType = "JobCreated",
            EventId = $"evt-job-created-{Guid.NewGuid():N}",
            JobId = jobId,
            JobNo = jobNo,
            JobType = jobType,
            ProductCode = productCode,
            ProductSerial = productSerial,
            Status = "CREATED",
            SourceSystem = sourceSystem,
            IdempotencyKey = idempotencyKey,
            Timestamp = DateTimeOffset.UtcNow.ToString("o")
        };
    }
}

/// <summary>
/// Published when a Job starts processing (attempt begins).
/// RabbitMQ routing key: <c>job.processing</c>
/// </summary>
public sealed record JobProcessingEvent : JobEventBase
{
    [JsonPropertyName("attempt_no")]
    public int AttemptNo { get; init; }

    [JsonPropertyName("payload_json")]
    public string? PayloadJson { get; init; }

    [JsonPropertyName("target_printer")]
    public string? TargetPrinter { get; init; }

    /// <summary>
    /// Execution target chosen by the operator in the Dispatch Dialog.
    /// Values: "simulation" (default) | "production-printer"
    /// </summary>
    [JsonPropertyName("dispatch_target")]
    public string? DispatchTarget { get; init; }

    public static JobProcessingEvent From(
        string jobId,
        string jobNo,
        string jobType,
        string productCode,
        string? productSerial,
        string sourceSystem,
        int attemptNo,
        string? payloadJson = null,
        string? targetPrinter = null,
        string? dispatchTarget = null)
    {
        return new JobProcessingEvent
        {
            EventType = "JobProcessing",
            EventId = $"evt-job-processing-{Guid.NewGuid():N}",
            JobId = jobId,
            JobNo = jobNo,
            JobType = jobType,
            ProductCode = productCode,
            ProductSerial = productSerial,
            Status = "PROCESSING",
            SourceSystem = sourceSystem,
            Timestamp = DateTimeOffset.UtcNow.ToString("o"),
            AttemptNo = attemptNo,
            PayloadJson = payloadJson,
            TargetPrinter = targetPrinter,
            DispatchTarget = dispatchTarget ?? "simulation"
        };
    }
}

/// <summary>
/// Published when a Job completes successfully.
/// RabbitMQ routing key: <c>job.completed</c>
/// </summary>
public sealed record JobCompletedEvent : JobEventBase
{
    [JsonPropertyName("completed_at")]
    public required string CompletedAt { get; init; }

    public static JobCompletedEvent From(
        string jobId,
        string jobNo,
        string jobType,
        string productCode,
        string? productSerial,
        string sourceSystem)
    {
        var now = DateTimeOffset.UtcNow.ToString("o");
        return new JobCompletedEvent
        {
            EventType = "JobCompleted",
            EventId = $"evt-job-completed-{Guid.NewGuid():N}",
            JobId = jobId,
            JobNo = jobNo,
            JobType = jobType,
            ProductCode = productCode,
            ProductSerial = productSerial,
            Status = "COMPLETED",
            SourceSystem = sourceSystem,
            Timestamp = now,
            CompletedAt = now
        };
    }
}

/// <summary>
/// Published when a Job fails permanently.
/// RabbitMQ routing key: <c>job.failed</c>
/// </summary>
public sealed record JobFailedEvent : JobEventBase
{
    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; init; }

    public static JobFailedEvent From(
        string jobId,
        string jobNo,
        string jobType,
        string productCode,
        string? productSerial,
        string sourceSystem,
        string? errorMessage = null)
    {
        return new JobFailedEvent
        {
            EventType = "JobFailed",
            EventId = $"evt-job-failed-{Guid.NewGuid():N}",
            JobId = jobId,
            JobNo = jobNo,
            JobType = jobType,
            ProductCode = productCode,
            ProductSerial = productSerial,
            Status = "FAILED",
            SourceSystem = sourceSystem,
            Timestamp = DateTimeOffset.UtcNow.ToString("o"),
            ErrorMessage = errorMessage
        };
    }
}

/// <summary>
/// Published when a printer completes a print job.
/// RabbitMQ routing key: <c>printer.printed</c>
/// </summary>
public sealed record PrinterPrintedEvent
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "PrinterPrinted";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("job_id")]
    public required string JobId { get; init; }

    [JsonPropertyName("job_no")]
    public required string JobNo { get; init; }

    [JsonPropertyName("printer_code")]
    public required string PrinterCode { get; init; }

    [JsonPropertyName("success")]
    public required bool Success { get; init; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; init; }

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }
}

/// <summary>
/// Published when a laser adapter completes a mark job.
/// RabbitMQ routing key: <c>laser.marked</c>
/// </summary>
public sealed record LaserMarkedEvent
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "LaserMarked";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("job_id")]
    public required string JobId { get; init; }

    [JsonPropertyName("job_no")]
    public required string JobNo { get; init; }

    [JsonPropertyName("laser_code")]
    public required string LaserCode { get; init; }

    [JsonPropertyName("success")]
    public required bool Success { get; init; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; init; }

    [JsonPropertyName("duration_ms")]
    public int DurationMs { get; init; }

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }
}

/// <summary>
/// Published by the Kiosk UI API when an operator triggers a Manual Override action.
/// Consuming services (e.g. Job Engine) decide how to process this command.
/// RabbitMQ routing key: <c>command.manual-override</c>
/// </summary>
public sealed record ManualOverrideRequestedEvent
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "ManualOverrideRequested";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("station_id")]
    public required string StationId { get; init; }

    [JsonPropertyName("job_id")]
    public string? JobId { get; init; }

    [JsonPropertyName("work_order")]
    public string? WorkOrder { get; init; }

    [JsonPropertyName("product_code")]
    public string? ProductCode { get; init; }

    [JsonPropertyName("operator")]
    public required string Operator { get; init; }

    [JsonPropertyName("reason")]
    public string? Reason { get; init; }

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }

    public static ManualOverrideRequestedEvent Create(
        string stationId,
        string operatorUserId,
        string? jobId = null,
        string? workOrder = null,
        string? productCode = null,
        string? reason = null)
    {
        return new ManualOverrideRequestedEvent
        {
            EventId = $"evt-override-{Guid.NewGuid():N}",
            StationId = stationId,
            JobId = jobId,
            WorkOrder = workOrder,
            ProductCode = productCode,
            Operator = operatorUserId,
            Reason = reason,
            Timestamp = DateTimeOffset.UtcNow.ToString("o")
        };
    }
}

/// <summary>
/// Event generated when a manual reprint is requested from Kiosk UI.
/// Routing key: command.manual-reprint
/// </summary>
public sealed record ManualReprintRequestedEvent
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "ManualReprintRequested";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("station_id")]
    public required string StationId { get; init; }

    [JsonPropertyName("originalExecutionId")]
    public required string OriginalExecutionId { get; init; }

    [JsonPropertyName("job_id")]
    public string JobId => OriginalExecutionId;

    [JsonPropertyName("job_no")]
    public required string JobNo { get; init; }

    [JsonPropertyName("product_code")]
    public required string ProductCode { get; init; }

    [JsonPropertyName("parent_attempt_id")]
    public required string ParentAttemptId { get; init; }

    [JsonPropertyName("requested_by")]
    public required string RequestedBy { get; init; }

    [JsonPropertyName("reason_code")]
    public required string ReasonCode { get; init; }

    [JsonPropertyName("comment")]
    public string? Comment { get; init; }

    [JsonPropertyName("reason_description")]
    public string? ReasonDescription => Comment;

    [JsonPropertyName("requested_at")]
    public required string RequestedAt { get; init; }

    public static ManualReprintRequestedEvent Create(
        string stationId,
        string jobId,
        string jobNo,
        string productCode,
        string parentAttemptId,
        string requestedBy,
        string reasonCode,
        string? reasonDescription = null)
    {
        return new ManualReprintRequestedEvent
        {
            EventId = $"evt-manual-reprint-{Guid.NewGuid():N}",
            StationId = stationId,
            OriginalExecutionId = jobId,
            JobNo = jobNo,
            ProductCode = productCode,
            ParentAttemptId = parentAttemptId,
            RequestedBy = requestedBy,
            ReasonCode = reasonCode,
            Comment = reasonDescription,
            RequestedAt = DateTimeOffset.UtcNow.ToString("o")
        };
    }
}

/// <summary>
/// Event generated when a manual re-marking is requested from Kiosk UI.
/// Routing key: command.manual-remarking
/// </summary>
public sealed record ManualRemarkingRequestedEvent
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "ManualRemarkingRequested";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("station_id")]
    public required string StationId { get; init; }

    [JsonPropertyName("originalExecutionId")]
    public required string OriginalExecutionId { get; init; }

    [JsonPropertyName("job_id")]
    public string JobId => OriginalExecutionId;

    [JsonPropertyName("job_no")]
    public required string JobNo { get; init; }

    [JsonPropertyName("product_code")]
    public required string ProductCode { get; init; }

    [JsonPropertyName("parent_attempt_id")]
    public required string ParentAttemptId { get; init; }

    [JsonPropertyName("requested_by")]
    public required string RequestedBy { get; init; }

    [JsonPropertyName("reason_code")]
    public required string ReasonCode { get; init; }

    [JsonPropertyName("comment")]
    public string? Comment { get; init; }

    [JsonPropertyName("reason_description")]
    public string? ReasonDescription => Comment;

    [JsonPropertyName("requested_at")]
    public required string RequestedAt { get; init; }

    public static ManualRemarkingRequestedEvent Create(
        string stationId,
        string jobId,
        string jobNo,
        string productCode,
        string parentAttemptId,
        string requestedBy,
        string reasonCode,
        string? reasonDescription = null)
    {
        return new ManualRemarkingRequestedEvent
        {
            EventId = $"evt-manual-remarking-{Guid.NewGuid():N}",
            StationId = stationId,
            OriginalExecutionId = jobId,
            JobNo = jobNo,
            ProductCode = productCode,
            ParentAttemptId = parentAttemptId,
            RequestedBy = requestedBy,
            ReasonCode = reasonCode,
            Comment = reasonDescription,
            RequestedAt = DateTimeOffset.UtcNow.ToString("o")
        };
    }
}

/// <summary>
/// Event generated when a manual reprocessing (re-run print + marking) is requested from Kiosk UI.
/// Routing key: command.manual-reprocess
/// </summary>
public sealed record ManualReprocessingRequestedEvent
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "ManualReprocessingRequested";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("station_id")]
    public required string StationId { get; init; }

    [JsonPropertyName("originalExecutionId")]
    public required string OriginalExecutionId { get; init; }

    [JsonPropertyName("job_id")]
    public string JobId => OriginalExecutionId;

    [JsonPropertyName("job_no")]
    public required string JobNo { get; init; }

    [JsonPropertyName("product_code")]
    public required string ProductCode { get; init; }

    [JsonPropertyName("parent_attempt_id")]
    public required string ParentAttemptId { get; init; }

    [JsonPropertyName("requested_by")]
    public required string RequestedBy { get; init; }

    [JsonPropertyName("reason_code")]
    public required string ReasonCode { get; init; }

    [JsonPropertyName("comment")]
    public string? Comment { get; init; }

    [JsonPropertyName("reason_description")]
    public string? ReasonDescription => Comment;

    [JsonPropertyName("requested_at")]
    public required string RequestedAt { get; init; }

    public static ManualReprocessingRequestedEvent Create(
        string stationId,
        string jobId,
        string jobNo,
        string productCode,
        string parentAttemptId,
        string requestedBy,
        string reasonCode,
        string? reasonDescription = null)
    {
        return new ManualReprocessingRequestedEvent
        {
            EventId = $"evt-manual-reprocess-{Guid.NewGuid():N}",
            StationId = stationId,
            OriginalExecutionId = jobId,
            JobNo = jobNo,
            ProductCode = productCode,
            ParentAttemptId = parentAttemptId,
            RequestedBy = requestedBy,
            ReasonCode = reasonCode,
            Comment = reasonDescription,
            RequestedAt = DateTimeOffset.UtcNow.ToString("o")
        };
    }
}

/// <summary>
/// Event generated when a manual reprint and laser marking is requested from Kiosk UI.
/// </summary>
public sealed record ManualReprintAndRemarkingRequestedEvent
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "ManualReprintAndRemarkingRequested";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("station_id")]
    public required string StationId { get; init; }

    [JsonPropertyName("originalExecutionId")]
    public required string OriginalExecutionId { get; init; }

    [JsonPropertyName("job_id")]
    public string JobId => OriginalExecutionId;

    [JsonPropertyName("job_no")]
    public required string JobNo { get; init; }

    [JsonPropertyName("product_code")]
    public required string ProductCode { get; init; }

    [JsonPropertyName("parent_attempt_id")]
    public required string ParentAttemptId { get; init; }

    [JsonPropertyName("requested_by")]
    public required string RequestedBy { get; init; }

    [JsonPropertyName("reason_code")]
    public required string ReasonCode { get; init; }

    [JsonPropertyName("comment")]
    public string? Comment { get; init; }

    [JsonPropertyName("reason_description")]
    public string? ReasonDescription => Comment;

    [JsonPropertyName("requested_at")]
    public required string RequestedAt { get; init; }

    public static ManualReprintAndRemarkingRequestedEvent Create(
        string stationId,
        string jobId,
        string jobNo,
        string productCode,
        string parentAttemptId,
        string requestedBy,
        string reasonCode,
        string? reasonDescription = null)
    {
        return new ManualReprintAndRemarkingRequestedEvent
        {
            EventId = $"evt-manual-reprint-remark-{Guid.NewGuid():N}",
            StationId = stationId,
            OriginalExecutionId = jobId,
            JobNo = jobNo,
            ProductCode = productCode,
            ParentAttemptId = parentAttemptId,
            RequestedBy = requestedBy,
            ReasonCode = reasonCode,
            Comment = reasonDescription,
            RequestedAt = DateTimeOffset.UtcNow.ToString("o")
        };
    }
}

/// <summary>
/// Published by the Printer Adapter health-check service every 15 seconds.
/// RabbitMQ routing key: <c>printer.health-changed</c>
/// </summary>
public sealed record PrinterHealthChangedEvent
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "PrinterHealthChanged";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("printer_code")]
    public required string PrinterCode { get; init; }

    [JsonPropertyName("driver_type")]
    public required string DriverType { get; init; }

    /// <summary>Idle | Printing | Stopped | Offline | Disconnected</summary>
    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("queue_name")]
    public string? QueueName { get; init; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; init; }

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }

    public static PrinterHealthChangedEvent Create(
        string printerCode,
        string driverType,
        string status,
        string? queueName = null,
        string? errorMessage = null)
    {
        return new PrinterHealthChangedEvent
        {
            EventId = $"evt-printer-health-{Guid.NewGuid():N}",
            PrinterCode = printerCode,
            DriverType = driverType,
            Status = status,
            QueueName = queueName,
            ErrorMessage = errorMessage,
            Timestamp = DateTimeOffset.UtcNow.ToString("o")
        };
    }
}

/// <summary>
/// Routing key constants for Job domain events.
/// </summary>
public static class JobEventRoutingKeys
{
    public const string ProductionOrderCreated = "production.order.created";
    public const string Created = "job.created";
    public const string Processing = "job.processing";
    public const string Preparing = "job.preparing";
    public const string Completed = "job.completed";
    public const string Failed = "job.failed";
    public const string PrinterPrinted = "printer.printed";
    public const string PrinterBatchPrinted = "printer.batch.printed";
    public const string LaserMarked = "laser.marked";
    public const string PrinterHealthChanged = "printer.health-changed";
    public const string ManualOverride = "command.manual-override";
    public const string ManualReprint = "command.manual-reprint";
    public const string ManualRemarking = "command.manual-remarking";
    public const string ManualReprocess = "command.manual-reprocess";
    public const string BatchPrint = "command.printer.print.batch";
}

// ────────────────── Batch Print Pipeline Events ───────────────────────────────

/// <summary>
/// Published by Job Engine when a Production Order enters the PREPARING phase.
/// The printer has NOT yet received any data — the system is rendering ZPL in memory.
/// RabbitMQ routing key: <c>job.preparing</c>
/// </summary>
public sealed record ProductionPreparingEvent
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "ProductionPreparing";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("production_order_no")]
    public required string ProductionOrderNo { get; init; }

    [JsonPropertyName("product_code")]
    public required string ProductCode { get; init; }

    [JsonPropertyName("planned_qty")]
    public required int PlannedQty { get; init; }

    [JsonPropertyName("status")]
    public string Status { get; init; } = "PREPARING";

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }

    public static ProductionPreparingEvent Create(string productionOrderNo, string productCode, int plannedQty)
        => new()
        {
            EventId = $"evt-preparing-{Guid.NewGuid():N}",
            ProductionOrderNo = productionOrderNo,
            ProductCode = productCode,
            PlannedQty = plannedQty,
            Timestamp = DateTimeOffset.UtcNow.ToString("o")
        };
}

/// <summary>
/// Represents one label item inside a <see cref="ProductionBatchPrintCommand"/>.
/// </summary>
public sealed record BatchLabelItem
{
    [JsonPropertyName("job_id")]
    public required string JobId { get; init; }

    [JsonPropertyName("product_serial")]
    public string? ProductSerial { get; init; }

    [JsonPropertyName("sequence")]
    public int Sequence { get; init; }
}

/// <summary>
/// Published by Job Engine to instruct Printer Adapter to render + batch-print all labels
/// for a Production Order in a single printer communication round-trip.
/// RabbitMQ routing key: <c>command.printer.print.batch</c>
/// </summary>
public sealed record ProductionBatchPrintCommand
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "ProductionBatchPrintCommand";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("production_order_no")]
    public required string ProductionOrderNo { get; init; }

    [JsonPropertyName("job_type")]
    public required string JobType { get; init; }

    [JsonPropertyName("product_code")]
    public required string ProductCode { get; init; }

    /// <summary>Shared payload JSON from the original MQTT event (template variables).</summary>
    [JsonPropertyName("payload_json")]
    public string? PayloadJson { get; init; }

    [JsonPropertyName("target_printer")]
    public string? TargetPrinter { get; init; }

    /// <summary>"simulation" | "production-printer"</summary>
    [JsonPropertyName("dispatch_target")]
    public string DispatchTarget { get; init; } = "simulation";

    /// <summary>All label items to render and print. Each item maps to one physical label.</summary>
    [JsonPropertyName("label_items")]
    public required IReadOnlyList<BatchLabelItem> LabelItems { get; init; }

    /// <summary>
    /// Maximum labels per ZPL chunk. Labels are split into sub-batches of this size.
    /// Defaults to 100; configurable via <c>PrintBatch:ChunkSize</c> appsetting.
    /// </summary>
    [JsonPropertyName("batch_size")]
    public int BatchSize { get; init; } = 100;

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }

    public static ProductionBatchPrintCommand Create(
        string productionOrderNo,
        string jobType,
        string productCode,
        string? payloadJson,
        string? targetPrinter,
        string dispatchTarget,
        IReadOnlyList<BatchLabelItem> labelItems,
        int batchSize = 100)
        => new()
        {
            EventId = $"evt-batch-print-{Guid.NewGuid():N}",
            ProductionOrderNo = productionOrderNo,
            JobType = jobType,
            ProductCode = productCode,
            PayloadJson = payloadJson,
            TargetPrinter = targetPrinter,
            DispatchTarget = dispatchTarget,
            LabelItems = labelItems,
            BatchSize = batchSize,
            Timestamp = DateTimeOffset.UtcNow.ToString("o")
        };
}

/// <summary>
/// Published by Printer Adapter after a batch print completes (success or failure).
/// RabbitMQ routing key: <c>printer.batch.printed</c>
/// </summary>
public sealed record ProductionBatchPrintedEvent
{
    [JsonPropertyName("event_type")]
    public string EventType { get; init; } = "ProductionBatchPrinted";

    [JsonPropertyName("event_id")]
    public required string EventId { get; init; }

    [JsonPropertyName("production_order_no")]
    public required string ProductionOrderNo { get; init; }

    [JsonPropertyName("printer_code")]
    public required string PrinterCode { get; init; }

    [JsonPropertyName("success")]
    public required bool Success { get; init; }

    /// <summary>Job IDs that printed successfully.</summary>
    [JsonPropertyName("succeeded_job_ids")]
    public required IReadOnlyList<string> SucceededJobIds { get; init; }

    /// <summary>Job IDs that failed (empty on full success).</summary>
    [JsonPropertyName("failed_job_ids")]
    public required IReadOnlyList<string> FailedJobIds { get; init; }

    [JsonPropertyName("completed_count")]
    public int CompletedCount { get; init; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; init; }

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }

    public static ProductionBatchPrintedEvent Create(
        string productionOrderNo,
        string printerCode,
        IReadOnlyList<string> succeededJobIds,
        IReadOnlyList<string> failedJobIds,
        string? errorMessage = null)
        => new()
        {
            EventId = $"evt-batch-printed-{Guid.NewGuid():N}",
            ProductionOrderNo = productionOrderNo,
            PrinterCode = printerCode,
            Success = failedJobIds.Count == 0,
            SucceededJobIds = succeededJobIds,
            FailedJobIds = failedJobIds,
            CompletedCount = succeededJobIds.Count,
            ErrorMessage = errorMessage,
            Timestamp = DateTimeOffset.UtcNow.ToString("o")
        };
}
