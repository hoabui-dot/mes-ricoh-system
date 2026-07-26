using Microsoft.EntityFrameworkCore;
using ND.SharedKernel.Abstractions;
using ND.VisionService.Domain.Entities;

namespace ND.VisionService.Infrastructure.Persistence;

public sealed class VisionDbContext : DbContext, IUnitOfWork
{
    public VisionDbContext(DbContextOptions<VisionDbContext> options) : base(options) { }

    public DbSet<Camera> Cameras => Set<Camera>();
    public DbSet<VisionResult> VisionResults => Set<VisionResult>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Camera>(e =>
        {
            e.ToTable("vision_cameras");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.CameraCode).HasColumnName("camera_code").IsRequired();
            e.HasIndex(x => x.CameraCode).IsUnique();
            e.Property(x => x.DisplayName).HasColumnName("display_name").IsRequired();
            e.Property(x => x.ConnectionType).HasColumnName("connection_type").IsRequired();
            e.Property(x => x.Endpoint).HasColumnName("endpoint");
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.LastHeartbeatAt).HasColumnName("last_heartbeat_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<VisionResult>(e =>
        {
            e.ToTable("vision_results");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.AttemptId).HasColumnName("attempt_id").IsRequired();
            e.Property(x => x.CameraId).HasColumnName("camera_id").IsRequired();
            e.Property(x => x.InspectionResult).HasColumnName("inspection_result").IsRequired();
            e.Property(x => x.DefectCode).HasColumnName("defect_code");
            e.Property(x => x.ConfidenceScore).HasColumnName("confidence_score");
            e.Property(x => x.OcrText).HasColumnName("ocr_text");
            e.Property(x => x.BarcodeValue).HasColumnName("barcode_value");
            e.Property(x => x.ImagePath).HasColumnName("image_path").IsRequired();
            e.Property(x => x.InspectedAt).HasColumnName("inspected_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });
    }
}
