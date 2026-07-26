using ND.PrinterAdapter.Domain.Entities;

namespace ND.PrinterAdapter.Application.Interfaces;

/// <summary>
/// Repository for managing label templates, their version history, and printer assignments.
/// </summary>
public interface ILabelTemplateRepository
{
    // ── Template CRUD ─────────────────────────────────────────────────────────

    /// <summary>Lists active templates, optionally filtered by search text, DPI, or status.</summary>
    Task<IList<LabelTemplate>> ListAsync(string? search = null, int? dpi = null, string? status = null, bool includeArchived = false, CancellationToken ct = default);

    Task<LabelTemplate?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<LabelTemplate?> GetDefaultAsync(CancellationToken ct = default);
    Task AddAsync(LabelTemplate template, CancellationToken ct = default);
    Task UpdateAsync(LabelTemplate template, CancellationToken ct = default);
    Task DeleteAsync(string id, CancellationToken ct = default);

    // ── Status management ─────────────────────────────────────────────────────

    /// <summary>Clears the IsDefault flag from all other templates before setting one as default.</summary>
    Task ClearDefaultFlagAsync(CancellationToken ct = default);

    // ── Version history ───────────────────────────────────────────────────────

    /// <summary>Saves an immutable version snapshot before updating a template.</summary>
    Task AddVersionAsync(LabelTemplateVersion version, CancellationToken ct = default);
    Task<IList<LabelTemplateVersion>> GetVersionHistoryAsync(string templateId, CancellationToken ct = default);
    Task<LabelTemplateVersion?> GetVersionAsync(string templateId, int version, CancellationToken ct = default);

    // ── Printer-template assignments ──────────────────────────────────────────

    Task<IList<PrinterTemplateAssignment>> GetAllAssignmentsAsync(CancellationToken ct = default);
    Task<PrinterTemplateAssignment?> GetAssignmentForPrinterAsync(string printerCode, CancellationToken ct = default);
    Task UpsertAssignmentAsync(string printerCode, string templateId, string? templateName, string? assignedBy, CancellationToken ct = default);
    Task RemoveAssignmentAsync(string printerCode, CancellationToken ct = default);
}
