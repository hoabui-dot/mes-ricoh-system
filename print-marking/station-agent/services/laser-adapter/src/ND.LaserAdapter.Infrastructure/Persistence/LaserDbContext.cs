using Microsoft.EntityFrameworkCore;
using ND.LaserAdapter.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.LaserAdapter.Infrastructure.Persistence;

public sealed class LaserDbContext : DbContext, IUnitOfWork
{
    public LaserDbContext(DbContextOptions<LaserDbContext> options) : base(options) { }

    public DbSet<Laser> Lasers => Set<Laser>();
    public DbSet<LaserJob> LaserJobs => Set<LaserJob>();
    public DbSet<LaserEvent> LaserEvents => Set<LaserEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Laser>(e =>
        {
            e.ToTable("laser_lasers");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.LaserCode).HasColumnName("laser_code").IsRequired();
            e.HasIndex(x => x.LaserCode).IsUnique();
            e.Property(x => x.DisplayName).HasColumnName("display_name").IsRequired();
            e.Property(x => x.ConnectionType).HasColumnName("connection_type").IsRequired();
            e.Property(x => x.Endpoint).HasColumnName("endpoint").IsRequired();
            e.Property(x => x.Vendor).HasColumnName("vendor").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.LastHeartbeatAt).HasColumnName("last_heartbeat_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<LaserJob>(e =>
        {
            e.ToTable("laser_jobs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.AttemptId).HasColumnName("attempt_id").IsRequired();
            e.Property(x => x.LaserId).HasColumnName("laser_id").IsRequired();
            e.Property(x => x.TemplateName).HasColumnName("template_name").IsRequired();
            e.Property(x => x.MarkContent).HasColumnName("mark_content").IsRequired();
            e.Property(x => x.MarkStatus).HasColumnName("mark_status").IsRequired();
            e.Property(x => x.SentAt).HasColumnName("sent_at");
            e.Property(x => x.FinishedAt).HasColumnName("finished_at");
            e.Property(x => x.ErrorMessage).HasColumnName("error_message");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<LaserEvent>(e =>
        {
            e.ToTable("laser_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.LaserId).HasColumnName("laser_id").IsRequired();
            e.Property(x => x.EventType).HasColumnName("event_type").IsRequired();
            e.Property(x => x.EventData).HasColumnName("event_data");
            e.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });
    }
}
