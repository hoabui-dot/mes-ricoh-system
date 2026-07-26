using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

/// <summary>
/// Immutable snapshot of a label template at a specific version.
/// Once created, never updated — ensures historical print jobs can always
/// reproduce the exact ZPL that was generated at job execution time.
/// Table: label_template_versions
/// </summary>
public sealed class LabelTemplateVersion : Entity
{
    public string TemplateId { get; private set; } = default!;
    public int Version { get; private set; }
    public string TemplateJson { get; private set; } = default!;
    public string? CreatedBy { get; private set; }

    private LabelTemplateVersion() { }

    public static LabelTemplateVersion Snapshot(string templateId, int version, string templateJson, string? createdBy = null)
    {
        return new LabelTemplateVersion
        {
            TemplateId = templateId,
            Version = version,
            TemplateJson = templateJson,
            CreatedBy = createdBy
        };
    }
}
