using Microsoft.EntityFrameworkCore;
using ND.PrinterAdapter.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.PrinterAdapter.Infrastructure.Persistence;

public sealed class PrinterDbContext : DbContext, IUnitOfWork
{
    public PrinterDbContext(DbContextOptions<PrinterDbContext> options) : base(options) { }

    public DbSet<Printer> Printers => Set<Printer>();
    public DbSet<PrinterJob> PrinterJobs => Set<PrinterJob>();
    public DbSet<PrinterEvent> PrinterEvents => Set<PrinterEvent>();
    public DbSet<LabelTemplate> LabelTemplates => Set<LabelTemplate>();
    public DbSet<LabelTemplateVersion> LabelTemplateVersions => Set<LabelTemplateVersion>();
    public DbSet<PrintHistory> PrintHistories => Set<PrintHistory>();
    public DbSet<PrinterTemplateAssignment> PrinterTemplateAssignments => Set<PrinterTemplateAssignment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Printer>(e =>
        {
            e.ToTable("printer_printers");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PrinterCode).HasColumnName("printer_code").IsRequired();
            e.HasIndex(x => x.PrinterCode).IsUnique();
            e.Property(x => x.DisplayName).HasColumnName("display_name").IsRequired();
            e.Property(x => x.IpAddress).HasColumnName("ip_address").IsRequired();
            e.Property(x => x.Port).HasColumnName("port");
            e.Property(x => x.Protocol).HasColumnName("protocol").IsRequired();
            e.Property(x => x.Vendor).HasColumnName("vendor").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.GroupId).HasColumnName("group_id");
            e.Property(x => x.LastHeartbeatAt).HasColumnName("last_heartbeat_at");
            e.Property(x => x.DriverType).HasColumnName("driver_type").HasDefaultValue("simulation").IsRequired();
            e.Property(x => x.CupsQueueName).HasColumnName("cups_queue_name");
            e.Property(x => x.IsActiveForWork).HasColumnName("is_active_for_work").HasDefaultValue(false);
            e.Property(x => x.ActiveTemplateId).HasColumnName("active_template_id");
            e.Property(x => x.ActiveTemplateName).HasColumnName("active_template_name");
            e.Property(x => x.ActivatedAt).HasColumnName("activated_at");
            e.Property(x => x.ActivatedBy).HasColumnName("activated_by");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<PrinterJob>(e =>
        {
            e.ToTable("printer_jobs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.AttemptId).HasColumnName("attempt_id").IsRequired();
            e.Property(x => x.PrinterId).HasColumnName("printer_id").IsRequired();
            e.Property(x => x.LabelTemplate).HasColumnName("label_template").IsRequired();
            e.Property(x => x.RenderedContent).HasColumnName("rendered_content").IsRequired();
            e.Property(x => x.PrintStatus).HasColumnName("print_status").IsRequired();
            e.Property(x => x.Copies).HasColumnName("copies");
            e.Property(x => x.SentAt).HasColumnName("sent_at");
            e.Property(x => x.FinishedAt).HasColumnName("finished_at");
            e.Property(x => x.ErrorMessage).HasColumnName("error_message");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<PrinterEvent>(e =>
        {
            e.ToTable("printer_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PrinterId).HasColumnName("printer_id").IsRequired();
            e.Property(x => x.EventType).HasColumnName("event_type").IsRequired();
            e.Property(x => x.EventData).HasColumnName("event_data");
            e.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        // ── Label Templates ──────────────────────────────────────────────────
        modelBuilder.Entity<LabelTemplate>(e =>
        {
            e.ToTable("label_templates");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Name).HasColumnName("name").IsRequired();
            e.Property(x => x.Description).HasColumnName("description");
            e.Property(x => x.Note).HasColumnName("note");
            e.Property(x => x.TemplateCode).HasColumnName("template_code");
            e.HasIndex(x => x.TemplateCode).IsUnique().HasFilter("template_code IS NOT NULL");
            e.Property(x => x.Category).HasColumnName("category");
            e.Property(x => x.Orientation).HasColumnName("orientation").HasDefaultValue("PORTRAIT");
            e.Property(x => x.Revision).HasColumnName("revision").HasDefaultValue("A");
            e.Property(x => x.SupportedBarcodeTypes).HasColumnName("supported_barcode_types");
            e.Property(x => x.SupportedPrinterModels).HasColumnName("supported_printer_models");
            e.Property(x => x.CompatibleStationTypes).HasColumnName("compatible_station_types");
            e.Property(x => x.Dpi).HasColumnName("dpi");
            e.Property(x => x.LabelWidth).HasColumnName("label_width");
            e.Property(x => x.LabelHeight).HasColumnName("label_height");
            e.Property(x => x.TemplateJson).HasColumnName("template_json").IsRequired();
            e.Property(x => x.Version).HasColumnName("version");
            e.Property(x => x.IsActive).HasColumnName("is_active");
            e.Property(x => x.Status).HasColumnName("status").HasDefaultValue("published").IsRequired();
            e.Property(x => x.IsDefault).HasColumnName("is_default").HasDefaultValue(false);
            e.Property(x => x.CreatedBy).HasColumnName("created_by");
            e.Property(x => x.UpdatedBy).HasColumnName("updated_by");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            // N-Up layout columns
            e.Property(x => x.LayoutType)  .HasColumnName("layout_type")  .HasDefaultValue("1UP").IsRequired();
            e.Property(x => x.SheetColumns).HasColumnName("sheet_columns").HasDefaultValue(1);
            e.Property(x => x.SheetRows)   .HasColumnName("sheet_rows")   .HasDefaultValue(1);
            e.Property(x => x.GapMm)       .HasColumnName("gap_mm")       .HasDefaultValue(0.0);
        });


        // ── Label Template Versions ──────────────────────────────────────────
        modelBuilder.Entity<LabelTemplateVersion>(e =>
        {
            e.ToTable("label_template_versions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.TemplateId).HasColumnName("template_id").IsRequired();
            e.HasIndex(x => new { x.TemplateId, x.Version }).IsUnique();
            e.Property(x => x.Version).HasColumnName("version");
            e.Property(x => x.TemplateJson).HasColumnName("template_json").IsRequired();
            e.Property(x => x.CreatedBy).HasColumnName("created_by");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        // ── Print History ─────────────────────────────────────────────────────
        modelBuilder.Entity<PrintHistory>(e =>
        {
            e.ToTable("print_history");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.TemplateId).HasColumnName("template_id").IsRequired();
            e.Property(x => x.TemplateName).HasColumnName("template_name").IsRequired();
            e.Property(x => x.TemplateVersion).HasColumnName("template_version");
            e.Property(x => x.PrinterCode).HasColumnName("printer_code").IsRequired();
            e.Property(x => x.RuntimeDataJson).HasColumnName("runtime_data_json").IsRequired();
            e.Property(x => x.RenderedZpl).HasColumnName("rendered_zpl").IsRequired();
            e.Property(x => x.TcpRequestHex).HasColumnName("tcp_request_hex");
            e.Property(x => x.TcpResponseHex).HasColumnName("tcp_response_hex");
            e.Property(x => x.PrinterResult).HasColumnName("printer_result");
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.DurationMs).HasColumnName("duration_ms");
            e.Property(x => x.RetryCount).HasColumnName("retry_count");
            e.Property(x => x.TraceId).HasColumnName("trace_id").IsRequired();
            e.Property(x => x.CorrelationId).HasColumnName("correlation_id").IsRequired();
            e.Property(x => x.ExceptionMessage).HasColumnName("exception_message");
            e.Property(x => x.TimelineJson).HasColumnName("timeline_json");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        // ── Printer Template Assignments ──────────────────────────────────────
        modelBuilder.Entity<PrinterTemplateAssignment>(e =>
        {
            e.ToTable("printer_template_assignments");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PrinterCode).HasColumnName("printer_code").IsRequired();
            e.HasIndex(x => x.PrinterCode).IsUnique();
            e.Property(x => x.TemplateId).HasColumnName("template_id").IsRequired();
            e.Property(x => x.TemplateName).HasColumnName("template_name");
            e.Property(x => x.AssignedBy).HasColumnName("assigned_by");
            e.Property(x => x.AssignedAt).HasColumnName("assigned_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });
    }
}
