using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ND.Infrastructure.Messaging;
using ND.ProjectionService.Application.Dtos;
using ND.ProjectionService.Application.Interfaces;
using ND.ProjectionService.Domain.Entities;
using ND.ProjectionService.Infrastructure.SignalR;
using ND.SharedKernel.Abstractions;
using ND.UnifiedContracts.Constants;
using ND.UnifiedContracts.Events;
using ND.ProjectionService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ND.ProjectionService.Infrastructure.Messaging;

/// <summary>
/// Background worker that consumes job and mqtt events from RabbitMQ,
/// updates the projection read model, and pushes updates to Kiosk UI via SignalR.
/// </summary>
public sealed class ProjectionEventConsumer : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRabbitMqConsumer _consumer;
    private readonly IHubContext<ProductionHub> _hubContext;
    private readonly ILogger<ProjectionEventConsumer> _logger;
    private readonly string _stationId;

    private const string Exchange = "station.events";
    
    private const string JobQueue = "projection-service.job-events";
    private const string JobPattern = "job.*";

    private const string MqttQueue = "projection-service.mqtt-events";
    private const string MqttPattern = "mqtt.MqttMessage.*";

    private static readonly JsonSerializerOptions JsonSerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public ProjectionEventConsumer(
        IServiceScopeFactory scopeFactory,
        IRabbitMqConsumer consumer,
        IHubContext<ProductionHub> hubContext,
        IConfiguration configuration,
        ILogger<ProjectionEventConsumer> logger)
    {
        _scopeFactory = scopeFactory;
        _consumer = consumer;
        _hubContext = hubContext;
        _logger = logger;
        _stationId = configuration["STATION_ID"] ?? "STATION-01";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Projection Event Consumer starting. StationId={StationId}", _stationId);

        // 1. Consume job events
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: JobQueue,
            routingKeyPattern: JobPattern,
            onMessage: (routingKey, json) => HandleJobEventAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        // 2. Consume printer printed events
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: JobQueue,
            routingKeyPattern: "printer.printed",
            onMessage: (routingKey, json) => HandleJobEventAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        // 3. Consume laser marked events
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: JobQueue,
            routingKeyPattern: "laser.marked",
            onMessage: (routingKey, json) => HandleJobEventAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        // 4. Consume MQTT inbound events
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: MqttQueue,
            routingKeyPattern: MqttPattern,
            onMessage: (routingKey, json) => HandleMqttEventAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        // 5. Consume manual requested events (reprint, re-marking, reprocess)
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: "projection-service.manual-reprint-events",
            routingKeyPattern: JobEventRoutingKeys.ManualReprint,
            onMessage: (routingKey, json) => HandleManualOverrideRequestedEventAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: "projection-service.manual-remarking-events",
            routingKeyPattern: JobEventRoutingKeys.ManualRemarking,
            onMessage: (routingKey, json) => HandleManualOverrideRequestedEventAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: "projection-service.manual-reprocess-events",
            routingKeyPattern: JobEventRoutingKeys.ManualReprocess,
            onMessage: (routingKey, json) => HandleManualOverrideRequestedEventAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        // 6. Consume production order created events
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: "projection-service.production-order-events",
            routingKeyPattern: "production.order.created",
            onMessage: (routingKey, json) => HandleJobEventAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        // 7. Consume device heartbeat events
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: "projection-service.device-heartbeats",
            routingKeyPattern: "device.heartbeat.*",
            onMessage: (routingKey, json) => HandleDeviceHeartbeatAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        // 8. Consume batch print preparing events
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: "projection-service.preparing-events",
            routingKeyPattern: JobEventRoutingKeys.Preparing,
            onMessage: (routingKey, json) => HandleJobEventAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        // 9. Consume batch printed results
        await _consumer.StartConsumingAsync(
            exchange: Exchange,
            queue: "projection-service.batch-printed-events",
            routingKeyPattern: JobEventRoutingKeys.PrinterBatchPrinted,
            onMessage: (routingKey, json) => HandleJobEventAsync(routingKey, json, stoppingToken),
            cancellationToken: stoppingToken);

        // Keep service alive
        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
    }

    private async Task HandleJobEventAsync(string routingKey, string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Projection Service received job event: {RoutingKey}", routingKey);

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var productionRepo = scope.ServiceProvider.GetRequiredService<IProductionViewRepository>();
            var recordRepo = scope.ServiceProvider.GetRequiredService<IProductionRecordRepository>();
            var activityRepo = scope.ServiceProvider.GetRequiredService<IActivityLogRepository>();
            var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            ProductionView? view = null;
            ActivityLog? log = null;
            ProductionRecord? productionRecordToPush = null;

            if (routingKey.Equals("job.created", StringComparison.OrdinalIgnoreCase))
            {
                var evt = JsonSerializer.Deserialize<JobCreatedEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    view = await productionRepo.GetByStationIdAsync(_stationId, cancellationToken);
                    if (view == null)
                    {
                        view = ProductionView.Create(_stationId, evt.JobId, evt.JobNo, evt.ProductCode, evt.ProductSerial, "QUEUED");
                        await productionRepo.AddAsync(view, cancellationToken);
                    }
                    else
                    {
                        view.Update(evt.JobId, evt.JobNo, evt.ProductCode, evt.ProductSerial, "QUEUED");
                        await productionRepo.UpdateAsync(view, cancellationToken);
                    }

                    log = ActivityLog.Create(
                        "JobCreated",
                        evt.JobId,
                        evt.JobNo,
                        evt.ProductCode,
                        "QUEUED",
                        $"Công việc {evt.JobNo} đã được tạo và đưa vào hàng đợi.",
                        evt.Timestamp);

                    // ProductionRecord logic — use IdempotencyKey from event (no cross-service DB access).
                    // For batch orders, IdempotencyKey is "eventId:N" (e.g. "eventId:0", "eventId:1").
                    // For single-item jobs, IdempotencyKey == eventId (no colon suffix).
                    // We strip the ":N" suffix to find the temp record created by the MQTT handler (if any).
                    var record = await recordRepo.GetByJobIdAsync(evt.JobId, cancellationToken);

                    if (record == null && !string.IsNullOrEmpty(evt.IdempotencyKey))
                    {
                        // Determine the lookup key: strip batch-item suffix ":N" to find the base eventId record
                        var lookupKey = evt.IdempotencyKey.Contains(':')
                            ? evt.IdempotencyKey[..evt.IdempotencyKey.LastIndexOf(':')]
                            : evt.IdempotencyKey;

                        record = await recordRepo.GetByJobIdAsync(lookupKey, cancellationToken);
                        if (record != null)
                        {
                            // Only promote this temp record if it hasn't been claimed by another batch item yet.
                            // Once claimed, its JobId changes to a real uuid — subsequent batch items won't find it.
                            _logger.LogInformation("Promoting temp record {TempJobId} → real JobId {RealJobId}", lookupKey, evt.JobId);
                            record.UpdateDetails(evt.JobId, evt.JobNo, evt.ProductCode, evt.ProductSerial, "QUEUED");
                            await recordRepo.UpdateAsync(record, cancellationToken);
                        }
                    }
                    else if (record != null)
                    {
                        record.UpdateDetails(evt.JobId, evt.JobNo, evt.ProductCode, evt.ProductSerial, "QUEUED");
                        await recordRepo.UpdateAsync(record, cancellationToken);
                    }

                    if (record == null)
                    {
                        record = ProductionRecord.Create(
                            evt.JobId,
                            evt.JobNo,
                            evt.ProductCode,
                            evt.ProductSerial,
                            evt.JobType,
                            _stationId,
                            "QUEUED");
                        await recordRepo.AddAsync(record, cancellationToken);
                    }
                    productionRecordToPush = record;
                }
            }
            else if (routingKey.Equals(JobEventRoutingKeys.Preparing, StringComparison.OrdinalIgnoreCase))
            {
                // Phase 1: ZPL is being rendered in memory. Printer has not received any data yet.
                var evt = JsonSerializer.Deserialize<ProductionPreparingEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    view = await productionRepo.GetByStationIdAsync(_stationId, cancellationToken);
                    if (view != null)
                    {
                        view.UpdateStatus("PREPARING");
                        await productionRepo.UpdateAsync(view, cancellationToken);
                    }

                    log = ActivityLog.Create(
                        "ProductionPreparing",
                        jobId: evt.ProductionOrderNo,
                        jobNo: evt.ProductionOrderNo,
                        productCode: evt.ProductCode,
                        status: "PREPARING",
                        message: $"Lệnh {evt.ProductionOrderNo}: đang chuẩn bị {evt.PlannedQty} nhãn in trong bộ nhớ.",
                        occurredAt: evt.Timestamp);

                    // Update all records for this production order to PREPARING
                    var orderRecords = await recordRepo.GetByJobNoAsync(evt.ProductionOrderNo, cancellationToken);
                    foreach (var rec in orderRecords)
                    {
                        rec.UpdateStatus("PREPARING");
                        await recordRepo.UpdateAsync(rec, cancellationToken);
                    }
                }
            }
            else if (routingKey.Equals("job.processing", StringComparison.OrdinalIgnoreCase))
            {
                var evt = JsonSerializer.Deserialize<JobProcessingEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    view = await productionRepo.GetByStationIdAsync(_stationId, cancellationToken);
                    if (view != null)
                    {
                        view.Update(evt.JobId, evt.JobNo, evt.ProductCode, evt.ProductSerial, "PROCESSING");
                        await productionRepo.UpdateAsync(view, cancellationToken);
                    }
                    else
                    {
                        view = ProductionView.Create(_stationId, evt.JobId, evt.JobNo, evt.ProductCode, evt.ProductSerial, "PROCESSING");
                        await productionRepo.AddAsync(view, cancellationToken);
                    }

                    log = ActivityLog.Create(
                        "JobProcessing",
                        evt.JobId,
                        evt.JobNo,
                        evt.ProductCode,
                        "PROCESSING",
                        $"Công việc {evt.JobNo} bắt đầu xử lý (lần thử #{evt.AttemptNo}).",
                        evt.Timestamp);

                    var record = await recordRepo.GetByJobIdAsync(evt.JobId, cancellationToken);
                    if (record != null)
                    {
                        record.UpdateStatus("PROCESSING");
                        if (!string.IsNullOrEmpty(evt.TargetPrinter))
                            record.AssignPrinter(evt.TargetPrinter);
                        record.SetStart(evt.Timestamp ?? DateTimeOffset.UtcNow.ToString("o"));
                        await recordRepo.UpdateAsync(record, cancellationToken);
                        productionRecordToPush = record;
                    }
                }
            }
            else if (routingKey.Equals(JobEventRoutingKeys.PrinterBatchPrinted, StringComparison.OrdinalIgnoreCase))
            {
                // Phase 2: batch has been sent to the printer. Update records to PRINTING then let
                // subsequent job.completed events flip them to COMPLETED individually.
                var evt = JsonSerializer.Deserialize<ProductionBatchPrintedEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    _logger.LogInformation(
                        "Batch printed for PO={OrderNo}: Succeeded={S} Failed={F}",
                        evt.ProductionOrderNo, evt.SucceededJobIds.Count, evt.FailedJobIds.Count);

                    // Mark succeeded records as PRINTING (job.completed arrives next and flips to COMPLETED)
                    foreach (var jobId in evt.SucceededJobIds)
                    {
                        var rec = await recordRepo.GetByJobIdAsync(jobId, cancellationToken);
                        if (rec != null)
                        {
                            rec.UpdateStatus("PRINTING");
                            await recordRepo.UpdateAsync(rec, cancellationToken);
                        }
                    }

                    // Mark failed records as FAILED
                    foreach (var jobId in evt.FailedJobIds)
                    {
                        var rec = await recordRepo.GetByJobIdAsync(jobId, cancellationToken);
                        if (rec != null)
                        {
                            rec.SetFailed(evt.ErrorMessage, DateTimeOffset.UtcNow.ToString("o"));
                            await recordRepo.UpdateAsync(rec, cancellationToken);
                        }
                    }

                    // Update the production order view completedQty for succeeded items
                    var orderRepo = scope.ServiceProvider.GetRequiredService<IProductionOrderViewRepository>();
                    var orderView = await orderRepo.GetByOrderNoAsync(evt.ProductionOrderNo, cancellationToken);
                    if (orderView != null)
                    {
                        // We'll let job.completed events do the increments individually, but if the order
                        // has all labels printing, update the live UI now
                        await _hubContext.Clients.Group(_stationId).SendAsync("OnProductionOrderUpdate",
                            new { orderView.OrderNo, orderView.PlannedQty, orderView.CompletedQty, orderView.RemainingQty, orderView.Status },
                            cancellationToken);
                    }
                }
            }
            else if (routingKey.Equals("printer.printed", StringComparison.OrdinalIgnoreCase))
            {
                var evt = JsonSerializer.Deserialize<PrinterPrintedEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    var record = await recordRepo.GetByJobIdAsync(evt.JobId, cancellationToken);
                    if (record != null)
                    {
                        record.UpdateStatus("PRINTING");
                        await recordRepo.UpdateAsync(record, cancellationToken);
                        productionRecordToPush = record;
                    }
                }
            }
            else if (routingKey.Equals("laser.marked", StringComparison.OrdinalIgnoreCase))
            {
                var evt = JsonSerializer.Deserialize<LaserMarkedEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    var record = await recordRepo.GetByJobIdAsync(evt.JobId, cancellationToken);
                    if (record != null)
                    {
                        record.UpdateStatus("PRINTING");
                        await recordRepo.UpdateAsync(record, cancellationToken);
                        productionRecordToPush = record;
                    }
                }
            }
            else if (routingKey.Equals("job.completed", StringComparison.OrdinalIgnoreCase))
            {
                var evt = JsonSerializer.Deserialize<JobCompletedEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    view = await productionRepo.GetByStationIdAsync(_stationId, cancellationToken);
                    if (view != null)
                    {
                        view.UpdateStatus("COMPLETED");
                        await productionRepo.UpdateAsync(view, cancellationToken);
                    }

                    log = ActivityLog.Create(
                        "JobCompleted",
                        evt.JobId,
                        evt.JobNo,
                        evt.ProductCode,
                        "COMPLETED",
                        $"Công việc {evt.JobNo} đã hoàn thành thành công.",
                        evt.Timestamp);

                    var record = await recordRepo.GetByJobIdAsync(evt.JobId, cancellationToken);
                    if (record != null)
                    {
                        record.SetComplete(evt.Timestamp ?? DateTimeOffset.UtcNow.ToString("o"));
                        await recordRepo.UpdateAsync(record, cancellationToken);
                        productionRecordToPush = record;
                    }

                    // Update ProductionOrderView progress
                    var orderRepo = scope.ServiceProvider.GetRequiredService<IProductionOrderViewRepository>();
                    var orderView = await orderRepo.GetByOrderNoAsync(evt.JobNo, cancellationToken);
                    if (orderView != null)
                    {
                        orderView.IncrementCompleted();
                        await orderRepo.UpdateAsync(orderView, cancellationToken);
                        // Push order summary update
                        await _hubContext.Clients.Group(_stationId).SendAsync("OnProductionOrderUpdate",
                            new { orderView.OrderNo, orderView.PlannedQty, orderView.CompletedQty, orderView.RemainingQty, orderView.Status },
                            cancellationToken);
                    }
                }
            }
            else if (routingKey.Equals("job.failed", StringComparison.OrdinalIgnoreCase))
            {
                var evt = JsonSerializer.Deserialize<JobFailedEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    view = await productionRepo.GetByStationIdAsync(_stationId, cancellationToken);
                    if (view != null)
                    {
                        view.UpdateStatus("FAILED");
                        await productionRepo.UpdateAsync(view, cancellationToken);
                    }

                    log = ActivityLog.Create(
                        "JobFailed",
                        evt.JobId,
                        evt.JobNo,
                        evt.ProductCode,
                        "FAILED",
                        $"Công việc {evt.JobNo} thất bại: {evt.ErrorMessage ?? "Lỗi không xác định"}.",
                        evt.Timestamp);

                    var record = await recordRepo.GetByJobIdAsync(evt.JobId, cancellationToken);
                    if (record != null)
                    {
                        record.SetFailed(evt.ErrorMessage, evt.Timestamp ?? DateTimeOffset.UtcNow.ToString("o"));
                        await recordRepo.UpdateAsync(record, cancellationToken);
                        productionRecordToPush = record;
                    }

                    // ── Create/Deduplicate Alarm for Job Failure ─────────────────────────
                    try
                    {
                        var alarmRepo = scope.ServiceProvider.GetRequiredService<IAlarmRepository>();

                        // Dedup: use jobId as the group key — one active alarm per job
                        var existingAlarm = await alarmRepo.GetActiveByGroupKeyAsync(evt.JobId, cancellationToken);
                        if (existingAlarm != null)
                        {
                            // Same job has failed multiple times — bump repeat count, no new broadcast
                            existingAlarm.UpdateRepeat();
                            await alarmRepo.UpdateAsync(existingAlarm, cancellationToken);
                            _logger.LogDebug(
                                "Alarm dedup: updated existing job failure alarm for {JobId}, RepeatCount={Rc}",
                                evt.JobId, existingAlarm.RepeatCount);
                        }
                        else
                        {
                            // First failure — create new alarm and broadcast
                            var alarm = Alarm.Create(
                                severity: "Error",
                                source: "Workflow",
                                message: $"Công việc {evt.JobNo} thất bại: {evt.ErrorMessage ?? "Lỗi không xác định"}",
                                deviceId: null,
                                deviceName: null,
                                alarmType: "ProductionError",
                                alarmGroupKey: evt.JobId,
                                productionOrderId: evt.JobNo
                            );
                            await alarmRepo.AddAsync(alarm, cancellationToken);

                            var alarmDto = new AlarmDto(
                                alarm.Id, alarm.AlarmType, alarm.AlarmGroupKey,
                                alarm.Severity, alarm.Source, alarm.Message,
                                alarm.DeviceId, alarm.DeviceName, alarm.ProductionOrderId,
                                alarm.IsAcknowledged, alarm.CurrentState,
                                alarm.AcknowledgedBy, alarm.AcknowledgedAt,
                                alarm.FirstOccurredAt, alarm.LastOccurredAt,
                                alarm.RepeatCount, alarm.ResolvedAt, alarm.CreatedAt
                            );
                            await _hubContext.Clients.Group(_stationId).SendAsync("OnAlarmRaised", alarmDto, cancellationToken);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to raise job failure alarm for {JobId}", evt.JobId);
                    }

                }
            }

            else if (routingKey.Equals("production.order.created", StringComparison.OrdinalIgnoreCase))
            {
                var evt = JsonSerializer.Deserialize<ProductionOrderCreatedEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    var orderRepo = scope.ServiceProvider.GetRequiredService<IProductionOrderViewRepository>();
                    var orderView = await orderRepo.GetByOrderNoAsync(evt.JobNo, cancellationToken);
                    if (orderView == null)
                    {
                        orderView = ProductionOrderView.Create(evt.JobNo, evt.ProductCode, evt.PlannedQty);
                        await orderRepo.AddAsync(orderView, cancellationToken);
                        _logger.LogInformation("Created ProductionOrderView for {OrderNo} qty={Qty}", evt.JobNo, evt.PlannedQty);
                    }

                    log = ActivityLog.Create(
                        "ProductionOrderCreated",
                        jobId: "",
                        jobNo: evt.JobNo,
                        productCode: evt.ProductCode,
                        status: "CREATED",
                        message: $"Lệnh sản xuất {evt.JobNo} được tạo với số lượng {evt.PlannedQty}.",
                        occurredAt: evt.Timestamp);

                    // Push order summary to UI
                    await _hubContext.Clients.Group(_stationId).SendAsync("OnProductionOrderUpdate",
                        new { orderView.OrderNo, orderView.PlannedQty, orderView.CompletedQty, orderView.RemainingQty, orderView.Status },
                        cancellationToken);
                }
            }

            if (log != null)
            {
                await activityRepo.AddAsync(log, cancellationToken);
                await activityRepo.TrimExcessAsync(10, cancellationToken);
            }

            await unitOfWork.SaveChangesAsync(cancellationToken);

            // SignalR Push
            if (view != null)
            {
                var viewDto = new ProductionViewDto(view.StationId, view.JobId, view.WorkOrderNo, view.ProductCode, view.ProductSerial, view.JobStatus, view.UpdatedAt);
                await _hubContext.Clients.Group(_stationId).SendAsync("OnProductionUpdate", viewDto, cancellationToken);
                _logger.LogInformation("Pushed production view update to group: {StationId}", _stationId);
            }

            if (log != null)
            {
                var logDto = new ActivityLogDto(log.Id, log.EventType, log.JobId, log.JobNo, log.ProductCode, log.Status, log.Message, log.OccurredAt);
                await _hubContext.Clients.Group(_stationId).SendAsync("OnActivityUpdate", logDto, cancellationToken);
                _logger.LogInformation("Pushed activity update to group: {StationId}", _stationId);
            }

            if (productionRecordToPush != null)
            {
                var recordDto = new ProductionRecordDto(
                    productionRecordToPush.Id,
                    productionRecordToPush.JobId,
                    productionRecordToPush.JobNo,
                    productionRecordToPush.ProductCode,
                    productionRecordToPush.ProductSerial,
                    productionRecordToPush.JobType,
                    productionRecordToPush.CurrentStatus,
                    productionRecordToPush.StationId,
                    productionRecordToPush.CreatedAt,
                    productionRecordToPush.UpdatedAt);

                await _hubContext.Clients.Group(_stationId).SendAsync("OnProductionRecordUpdate", recordDto, cancellationToken);
                _logger.LogInformation("Pushed production record update to group: {StationId}", _stationId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle job event: {RoutingKey}", routingKey);
            throw; // Will Nack
        }
    }

    private async Task HandleMqttEventAsync(string routingKey, string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Projection Service received mqtt event: {RoutingKey}", routingKey);

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var activityRepo = scope.ServiceProvider.GetRequiredService<IActivityLogRepository>();
            var recordRepo = scope.ServiceProvider.GetRequiredService<IProductionRecordRepository>();
            var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            var unifiedEvent = JsonSerializer.Deserialize<UnifiedEvent>(payloadJson, JsonSerializerOptions);
            if (unifiedEvent != null)
            {
                var tagsDict = unifiedEvent.Data.ToDictionary(
                    t => t.Tag,
                    t => t.Value?.ToString() ?? string.Empty,
                    StringComparer.OrdinalIgnoreCase);

                var productCode = tagsDict.TryGetValue(BusinessConstants.MqttTag.ProductId, out var pid)
                    ? pid
                    : tagsDict.TryGetValue(BusinessConstants.MqttTag.MarkingSerial, out var ms) ? ms : "GENERIC";

                var productSerial = tagsDict.TryGetValue(BusinessConstants.MqttTag.MarkingSerial, out var serial)
                    ? serial
                    : tagsDict.TryGetValue(BusinessConstants.MqttTag.ProductId, out var pidFallback) ? pidFallback : null;

                var opType = tagsDict.TryGetValue(BusinessConstants.MqttTag.OperationType, out var ot)
                    ? ot : "DEFAULT";

                var jobNo = tagsDict.TryGetValue("production.order_number", out var wo) && !string.IsNullOrWhiteSpace(wo)
                    ? wo
                    : unifiedEvent.EventId;

                var log = ActivityLog.Create(
                    "MqttMessageReceived",
                    jobId: "",
                    jobNo: jobNo,
                    productCode: productCode,
                    status: "RECEIVED",
                    message: "Nhận yêu cầu in/khắc mới từ cổng nhà máy.",
                    occurredAt: unifiedEvent.Timestamp);

                await activityRepo.AddAsync(log, cancellationToken);
                await activityRepo.TrimExcessAsync(10, cancellationToken);

                // Determine planned quantity from MQTT tags.
                // For batch production orders (plannedQty > 1), do NOT create a temporary ProductionRecord here.
                // Real records will be created one-per-item by the job.created event handler,
                // each with a unique serial number and real JobId. Creating a temp record here
                // causes ghost "Đã nhận yêu cầu" rows that cannot be merged into the batch items.
                var plannedQty = tagsDict.TryGetValue("production.planned_qty", out var pqStr)
                    && int.TryParse(pqStr, out var pq) ? pq : 1;

                await unitOfWork.SaveChangesAsync(cancellationToken);

                // SignalR Push — activity log always
                var logDto = new ActivityLogDto(log.Id, log.EventType, log.JobId, log.JobNo, log.ProductCode, log.Status, log.Message, log.OccurredAt);
                await _hubContext.Clients.Group(_stationId).SendAsync("OnActivityUpdate", logDto, cancellationToken);
                _logger.LogInformation("Pushed raw MQTT receive activity update to group: {StationId}", _stationId);

                // For single-item jobs only: create a temporary ProductionRecord so the UI
                // shows instant "RECEIVED" feedback before job.created arrives.
                // For batch orders the job.created events create proper per-item records.
                if (plannedQty <= 1)
                {
                    var record = await recordRepo.GetByJobIdAsync(unifiedEvent.EventId, cancellationToken);

                    if (record == null)
                    {
                        record = ProductionRecord.Create(
                            jobId: unifiedEvent.EventId, // temporary — will be promoted by job.created
                            jobNo: jobNo,
                            productCode: productCode,
                            productSerial: productSerial,
                            jobType: opType,
                            stationId: _stationId,
                            status: "RECEIVED");
                        await recordRepo.AddAsync(record, cancellationToken);
                        await unitOfWork.SaveChangesAsync(cancellationToken);
                    }
                    else
                    {
                        record.UpdateDetails(record.JobId, jobNo, productCode, productSerial, "RECEIVED");
                        await recordRepo.UpdateAsync(record, cancellationToken);
                        await unitOfWork.SaveChangesAsync(cancellationToken);
                    }

                    var recordDto = new ProductionRecordDto(
                        record.Id,
                        record.JobId,
                        record.JobNo,
                        record.ProductCode,
                        record.ProductSerial,
                        record.JobType,
                        record.CurrentStatus,
                        record.StationId,
                        record.CreatedAt,
                        record.UpdatedAt);
                    await _hubContext.Clients.Group(_stationId).SendAsync("OnProductionRecordUpdate", recordDto, cancellationToken);
                    _logger.LogInformation("Pushed production record update from MQTT to group: {StationId}", _stationId);
                }
                else
                {
                    _logger.LogInformation(
                        "Batch production order {JobNo} (qty={Qty}): skipping temp ProductionRecord — records created per item by job.created events.",
                        jobNo, plannedQty);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle MQTT event: {RoutingKey}", routingKey);
            throw; // Will Nack
        }
    }

    private async Task HandleManualOverrideRequestedEventAsync(string routingKey, string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Projection Service received manual override request: {RoutingKey}", routingKey);

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var activityRepo = scope.ServiceProvider.GetRequiredService<IActivityLogRepository>();
            var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            string eventType = "ManualOverrideRequested";
            string jobId = "";
            string jobNo = "";
            string productCode = "";
            string requestedBy = "";
            string reasonCode = "";
            string reasonDescription = "";
            string message = "";
            string timestamp = "";

            if (routingKey.Equals(JobEventRoutingKeys.ManualReprint, StringComparison.OrdinalIgnoreCase))
            {
                var evt = JsonSerializer.Deserialize<ManualReprintRequestedEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    eventType = evt.EventType;
                    jobId = evt.JobId;
                    jobNo = evt.JobNo;
                    productCode = evt.ProductCode;
                    requestedBy = evt.RequestedBy;
                    reasonCode = evt.ReasonCode;
                    reasonDescription = evt.ReasonDescription ?? "";
                    timestamp = evt.RequestedAt;
                    message = $"Yêu cầu in lại nhãn bởi {requestedBy}. Lý do: [{reasonCode}] {reasonDescription}";
                }
            }
            else if (routingKey.Equals(JobEventRoutingKeys.ManualRemarking, StringComparison.OrdinalIgnoreCase))
            {
                var evt = JsonSerializer.Deserialize<ManualRemarkingRequestedEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    eventType = evt.EventType;
                    jobId = evt.JobId;
                    jobNo = evt.JobNo;
                    productCode = evt.ProductCode;
                    requestedBy = evt.RequestedBy;
                    reasonCode = evt.ReasonCode;
                    reasonDescription = evt.ReasonDescription ?? "";
                    timestamp = evt.RequestedAt;
                    message = $"Yêu cầu khắc lại laser bởi {requestedBy}. Lý do: [{reasonCode}] {reasonDescription}";
                }
            }
            else if (routingKey.Equals(JobEventRoutingKeys.ManualReprocess, StringComparison.OrdinalIgnoreCase))
            {
                var evt = JsonSerializer.Deserialize<ManualReprocessingRequestedEvent>(payloadJson, JsonSerializerOptions);
                if (evt != null)
                {
                    eventType = evt.EventType;
                    jobId = evt.JobId;
                    jobNo = evt.JobNo;
                    productCode = evt.ProductCode;
                    requestedBy = evt.RequestedBy;
                    reasonCode = evt.ReasonCode;
                    reasonDescription = evt.ReasonDescription ?? "";
                    timestamp = evt.RequestedAt;
                    message = $"Yêu cầu làm lại quy trình bởi {requestedBy}. Lý do: [{reasonCode}] {reasonDescription}";
                }
            }

            if (string.IsNullOrEmpty(jobId)) return;

            var log = ActivityLog.Create(
                eventType,
                jobId,
                jobNo,
                productCode,
                "REQUESTED",
                message,
                timestamp);

            await activityRepo.AddAsync(log, cancellationToken);
            await activityRepo.TrimExcessAsync(10, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);

            // Push real-time update to UI SignalR
            var logDto = new ActivityLogDto(log.Id, log.EventType, log.JobId, log.JobNo, log.ProductCode, log.Status, log.Message, log.OccurredAt);
            await _hubContext.Clients.Group(_stationId).SendAsync("OnActivityUpdate", logDto, cancellationToken);
            _logger.LogInformation("Pushed manual override request activity update to group: {StationId}", _stationId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle manual override event: {RoutingKey}", routingKey);
            throw; // Will Nack
        }
    }

    private async Task HandleDeviceHeartbeatAsync(string routingKey, string payloadJson, CancellationToken cancellationToken)
    {
        _logger.LogDebug("Projection Service received device heartbeat: {RoutingKey}", routingKey);
        try
        {
            var heartbeat = JsonSerializer.Deserialize<ND.UnifiedContracts.Events.DeviceStatusHeartbeat>(payloadJson, JsonSerializerOptions);
            if (heartbeat == null) return;

            using var scope = _scopeFactory.CreateScope();
            var deviceRepo = scope.ServiceProvider.GetRequiredService<IDeviceStatusRepository>();
            var dbContext = scope.ServiceProvider.GetRequiredService<ProjectionDbContext>();
            var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

            var device = await deviceRepo.GetByIdAsync(heartbeat.DeviceId, cancellationToken);
            bool wasOnline  = device != null && device.IsOnline;
            bool wasOffline = device != null && !device.IsOnline;
            string? oldLifecycle = device?.LifecycleState;

            bool stateChanged = device == null 
                || device.IsOnline != heartbeat.IsOnline 
                || device.LifecycleState != heartbeat.LifecycleState;

            if (device == null)
            {
                device = DeviceStatus.Create(
                    heartbeat.DeviceId, 
                    heartbeat.DeviceType, 
                    heartbeat.IsOnline, 
                    heartbeat.Timestamp, 
                    heartbeat.LifecycleState,
                    heartbeat.SerialNumber,
                    heartbeat.LifetimePrintCounter,
                    heartbeat.ThermalTemp,
                    heartbeat.ConnectionDetails);
                await deviceRepo.AddAsync(device, cancellationToken);
            }
            else
            {
                device.UpdateStatus(
                    heartbeat.IsOnline, 
                    heartbeat.Timestamp, 
                    heartbeat.LifecycleState,
                    heartbeat.SerialNumber,
                    heartbeat.LifetimePrintCounter,
                    heartbeat.ThermalTemp,
                    heartbeat.ConnectionDetails);
            }

            if (stateChanged)
            {
                // Phase 11: Log transition to history
                var transitionHistory = DeviceStatusHistory.Create(
                    heartbeat.DeviceId,
                    heartbeat.LifecycleState,
                    heartbeat.IsOnline,
                    heartbeat.Timestamp
                );
                await dbContext.DeviceStatusHistories.AddAsync(transitionHistory, cancellationToken);
            }

            // Always save updates to the database (silent DB updates)
            await unitOfWork.SaveChangesAsync(cancellationToken);

            // Phase 6: SignalR Idempotency - only push status updates to client on actual state changes
            if (stateChanged)
            {
                var dto = new DeviceStatusDto(device.DeviceId, device.DeviceType, device.IsOnline, device.LastSeenAt, device.LifecycleState);
                await _hubContext.Clients.Group(_stationId).SendAsync("OnDeviceStatusUpdate", dto, cancellationToken);
            }

            // Phase 7: Alarms for fault states (Offline, Paper Out, Ribbon Out, Head Open, Buffer Full, Thermal Warning)
            bool isFaultState = !heartbeat.IsOnline 
                || heartbeat.LifecycleState is "Paper Out" 
                || heartbeat.LifecycleState is "Ribbon Out" 
                || heartbeat.LifecycleState is "Head Open" 
                || heartbeat.LifecycleState is "Buffer Full" 
                || heartbeat.LifecycleState is "Thermal Warning";

            bool wasFaultState = !wasOnline 
                || oldLifecycle is "Paper Out" 
                || oldLifecycle is "Ribbon Out" 
                || oldLifecycle is "Head Open" 
                || oldLifecycle is "Buffer Full" 
                || oldLifecycle is "Thermal Warning";

            if (isFaultState && (!wasFaultState || oldLifecycle != heartbeat.LifecycleState))
            {
                try
                {
                    var alarmRepo = scope.ServiceProvider.GetRequiredService<IAlarmRepository>();
                    var alarmGroupKey = $"{heartbeat.DeviceId}-{heartbeat.LifecycleState.Replace(" ", "")}";
                    var existingAlarm = await alarmRepo.GetActiveByGroupKeyAsync(alarmGroupKey, cancellationToken);

                    if (existingAlarm != null && existingAlarm.CurrentState == "Active")
                    {
                        existingAlarm.UpdateRepeat(heartbeat.Timestamp);
                        await unitOfWork.SaveChangesAsync(cancellationToken);
                        _logger.LogDebug(
                            "Alarm dedup: updated existing device alarm for {DeviceId}, RepeatCount={Rc}",
                            heartbeat.DeviceId, existingAlarm.RepeatCount);
                    }
                    else
                    {
                        var lifecycleDetail = heartbeat.LifecycleState is not null and not "Offline"
                            ? $" (trạng thái: {heartbeat.LifecycleState})"
                            : string.Empty;

                        var alarm = Alarm.Create(
                            severity: "Error",
                            source: "Device",
                            message: $"Thiết bị {heartbeat.DeviceId} ({heartbeat.DeviceType}) báo lỗi hoặc mất kết nối{lifecycleDetail}.",
                            deviceId: heartbeat.DeviceId,
                            deviceName: heartbeat.DeviceId,
                            alarmType: "DeviceConnection",
                            alarmGroupKey: alarmGroupKey
                        );
                        await alarmRepo.AddAsync(alarm, cancellationToken);
                        await unitOfWork.SaveChangesAsync(cancellationToken);

                        var alarmDto = new AlarmDto(
                            alarm.Id, alarm.AlarmType, alarm.AlarmGroupKey,
                            alarm.Severity, alarm.Source, alarm.Message,
                            alarm.DeviceId, alarm.DeviceName, alarm.ProductionOrderId,
                            alarm.IsAcknowledged, alarm.CurrentState,
                            alarm.AcknowledgedBy, alarm.AcknowledgedAt,
                            alarm.FirstOccurredAt, alarm.LastOccurredAt,
                            alarm.RepeatCount, alarm.ResolvedAt, alarm.CreatedAt
                        );
                        await _hubContext.Clients.Group(_stationId).SendAsync("OnAlarmRaised", alarmDto, cancellationToken);

                        _logger.LogWarning("Device {DeviceId} went offline or reports fault {Fault} — alarm raised", heartbeat.DeviceId, heartbeat.LifecycleState);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to raise device offline or fault alarm for {DeviceId}", heartbeat.DeviceId);
                }
            }

            // Phase 7: Recovered/Operational - auto-resolve active alarms
            if (!isFaultState && wasFaultState)
            {
                try
                {
                    var alarmRepo = scope.ServiceProvider.GetRequiredService<IAlarmRepository>();
                    var activeAlarms = await dbContext.Alarms
                        .Where(a => a.DeviceId == heartbeat.DeviceId && a.CurrentState == "Active")
                        .ToListAsync(cancellationToken);

                    foreach (var existingAlarm in activeAlarms)
                    {
                        existingAlarm.Resolve(resolvedBy: "System");
                        await unitOfWork.SaveChangesAsync(cancellationToken);

                        var alarmDto = new AlarmDto(
                            existingAlarm.Id, existingAlarm.AlarmType, existingAlarm.AlarmGroupKey,
                            existingAlarm.Severity, existingAlarm.Source, existingAlarm.Message,
                            existingAlarm.DeviceId, existingAlarm.DeviceName, existingAlarm.ProductionOrderId,
                            existingAlarm.IsAcknowledged, existingAlarm.CurrentState,
                            existingAlarm.AcknowledgedBy, existingAlarm.AcknowledgedAt,
                            existingAlarm.FirstOccurredAt, existingAlarm.LastOccurredAt,
                            existingAlarm.RepeatCount, existingAlarm.ResolvedAt, existingAlarm.CreatedAt
                        );
                        await _hubContext.Clients.Group(_stationId).SendAsync("OnAlarmRaised", alarmDto, cancellationToken);

                        _logger.LogInformation("Device {DeviceId} recovered — resolved alarm {AlarmId}", heartbeat.DeviceId, existingAlarm.Id);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to auto-resolve alarm for recovered device {DeviceId}", heartbeat.DeviceId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to handle device heartbeat: {RoutingKey}", routingKey);
        }
    }

}

