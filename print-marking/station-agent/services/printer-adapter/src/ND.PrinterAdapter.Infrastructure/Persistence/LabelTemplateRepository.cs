using Microsoft.EntityFrameworkCore;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Domain.Entities;
using ND.PrinterAdapter.Infrastructure.Persistence;

namespace ND.PrinterAdapter.Infrastructure.Persistence;

public sealed class LabelTemplateRepository : ILabelTemplateRepository
{
    private readonly PrinterDbContext _db;

    public LabelTemplateRepository(PrinterDbContext db)
    {
        _db = db;
    }

    // ── Template CRUD ─────────────────────────────────────────────────────────

    public async Task<IList<LabelTemplate>> ListAsync(
        string? search = null,
        int? dpi = null,
        string? status = null,
        bool includeArchived = false,
        CancellationToken ct = default)
    {
        var query = _db.LabelTemplates.Where(t => t.IsActive);

        if (!includeArchived)
            query = query.Where(t => t.Status != "archived");

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(t => t.Status == status);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(t => t.Name.Contains(search) ||
                                     (t.Description != null && t.Description.Contains(search)));

        if (dpi.HasValue)
            query = query.Where(t => t.Dpi == dpi.Value);

        return await query.OrderByDescending(t => t.IsDefault)
                          .ThenByDescending(t => t.UpdatedAt)
                          .ToListAsync(ct);
    }

    public async Task<LabelTemplate?> GetByIdAsync(string id, CancellationToken ct = default)
        => await _db.LabelTemplates.FirstOrDefaultAsync(t => t.Id == id && t.IsActive, ct);

    public async Task<LabelTemplate?> GetDefaultAsync(CancellationToken ct = default)
        => await _db.LabelTemplates.FirstOrDefaultAsync(t => t.IsDefault && t.IsActive && t.Status == "published", ct);

    public async Task AddAsync(LabelTemplate template, CancellationToken ct = default)
        => await _db.LabelTemplates.AddAsync(template, ct);

    public Task UpdateAsync(LabelTemplate template, CancellationToken ct = default)
    {
        _db.LabelTemplates.Update(template);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var template = await _db.LabelTemplates.FindAsync(new object[] { id }, ct);
        if (template is not null)
        {
            template.Deactivate();
            _db.LabelTemplates.Update(template);
        }
    }

    // ── Status management ─────────────────────────────────────────────────────

    public async Task ClearDefaultFlagAsync(CancellationToken ct = default)
    {
        var defaults = await _db.LabelTemplates.Where(t => t.IsDefault && t.IsActive).ToListAsync(ct);
        foreach (var t in defaults)
        {
            t.UnsetDefault();
            _db.LabelTemplates.Update(t);
        }
    }

    // ── Version history ───────────────────────────────────────────────────────

    public async Task AddVersionAsync(LabelTemplateVersion version, CancellationToken ct = default)
        => await _db.LabelTemplateVersions.AddAsync(version, ct);

    public async Task<IList<LabelTemplateVersion>> GetVersionHistoryAsync(string templateId, CancellationToken ct = default)
        => await _db.LabelTemplateVersions
            .Where(v => v.TemplateId == templateId)
            .OrderByDescending(v => v.Version)
            .ToListAsync(ct);

    public async Task<LabelTemplateVersion?> GetVersionAsync(string templateId, int version, CancellationToken ct = default)
        => await _db.LabelTemplateVersions
            .FirstOrDefaultAsync(v => v.TemplateId == templateId && v.Version == version, ct);

    // ── Printer-template assignments ──────────────────────────────────────────

    public async Task<IList<PrinterTemplateAssignment>> GetAllAssignmentsAsync(CancellationToken ct = default)
        => await _db.PrinterTemplateAssignments.OrderBy(a => a.PrinterCode).ToListAsync(ct);

    public async Task<PrinterTemplateAssignment?> GetAssignmentForPrinterAsync(string printerCode, CancellationToken ct = default)
        => await _db.PrinterTemplateAssignments.FirstOrDefaultAsync(a => a.PrinterCode == printerCode, ct);

    public async Task UpsertAssignmentAsync(string printerCode, string templateId, string? templateName, string? assignedBy, CancellationToken ct = default)
    {
        var existing = await _db.PrinterTemplateAssignments.FirstOrDefaultAsync(a => a.PrinterCode == printerCode, ct);
        if (existing is null)
        {
            var newAssignment = PrinterTemplateAssignment.Create(printerCode, templateId, templateName, assignedBy);
            await _db.PrinterTemplateAssignments.AddAsync(newAssignment, ct);
        }
        else
        {
            existing.Reassign(templateId, templateName, assignedBy);
            _db.PrinterTemplateAssignments.Update(existing);
        }
    }

    public async Task RemoveAssignmentAsync(string printerCode, CancellationToken ct = default)
    {
        var existing = await _db.PrinterTemplateAssignments.FirstOrDefaultAsync(a => a.PrinterCode == printerCode, ct);
        if (existing is not null)
            _db.PrinterTemplateAssignments.Remove(existing);
    }
}
