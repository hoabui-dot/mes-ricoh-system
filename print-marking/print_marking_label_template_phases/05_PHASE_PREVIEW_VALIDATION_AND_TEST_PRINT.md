# Phase 5 Prompt — Server Preview, Preflight, Barcode Verification, and Test Print

## Role

Implement the authoritative preview and test-print workflow.

Load and obey `00_EXECUTION_RULES.md`. Continue automatically to Phase 6.

## Objective

Deliver server-rendered previews, printer-specific preflight, visual warnings, barcode/QR decode checks, test-print execution, and approval evidence.

## Preview types

Maintain three distinct concepts:

1. Browser designer preview: fast and non-authoritative.
2. Server preview: authoritative layout and validation preview.
3. Physical test print: required evidence where policy demands it.

## APIs

Implement equivalent endpoints:

```text
POST /api/label-templates/preview
POST /api/label-templates/{templateId}/versions/{versionId}/preview
POST /api/label-templates/{templateId}/versions/{versionId}/preflight
POST /api/label-templates/{templateId}/versions/{versionId}/test-print
```

Return dimensions, DPI, preview reference, warnings/errors, render checksum, payload checksum, resolved assets, font strategy, and barcode verification.

## Server rendering

Use the same measurement, variables, font, asset, rotation, visibility, and DPI rules as production compilation. Render text, native-code preview equivalents, QR, lines, boxes, images, and icons.

## Preflight

Check canvas/media size, printer width, DPI, bounds, text overflow, variables, assets, variants, fonts, Z64 capability, stored graphics, quiet zones, barcode/QR decode, orientation, payload size, printer online state, memory, and required asset sync.

Classify issues as ERROR, WARNING, or INFO. Blocking errors must prevent activation and test print.

## Test print

Implement:

```text
Authorize
→ Load exact version
→ Validate sample data
→ Preflight selected printer
→ Create test execution
→ Synchronize assets
→ Send safely
→ Record result
→ Write audit and Outbox
```

Record template version, printer, user, sample data, checksum, timestamp, result, error, correlation ID, media, darkness, speed, ribbon, barcode scan, Vision result, notes, and optional evidence reference.

Test labels should be distinguishable from production when policy requires.

## Seeds and tests

Seed valid 203/300 previews and cases for overflow, missing asset, invalid barcode, unsupported font, offline printer, no Z64, missing asset cache, Vietnamese fallback, and large payload.

Test deterministic previews, DPI behavior, conditional icons, Vietnamese text, all preflight codes, barcode/QR decode, authorization, asset sync, transport failure, status unknown, duplicate request protection, visual regression, and audit persistence.

## Acceptance gate

Pass only when authoritative preview, preflight, barcode verification, test print, evidence, blocking behavior, seeds, and tests work.

Continue immediately to Phase 6.
