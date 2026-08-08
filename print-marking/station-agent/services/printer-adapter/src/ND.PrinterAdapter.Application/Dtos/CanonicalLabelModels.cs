using System.Text.Json;

namespace ND.PrinterAdapter.Application.Dtos;

public enum PrinterLanguage { Zpl }
public enum LabelVariableType { String, Integer, Decimal, Boolean, Date, DateTime, Enum }

public sealed record PrinterCapabilities(
    int Dpi, double MaxWidthMm, double MaxLengthMm, bool SupportsUtf8, bool SupportsVietnameseFont,
    bool SupportsZ64, bool SupportsStoredGraphics, bool SupportsStatusQuery, string Language = "ZPL");

public sealed record PrinterProfile(string PrinterId, string Name, PrinterCapabilities Capabilities,
    bool IsOnline = true, string? VietnameseFont = null);

public sealed record LabelRenderData(IReadOnlyDictionary<string, string?> Variables, int Quantity = 1);
public sealed record ValidationIssue(string Code, string Severity, string? ElementId, string? Field,
    string MessageKey, IReadOnlyDictionary<string, string>? Parameters = null);
public sealed record CompiledLabel(string Payload, string Checksum, int WidthDots, int HeightDots,
    IReadOnlyDictionary<string, string> ResolvedVariables, IReadOnlyList<ValidationIssue> Issues,
    string CompilerVersion = "label-compiler/1.0");

public sealed record CanonicalLabelTemplate(
    int SchemaVersion, string TemplateCode, string Name, double WidthMm, double HeightMm,
    int DefaultDpi, IReadOnlySet<int> SupportedDpi, IReadOnlyList<CanonicalLabelVariable> Variables,
    IReadOnlyList<CanonicalLabelElement> Elements);

public sealed record CanonicalLabelVariable(string Name, LabelVariableType Type, bool Required,
    string? DefaultValue, int? MaxLength, string? Pattern, IReadOnlyList<string> AllowedValues,
    string? Format);

public sealed record CanonicalLabelElement(string Id, string Type, double XMm, double YMm,
    double WidthMm, double HeightMm, int ZIndex, double Rotation, string? Binding, string? Text,
    string? Symbology, bool Visible = true);

public static class CanonicalLabelTemplateParser
{
    public static bool TryParse(string json, out CanonicalLabelTemplate? template, out ValidationIssue? issue)
    {
        template = null; issue = null;
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var canvas = root.TryGetProperty("canvas", out var canvasElement) ? canvasElement : root;
            var width = Number(canvas, "widthMm", Number(root, "width", 0));
            var height = Number(canvas, "heightMm", Number(root, "height", 0));
            var dpi = (int)Number(canvas, "defaultDpi", Number(root, "dpi", 203));
            var code = String(root, "template_code") ?? String(root, "templateCode") ?? "UNNAMED";
            var name = String(root, "name") ?? code;
            var variables = ReadVariables(root);
            var elements = ReadElements(root);
            var supported = new HashSet<int> { dpi };
            if (root.TryGetProperty("supported_dpi", out var dpiArray) || root.TryGetProperty("supportedDpi", out dpiArray))
                if (dpiArray.ValueKind == JsonValueKind.Array)
                    foreach (var item in dpiArray.EnumerateArray()) if (item.TryGetInt32(out var value)) supported.Add(value);
            if (width <= 0 || height <= 0) { issue = new("CANVAS_INVALID", "ERROR", null, "canvas", "label.canvas.invalid"); return false; }
            template = new((int)Number(root, "schema_version", 1), code, name, width, height, dpi, supported, variables, elements);
            return true;
        }
        catch (JsonException) { issue = new("TEMPLATE_JSON_INVALID", "ERROR", null, null, "label.json.invalid"); return false; }
    }

    private static List<CanonicalLabelVariable> ReadVariables(JsonElement root)
    {
        var values = new List<CanonicalLabelVariable>();
        if (!root.TryGetProperty("variables", out var source) || source.ValueKind != JsonValueKind.Array) return values;
        foreach (var item in source.EnumerateArray())
        {
            var type = Enum.TryParse<LabelVariableType>(String(item, "type"), true, out var parsed) ? parsed : LabelVariableType.String;
            var allowed = item.TryGetProperty("allowedValues", out var allowedElement) && allowedElement.ValueKind == JsonValueKind.Array
                ? allowedElement.EnumerateArray().Select(x => x.GetString() ?? string.Empty).ToList() : [];
            values.Add(new(String(item, "name") ?? string.Empty, type, Bool(item, "required"), String(item, "default"),
                Int(item, "maxLength"), String(item, "pattern"), allowed, String(item, "format")));
        }
        return values;
    }

    private static List<CanonicalLabelElement> ReadElements(JsonElement root)
    {
        var values = new List<CanonicalLabelElement>();
        if (!root.TryGetProperty("elements", out var source) || source.ValueKind != JsonValueKind.Array) return values;
        foreach (var item in source.EnumerateArray()) values.Add(new(
            String(item, "id") ?? Guid.NewGuid().ToString("N"), String(item, "type") ?? "text",
            Number(item, "xMm", Number(item, "x", 0)), Number(item, "yMm", Number(item, "y", 0)),
            Number(item, "widthMm", Number(item, "width", 0)), Number(item, "heightMm", Number(item, "height", 0)),
            (int)Number(item, "zIndex", 0), Number(item, "rotation", 0), String(item, "binding"),
            String(item, "text"), String(item, "symbology"), !item.TryGetProperty("visible", out var visible) || visible.GetBoolean()));
        return values;
    }
    private static string? String(JsonElement element, string name) => element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static double Number(JsonElement element, string name, double fallback) => element.TryGetProperty(name, out var value) && value.TryGetDouble(out var number) ? number : fallback;
    private static int? Int(JsonElement element, string name) => element.TryGetProperty(name, out var value) && value.TryGetInt32(out var number) ? number : null;
    private static bool Bool(JsonElement element, string name) => element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;
}
