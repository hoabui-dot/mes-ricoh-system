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
            e.Property(x => x.AlarmType).HasColumnName("alarm_type").IsRequired().HasDefaultValue("ProductionError");
            e.Property(x => x.AlarmGroupKey).HasColumnName("alarm_group_key").IsRequired();
            e.Property(x => x.Severity).HasColumnName("severity").IsRequired();
            e.Property(x => x.Source).HasColumnName("source").IsRequired();
            e.Property(x => x.Message).HasColumnName("message").IsRequired();
            e.Property(x => x.DeviceId).HasColumnName("device_id");
            e.Property(x => x.DeviceName).HasColumnName("device_name");
            e.Property(x => x.ProductionOrderId).HasColumnName("production_order_id");
            e.Property(x => x.CurrentState).HasColumnName("current_state").IsRequired().HasDefaultValue("Active");
            e.Property(x => x.FirstOccurredAt).HasColumnName("first_occurred_at").IsRequired();
            e.Property(x => x.LastOccurredAt).HasColumnName("last_occurred_at").IsRequired();
            e.Property(x => x.RepeatCount).HasColumnName("repeat_count").HasDefaultValue(0);
            e.Property(x => x.ResolvedAt).HasColumnName("resolved_at");
            e.Property(x => x.IsAcknowledged).HasColumnName("is_acknowledged").IsRequired();
            e.Property(x => x.AcknowledgedBy).HasColumnName("acknowledged_by");
            e.Property(x => x.AcknowledgedAt).HasColumnName("acknowledged_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            // Index on alarm_group_key for fast dedup lookups
            e.HasIndex(x => x.AlarmGroupKey);
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

