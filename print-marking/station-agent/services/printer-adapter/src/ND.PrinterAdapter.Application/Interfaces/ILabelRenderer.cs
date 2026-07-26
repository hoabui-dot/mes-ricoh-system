namespace ND.PrinterAdapter.Application.Interfaces;

/// <summary>
/// Strategy interface for rendering a label template JSON into a printer command string.
/// Implementations: ZplRenderer, future: PdfRenderer, PngRenderer, EplRenderer, BrotherRenderer.
/// </summary>
public interface ILabelRenderer
{
    /// <summary>Identifies this renderer (e.g. "ZPL", "PDF", "PNG").</summary>
    string RendererType { get; }

    /// <summary>
    /// Renders the template JSON with the provided runtime data dictionary into a printer command string.
    /// </summary>
    /// <param name="templateJson">The label template JSON produced by the Label Designer.</param>
    /// <param name="data">Key-value pairs for binding field substitution (e.g. {"ProductName":"Coffee"}).</param>
    /// <returns>The rendered output string (e.g. ZPL commands).</returns>
    string Render(string templateJson, IDictionary<string, string> data);
}
