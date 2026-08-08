using System.Collections.Generic;

namespace ND.PrinterAdapter.Application.DTOs;

public record CreateTemplateRequest(
    string Name,
    string? Description,
    string? Note,
    int Dpi,
    double LabelWidth,
    double LabelHeight,
    string TemplateJson,
    string? TemplateCode = null,
    string? Category = null,
    string? Orientation = "PORTRAIT",
    string? Revision = "A",
    string? SupportedBarcodeTypes = null,
    string? SupportedPrinterModels = null,
    string? CompatibleStationTypes = null,
    // N-Up layout — set at creation, not editable after
    string  LayoutType   = "1UP",
    int     SheetColumns = 1,
    int     SheetRows    = 1,
    double  GapMm        = 0);

public record UpdateTemplateRequest(
    string Name,
    string? Description,
    string? Note,
    int Dpi,
    double LabelWidth,
    double LabelHeight,
    string TemplateJson,
    string? TemplateCode = null,
    string? Category = null,
    string? Orientation = null,
    string? Revision = null,
    string? SupportedBarcodeTypes = null,
    string? SupportedPrinterModels = null,
    string? CompatibleStationTypes = null,
    // N-Up: only gap is adjustable after creation
    double? GapMm = null);

public record RenderRequest(
    string TemplateJson,
    IDictionary<string, string>? Data);

public record RenderWithDataRequest(
    IDictionary<string, string>? Data);

public record PrintTestRequest(
    IDictionary<string, string>? Data,
    string? PrinterCode,
    string? CorrelationId);
