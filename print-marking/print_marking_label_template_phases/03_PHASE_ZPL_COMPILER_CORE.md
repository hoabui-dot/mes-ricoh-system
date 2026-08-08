# Phase 3 Prompt — DPI-Aware ZPL Compiler and Secure Variable Binding

## Role

Implement the authoritative production ZPL compiler.

Load and obey `00_EXECUTION_RULES.md`. Continue automatically to Phase 4.

## Objective

Compile canonical template JSON deterministically into secure ZPL for 203 and 300 DPI printers.

## Compiler abstraction

Implement or adapt:

```csharp
public interface ILabelCompiler
{
    PrinterLanguage Language { get; }

    Task<CompiledLabel> CompileAsync(
        LabelTemplateVersion template,
        LabelRenderData data,
        PrinterProfile printer,
        CancellationToken cancellationToken);
}
```

Return payload, checksum, dimensions, resolved variables/assets, warnings, and compiler version.

## DPI conversion

Use:

```text
dots = round(mm * dpi / 25.4)
```

Use deterministic rounding. Validate maximum print width/length, negative coordinates, overflow, and rotation.

## Variable binding

Support required/default values, type conversion, date/decimal formatting, enum validation, patterns, max length, sample values, and conditional visibility.

Unknown fields must not influence output unless explicitly supported.

## Injection protection

Prevent `^`, `~`, control bytes, newline, delimiter, and printer-command injection. Never use unsafe string replacement. Use hexadecimal field encoding where appropriate.

Add malicious input tests.

## Native ZPL elements

Implement:

- UTF-8 text and `^CI28` for capable profiles
- Approved font selection
- Vietnamese font compatibility warning/fallback marker
- Native Code 128
- Native QR
- Native lines
- Native rectangles
- Rotation and stable z-index ordering
- Print quantity

Do not rasterize native barcodes by default.

## Golden files

Create reviewed golden-file tests for simple, 203 DPI, 300 DPI, Vietnamese, Code 128, QR, conditional, rotated, overflow, injection, and invalid-profile cases.

## Barcode verification

Where practical, render/decode generated barcode and QR previews using ZXing.Net or the repository-approved equivalent and compare exact values.

## Tests

Cover coordinate conversion, rounding, binding, formatting, visibility, escaping, injection, text, barcode, QR, lines, boxes, orientation, bounds, unsupported font, database loading, exact version resolution, and checksum determinism.

## Acceptance gate

Pass only when deterministic 203/300 DPI compilation, native elements, Vietnamese strategy, injection protection, golden files, barcode verification, and seed-template compilation work.

Continue immediately to Phase 4.
