using Microsoft.EntityFrameworkCore;
using ND.JobEngine.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.JobEngine.Infrastructure.Persistence;

public sealed class JobEngineDbContext : DbContext, IUnitOfWork
{
    public JobEngineDbContext(DbContextOptions<JobEngineDbContext> options) : base(options) { }

    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<JobAttempt> JobAttempts => Set<JobAttempt>();
    public DbSet<JobStep> JobSteps => Set<JobStep>();
    public DbSet<JobHistory> JobHistories => Set<JobHistory>();
    public DbSet<JobStateTransition> JobStateTransitions => Set<JobStateTransition>();
    public DbSet<OverwriteRequest> OverwriteRequests => Set<OverwriteRequest>();
    public DbSet<JobEngineOutboxEvent> JobEngineOutboxEvents => Set<JobEngineOutboxEvent>();
    public DbSet<ProductionOrder> ProductionOrders => Set<ProductionOrder>();
    public DbSet<ProductionItem> ProductionItems => Set<ProductionItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Job>(e =>
        {
            e.ToTable("job_engine_jobs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobNo).HasColumnName("job_no").IsRequired();
            e.HasIndex(x => x.JobNo);
            e.Property(x => x.SourceSystem).HasColumnName("source_system").IsRequired();
            e.Property(x => x.JobType).HasColumnName("job_type").IsRequired();
            e.Property(x => x.CurrentStatus).HasColumnName("current_status").IsRequired();
            e.Property(x => x.ProductCode).HasColumnName("product_code").IsRequired();
            e.Property(x => x.ProductSerial).HasColumnName("product_serial");
            e.Property(x => x.PayloadJson).HasColumnName("payload_json").IsRequired();
            e.Property(x => x.Priority).HasColumnName("priority");
            e.Property(x => x.IdempotencyKey).HasColumnName("idempotency_key").IsRequired();
            e.HasIndex(x => x.IdempotencyKey).IsUnique();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
            e.Property(x => x.CompletedAt).HasColumnName("completed_at");
            e.Property(x => x.ParentJobId).HasColumnName("parent_job_id");
            e.Property(x => x.RootJobId).HasColumnName("root_job_id");
            e.Property(x => x.RetrySequence).HasColumnName("retry_sequence").HasDefaultValue(0);
            e.Property(x => x.ExecutionType).HasColumnName("execution_type").HasDefaultValue("OriginalProduction");
            e.Property(x => x.TriggeredByUserId).HasColumnName("triggered_by_user_id");
            e.Property(x => x.ReasonCode).HasColumnName("reason_code");
            e.Property(x => x.ReasonDescription).HasColumnName("reason_description");
            e.Property(x => x.AssignedPrinter).HasColumnName("assigned_printer");
        });

        modelBuilder.Entity<JobAttempt>(e =>
        {
            e.ToTable("job_engine_job_attempts");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.AttemptNo).HasColumnName("attempt_no").IsRequired();
            e.Property(x => x.TriggerType).HasColumnName("trigger_type").IsRequired();
            e.Property(x => x.TriggeredByUserId).HasColumnName("triggered_by_user_id");
            e.Property(x => x.ResultStatus).HasColumnName("result_status").IsRequired();
            e.Property(x => x.StartedAt).HasColumnName("started_at").IsRequired();
            e.Property(x => x.FinishedAt).HasColumnName("finished_at");
            e.Property(x => x.ErrorMessage).HasColumnName("error_message");
            e.Property(x => x.ParentAttemptId).HasColumnName("parent_attempt_id");
            e.Property(x => x.RetrySequence).HasColumnName("retry_sequence").HasDefaultValue(0);
            e.Property(x => x.ReasonCode).HasColumnName("reason_code");
            e.Property(x => x.ReasonDescription).HasColumnName("reason_description");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<JobStep>(e =>
        {
            e.ToTable("job_engine_job_steps");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.AttemptId).HasColumnName("attempt_id").IsRequired();
            e.Property(x => x.StepName).HasColumnName("step_name").IsRequired();
            e.Property(x => x.StepOrder).HasColumnName("step_order").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.StartedAt).HasColumnName("started_at");
            e.Property(x => x.FinishedAt).HasColumnName("finished_at");
            e.Property(x => x.ResultJson).HasColumnName("result_json");
            e.Property(x => x.ErrorMessage).HasColumnName("error_message");
            e.Property(x => x.ExecutionDurationMs).HasColumnName("execution_duration_ms").HasDefaultValue(0);
            e.Property(x => x.RetryCount).HasColumnName("retry_count_step").HasDefaultValue(0);
            e.Property(x => x.PayloadJsonStep).HasColumnName("payload_json_step");
            e.Property(x => x.AssignedDeviceId).HasColumnName("assigned_device_id");
            e.Property(x => x.ExecutionResult).HasColumnName("execution_result");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<JobHistory>(e =>
        {
            e.ToTable("job_engine_job_history");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.AttemptId).HasColumnName("attempt_id");
            e.Property(x => x.OldStatus).HasColumnName("old_status").IsRequired();
            e.Property(x => x.NewStatus).HasColumnName("new_status").IsRequired();
            e.Property(x => x.ActionName).HasColumnName("action_name").IsRequired();
            e.Property(x => x.PerformedBy).HasColumnName("performed_by").IsRequired();
            e.Property(x => x.Note).HasColumnName("note");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<JobStateTransition>(e =>
        {
            e.ToTable("job_engine_state_transitions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.FromState).HasColumnName("from_state").IsRequired();
            e.Property(x => x.ToState).HasColumnName("to_state").IsRequired();
            e.Property(x => x.Trigger).HasColumnName("trigger").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<OverwriteRequest>(e =>
        {
            e.ToTable("job_engine_overwrite_requests");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobId).HasColumnName("job_id").IsRequired();
            e.Property(x => x.OverwriteType).HasColumnName("overwrite_type").IsRequired();
            e.Property(x => x.Reason).HasColumnName("reason").IsRequired();
            e.Property(x => x.RequestedBy).HasColumnName("requested_by").IsRequired();
            e.Property(x => x.ApprovedBy).HasColumnName("approved_by");
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.RequestedAt).HasColumnName("requested_at").IsRequired();
            e.Property(x => x.ResolvedAt).HasColumnName("resolved_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<JobEngineOutboxEvent>(e =>
        {
            e.ToTable("job_engine_outbox_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.AggregateType).HasColumnName("aggregate_type").IsRequired();
            e.Property(x => x.AggregateId).HasColumnName("aggregate_id").IsRequired();
            e.Property(x => x.EventType).HasColumnName("event_type").IsRequired();
            e.Property(x => x.RoutingKey).HasColumnName("routing_key").IsRequired();
            e.Property(x => x.PayloadJson).HasColumnName("payload_json").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.RetryCount).HasColumnName("retry_count").IsRequired();
            e.Property(x => x.NextRetryAt).HasColumnName("next_retry_at");
            e.Property(x => x.PublishedAt).HasColumnName("published_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        });

        modelBuilder.Entity<ProductionOrder>(e =>
        {
            e.ToTable("job_engine_production_orders");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.OrderNo).HasColumnName("order_no").IsRequired();
            e.HasIndex(x => x.OrderNo).IsUnique();
            e.Property(x => x.ProductCode).HasColumnName("product_code").IsRequired();
            e.Property(x => x.PlannedQty).HasColumnName("planned_qty").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        });

        modelBuilder.Entity<ProductionItem>(e =>
        {
            e.ToTable("job_engine_production_items");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.OrderNo).HasColumnName("order_no").IsRequired();
            e.Property(x => x.SequenceNo).HasColumnName("sequence_no").IsRequired();
            e.Property(x => x.ProductSerial).HasColumnName("product_serial").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.CurrentJobId).HasColumnName("current_job_id");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        });
    }
}
