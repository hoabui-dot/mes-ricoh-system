using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using ND.SharedKernel.Abstractions;
using ND.StationGateway.Domain.Entities;

namespace ND.StationGateway.Infrastructure.Persistence;

public sealed class GatewayDbContext : DbContext, IUnitOfWork, ITransactionalUnitOfWork
{
    public GatewayDbContext(DbContextOptions<GatewayDbContext> options) : base(options) { }

    public DbSet<GatewayRequest> GatewayRequests => Set<GatewayRequest>();
    public DbSet<GatewayOutboxEvent> GatewayOutboxEvents => Set<GatewayOutboxEvent>();

    // ── IUnitOfWork ────────────────────────────────────────────────────────────
    Task<int> IUnitOfWork.SaveChangesAsync(CancellationToken ct) => SaveChangesAsync(ct);

    // ── ITransactionalUnitOfWork ───────────────────────────────────────────────
    public async Task<IDbTransaction> BeginTransactionAsync(CancellationToken ct = default)
    {
        var efTx = await Database.BeginTransactionAsync(ct);
        return new EfCoreDbTransaction(efTx);
    }

    private sealed class EfCoreDbTransaction(IDbContextTransaction tx) : IDbTransaction
    {
        public Task CommitAsync(CancellationToken ct = default) => tx.CommitAsync(ct);
        public Task RollbackAsync(CancellationToken ct = default) => tx.RollbackAsync(ct);
        public ValueTask DisposeAsync() => tx.DisposeAsync();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<GatewayRequest>(e =>
        {
            e.ToTable("gateway_requests");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.RequestId).HasColumnName("request_id").IsRequired();
            e.HasIndex(x => x.RequestId).IsUnique();
            e.Property(x => x.Source).HasColumnName("source").IsRequired();
            e.Property(x => x.PayloadJson).HasColumnName("payload_json").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.ReceivedAt).HasColumnName("received_at").IsRequired();
            e.Property(x => x.ProcessedAt).HasColumnName("processed_at");
            e.Property(x => x.ErrorMessage).HasColumnName("error_message");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        });

        modelBuilder.Entity<GatewayOutboxEvent>(e =>
        {
            e.ToTable("gateway_outbox_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.AggregateType).HasColumnName("aggregate_type").IsRequired();
            e.Property(x => x.AggregateId).HasColumnName("aggregate_id").IsRequired();
            e.Property(x => x.EventType).HasColumnName("event_type").IsRequired();
            e.Property(x => x.PayloadJson).HasColumnName("payload_json").IsRequired();
            e.Property(x => x.RoutingKeyHint).HasColumnName("routing_key_hint").IsRequired();
            e.Property(x => x.Status).HasColumnName("status").IsRequired();
            e.Property(x => x.RetryCount).HasColumnName("retry_count");
            e.Property(x => x.NextRetryAt).HasColumnName("next_retry_at");
            e.Property(x => x.PublishedAt).HasColumnName("published_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        });
    }
}
