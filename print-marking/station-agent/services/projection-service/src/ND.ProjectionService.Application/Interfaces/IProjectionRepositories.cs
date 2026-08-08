using ND.ProjectionService.Domain.Entities;
using ND.SharedKernel.Abstractions;

namespace ND.ProjectionService.Application.Interfaces;

public interface IProductionViewRepository : IRepository<ProductionView>
{
    Task<ProductionView?> GetByStationIdAsync(string stationId, CancellationToken cancellationToken = default);
}

public interface IActivityLogRepository : IRepository<ActivityLog>
{
    Task<IReadOnlyList<ActivityLog>> GetLatestAsync(int limit, CancellationToken cancellationToken = default);
    Task TrimExcessAsync(int keepCount, CancellationToken cancellationToken = default);
}

public interface IDeviceStatusRepository : IRepository<DeviceStatus>
{
    Task<DeviceStatus?> GetByDeviceIdAsync(string deviceId, CancellationToken cancellationToken = default);
}

public interface IProductionRecordRepository : IRepository<ProductionRecord>
{
    Task<ProductionRecord?> GetByJobIdAsync(string jobId, CancellationToken cancellationToken = default);

    /// <summary>Returns all records for a given production order (JobNo), newest first.</summary>
    Task<IReadOnlyList<ProductionRecord>> GetByJobNoAsync(string jobNo, CancellationToken cancellationToken = default);

    /// <summary>Returns records created today (UTC), newest first, paginated.</summary>
    Task<(IReadOnlyList<ProductionRecord> Items, int TotalCount)> GetTodayAsync(
        int page, int pageSize, CancellationToken cancellationToken = default);

    /// <summary>Returns historical records (all time) with optional filters, newest first, paginated.</summary>
    Task<(IReadOnlyList<ProductionRecord> Items, int TotalCount)> GetHistoryAsync(
        int page,
        int pageSize,
        string? status = null,
        string? productCode = null,
        string? workOrder = null,
        string? dateFrom = null,
        string? dateTo = null,
        CancellationToken cancellationToken = default);
}

public interface IAlarmRepository : IRepository<Alarm>
{
    /// <summary>
    /// Returns the latest unacknowledged (Active) alarm for the given group key.
    /// Used for deduplication — if this returns non-null, do NOT insert a new alarm.
    /// </summary>
    Task<Alarm?> GetActiveByGroupKeyAsync(string groupKey, CancellationToken ct = default);

    /// <summary>
    /// Server-side paginated + filtered query for the Alarm Center UI.
    /// </summary>
    Task<(IReadOnlyList<Alarm> Items, int TotalCount)> GetPagedAsync(
        int page,
        int pageSize,
        string? alarmType = null,
        string? status = null,
        string? severity = null,
        string? deviceId = null,
        string? search = null,
        string? dateFrom = null,
        string? dateTo = null,
        CancellationToken ct = default);

    /// <summary>
    /// Count of active (unacknowledged, non-resolved) alarms only — for dashboard banner.
    /// </summary>
    Task<int> GetActiveCountAsync(CancellationToken ct = default);
    Task<(IReadOnlyList<Alarm> Items, int TotalCount)> GetAdvancedPagedAsync(
        int page, int pageSize, string? stationId = null, string? state = null,
        string? severity = null, string? category = null, string? deviceId = null,
        string? jobId = null, string? workOrderNo = null, string? assignedTo = null,
        bool productionImpactOnly = false, string? from = null, string? to = null,
        string? sort = null, CancellationToken ct = default);
    Task<AlarmSummary> GetSummaryAsync(string? stationId = null, CancellationToken ct = default);
}

public sealed record AlarmSummary(int ActiveCount, int UnacknowledgedCount, int CriticalCount,
    int InProgressCount, int ClearedTodayCount);

public interface IAlarmTimelineRepository : IRepository<AlarmTimelineEvent>
{
    Task<IReadOnlyList<AlarmTimelineEvent>> GetByAlarmIdAsync(string alarmId, CancellationToken ct = default);
}

public interface IAlarmOutboxRepository : IRepository<AlarmOutboxEvent>
{
    Task<IReadOnlyList<AlarmOutboxEvent>> GetPendingAsync(int batchSize, string now, CancellationToken ct = default);
}

public interface IAlarmInboxRepository : IRepository<AlarmInboxMessage>
{
    Task<bool> ExistsAsync(string consumerName, string eventId, CancellationToken ct = default);
}

public interface IProductionOrderViewRepository : IRepository<ProductionOrderView>
{
    Task<ProductionOrderView?> GetByOrderNoAsync(string orderNo, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ProductionOrderView>> GetLatestAsync(int limit, CancellationToken cancellationToken = default);
}
