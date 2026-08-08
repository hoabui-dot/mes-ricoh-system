using Microsoft.EntityFrameworkCore;
using ND.ProjectionService.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.ProjectionService.Infrastructure.Persistence;

public sealed class ProjectionDbContext : DbContext, IUnitOfWork
{
    public ProjectionDbContext(DbContextOptions<ProjectionDbContext> options) : base(options) { }

    public DbSet<ProductionView> ProductionViews => Set<ProductionView>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();
    public DbSet<DeviceStatus> DeviceStatuses => Set<DeviceStatus>();
    public DbSet<DeviceStatusHistory> DeviceStatusHistories => Set<DeviceStatusHistory>();
    public DbSet<ProductionRecord> ProductionRecords => Set<ProductionRecord>();
    public DbSet<Alarm> Alarms => Set<Alarm>();
    public DbSet<AlarmTimelineEvent> AlarmTimelineEvents => Set<AlarmTimelineEvent>();
    public DbSet<AlarmOutboxEvent> AlarmOutboxEvents => Set<AlarmOutboxEvent>();
    public DbSet<AlarmInboxMessage> AlarmInboxMessages => Set<AlarmInboxMessage>();
    public DbSet<AlarmCommandReceipt> AlarmCommandReceipts => Set<AlarmCommandReceipt>();
    public DbSet<ProductionOrderView> ProductionOrders => Set<ProductionOrderView>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ProductionView>(e =>
        {
            e.ToTable("projection_production_view");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.StationId).HasColumnName("station_id").IsRequired();
            e.HasIndex(x => x.StationId).IsUnique();
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.WorkOrderNo).HasColumnName("work_order_no").IsRequired();
            e.Property(x => x.ProductCode).HasColumnName("product_code").IsRequired();
            e.Property(x => x.ProductSerial).HasColumnName("product_serial");
            e.Property(x => x.JobStatus).HasColumnName("job_status").IsRequired();
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<ActivityLog>(e =>
        {
            e.ToTable("projection_activity_log");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.EventType).HasColumnName("event_type").IsRequired();
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.JobNo).HasColumnName("job_no").IsRequired();
            e.Property(x => x.ProductCode).HasColumnName("product_code").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.Message).HasColumnName("message").IsRequired();
            e.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<DeviceStatus>(e =>
        {
            e.ToTable("projection_device_status");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.DeviceId).HasColumnName("device_id").IsRequired();
            e.HasIndex(x => x.DeviceId).IsUnique();
            e.Property(x => x.DeviceType).HasColumnName("device_type").IsRequired();
            e.Property(x => x.IsOnline).HasColumnName("is_online").IsRequired();
            e.Property(x => x.LastSeenAt).HasColumnName("last_seen_at").IsRequired();
            e.Property(x => x.LifecycleState).HasColumnName("lifecycle_state").HasDefaultValue("Offline");
            e.Property(x => x.SerialNumber).HasColumnName("serial_number");
            e.Property(x => x.LifetimePrintCounter).HasColumnName("lifetime_print_counter");
            e.Property(x => x.ThermalTemp).HasColumnName("thermal_temp");
            e.Property(x => x.ConnectionDetails).HasColumnName("connection_details");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<DeviceStatusHistory>(e =>
        {
            e.ToTable("projection_device_status_history");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.DeviceId).HasColumnName("device_id").IsRequired();
            e.Property(x => x.LifecycleState).HasColumnName("lifecycle_state").IsRequired();
            e.Property(x => x.IsOnline).HasColumnName("is_online").IsRequired();
            e.Property(x => x.Timestamp).HasColumnName("timestamp").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<ProductionRecord>(e =>
        {
            e.ToTable("projection_production_records");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.HasIndex(x => x.JobId).IsUnique();
            e.Property(x => x.JobNo).HasColumnName("job_no").IsRequired();
            e.Property(x => x.ProductCode).HasColumnName("product_code").IsRequired();
            e.Property(x => x.ProductSerial).HasColumnName("product_serial");
            e.Property(x => x.JobType).HasColumnName("job_type").IsRequired();
            e.Property(x => x.CurrentStatus).HasColumnName("current_status").IsRequired();
            e.Property(x => x.StationId).HasColumnName("station_id").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
            e.Property(x => x.AssignedPrinter).HasColumnName("assigned_printer");
            e.Property(x => x.StartTime).HasColumnName("start_time");
            e.Property(x => x.EndTime).HasColumnName("end_time");
            e.Property(x => x.RetryCount).HasColumnName("retry_count").HasDefaultValue(0);
            e.Property(x => x.ErrorMessage).HasColumnName("error_message");
        });

        modelBuilder.Entity<Alarm>(e =>
        {
            e.ToTable("projection_alarms");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.AlarmCode).HasColumnName("alarm_code").IsRequired();
            e.Property(x => x.DedupeKey).HasColumnName("dedupe_key").IsRequired();
            e.Property(x => x.Severity).HasColumnName("severity").IsRequired();
            e.Property(x => x.Category).HasColumnName("category").IsRequired();
            e.Property(x => x.State).HasColumnName("state").IsRequired();
            e.Property(x => x.StationId).HasColumnName("station_id").IsRequired();
            e.Property(x => x.SourceService).HasColumnName("source_service").IsRequired();
            e.Property(x => x.SourceType).HasColumnName("source_type").IsRequired();
            e.Property(x => x.SourceId).HasColumnName("source_id").IsRequired();
            e.Property(x => x.DeviceId).HasColumnName("device_id");
            e.Property(x => x.JobId).HasColumnName("job_id");
            e.Property(x => x.WorkOrderNo).HasColumnName("work_order_no");
            e.Property(x => x.ProductCode).HasColumnName("product_code");
            e.Property(x => x.ProductSerial).HasColumnName("product_serial");
            e.Property(x => x.ProductionImpact).HasColumnName("production_impact");
            e.Property(x => x.TitleKey).HasColumnName("title_key").IsRequired();
            e.Property(x => x.MessageKey).HasColumnName("message_key").IsRequired();
            e.Property(x => x.MessageParamsJson).HasColumnName("message_params_json").IsRequired();
            e.Property(x => x.TechnicalMessage).HasColumnName("technical_message");
            e.Property(x => x.CorrelationId).HasColumnName("correlation_id");
            e.Property(x => x.FirstSeenAt).HasColumnName("first_seen_at").IsRequired();
            e.Property(x => x.LastSeenAt).HasColumnName("last_seen_at").IsRequired();
            e.Property(x => x.OccurrenceCount).HasColumnName("occurrence_count").IsRequired();
            e.Property(x => x.AcknowledgedBy).HasColumnName("acknowledged_by");
            e.Property(x => x.AcknowledgedAt).HasColumnName("acknowledged_at");
            e.Property(x => x.AssignedTo).HasColumnName("assigned_to");
            e.Property(x => x.AssignedAt).HasColumnName("assigned_at");
            e.Property(x => x.ResolvedBy).HasColumnName("resolved_by");
            e.Property(x => x.ResolvedAt).HasColumnName("resolved_at");
            e.Property(x => x.ResolutionCode).HasColumnName("resolution_code");
            e.Property(x => x.ResolutionComment).HasColumnName("resolution_comment");
            e.Property(x => x.SuppressedUntil).HasColumnName("suppressed_until");
            e.Property(x => x.SuppressionReason).HasColumnName("suppression_reason");
            e.Property(x => x.EscalationLevel).HasColumnName("escalation_level");
            e.Property(x => x.EscalatedAt).HasColumnName("escalated_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
            e.Property(x => x.RowVersion).HasColumnName("row_version").IsConcurrencyToken();
            e.Ignore(x => x.AlarmType); e.Ignore(x => x.AlarmGroupKey); e.Ignore(x => x.Source);
            e.Ignore(x => x.Message); e.Ignore(x => x.DeviceName); e.Ignore(x => x.ProductionOrderId);
            e.Ignore(x => x.IsAcknowledged); e.Ignore(x => x.CurrentState);
            e.Ignore(x => x.FirstOccurredAt); e.Ignore(x => x.LastOccurredAt); e.Ignore(x => x.RepeatCount);
            e.HasIndex(x => x.DedupeKey).IsUnique()
                .HasFilter("state IN ('RAISED','ACKNOWLEDGED','IN_PROGRESS','SUPPRESSED')");
            e.HasIndex(x => x.State); e.HasIndex(x => x.Severity); e.HasIndex(x => x.StationId);
            e.HasIndex(x => x.DeviceId); e.HasIndex(x => x.JobId); e.HasIndex(x => x.FirstSeenAt);
            e.HasIndex(x => x.LastSeenAt); e.HasIndex(x => x.AssignedTo);
        });

        modelBuilder.Entity<AlarmTimelineEvent>(e =>
        {
            e.ToTable("alarm_timeline_events"); e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id"); e.Property(x => x.AlarmId).HasColumnName("alarm_id").IsRequired();
            e.Property(x => x.ActionType).HasColumnName("action_type").IsRequired();
            e.Property(x => x.PreviousState).HasColumnName("previous_state"); e.Property(x => x.NewState).HasColumnName("new_state").IsRequired();
            e.Property(x => x.ActorUserId).HasColumnName("actor_user_id"); e.Property(x => x.ActorUsername).HasColumnName("actor_username").IsRequired();
            e.Property(x => x.ActorRole).HasColumnName("actor_role").IsRequired(); e.Property(x => x.Comment).HasColumnName("comment");
            e.Property(x => x.MetadataJson).HasColumnName("metadata_json").IsRequired(); e.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
            e.Property(x => x.CorrelationId).HasColumnName("correlation_id"); e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.HasIndex(x => new { x.AlarmId, x.OccurredAt });
        });

        modelBuilder.Entity<AlarmOutboxEvent>(e =>
        {
            e.ToTable("alarm_outbox_events"); e.HasKey(x => x.Id); e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.EventId).HasColumnName("event_id").IsRequired(); e.HasIndex(x => x.EventId).IsUnique();
            e.Property(x => x.AlarmId).HasColumnName("alarm_id").IsRequired(); e.Property(x => x.EventType).HasColumnName("event_type").IsRequired();
            e.Property(x => x.PayloadJson).HasColumnName("payload_json").IsRequired(); e.Property(x => x.RoutingKey).HasColumnName("routing_key").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired(); e.Property(x => x.RetryCount).HasColumnName("retry_count");
            e.Property(x => x.NextRetryAt).HasColumnName("next_retry_at"); e.Property(x => x.PublishedAt).HasColumnName("published_at");
            e.Property(x => x.LastError).HasColumnName("last_error"); e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.HasIndex(x => new { x.Status, x.NextRetryAt });
        });

        modelBuilder.Entity<AlarmInboxMessage>(e =>
        {
            e.ToTable("alarm_inbox_messages"); e.HasKey(x => x.Id); e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ConsumerName).HasColumnName("consumer_name").IsRequired(); e.Property(x => x.EventId).HasColumnName("event_id").IsRequired();
            e.Property(x => x.ProcessedAt).HasColumnName("processed_at").IsRequired(); e.Property(x => x.CorrelationId).HasColumnName("correlation_id");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired(); e.HasIndex(x => new { x.ConsumerName, x.EventId }).IsUnique();
        });

        modelBuilder.Entity<AlarmCommandReceipt>(e =>
        {
            e.ToTable("alarm_command_receipts"); e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.IdempotencyKey).HasColumnName("idempotency_key").IsRequired();
            e.Property(x => x.AlarmId).HasColumnName("alarm_id").IsRequired();
            e.Property(x => x.CommandType).HasColumnName("command_type").IsRequired();
            e.Property(x => x.ActorUserId).HasColumnName("actor_user_id").IsRequired();
            e.Property(x => x.CompletedAt).HasColumnName("completed_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.HasIndex(x => x.IdempotencyKey).IsUnique();
        });


        modelBuilder.Entity<ProductionOrderView>(e =>
        {
            e.ToTable("projection_production_orders");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.OrderNo).HasColumnName("order_no").IsRequired();
            e.HasIndex(x => x.OrderNo).IsUnique();
            e.Property(x => x.ProductCode).HasColumnName("product_code").IsRequired();
            e.Property(x => x.PlannedQty).HasColumnName("planned_qty").IsRequired();
            e.Property(x => x.CompletedQty).HasColumnName("completed_qty").IsRequired();
            e.Property(x => x.RemainingQty).HasColumnName("remaining_qty").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        });
    }
}
