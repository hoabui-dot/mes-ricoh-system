using Microsoft.EntityFrameworkCore;
using ND.StationGateway.Application.Interfaces;
using ND.StationGateway.Domain.Entities;
using ND.StationGateway.Infrastructure.Persistence;

namespace ND.StationGateway.Infrastructure.Repositories;

public sealed class GatewayRequestRepository(GatewayDbContext db) : IGatewayRequestRepository
{
    public async Task AddAsync(GatewayRequest request, CancellationToken cancellationToken = default)
        => await db.GatewayRequests.AddAsync(request, cancellationToken);
}

public sealed class GatewayOutboxRepository(GatewayDbContext db) : IGatewayOutboxRepository
{
    public async Task AddAsync(GatewayOutboxEvent outboxEvent, CancellationToken cancellationToken = default)
        => await db.GatewayOutboxEvents.AddAsync(outboxEvent, cancellationToken);

    public async Task<IReadOnlyList<GatewayOutboxEvent>> GetPendingAsync(int batchSize, CancellationToken cancellationToken = default)
    {
        var nowIso = DateTimeOffset.UtcNow.ToString("o");
        var pending = await db.GatewayOutboxEvents
            .Where(e => e.Status == "PENDING")
            .OrderBy(e => e.CreatedAt)
            .ToListAsync(cancellationToken);

        return pending
            .Where(e => e.NextRetryAt == null || string.Compare(e.NextRetryAt, nowIso, StringComparison.Ordinal) <= 0)
            .Take(batchSize)
            .ToList();
    }

    public Task UpdateAsync(GatewayOutboxEvent outboxEvent, CancellationToken cancellationToken = default)
    {
        db.GatewayOutboxEvents.Update(outboxEvent);
        return Task.CompletedTask;
    }
}
