using System.Text.Json.Nodes;
using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

/// <summary>
/// Versioned label definition owned by the Printer Adapter.
/// The entity intentionally stores the renderer document as JSON so the adapter
/// can remain independent from kiosk or Job Engine UI models.
/// </summary>
public sealed class LabelTemplate : Entity
{
    public string Name { get; private set; } = default!;
    public string? Description { get; private set; }
    public string? Note { get; private set; }
    public string? TemplateCode { get; private set; }
    public string? Category { get; private set; }
    public string Orientation { get; private set; } = "PORTRAIT";
    public string Revision { get; private set; } = "A";
    public string? SupportedBarcodeTypes { get; private set; }
    public string? SupportedPrinterModels { get; private set; }
    public string? CompatibleStationTypes { get; private set; }
    public int Dpi { get; private set; }
    public double LabelWidth { get; private set; }
    public double LabelHeight { get; private set; }
    public string TemplateJson { get; private set; } = default!;
    public int Version { get; private set; } = 1;
    public bool IsActive { get; private set; } = true;
    public string Status { get; private set; } = "draft";
    public bool IsDefault { get; private set; }
    public string? CreatedBy { get; private set; }
    public string? UpdatedBy { get; private set; }
    public string UpdatedAt { get; private set; } = DateTime.UtcNow.ToString("o");
    public string LayoutType { get; private set; } = "1UP";
    public int SheetColumns { get; private set; } = 1;
    public int SheetRows { get; private set; } = 1;
    public double GapMm { get; private set; }

    private LabelTemplate() { }

    public static LabelTemplate Create(
        string name,
        string? description,
        int dpi,
        double labelWidth,
        double labelHeight,
        string templateJson,
        string status = "draft",
        string? createdBy = null,
        string? note = null,
        string? templateCode = null,
        string? category = null,
        string? orientation = "PORTRAIT",
        string? revision = "A",
        string? supportedBarcodeTypes = null,
        string? supportedPrinterModels = null,
        string? compatibleStationTypes = null,
        string layoutType = "1UP",
        int sheetColumns = 1,
        int sheetRows = 1,
        double gapMm = 0)
    {
        return new LabelTemplate
        {
            Name = name,
            Description = description,
            Dpi = dpi,
            LabelWidth = labelWidth,
            LabelHeight = labelHeight,
            TemplateJson = templateJson,
            Status = status,
            CreatedBy = createdBy,
            Note = note,
            TemplateCode = templateCode,
            Category = category,
            Orientation = orientation ?? "PORTRAIT",
            Revision = revision ?? "A",
            SupportedBarcodeTypes = supportedBarcodeTypes,
            SupportedPrinterModels = supportedPrinterModels,
            CompatibleStationTypes = compatibleStationTypes,
            LayoutType = layoutType,
            SheetColumns = Math.Max(1, sheetColumns),
            SheetRows = Math.Max(1, sheetRows),
            GapMm = gapMm,
            UpdatedAt = DateTime.UtcNow.ToString("o")
        };
    }

    public void Update(
        string name,
        string? description,
        int dpi,
        double labelWidth,
        double labelHeight,
        string templateJson,
        string? updatedBy = null,
        string? note = null,
        string? templateCode = null,
        string? category = null,
        string? orientation = null,
        string? revision = null,
        string? supportedBarcodeTypes = null,
        string? supportedPrinterModels = null,
        string? compatibleStationTypes = null,
        double? gapMm = null)
    {
        Name = name;
        Description = description;
        Dpi = dpi;
        LabelWidth = labelWidth;
        LabelHeight = labelHeight;
        TemplateJson = templateJson;
        UpdatedBy = updatedBy;
        Note = note;
        TemplateCode = templateCode;
        Category = category;
        if (orientation is not null) Orientation = orientation;
        if (revision is not null) Revision = revision;
        SupportedBarcodeTypes = supportedBarcodeTypes;
        SupportedPrinterModels = supportedPrinterModels;
        CompatibleStationTypes = compatibleStationTypes;
        if (gapMm.HasValue) GapMm = gapMm.Value;
        Version++;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public void Publish(string? updatedBy = null)
    {
        Status = "published";
        UpdatedBy = updatedBy ?? UpdatedBy;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public void Archive()
    {
        Status = "archived";
        IsDefault = false;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public void Deactivate()
    {
        IsActive = false;
        IsDefault = false;
        Status = "archived";
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public void SetAsDefault()
    {
        IsDefault = true;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public void UnsetDefault()
    {
        IsDefault = false;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public string GetTemplateJsonWithLayout()
    {
        if (LayoutType.Equals("1UP", StringComparison.OrdinalIgnoreCase))
            return TemplateJson;

        try
        {
            var root = JsonNode.Parse(TemplateJson);
            if (root is JsonObject obj)
            {
                obj["layoutType"] = LayoutType;
                obj["sheetColumns"] = SheetColumns;
                obj["sheetRows"] = SheetRows;
                obj["gapMm"] = GapMm;
                return obj.ToJsonString();
            }
        }
        catch
        {
            // Validation guarantees JSON at the API boundary; keep rendering
            // resilient for legacy rows that predate that validation.
        }

        return TemplateJson;
    }
}
