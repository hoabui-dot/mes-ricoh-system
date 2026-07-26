using Microsoft.EntityFrameworkCore;
using ND.PlcAdapter.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.PlcAdapter.Infrastructure.Persistence;

public sealed class PlcDbContext : DbContext, IUnitOfWork
{
    public PlcDbContext(DbContextOptions<PlcDbContext> options) : base(options) { }

    public DbSet<PlcDevice> PlcDevices => Set<PlcDevice>();
    public DbSet<PlcCommand> PlcCommands => Set<PlcCommand>();
    public DbSet<PlcEvent> PlcEvents => Set<PlcEvent>();
    public DbSet<PlcRobotPickEvent> PlcRobotPickEvents => Set<PlcRobotPickEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PlcDevice>(e =>
        {
            e.ToTable("plc_devices");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PlcCode).HasColumnName("plc_code").IsRequired();
            e.HasIndex(x => x.PlcCode).IsUnique();
            e.Property(x => x.DisplayName).HasColumnName("display_name").IsRequired();
            e.Property(x => x.Protocol).HasColumnName("protocol").IsRequired();
            e.Property(x => x.IpAddress).HasColumnName("ip_address").IsRequired();
            e.Property(x => x.Port).HasColumnName("port");
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.LastHeartbeatAt).HasColumnName("last_heartbeat_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<PlcCommand>(e =>
        {
            e.ToTable("plc_commands");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.AttemptId).HasColumnName("attempt_id").IsRequired();
            e.Property(x => x.PlcId).HasColumnName("plc_id").IsRequired();
            e.Property(x => x.CommandName).HasColumnName("command_name").IsRequired();
            e.Property(x => x.CommandPayload).HasColumnName("command_payload").IsRequired();
            e.Property(x => x.ExecutionStatus).HasColumnName("execution_status").IsRequired();
            e.Property(x => x.SentAt).HasColumnName("sent_at");
            e.Property(x => x.FinishedAt).HasColumnName("finished_at");
            e.Property(x => x.ErrorMessage).HasColumnName("error_message");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<PlcEvent>(e =>
        {
            e.ToTable("plc_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PlcId).HasColumnName("plc_id").IsRequired();
            e.Property(x => x.EventType).HasColumnName("event_type").IsRequired();
            e.Property(x => x.EventData).HasColumnName("event_data");
            e.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<PlcRobotPickEvent>(e =>
        {
            e.ToTable("plc_robot_pick_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.AttemptId).HasColumnName("attempt_id").IsRequired();
            e.Property(x => x.PlcId).HasColumnName("plc_id").IsRequired();
            e.Property(x => x.PickResult).HasColumnName("pick_result").IsRequired();
            e.Property(x => x.PickPosition).HasColumnName("pick_position");
            e.Property(x => x.ErrorCode).HasColumnName("error_code");
            e.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });
    }
}
