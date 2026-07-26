using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

/// <summary>
/// Maps a physical printer (by PrinterCode) to a specific label template.
/// One printer → one template assignment. Upsert on assign.
/// Table: printer_template_assignments
/// </summary>
public sealed class PrinterTemplateAssignment : Entity
{
    public string PrinterCode { get; private set; } = default!;
    public string TemplateId { get; private set; } = default!;
    public string? TemplateName { get; private set; }
    public string? AssignedBy { get; private set; }
    public string AssignedAt { get; private set; } = DateTime.UtcNow.ToString("o");

    private PrinterTemplateAssignment() { }

    public static PrinterTemplateAssignment Create(
        string printerCode,
        string templateId,
        string? templateName = null,
        string? assignedBy = null)
    {
        return new PrinterTemplateAssignment
        {
            PrinterCode = printerCode,
            TemplateId = templateId,
            TemplateName = templateName,
            AssignedBy = assignedBy,
            AssignedAt = DateTime.UtcNow.ToString("o")
        };
    }

    public void Reassign(string templateId, string? templateName, string? assignedBy = null)
    {
        TemplateId = templateId;
        TemplateName = templateName;
        AssignedBy = assignedBy;
        AssignedAt = DateTime.UtcNow.ToString("o");
    }
}
