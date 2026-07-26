using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using ND.PrinterAdapter.Application.Interfaces;

namespace ND.PrinterAdapter.Infrastructure.Rendering;

/// <summary>
/// ZPL (Zebra Programming Language) renderer implementation of the ILabelRenderer strategy.
/// Converts the JSON label template + runtime data into raw ZPL commands ready to send to a Zebra printer via TCP port 9100.
///
/// Supported elements:
///   - text: ^FO + ^A + ^FD
///   - barcode: ^FO + ^BC (Code128), ^B3 (Code39), ^BE (EAN-13), ^BU (UPC-A)
///   - qr: ^FO + ^BQ
///   - rect: ^FO + ^GB (box)
///   - circle: ^FO + ^GE (ellipse)
///   - line: ^FO + ^GD (diagonal) or ^GB (horizontal/vertical)
///   - image: ^GFA (base64 raster, requires conversion)
/// </summary>
public sealed class ZplRenderer : ILabelRenderer
{
    private readonly ILogger<ZplRenderer> _logger;

    public string RendererType => "ZPL";

    public ZplRenderer(ILogger<ZplRenderer> logger)
    {
        _logger = logger;
    }

    public string Render(string templateJson, IDictionary<string, string> data)
    {
        _logger.LogDebug("ZplRenderer: rendering template with {Count} binding fields", data.Count);

        JsonElement root;
        try
        {
            root = JsonDocument.Parse(templateJson).RootElement;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "ZplRenderer: invalid template JSON");
            throw new InvalidOperationException("Label template JSON is invalid.", ex);
        }

        // ── Detect multi-up layout ────────────────────────────────────────────
        if (root.TryGetProperty("layout", out var layoutProp) && layoutProp.ValueKind == JsonValueKind.Object)
        {
            var cols   = layoutProp.TryGetProperty("columns", out var cProp) ? cProp.GetInt32() : 1;
            var rows   = layoutProp.TryGetProperty("rows",    out var rProp) ? rProp.GetInt32() : 1;
            var gapMm  = layoutProp.TryGetProperty("gapMm",  out var gProp) ? gProp.GetDouble() : 0.0;

            if (cols > 1 || rows > 1)
            {
                _logger.LogDebug("ZplRenderer: multi-up layout detected — {Cols}×{Rows}, gap={Gap}mm", cols, rows, gapMm);
                return RenderMultiUp(root, data, cols, rows, gapMm);
            }
        }

        // ── Single-label render (unchanged) ──────────────────────────────────
        var dpi = root.TryGetProperty("dpi", out var dpiProp) ? dpiProp.GetInt32() : 203;
        var sb = new StringBuilder();
        sb.AppendLine("^XA");

        if (root.TryGetProperty("width", out var wProp) && root.TryGetProperty("height", out var hProp))
        {
            sb.AppendLine($"^PW{MmToDots(wProp.GetDouble(), dpi)}");
            sb.AppendLine($"^LL{MmToDots(hProp.GetDouble(), dpi)}");
        }

        if (!root.TryGetProperty("elements", out var elements))
        {
            sb.AppendLine("^XZ");
            return sb.ToString();
        }

        sb.Append(RenderElementList(elements, data, dpi, offsetX: 0, offsetY: 0));
        sb.AppendLine("^XZ");
        return sb.ToString();
    }

    // ── Multi-Up Renderer ─────────────────────────────────────────────────────

    /// <summary>
    /// Renders <paramref name="cols"/> × <paramref name="rows"/> copies of the label elements
    /// into a single ZPL document, tiled left-to-right, top-to-bottom.
    /// Each cell is offset by (col * (cellWidthDots + gapDots), row * (cellHeightDots + gapDots)).
    /// </summary>
    private string RenderMultiUp(
        JsonElement root,
        IDictionary<string, string> data,
        int cols, int rows, double gapMm)
    {
        var dpi        = root.TryGetProperty("dpi",    out var dpiProp) ? dpiProp.GetInt32()    : 203;
        var cellWmm    = root.TryGetProperty("width",  out var wProp)   ? wProp.GetDouble()     : 50.0;
        var cellHmm    = root.TryGetProperty("height", out var hProp)   ? hProp.GetDouble()     : 30.0;

        var cellWdots  = MmToDots(cellWmm,  dpi);
        var cellHdots  = MmToDots(cellHmm,  dpi);
        var gapDots    = MmToDots(gapMm,    dpi);

        // Full sheet dimensions
        var sheetWdots = cols * cellWdots + (cols - 1) * gapDots;
        var sheetHdots = rows * cellHdots + (rows - 1) * gapDots;

        var sb = new StringBuilder();
        sb.AppendLine("^XA");
        sb.AppendLine($"^PW{sheetWdots}");
        sb.AppendLine($"^LL{sheetHdots}");

        if (!root.TryGetProperty("elements", out var elements))
        {
            sb.AppendLine("^XZ");
            return sb.ToString();
        }

        for (var row = 0; row < rows; row++)
        {
            for (var col = 0; col < cols; col++)
            {
                var offsetX = col * (cellWdots + gapDots);
                var offsetY = row * (cellHdots + gapDots);
                sb.Append(RenderElementList(elements, data, dpi, offsetX, offsetY));
            }
        }

        sb.AppendLine("^XZ");

        _logger.LogDebug(
            "ZplRenderer: multi-up rendered {Cells} cells ({Bytes} bytes)",
            cols * rows, Encoding.UTF8.GetByteCount(sb.ToString()));

        return sb.ToString();
    }

    /// <summary>
    /// Renders all elements in <paramref name="elements"/>, adding <paramref name="offsetX"/> / <paramref name="offsetY"/>
    /// dots to every element's X/Y position. Used by both single-label and multi-up paths.
    /// </summary>
    private string RenderElementList(
        JsonElement elements,
        IDictionary<string, string> data,
        int dpi,
        int offsetX,
        int offsetY)
    {
        var sb = new StringBuilder();
        foreach (var el in elements.EnumerateArray())
        {
            var type = el.TryGetProperty("type", out var typeProp) ? typeProp.GetString() : null;
            if (string.IsNullOrWhiteSpace(type)) continue;

            try
            {
                var elementZpl = type.ToLowerInvariant() switch
                {
                    "text"       => RenderText(el, data, dpi, offsetX, offsetY),
                    "barcode"    => RenderBarcode(el, data, dpi, offsetX, offsetY),
                    "qr"         => RenderQrCode(el, data, dpi, offsetX, offsetY),
                    "datamatrix" => RenderDataMatrix(el, data, dpi, offsetX, offsetY),
                    "rect"       => RenderRect(el, dpi, offsetX, offsetY),
                    "circle"     => RenderCircle(el, dpi, offsetX, offsetY),
                    "line"       => RenderLine(el, dpi, offsetX, offsetY),
                    _            => null
                };

                if (elementZpl is not null)
                    sb.Append(elementZpl);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "ZplRenderer: failed to render element of type '{Type}' — skipping", type);
            }
        }
        return sb.ToString();
    }

    // ─── Element Renderers ────────────────────────────────────────────────────

    private string RenderText(JsonElement el, IDictionary<string, string> data, int dpi, int offsetX = 0, int offsetY = 0)
    {
        var x = GetInt(el, "x", 0) + offsetX;
        var y = GetInt(el, "y", 0) + offsetY;
        var fontSize = GetInt(el, "fontSize", 24);
        var text = ResolveBinding(el, data);

        // ^A0N: ZPL standard font. Scale height proportionally from fontSize.
        var fontHeight = (int)(fontSize * 1.4);
        var fontWidth  = (int)(fontSize * 1.2);

        return $"^FO{x},{y}^A0N,{fontHeight},{fontWidth}^FD{EscapeZpl(text)}^FS\n";
    }

    private string RenderBarcode(JsonElement el, IDictionary<string, string> data, int dpi, int offsetX = 0, int offsetY = 0)
    {
        var x = GetInt(el, "x", 0) + offsetX;
        var y = GetInt(el, "y", 0) + offsetY;
        var height   = GetInt(el, "height", 80);
        var value    = ResolveBinding(el, data);
        var symbology = el.TryGetProperty("symbology", out var sym) ? sym.GetString() ?? "Code128" : "Code128";
        var barWidth = GetInt(el, "barWidth", 3);

        return symbology.ToUpperInvariant() switch
        {
            "CODE128" => $"^FO{x},{y}^BY{barWidth}^BCN,{height},Y,N,N^FD{EscapeZpl(value)}^FS\n",
            "CODE39"  => $"^FO{x},{y}^BY{barWidth}^B3N,N,{height},Y,N^FD{EscapeZpl(value)}^FS\n",
            "EAN13"   => $"^FO{x},{y}^BY{barWidth}^BEN,{height},Y,N^FD{EscapeZpl(value)}^FS\n",
            "UPCA"    => $"^FO{x},{y}^BY{barWidth}^BUN,{height},Y,N^FD{EscapeZpl(value)}^FS\n",
            "EAN8"    => $"^FO{x},{y}^BY{barWidth}^B8N,{height},Y,N^FD{EscapeZpl(value)}^FS\n",
            "ITF"     => $"^FO{x},{y}^BY{barWidth}^BIN,{height},Y,N^FD{EscapeZpl(value)}^FS\n",
            _         => $"^FO{x},{y}^BY{barWidth}^BCN,{height},Y,N,N^FD{EscapeZpl(value)}^FS\n"
        };
    }

    private string RenderQrCode(JsonElement el, IDictionary<string, string> data, int dpi, int offsetX = 0, int offsetY = 0)
    {
        var x = GetInt(el, "x", 0) + offsetX;
        var y = GetInt(el, "y", 0) + offsetY;
        
        int magnification;
        if (el.TryGetProperty("width", out var wProp) && wProp.ValueKind == JsonValueKind.Number)
        {
            var width = wProp.GetInt32();
            magnification = Math.Clamp((int)Math.Round(width / 25.0), 1, 10);
        }
        else if (el.TryGetProperty("height", out var hProp) && hProp.ValueKind == JsonValueKind.Number)
        {
            var height = hProp.GetInt32();
            magnification = Math.Clamp((int)Math.Round(height / 25.0), 1, 10);
        }
        else
        {
            magnification = GetInt(el, "magnification", 4);
        }

        var errorCorrection = el.TryGetProperty("errorCorrection", out var ec) ? ec.GetString() ?? "M" : "M";
        var value = ResolveQrPayload(el, data);

        // ^BQ: QR Code. Format: ^BQa,b where a=model(2=QRCode), b=magnification(1-10)
        // Then ^FD followed by error correction level + A (Auto) + data + ^FS
        return $"^FO{x},{y}^BQN,2,{magnification}^FD{errorCorrection}A,{EscapeZpl(value)}^FS\n";
    }


    private string ResolveQrPayload(JsonElement el, IDictionary<string, string> data)
    {
        if (el.TryGetProperty("payloadTemplate", out var ptProp) && !string.IsNullOrWhiteSpace(ptProp.GetString()))
        {
            var template = ptProp.GetString()!;
            var sb = new StringBuilder(template);
            foreach (var kvp in data)
            {
                sb.Replace("{" + kvp.Key + "}", kvp.Value);
            }
            return sb.ToString();
        }

        return ResolveBinding(el, data);
    }

    private string RenderDataMatrix(JsonElement el, IDictionary<string, string> data, int dpi, int offsetX = 0, int offsetY = 0)
    {
        var x = GetInt(el, "x", 0) + offsetX;
        var y = GetInt(el, "y", 0) + offsetY;
        var magnification = GetInt(el, "magnification", 4);
        var value = ResolveBinding(el, data);

        // ^BX: Data Matrix. ECC200 is represented by quality=200
        return $"^FO{x},{y}^BXN,{magnification},200^FD{EscapeZpl(value)}^FS\n";
    }

    private string RenderRect(JsonElement el, int dpi, int offsetX = 0, int offsetY = 0)
    {
        var x         = GetInt(el, "x", 0) + offsetX;
        var y         = GetInt(el, "y", 0) + offsetY;
        var width     = GetInt(el, "width", 100);
        var height    = GetInt(el, "height", 50);
        var thickness = GetInt(el, "strokeWidth", 2);

        // ^GB: Graphic Box. Format: ^GBw,h,t
        return $"^FO{x},{y}^GB{width},{height},{thickness}^FS\n";
    }

    private string RenderCircle(JsonElement el, int dpi, int offsetX = 0, int offsetY = 0)
    {
        var x         = GetInt(el, "x", 0) + offsetX;
        var y         = GetInt(el, "y", 0) + offsetY;
        var diameter  = GetInt(el, "width", 60);
        var thickness = GetInt(el, "strokeWidth", 2);

        // ^GE: Graphic Ellipse. Format: ^GEw,h,t
        return $"^FO{x},{y}^GE{diameter},{diameter},{thickness}^FS\n";
    }

    private string RenderLine(JsonElement el, int dpi, int offsetX = 0, int offsetY = 0)
    {
        var x         = GetInt(el, "x", 0) + offsetX;
        var y         = GetInt(el, "y", 0) + offsetY;
        var width     = GetInt(el, "width", 100);
        var height    = GetInt(el, "height", 2);
        var thickness = Math.Max(height, 1);

        // ^GB: Graphic Box — use it as a line by making height == thickness
        return $"^FO{x},{y}^GB{width},{thickness},{thickness}^FS\n";
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static string ResolveBinding(JsonElement el, IDictionary<string, string> data)
    {
        if (el.TryGetProperty("binding", out var binding) && !string.IsNullOrWhiteSpace(binding.GetString()))
        {
            var key = binding.GetString()!;
            if (data.TryGetValue(key, out var value))
                return value;
            
            // Fallback to defaultValue or static values before returning placeholder
            if (el.TryGetProperty("defaultValue", out var defVal)) return defVal.GetString() ?? "";
            if (el.TryGetProperty("value", out var val)) return val.GetString() ?? "";
            if (el.TryGetProperty("text", out var txt)) return txt.GetString() ?? "";

            return $"{{{key}}}"; // placeholder if not provided
        }

        // Fallback to static properties
        if (el.TryGetProperty("value", out var valueProp)) return valueProp.GetString() ?? "";
        if (el.TryGetProperty("text", out var textProp)) return textProp.GetString() ?? "";
        if (el.TryGetProperty("defaultValue", out var defaultProp)) return defaultProp.GetString() ?? "";
        return "";
    }

    private static string EscapeZpl(string value)
    {
        return value.Replace("^", " ").Replace("~", " ").Replace("\r", "").Replace("\n", "");
    }

    private static int GetInt(JsonElement el, string property, int defaultValue)
    {
        if (el.TryGetProperty(property, out var prop))
        {
            if (prop.ValueKind == JsonValueKind.Number)
                return prop.GetInt32();
        }

        // Fallback for nested font size e.g. font: { family: "A0", height: 30 }
        if (property == "fontSize" && el.TryGetProperty("font", out var fontProp) && fontProp.ValueKind == JsonValueKind.Object)
        {
            if (fontProp.TryGetProperty("height", out var heightProp) && heightProp.ValueKind == JsonValueKind.Number)
                return heightProp.GetInt32();
            if (fontProp.TryGetProperty("width", out var widthProp) && widthProp.ValueKind == JsonValueKind.Number)
                return widthProp.GetInt32();
        }

        return defaultValue;
    }

    private static int MmToDots(double mm, int dpi)
        => (int)Math.Round(mm / 25.4 * dpi);
}
