using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using ND.PrinterAdapter.Application.Dtos;
using ND.PrinterAdapter.Application.Interfaces;
using ND.PrinterAdapter.Domain.Entities;

namespace ND.PrinterAdapter.Infrastructure.Rendering;

/// <summary>Canonical, deterministic ZPL compiler. Coordinates are supplied in millimetres.</summary>
public sealed class ZplLabelCompiler : ILabelCompiler
{
    public PrinterLanguage Language => PrinterLanguage.Zpl;

    public Task<CompiledLabel> CompileAsync(LabelTemplateVersion version, LabelRenderData data,
        PrinterProfile printer, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!CanonicalLabelTemplateParser.TryParse(version.TemplateJson, out var template, out var parseIssue))
            return Task.FromResult(Failed(parseIssue!));
        var issues = new List<ValidationIssue>();
        if (!template!.SupportedDpi.Contains(printer.Capabilities.Dpi))
            issues.Add(Issue("DPI_UNSUPPORTED", null, "supported_dpi", "label.dpi.unsupported"));
        if (template.WidthMm > printer.Capabilities.MaxWidthMm || template.HeightMm > printer.Capabilities.MaxLengthMm)
            issues.Add(Issue("CANVAS_EXCEEDS_PRINTER", null, "canvas", "label.canvas.exceeds_printer"));
        var resolved = ResolveVariables(template, data, issues);
        ValidateElements(template, printer, issues);
        if (issues.Any(x => x.Severity == "ERROR")) return Task.FromResult(Failed(issues));

        var dpi = printer.Capabilities.Dpi;
        var width = Dots(template.WidthMm, dpi); var height = Dots(template.HeightMm, dpi);
        var zpl = new StringBuilder("^XA\n");
        zpl.Append("^CI28\n"); zpl.Append($"^PW{width}\n^LL{height}\n");
        foreach (var element in template.Elements.Where(x => x.Visible).OrderBy(x => x.ZIndex).ThenBy(x => x.Id, StringComparer.Ordinal))
        {
            var x = Dots(element.XMm, dpi); var y = Dots(element.YMm, dpi);
            var value = Resolve(element, resolved);
            switch (element.Type.ToLowerInvariant())
            {
                case "text":
                    if (!printer.Capabilities.SupportsVietnameseFont && value.Any(c => c > 127))
                        issues.Add(Issue("VIETNAMESE_FONT_FALLBACK", element.Id, "text", "label.font.vietnamese_fallback", "WARNING"));
                    zpl.Append($"^FO{x},{y}^A0N,{Math.Max(12, Dots(Math.Max(element.HeightMm, 2), dpi))},{Math.Max(8, Dots(Math.Max(element.WidthMm / 3, 1.5), dpi))}^FH\\^FD{Hex(value)}^FS\n");
                    break;
                case "barcode":
                    if (string.IsNullOrWhiteSpace(value)) { issues.Add(Issue("BARCODE_VALUE_REQUIRED", element.Id, "binding", "label.barcode.value_required")); break; }
                    zpl.Append($"^FO{x},{y}^BY2^BCN,{Math.Max(20, Dots(element.HeightMm, dpi))},Y,N,N^FH\\^FD{Hex(value)}^FS\n");
                    break;
                case "qrcode": case "qr":
                    if (string.IsNullOrWhiteSpace(value)) { issues.Add(Issue("QR_VALUE_REQUIRED", element.Id, "binding", "label.qr.value_required")); break; }
                    zpl.Append($"^FO{x},{y}^BQN,2,{Math.Clamp(Dots(Math.Max(element.WidthMm, 4), dpi) / 25, 1, 10)}^FH\\^FDMA,{Hex(value)}^FS\n");
                    break;
                case "line":
                    zpl.Append($"^FO{x},{y}^GB{Math.Max(1, Dots(element.WidthMm, dpi))},1,1^FS\n"); break;
                case "rectangle": case "rect":
                    zpl.Append($"^FO{x},{y}^GB{Math.Max(1, Dots(element.WidthMm, dpi))},{Math.Max(1, Dots(element.HeightMm, dpi))},1^FS\n"); break;
                case "image": case "icon":
                    issues.Add(Issue("ASSET_RENDER_PENDING", element.Id, "asset", "label.asset.requires_variant", "WARNING")); break;
                default: issues.Add(Issue("ELEMENT_UNSUPPORTED", element.Id, "type", "label.element.unsupported")); break;
            }
        }
        if (issues.Any(x => x.Severity == "ERROR")) return Task.FromResult(Failed(issues));
        zpl.Append("^PQ").Append(Math.Clamp(data.Quantity, 1, 999)).Append("\n^XZ\n");
        var payload = zpl.ToString();
        return Task.FromResult(new CompiledLabel(payload, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant(),
            width, height, resolved, issues));
    }

    public static int Dots(double mm, int dpi) => (int)Math.Round(mm * dpi / 25.4, MidpointRounding.AwayFromZero);
    private static CompiledLabel Failed(params ValidationIssue[] issues) => Failed((IReadOnlyList<ValidationIssue>)issues);
    private static CompiledLabel Failed(IReadOnlyList<ValidationIssue> issues) => new(string.Empty, string.Empty, 0, 0, new Dictionary<string, string>(), issues);
    private static ValidationIssue Issue(string code, string? id, string? field, string key, string severity = "ERROR") => new(code, severity, id, field, key);
    private static Dictionary<string, string> ResolveVariables(CanonicalLabelTemplate template, LabelRenderData data, List<ValidationIssue> issues)
    {
        var resolved = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var variable in template.Variables)
        {
            data.Variables.TryGetValue(variable.Name, out var value); value ??= variable.DefaultValue;
            if (variable.Required && string.IsNullOrWhiteSpace(value)) { issues.Add(Issue("VARIABLE_REQUIRED", null, variable.Name, "label.variable.required")); continue; }
            value ??= string.Empty;
            if (variable.MaxLength is { } length && value.Length > length) issues.Add(Issue("VARIABLE_TOO_LONG", null, variable.Name, "label.variable.max_length"));
            if (!string.IsNullOrWhiteSpace(variable.Pattern) && !Regex.IsMatch(value, variable.Pattern, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100))) issues.Add(Issue("VARIABLE_PATTERN_INVALID", null, variable.Name, "label.variable.pattern"));
            if (variable.Type == LabelVariableType.Enum && variable.AllowedValues.Count > 0 && !variable.AllowedValues.Contains(value)) issues.Add(Issue("VARIABLE_ENUM_INVALID", null, variable.Name, "label.variable.enum"));
            resolved[variable.Name] = value;
        }
        return resolved;
    }
    private static void ValidateElements(CanonicalLabelTemplate template, PrinterProfile printer, List<ValidationIssue> issues)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var element in template.Elements)
        {
            if (!seen.Add(element.Id)) issues.Add(Issue("ELEMENT_ID_DUPLICATE", element.Id, "id", "label.element.duplicate_id"));
            if (element.XMm < 0 || element.YMm < 0 || element.XMm + element.WidthMm > template.WidthMm || element.YMm + element.HeightMm > template.HeightMm)
                issues.Add(Issue("ELEMENT_OUT_OF_BOUNDS", element.Id, "position", "label.element.out_of_bounds"));
            if (element.Rotation is not (0 or 90 or 180 or 270)) issues.Add(Issue("ROTATION_UNSUPPORTED", element.Id, "rotation", "label.rotation.unsupported"));
        }
    }
    private static string Resolve(CanonicalLabelElement element, IReadOnlyDictionary<string, string> variables) =>
        !string.IsNullOrWhiteSpace(element.Binding) && variables.TryGetValue(element.Binding, out var value) ? value : element.Text ?? string.Empty;
    private static string Hex(string value) => string.Concat(Encoding.UTF8.GetBytes(value).Select(x => $"\\{x:X2}"));
}
