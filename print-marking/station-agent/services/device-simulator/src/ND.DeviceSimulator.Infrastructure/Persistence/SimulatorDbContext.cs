using Microsoft.EntityFrameworkCore;
using ND.DeviceSimulator.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.DeviceSimulator.Infrastructure.Persistence;

public sealed class SimulatorDbContext : DbContext, IUnitOfWork
{
    public SimulatorDbContext(DbContextOptions<SimulatorDbContext> options) : base(options) { }

    public DbSet<PrinterJob> PrinterJobs => Set<PrinterJob>();
    public DbSet<LaserCommand> LaserCommands => Set<LaserCommand>();
    public DbSet<VisionResult> VisionResults => Set<VisionResult>();
    public DbSet<PlcRegisterEvent> PlcRegisterEvents => Set<PlcRegisterEvent>();
    public DbSet<GatewayEvent> GatewayEvents => Set<GatewayEvent>();
    public DbSet<TimelineEvent> TimelineEvents => Set<TimelineEvent>();
    public DbSet<SystemConnection> SystemConnections => Set<SystemConnection>();
    public DbSet<ConfigurationValue> ConfigurationValues => Set<ConfigurationValue>();
    public DbSet<ProductionOrderMapping> ProductionOrderMappings => Set<ProductionOrderMapping>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PrinterJob>(e =>
        {
            e.ToTable("printer_jobs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.ZplContent).HasColumnName("zpl_content");
            e.Property(x => x.DurationMs).HasColumnName("duration_ms");
            e.Property(x => x.ReceivedAt).HasColumnName("received_at").IsRequired();
            e.Property(x => x.ErrorMessage).HasColumnName("error_message");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<LaserCommand>(e =>
        {
            e.ToTable("laser_commands");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.RawCommand).HasColumnName("raw_command").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.DurationMs).HasColumnName("duration_ms");
            e.Property(x => x.ExecutedAt).HasColumnName("executed_at").IsRequired();
            e.Property(x => x.ErrorMessage).HasColumnName("error_message");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<VisionResult>(e =>
        {
            e.ToTable("vision_results");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.Result).HasColumnName("result").IsRequired();
            e.Property(x => x.DefectCode).HasColumnName("defect_code");
            e.Property(x => x.Confidence).HasColumnName("confidence");
            e.Property(x => x.OcrText).HasColumnName("ocr_text");
            e.Property(x => x.DurationMs).HasColumnName("duration_ms");
            e.Property(x => x.VerifiedAt).HasColumnName("verified_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<PlcRegisterEvent>(e =>
        {
            e.ToTable("plc_register_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.RegisterName).HasColumnName("register_name").IsRequired();
            e.Property(x => x.Value).HasColumnName("value");
            e.Property(x => x.Source).HasColumnName("source").IsRequired();
            e.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<GatewayEvent>(e =>
        {
            e.ToTable("gateway_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Direction).HasColumnName("direction").IsRequired();
            e.Property(x => x.Topic).HasColumnName("topic").IsRequired();
            e.Property(x => x.PayloadJson).HasColumnName("payload_json").IsRequired();
            e.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<TimelineEvent>(e =>
        {
            e.ToTable("timeline_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Stage).HasColumnName("stage").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.Detail).HasColumnName("detail").IsRequired();
            e.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<SystemConnection>(e =>
        {
            e.ToTable("system_connections");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ConnectionName).HasColumnName("connection_name").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.Detail).HasColumnName("detail");
            e.Property(x => x.CheckedAt).HasColumnName("checked_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<ConfigurationValue>(e =>
        {
            e.ToTable("configuration_values");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Key).HasColumnName("key").IsRequired();
            e.HasIndex(x => x.Key).IsUnique();
            e.Property(x => x.Value).HasColumnName("value").IsRequired();
            e.Property(x => x.Description).HasColumnName("description");
            e.Property(x => x.IsEditable).HasColumnName("is_editable");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<ProductionOrderMapping>(e =>
        {
            e.ToTable("production_order_mappings");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ProductionOrderId).HasColumnName("production_order_id").IsRequired();
            e.Property(x => x.OrderNumber).HasColumnName("order_number").IsRequired();
            e.Property(x => x.EventId).HasColumnName("event_id").IsRequired();
            e.HasIndex(x => x.EventId).IsUnique();
            e.Property(x => x.CorrelationId).HasColumnName("correlation_id").IsRequired();
            e.Property(x => x.OperationType).HasColumnName("operation_type").IsRequired();
            e.Property(x => x.Station).HasColumnName("station").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });
    }
}
