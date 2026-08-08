using Microsoft.EntityFrameworkCore;
using ND.ProjectionService.Application.Interfaces;
using ND.ProjectionService.Domain.Entities;
using ND.ProjectionService.Infrastructure.Persistence;

namespace ND.ProjectionService.Infrastructure.Repositories;

public sealed class ProductionViewRepository : IProductionViewRepository
{
    private readonly ProjectionDbContext _context;

    public ProductionViewRepository(ProjectionDbContext context)
    {
        _context = context;
    }

    public async Task<ProductionView?> GetByIdAsync(string id, CancellationToken ct = default)
        => await _context.ProductionViews.FindAsync([id], ct);

    public async Task<IReadOnlyList<ProductionView>> GetAllAsync(CancellationToken ct = default)
        => await _context.ProductionViews.ToListAsync(ct);

    public async Task<ProductionView?> GetByStationIdAsync(string stationId, CancellationToken ct = default)
        => await _context.ProductionViews.FirstOrDefaultAsync(v => v.StationId == stationId, ct);

    public async Task AddAsync(ProductionView entity, CancellationToken ct = default)
        => await _context.ProductionViews.AddAsync(entity, ct);

    public Task UpdateAsync(ProductionView entity, CancellationToken ct = default)
    {
        _context.ProductionViews.Update(entity);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var entity = await GetByIdAsync(id, ct);
        if (entity is not null)
            _context.ProductionViews.Remove(entity);
    }
}

public sealed class ActivityLogRepository : IActivityLogRepository
{
    private readonly ProjectionDbContext _context;

    public ActivityLogRepository(ProjectionDbContext context)
    {
        _context = context;
    }

    public async Task<ActivityLog?> GetByIdAsync(string id, CancellationToken ct = default)
        => await _context.ActivityLogs.FindAsync([id], ct);

    public async Task<IReadOnlyList<ActivityLog>> GetAllAsync(CancellationToken ct = default)
        => await _context.ActivityLogs.ToListAsync(ct);

    public async Task<IReadOnlyList<ActivityLog>> GetLatestAsync(int limit, CancellationToken ct = default)
    {
        return await _context.ActivityLogs
            .OrderByDescending(e => e.OccurredAt)
            .Take(limit)
            .ToListAsync(ct);
    }

    public async Task TrimExcessAsync(int keepCount, CancellationToken ct = default)
    {
        var count = await _context.ActivityLogs.CountAsync(ct);
        if (count > keepCount)
        {
            var itemsToRemove = await _context.ActivityLogs
                .OrderBy(e => e.OccurredAt)
                .Take(count - keepCount)
                .ToListAsync(ct);

            _context.ActivityLogs.RemoveRange(itemsToRemove);
        }
    }

    public async Task AddAsync(ActivityLog entity, CancellationToken ct = default)
        => await _context.ActivityLogs.AddAsync(entity, ct);

    public Task UpdateAsync(ActivityLog entity, CancellationToken ct = default)
    {
        _context.ActivityLogs.Update(entity);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var entity = await GetByIdAsync(id, ct);
        if (entity is not null)
            _context.ActivityLogs.Remove(entity);
    }
}

public sealed class DeviceStatusRepository : IDeviceStatusRepository
{
    private readonly ProjectionDbContext _context;

    public DeviceStatusRepository(ProjectionDbContext context)
    {
        _context = context;
    }

    public async Task<DeviceStatus?> GetByIdAsync(string id, CancellationToken ct = default)
        => await _context.DeviceStatuses.FindAsync([id], ct);

    public async Task<IReadOnlyList<DeviceStatus>> GetAllAsync(CancellationToken ct = default)
        => await _context.DeviceStatuses.ToListAsync(ct);

    public async Task<DeviceStatus?> GetByDeviceIdAsync(string deviceId, CancellationToken ct = default)
        => await _context.DeviceStatuses.FirstOrDefaultAsync(d => d.DeviceId == deviceId, ct);

    public async Task AddAsync(DeviceStatus entity, CancellationToken ct = default)
        => await _context.DeviceStatuses.AddAsync(entity, ct);

    public Task UpdateAsync(DeviceStatus entity, CancellationToken ct = default)
    {
        _context.DeviceStatuses.Update(entity);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var entity = await GetByIdAsync(id, ct);
        if (entity is not null)
            _context.DeviceStatuses.Remove(entity);
    }
}

public sealed class ProductionRecordRepository : IProductionRecordRepository
{
    private readonly ProjectionDbContext _context;

    public ProductionRecordRepository(ProjectionDbContext context)
    {
        _context = context;
    }

    public async Task<ProductionRecord?> GetByIdAsync(string id, CancellationToken ct = default)
        => await _context.ProductionRecords.FindAsync([id], ct);

    public async Task<IReadOnlyList<ProductionRecord>> GetAllAsync(CancellationToken ct = default)
        => await _context.ProductionRecords.ToListAsync(ct);

    public async Task AddAsync(ProductionRecord entity, CancellationToken ct = default)
        => await _context.ProductionRecords.AddAsync(entity, ct);

    public Task UpdateAsync(ProductionRecord entity, CancellationToken ct = default)
    {
        _context.ProductionRecords.Update(entity);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var entity = await GetByIdAsync(id, ct);
        if (entity is not null)
            _context.ProductionRecords.Remove(entity);
    }

    public async Task<ProductionRecord?> GetByJobIdAsync(string jobId, CancellationToken ct = default)
        => await _context.ProductionRecords.FirstOrDefaultAsync(r => r.JobId == jobId, ct);

    public async Task<IReadOnlyList<ProductionRecord>> GetByJobNoAsync(string jobNo, CancellationToken ct = default)
        => await _context.ProductionRecords
            .Where(r => r.JobNo == jobNo)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(ct);

    public async Task<(IReadOnlyList<ProductionRecord> Items, int TotalCount)> GetTodayAsync(
        int page, int pageSize, CancellationToken ct = default)
    {
        var nowLocal = DateTime.Now;
        var startOfTodayLocal = new DateTime(nowLocal.Year, nowLocal.Month, nowLocal.Day, 0, 0, 0, DateTimeKind.Local);
        var endOfTodayLocal = new DateTime(nowLocal.Year, nowLocal.Month, nowLocal.Day, 23, 59, 59, 999, DateTimeKind.Local);

        var startOfToday = startOfTodayLocal.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        var endOfToday = endOfTodayLocal.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

        var query = _context.ProductionRecords
            .Where(r => string.Compare(r.CreatedAt, startOfToday) >= 0 && string.Compare(r.CreatedAt, endOfToday) <= 0)
            .OrderByDescending(r => r.CreatedAt);

        var totalCount = await query.CountAsync(ct);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return (items, totalCount);
    }

    public async Task<(IReadOnlyList<ProductionRecord> Items, int TotalCount)> GetHistoryAsync(
        int page,
        int pageSize,
        string? status = null,
        string? productCode = null,
        string? workOrder = null,
        string? dateFrom = null,
        string? dateTo = null,
        CancellationToken ct = default)
    {
        var query = _context.ProductionRecords.AsQueryable();

        if (!string.IsNullOrWhiteSpace(productCode))
        {
            query = query.Where(r => r.ProductCode.Contains(productCode));
        }
        if (!string.IsNullOrWhiteSpace(workOrder))
        {
            query = query.Where(r => r.JobNo.Contains(workOrder));
        }
        if (!string.IsNullOrWhiteSpace(dateFrom))
        {
            var targetFrom = dateFrom;
            if (DateTimeOffset.TryParse(dateFrom, out var dtoFrom))
            {
                targetFrom = dtoFrom.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            }
            query = query.Where(r => string.Compare(r.CreatedAt, targetFrom) >= 0);
        }
        if (!string.IsNullOrWhiteSpace(dateTo))
        {
            var targetTo = dateTo;
            if (DateTimeOffset.TryParse(dateTo, out var dtoTo))
            {
                targetTo = dtoTo.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            }
            query = query.Where(r => string.Compare(r.CreatedAt, targetTo) <= 0);
        }

        var groupedQuery = query.GroupBy(r => r.JobNo).Select(g => new {
            JobNo = g.Key,
            ProductCode = g.Max(r => r.ProductCode) ?? "",
            JobType = g.Max(r => r.JobType) ?? "",
            StationId = g.Max(r => r.StationId) ?? "",
            CreatedAt = g.Min(r => r.CreatedAt) ?? "",
            UpdatedAt = g.Max(r => r.UpdatedAt) ?? "",
            TotalCount = g.Count(),
            CompletedCount = g.Count(r => r.CurrentStatus == "COMPLETED"),
            FailedCount = g.Count(r => r.CurrentStatus == "FAILED"),
            LatestJobId = g.Max(r => r.JobId) ?? "",
            LatestId = g.Max(r => r.Id) ?? ""
        });

        if (!string.IsNullOrWhiteSpace(status))
        {
            if (status.Equals("COMPLETED", StringComparison.OrdinalIgnoreCase))
            {
                groupedQuery = groupedQuery.Where(g => g.TotalCount == g.CompletedCount);
            }
            else if (status.Equals("FAILED", StringComparison.OrdinalIgnoreCase))
            {
                groupedQuery = groupedQuery.Where(g => g.FailedCount > 0 && (g.CompletedCount + g.FailedCount == g.TotalCount));
            }
            else if (status.Equals("PROCESSING", StringComparison.OrdinalIgnoreCase) || 
                     status.Equals("QUEUED", StringComparison.OrdinalIgnoreCase) || 
                     status.Equals("PRINTING", StringComparison.OrdinalIgnoreCase) || 
                     status.Equals("VERIFYING", StringComparison.OrdinalIgnoreCase) || 
                     status.Equals("RECEIVED", StringComparison.OrdinalIgnoreCase))
            {
                groupedQuery = groupedQuery.Where(g => g.TotalCount > g.CompletedCount + g.FailedCount);
            }
        }

        groupedQuery = groupedQuery.OrderByDescending(g => g.UpdatedAt);

        var totalCount = await groupedQuery.CountAsync(ct);
        var items = await groupedQuery
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        var resultItems = new List<ProductionRecord>();
        foreach (var item in items)
        {
            string aggStatus = "PROCESSING";
            if (item.TotalCount == item.CompletedCount)
            {
                aggStatus = "COMPLETED";
            }
            else if (item.FailedCount > 0 && (item.CompletedCount + item.FailedCount == item.TotalCount))
            {
                aggStatus = "FAILED";
            }

            string serialLabel = item.TotalCount > 1 
                ? $"{item.CompletedCount}/{item.TotalCount} pcs" 
                : "1/1 pcs";

            var combined = ProductionRecord.Create(
                jobId: item.LatestJobId,
                jobNo: item.JobNo,
                productCode: item.ProductCode,
                productSerial: serialLabel,
                jobType: item.JobType,
                stationId: item.StationId,
                status: aggStatus);

            // Reflect the original creation timestamp by setting Id directly via reflection-free workaround
            resultItems.Add(combined);
        }

        return (resultItems, totalCount);
    }
}

public sealed class AlarmRepository : IAlarmRepository
{
    private readonly ProjectionDbContext _context;

    public AlarmRepository(ProjectionDbContext context) => _context = context;

    public async Task<Alarm?> GetByIdAsync(string id, CancellationToken ct = default)
        => await _context.Alarms.FindAsync([id], ct);

    public async Task<IReadOnlyList<Alarm>> GetAllAsync(CancellationToken ct = default)
        => await _context.Alarms.ToListAsync(ct);

    public async Task AddAsync(Alarm entity, CancellationToken ct = default)
        => await _context.Alarms.AddAsync(entity, ct);

    public Task UpdateAsync(Alarm entity, CancellationToken ct = default)
    {
        _context.Alarms.Update(entity);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var entity = await GetByIdAsync(id, ct);
        if (entity is not null) _context.Alarms.Remove(entity);
    }

    /// <summary>
    /// Dedup lookup — find the latest Active (unacknowledged) alarm for the same group key.
    /// Returns null if no such alarm exists (caller should create a new one).
    /// </summary>
    public async Task<Alarm?> GetActiveByGroupKeyAsync(string groupKey, CancellationToken ct = default)
        => await _context.Alarms
            .Where(a => a.DedupeKey == groupKey &&
                (a.State == "RAISED" || a.State == "ACKNOWLEDGED" || a.State == "IN_PROGRESS" || a.State == "SUPPRESSED"))
            .OrderByDescending(a => a.CreatedAt)
            .FirstOrDefaultAsync(ct);

    /// <summary>
    /// Server-side paginated + filtered alarm query for the Alarm Center UI.
    /// </summary>
    public async Task<(IReadOnlyList<Alarm> Items, int TotalCount)> GetPagedAsync(
        int page,
        int pageSize,
        string? alarmType = null,
        string? status = null,
        string? severity = null,
        string? deviceId = null,
        string? search = null,
        string? dateFrom = null,
        string? dateTo = null,
        CancellationToken ct = default)
    {
        var query = _context.Alarms.AsQueryable();

        // ── Category filter ─────────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(alarmType))
            query = alarmType == "DeviceConnection"
                ? query.Where(a => a.Category == "DEVICE")
                : alarmType == "ProductionError"
                    ? query.Where(a => a.Category != "DEVICE")
                    : query.Where(a => a.Category == alarmType);

        // ── Status filter ──────────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (status.Equals("Active", StringComparison.OrdinalIgnoreCase))
                query = query.Where(a => a.State == "RAISED");
            else if (status.Equals("Acknowledged", StringComparison.OrdinalIgnoreCase))
                query = query.Where(a => a.State == "ACKNOWLEDGED" || a.State == "IN_PROGRESS");
            else if (status.Equals("Resolved", StringComparison.OrdinalIgnoreCase))
                query = query.Where(a => a.State == "CLEARED" || a.State == "CLOSED");
            else
                query = query.Where(a => a.State == status);
        }

        // ── Severity filter ────────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(severity))
            query = query.Where(a => a.Severity == severity);

        // ── Device filter ──────────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(deviceId))
            query = query.Where(a => a.DeviceId == deviceId);

        // ── Date range filter ──────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(dateFrom))
        {
            var targetFrom = dateFrom;
            if (DateTimeOffset.TryParse(dateFrom, out var dtoFrom))
            {
                targetFrom = dtoFrom.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            }
            query = query.Where(a => string.Compare(a.CreatedAt, targetFrom) >= 0);
        }
        if (!string.IsNullOrWhiteSpace(dateTo))
        {
            var targetTo = dateTo;
            if (DateTimeOffset.TryParse(dateTo, out var dtoTo))
            {
                targetTo = dtoTo.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            }
            query = query.Where(a => string.Compare(a.CreatedAt, targetTo) <= 0);
        }

        // ── Full-text search ───────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(a =>
                (a.TechnicalMessage != null && a.TechnicalMessage.ToLower().Contains(s)) ||
                a.AlarmCode.ToLower().Contains(s) ||
                (a.DeviceId != null && a.DeviceId.ToLower().Contains(s)) ||
                a.SourceType.ToLower().Contains(s) ||
                (a.JobId != null && a.JobId.ToLower().Contains(s)));
        }

        query = query.OrderByDescending(a => a.LastSeenAt);

        var totalCount = await query.CountAsync(ct);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return (items, totalCount);
    }

    /// <summary>Count of Active (unacknowledged) alarms — for dashboard banner.</summary>
    public async Task<int> GetActiveCountAsync(CancellationToken ct = default)
        => await _context.Alarms.CountAsync(a => a.State == "RAISED", ct);

    public async Task<(IReadOnlyList<Alarm> Items, int TotalCount)> GetAdvancedPagedAsync(
        int page, int pageSize, string? stationId = null, string? state = null,
        string? severity = null, string? category = null, string? deviceId = null,
        string? jobId = null, string? workOrderNo = null, string? assignedTo = null,
        bool productionImpactOnly = false, string? from = null, string? to = null,
        string? sort = null, CancellationToken ct = default)
    {
        var query = _context.Alarms.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(stationId)) query = query.Where(x => x.StationId == stationId);
        if (state == "ACTIVE") query = query.Where(x => x.State == "RAISED" || x.State == "ACKNOWLEDGED" || x.State == "IN_PROGRESS");
        else if (state == "HISTORY") query = query.Where(x => x.State == "CLEARED" || x.State == "CLOSED");
        else if (!string.IsNullOrWhiteSpace(state)) query = query.Where(x => x.State == state);
        if (!string.IsNullOrWhiteSpace(severity)) query = query.Where(x => x.Severity == severity);
        if (!string.IsNullOrWhiteSpace(category)) query = query.Where(x => x.Category == category);
        if (!string.IsNullOrWhiteSpace(deviceId)) query = query.Where(x => x.DeviceId == deviceId);
        if (!string.IsNullOrWhiteSpace(jobId)) query = query.Where(x => x.JobId == jobId);
        if (!string.IsNullOrWhiteSpace(workOrderNo)) query = query.Where(x => x.WorkOrderNo == workOrderNo);
        if (!string.IsNullOrWhiteSpace(assignedTo)) query = query.Where(x => x.AssignedTo == assignedTo);
        if (productionImpactOnly) query = query.Where(x => x.ProductionImpact != null && x.ProductionImpact != "NONE");
        if (!string.IsNullOrWhiteSpace(from)) query = query.Where(x => string.Compare(x.FirstSeenAt, from) >= 0);
        if (!string.IsNullOrWhiteSpace(to)) query = query.Where(x => string.Compare(x.FirstSeenAt, to) <= 0);

        var total = await query.CountAsync(ct);
        query = sort?.ToLowerInvariant() switch
        {
            "newest" => query.OrderByDescending(x => x.LastSeenAt).ThenBy(x => x.Id),
            "oldest" => query.OrderBy(x => x.FirstSeenAt).ThenBy(x => x.Id),
            _ => query
                .OrderBy(x => x.State == "RAISED" ? 0 : x.State == "ACKNOWLEDGED" ? 1 : x.State == "IN_PROGRESS" ? 2 : 3)
                .ThenBy(x => x.Severity == "CRITICAL" ? 0 : x.Severity == "HIGH" ? 1 : x.Severity == "MEDIUM" ? 2 : x.Severity == "LOW" ? 3 : 4)
                .ThenBy(x => x.FirstSeenAt).ThenBy(x => x.Id)
        };
        return (await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct), total);
    }

    public async Task<AlarmSummary> GetSummaryAsync(string? stationId = null, CancellationToken ct = default)
    {
        var query = _context.Alarms.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(stationId)) query = query.Where(x => x.StationId == stationId);
        var today = DateTime.UtcNow.Date.ToString("yyyy-MM-dd");
        return new AlarmSummary(
            await query.CountAsync(x => x.State == "RAISED" || x.State == "ACKNOWLEDGED" || x.State == "IN_PROGRESS" || x.State == "SUPPRESSED", ct),
            await query.CountAsync(x => x.State == "RAISED", ct),
            await query.CountAsync(x => x.Severity == "CRITICAL" && x.State != "CLOSED" && x.State != "CLEARED", ct),
            await query.CountAsync(x => x.State == "IN_PROGRESS", ct),
            await query.CountAsync(x => x.State == "CLEARED" && x.ResolvedAt != null && x.ResolvedAt.StartsWith(today), ct));
    }
}

public sealed class AlarmTimelineRepository : IAlarmTimelineRepository
{
    private readonly ProjectionDbContext _context;
    public AlarmTimelineRepository(ProjectionDbContext context) => _context = context;
    public async Task<AlarmTimelineEvent?> GetByIdAsync(string id, CancellationToken ct = default) => await _context.AlarmTimelineEvents.FindAsync([id], ct);
    public async Task<IReadOnlyList<AlarmTimelineEvent>> GetAllAsync(CancellationToken ct = default) => await _context.AlarmTimelineEvents.AsNoTracking().ToListAsync(ct);
    public async Task<IReadOnlyList<AlarmTimelineEvent>> GetByAlarmIdAsync(string alarmId, CancellationToken ct = default) =>
        await _context.AlarmTimelineEvents.AsNoTracking().Where(x => x.AlarmId == alarmId).OrderBy(x => x.OccurredAt).ToListAsync(ct);
    public async Task AddAsync(AlarmTimelineEvent entity, CancellationToken ct = default) => await _context.AlarmTimelineEvents.AddAsync(entity, ct);
    public Task UpdateAsync(AlarmTimelineEvent entity, CancellationToken ct = default) => throw new NotSupportedException("Alarm timeline is immutable.");
    public Task DeleteAsync(string id, CancellationToken ct = default) => throw new NotSupportedException("Alarm timeline is immutable.");
}

public sealed class AlarmOutboxRepository : IAlarmOutboxRepository
{
    private readonly ProjectionDbContext _context;
    public AlarmOutboxRepository(ProjectionDbContext context) => _context = context;
    public async Task<AlarmOutboxEvent?> GetByIdAsync(string id, CancellationToken ct = default) => await _context.AlarmOutboxEvents.FindAsync([id], ct);
    public async Task<IReadOnlyList<AlarmOutboxEvent>> GetAllAsync(CancellationToken ct = default) => await _context.AlarmOutboxEvents.ToListAsync(ct);
    public async Task<IReadOnlyList<AlarmOutboxEvent>> GetPendingAsync(int batchSize, string now, CancellationToken ct = default) =>
        await _context.AlarmOutboxEvents.Where(x => x.Status == "PENDING" && (x.NextRetryAt == null || string.Compare(x.NextRetryAt, now) <= 0))
            .OrderBy(x => x.CreatedAt).Take(batchSize).ToListAsync(ct);
    public async Task AddAsync(AlarmOutboxEvent entity, CancellationToken ct = default) => await _context.AlarmOutboxEvents.AddAsync(entity, ct);
    public Task UpdateAsync(AlarmOutboxEvent entity, CancellationToken ct = default) { _context.AlarmOutboxEvents.Update(entity); return Task.CompletedTask; }
    public async Task DeleteAsync(string id, CancellationToken ct = default) { var item = await GetByIdAsync(id, ct); if (item is not null) _context.AlarmOutboxEvents.Remove(item); }
}

public sealed class AlarmInboxRepository : IAlarmInboxRepository
{
    private readonly ProjectionDbContext _context;
    public AlarmInboxRepository(ProjectionDbContext context) => _context = context;
    public async Task<AlarmInboxMessage?> GetByIdAsync(string id, CancellationToken ct = default) => await _context.AlarmInboxMessages.FindAsync([id], ct);
    public async Task<IReadOnlyList<AlarmInboxMessage>> GetAllAsync(CancellationToken ct = default) => await _context.AlarmInboxMessages.AsNoTracking().ToListAsync(ct);
    public Task<bool> ExistsAsync(string consumerName, string eventId, CancellationToken ct = default) => _context.AlarmInboxMessages.AnyAsync(x => x.ConsumerName == consumerName && x.EventId == eventId, ct);
    public async Task AddAsync(AlarmInboxMessage entity, CancellationToken ct = default) => await _context.AlarmInboxMessages.AddAsync(entity, ct);
    public Task UpdateAsync(AlarmInboxMessage entity, CancellationToken ct = default) => throw new NotSupportedException("Alarm inbox is immutable.");
    public Task DeleteAsync(string id, CancellationToken ct = default) => throw new NotSupportedException("Alarm inbox is immutable.");
}

public sealed class ProductionOrderViewRepository : IProductionOrderViewRepository
{
    private readonly ProjectionDbContext _context;

    public ProductionOrderViewRepository(ProjectionDbContext context) => _context = context;

    public async Task<ProductionOrderView?> GetByIdAsync(string id, CancellationToken ct = default)
        => await _context.ProductionOrders.FindAsync([id], ct);

    public async Task<IReadOnlyList<ProductionOrderView>> GetAllAsync(CancellationToken ct = default)
        => await _context.ProductionOrders.ToListAsync(ct);

    public async Task<ProductionOrderView?> GetByOrderNoAsync(string orderNo, CancellationToken ct = default)
        => await _context.ProductionOrders.FirstOrDefaultAsync(o => o.OrderNo == orderNo, ct);

    public async Task<IReadOnlyList<ProductionOrderView>> GetLatestAsync(int limit, CancellationToken ct = default)
        => await _context.ProductionOrders.OrderByDescending(o => o.UpdatedAt).Take(limit).ToListAsync(ct);

    public async Task AddAsync(ProductionOrderView entity, CancellationToken ct = default)
        => await _context.ProductionOrders.AddAsync(entity, ct);

    public Task UpdateAsync(ProductionOrderView entity, CancellationToken ct = default)
    {
        _context.ProductionOrders.Update(entity);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var entity = await GetByIdAsync(id, ct);
        if (entity is not null) _context.ProductionOrders.Remove(entity);
    }
}
