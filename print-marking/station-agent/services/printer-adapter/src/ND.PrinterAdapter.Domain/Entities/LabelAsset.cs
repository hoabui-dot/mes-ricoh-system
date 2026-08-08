using ND.SharedKernel.Primitives;
namespace ND.PrinterAdapter.Domain.Entities;
public sealed class LabelAsset : Entity
{
    public string Name { get; private set; } = default!;
    public string ContentType { get; private set; } = default!;
    public string Sha256 { get; private set; } = default!;
    public byte[] Content { get; private set; } = default!;
    public bool IsActive { get; private set; } = true;
    private LabelAsset() { }
    public static LabelAsset Create(string name, string contentType, string sha256, byte[] content) => new() { Name=name, ContentType=contentType, Sha256=sha256, Content=content };
    public void Deactivate() => IsActive = false;
}
