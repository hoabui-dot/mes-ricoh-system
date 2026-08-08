using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

public sealed class TemplateAuditEvent : Entity
{
    public string TemplateId { get; private set; } = default!;
    public int TemplateVersion { get; private set; }
    public string Action { get; private set; } = default!;
    public string? Actor { get; private set; }
    public string? DetailJson { get; private set; }

    private TemplateAuditEvent() { }
    public static TemplateAuditEvent Create(string templateId, int version, string action, string? actor, string? detailJson = null) => new()
    { TemplateId = templateId, TemplateVersion = version, Action = action, Actor = actor, DetailJson = detailJson };
}
