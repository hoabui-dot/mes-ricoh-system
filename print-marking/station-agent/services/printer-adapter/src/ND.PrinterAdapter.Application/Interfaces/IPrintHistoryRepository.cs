using ND.PrinterAdapter.Domain.Entities;

namespace ND.PrinterAdapter.Application.Interfaces;

/// <summary>
/// Repository for reading and writing print execution history records.
/// </summary>
public interface IPrintHistoryRepository
{
    Task<IList<PrintHistory>> ListAsync(int page = 1, int pageSize = 50, CancellationToken ct = default);
    Task<PrintHistory?> GetByIdAsync(string id, CancellationToken ct = default);
    Task AddAsync(PrintHistory record, CancellationToken ct = default);
    Task UpdateAsync(PrintHistory record, CancellationToken ct = default);
}
