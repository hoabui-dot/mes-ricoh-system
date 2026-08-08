# Phase 4 Prompt — Icon, Logo, Rasterization, Z64, and Printer Asset Cache

## Role

Implement the complete graphic pipeline for icons and logos.

Load and obey `00_EXECUTION_RULES.md`. Continue automatically to Phase 5.

## Objective

Implement safe asset upload, SVG sanitization, DPI-specific one-bit rasterization, ASCII hexadecimal and Z64 encoding, inline `^GF`, stored `~DG`/`^XG`, and idempotent printer asset synchronization.

## Upload and security

Support SVG and PNG first. Validate MIME, signature, size, dimensions, format, and SHA-256.

Reject SVG scripts, event handlers, external URLs/images/fonts, embedded HTML, XML entities, unsafe animation, unsupported filters, and excessive complexity.

## Raster pipeline

Implement:

```text
Load
→ Resolve physical size
→ Resolve target DPI
→ Calculate target dots
→ Render on white
→ Grayscale
→ Threshold or approved dithering
→ One-bit conversion
→ Row bit packing
→ Encode
```

Create variants keyed by asset, DPI, dot dimensions, render mode, threshold, and dithering.

Do not scale a 203 DPI production bitmap into a 300 DPI one.

## Encoding and commands

Support:

- ASCII hexadecimal fallback
- Z64 with deterministic compression, Base64, and CRC
- Inline `^GF`
- Stored `~DG` and `^XG`

Use deterministic hash-based printer object names and an 8.3-safe strategy for legacy models.

## Printer asset cache

Create or extend `printer_asset_cache` with printer, asset, variant hashes, object name, memory location, DPI, dimensions, status, installed/verified times, and last error.

Implement synchronization:

```text
Resolve required variants
→ Check cache
→ Query printer when supported
→ Download missing/stale objects
→ Verify
→ Update cache
→ Print
```

Handle offline printer, memory full, stale hashes, restart, retry, and optional inline fallback. Never delete unrelated printer objects.

## Seeds

Add company logo, QC pass/fail, warning, rework, fragile, recycle, keep dry, and orientation-arrow assets with 203 and 300 DPI variants.

## Tests

Test valid/invalid uploads, unsafe SVG, transparent PNG, threshold, dithering, odd widths, bit packing, checksums, ASCII hex, Z64 CRC, inline/stored graphics, conditional icons, missing assets, incompatible printers, fresh/stale cache, retry, restart, and duplicate-download prevention.

## Acceptance gate

Pass only when upload security, DPI variants, rasterization, encodings, inline/stored graphics, asset cache, fallbacks, seeds, and all tests work.

Continue immediately to Phase 5.
