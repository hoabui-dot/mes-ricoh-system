using Microsoft.EntityFrameworkCore;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Domain.Entities;
using ND.PrinterAdapter.Infrastructure.Persistence;

namespace ND.PrinterAdapter.Infrastructure.Persistence;

public sealed class PrintHistoryRepository : IPrintHistoryRepository
{
    private readonly PrinterDbContext _db;

    public PrintHistoryRepository(PrinterDbContext db)
    {
        _db = db;
    }

    public async Task<IList<PrintHistory>> ListAsync(int page = 1, int pageSize = 50, CancellationToken ct = default)
        => await _db.PrintHistories
            .OrderByDescending(h => h.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

    public async Task<PrintHistory?> GetByIdAsync(string id, CancellationToken ct = default)
        => await _db.PrintHistories.FindAsync(new object[] { id }, ct);

    public async Task AddAsync(PrintHistory record, CancellationToken ct = default)
        => await _db.PrintHistories.AddAsync(record, ct);

    public Task UpdateAsync(PrintHistory record, CancellationToken ct = default)
    {
        _db.PrintHistories.Update(record);
        return Task.CompletedTask;
    }
}
