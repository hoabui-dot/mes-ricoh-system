using ND.SharedKernel.Primitives;

namespace ND.PrinterAdapter.Domain.Entities;

/// <summary>
/// A label template stored as JSON. Never stores generated ZPL.
/// Each save increments the Version. Historical versions are preserved in LabelTemplateVersion.
/// Table: label_templates
/// </summary>
public sealed class LabelTemplate : Entity
{
    public string Name { get; private set; } = default!;
    public string? Description { get; private set; }

    /// <summary>Vietnamese business note for production engineers (Ghi chú sản xuất).</summary>
    public string? Note { get; private set; }

    /// <summary>Short machine-readable code, e.g. "LBL-WIP-60x40".</summary>
    public string? TemplateCode { get; private set; }

    /// <summary>Label category: WIP | PALLET | SHELF | INSPECTION | MATERIAL | SHEET | ISSUE | PRODUCT</summary>
    public string? Category { get; private set; }

    /// <summary>Orientation: PORTRAIT | LANDSCAPE</summary>
    public string? Orientation { get; private set; } = "PORTRAIT";

    /// <summary>Letter revision: A, B, C …</summary>
    public string? Revision { get; private set; } = "A";

    /// <summary>JSON array of supported barcode symbologies, e.g. ["CODE128","QR"]</summary>
    public string? SupportedBarcodeTypes { get; private set; }

    /// <summary>JSON array of compatible printer models, e.g. ["GK420t","ZT230"]</summary>
    public string? SupportedPrinterModels { get; private set; }

    /// <summary>JSON array of compatible station types, e.g. ["PRINT_STATION","MARK_STATION"]</summary>
    public string? CompatibleStationTypes { get; private set; }

    public int Dpi { get; private set; } = 203;
    public double LabelWidth { get; private set; }   // mm — single cell
    public double LabelHeight { get; private set; }  // mm — single cell
    public string TemplateJson { get; private set; } = default!;
    public int Version { get; private set; } = 1;
    public bool IsActive { get; private set; } = true;

    // ── N-Up layout ───────────────────────────────────────────────────────────
    /// <summary>Layout style: 1UP | 2UP | 3UP</summary>
    public string LayoutType   { get; private set; } = "1UP";
    /// <summary>Number of label cells per row on the physical sheet (1, 2, or 3).</summary>
    public int    SheetColumns { get; private set; } = 1;
    /// <summary>Number of label rows on the physical sheet (always 1 for 2UP/3UP standard stock).</summary>
    public int    SheetRows    { get; private set; } = 1;
    /// <summary>Gap between label cells in millimetres.</summary>
    public double GapMm        { get; private set; } = 0;

    /// <summary>Status: draft | published | archived</summary>
    public string Status { get; private set; } = "published";

    /// <summary>True if this is the system-wide default template.</summary>
    public bool IsDefault { get; private set; } = false;

    public string? CreatedBy { get; private set; }
    public string? UpdatedBy { get; private set; }
    public string UpdatedAt { get; private set; } = DateTime.UtcNow.ToString("o");
    public string? SubmittedBy { get; private set; }
    public string? ApprovedBy { get; private set; }
    public string? ApprovedAt { get; private set; }

    private LabelTemplate() { }

    public static LabelTemplate Create(
        string name,
        string? description,
        int dpi,
        double labelWidth,
        double labelHeight,
        string templateJson,
        string status = "published",
        string? createdBy = null,
        string? note = null,
        string? templateCode = null,
        string? category = null,
        string? orientation = "PORTRAIT",
        string? revision = "A",
        string? supportedBarcodeTypes = null,
        string? supportedPrinterModels = null,
        string? compatibleStationTypes = null,
        string  layoutType   = "1UP",
        int     sheetColumns = 1,
        int     sheetRows    = 1,
        double  gapMm        = 0)
    {
        // Derive columns/rows from layoutType if not explicitly set
        var cols = sheetColumns > 1 ? sheetColumns : layoutType switch { "2UP" => 2, "3UP" => 3, _ => 1 };
        var rows = sheetRows    > 1 ? sheetRows    : 1;
        return new LabelTemplate
        {
            Name = name,
            Description = description,
            Note = note,
            TemplateCode = templateCode,
            Category = category,
            Orientation = orientation ?? "PORTRAIT",
            Revision = revision ?? "A",
            SupportedBarcodeTypes = supportedBarcodeTypes,
            SupportedPrinterModels = supportedPrinterModels,
            CompatibleStationTypes = compatibleStationTypes,
            Dpi = dpi,
            LabelWidth = labelWidth,
            LabelHeight = labelHeight,
            TemplateJson = templateJson,
            Version = 1,
            IsActive = true,
            Status = status,
            IsDefault = false,
            CreatedBy = createdBy,
            UpdatedBy = createdBy,
            UpdatedAt = DateTime.UtcNow.ToString("o"),
            LayoutType   = layoutType.ToUpperInvariant() is "1UP" or "2UP" or "3UP" ? layoutType.ToUpperInvariant() : "1UP",
            SheetColumns = cols,
            SheetRows    = rows,
            GapMm        = gapMm
        };
    }

    /// <summary>
    /// Updates the template JSON, bumping the version number.
    /// The caller must also snapshot a new LabelTemplateVersion before calling this.
    /// </summary>
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
        if (note is not null) Note = note;
        if (templateCode is not null) TemplateCode = templateCode;
        if (category is not null) Category = category;
        if (orientation is not null) Orientation = orientation;
        if (revision is not null) Revision = revision;
        if (supportedBarcodeTypes is not null) SupportedBarcodeTypes = supportedBarcodeTypes;
        if (supportedPrinterModels is not null) SupportedPrinterModels = supportedPrinterModels;
        if (compatibleStationTypes is not null) CompatibleStationTypes = compatibleStationTypes;
        if (gapMm.HasValue) GapMm = gapMm.Value;
        // Sync SheetColumns from LayoutType if columns still default
        SheetColumns = LayoutType switch { "2UP" => 2, "3UP" => 3, _ => 1 };
        Dpi = dpi;
        LabelWidth = labelWidth;
        LabelHeight = labelHeight;
        TemplateJson = templateJson;
        Version += 1;
        UpdatedBy = updatedBy;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public void SetNote(string? note) => Note = note;

    public void Publish(string? updatedBy = null)
    {
        Status = "published";
        UpdatedBy = updatedBy;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public void MarkValidated(string? updatedBy = null)
    {
        EnsureStatus(LabelTemplateLifecycle.Draft, "Only drafts can be validated.");
        Status = LabelTemplateLifecycle.Validated;
        Touch(updatedBy);
    }

    public void SubmitForApproval(string? submittedBy)
    {
        EnsureStatus(LabelTemplateLifecycle.Validated, "Only validated templates can be submitted.");
        Status = LabelTemplateLifecycle.PendingApproval;
        SubmittedBy = submittedBy;
        Touch(submittedBy);
    }

    public void Approve(string? approvedBy)
    {
        EnsureStatus(LabelTemplateLifecycle.PendingApproval, "Only submitted templates can be approved.");
        if (!string.IsNullOrWhiteSpace(SubmittedBy) && string.Equals(SubmittedBy, approvedBy, StringComparison.Ordinal))
            throw new InvalidOperationException("Maker-checker approval requires a different approver.");
        Status = LabelTemplateLifecycle.Approved;
        ApprovedBy = approvedBy;
        ApprovedAt = DateTime.UtcNow.ToString("o");
        Touch(approvedBy);
    }

    public void ActivateApproved(string? updatedBy = null)
    {
        EnsureStatus(LabelTemplateLifecycle.Approved, "Only approved templates can be activated.");
        Status = LabelTemplateLifecycle.Active;
        Touch(updatedBy);
    }

    public void Retire(string? updatedBy = null)
    {
        Status = LabelTemplateLifecycle.Retired;
        IsDefault = false;
        Touch(updatedBy);
    }

    public void Archive(string? updatedBy = null)
    {
        Status = "archived";
        IsDefault = false;
        UpdatedBy = updatedBy;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public void SetAsDefault()
    {
        IsDefault = true;
        if (Status != "published")
            Status = "published";
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    public void UnsetDefault() => IsDefault = false;

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;

    private void EnsureStatus(string expected, string message)
    {
        if (!string.Equals(Status, expected, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException(message);
    }

    private void Touch(string? updatedBy)
    {
        UpdatedBy = updatedBy;
        UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    /// <summary>
    /// Returns the TemplateJson with the columns, rows, and gapMm injected
    /// into a top-level "layout" property, matching the renderer expectation.
    /// </summary>
    public string GetTemplateJsonWithLayout()
    {
        if (string.IsNullOrWhiteSpace(TemplateJson)) return TemplateJson;

        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(TemplateJson);
            var root = doc.RootElement;

            using var ms = new System.IO.MemoryStream();
            using (var writer = new System.Text.Json.Utf8JsonWriter(ms))
            {
                writer.WriteStartObject();
                foreach (var prop in root.EnumerateObject())
                {
                    if (prop.NameEquals("layout")) continue; // override existing
                    prop.WriteTo(writer);
                }

                writer.WriteStartObject("layout");
                writer.WriteNumber("columns", SheetColumns);
                writer.WriteNumber("rows", SheetRows);
                writer.WriteNumber("gapMm", GapMm);
                writer.WriteEndObject();

                writer.WriteEndObject();
            }

            return System.Text.Encoding.UTF8.GetString(ms.ToArray());
        }
        catch
        {
            return TemplateJson;
        }
    }
}
