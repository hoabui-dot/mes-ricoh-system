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
            .Where(a => a.AlarmGroupKey == groupKey && a.CurrentState == "Active")
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
            query = query.Where(a => a.AlarmType == alarmType);

        // ── Status filter ──────────────────────────────────────────────────────
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (status.Equals("Active", StringComparison.OrdinalIgnoreCase))
                query = query.Where(a => a.CurrentState == "Active");
            else if (status.Equals("Acknowledged", StringComparison.OrdinalIgnoreCase))
                query = query.Where(a => a.CurrentState == "Acknowledged");
            else if (status.Equals("Resolved", StringComparison.OrdinalIgnoreCase))
                query = query.Where(a => a.CurrentState == "Resolved");
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
                a.Message.ToLower().Contains(s) ||
                (a.DeviceId != null && a.DeviceId.ToLower().Contains(s)) ||
                (a.DeviceName != null && a.DeviceName.ToLower().Contains(s)) ||
                (a.ProductionOrderId != null && a.ProductionOrderId.ToLower().Contains(s)));
        }

        query = query.OrderByDescending(a => a.LastOccurredAt);

        var totalCount = await query.CountAsync(ct);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return (items, totalCount);
    }

    /// <summary>Count of Active (unacknowledged) alarms — for dashboard banner.</summary>
    public async Task<int> GetActiveCountAsync(CancellationToken ct = default)
        => await _context.Alarms.CountAsync(a => a.CurrentState == "Active", ct);
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
