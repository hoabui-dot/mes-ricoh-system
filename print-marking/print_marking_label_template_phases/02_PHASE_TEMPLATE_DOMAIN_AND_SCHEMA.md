# Phase 2 Prompt — Template Domain, JSON Schema, Versioning, Assets, and Persistence

## Role

Implement the authoritative Label Template domain inside the real Printer Adapter project.

Load and obey `00_EXECUTION_RULES.md`. Use the actual paths found in Phase 1. Continue automatically to Phase 3.

## Objective

Implement the canonical template model, lifecycle, variables, typed elements, printer profiles, asset metadata, immutable versions, approval, audit, Outbox, migrations, and deterministic seeds.

## Canonical model

Define typed models for:

```text
schema_version
template_code
name
description
category
canvas
supported_dpi
variables
elements
metadata
```

Canvas must support width/height in millimeters, orientation, margins, and default DPI.

Variables must support string, integer, decimal, boolean, date, datetime, and enum with required/default/length/pattern/format/allowed-values/sample metadata.

MVP elements:

```text
text
barcode
qrcode
line
rectangle
image
icon
```

Use typed element-specific properties, stable IDs, millimeter coordinates, size, rotation, z-index, binding, visibility, and safe conditional visibility.

## Lifecycle

Implement:

```text
DRAFT
VALIDATED
PENDING_APPROVAL
APPROVED
ACTIVE
RETIRED
```

Approved versions are immutable. Editing creates a new version. Production resolves exact versions. Enforce maker-checker where applicable.

## Persistence

Create or extend these tables in `printer.db`:

- `label_templates`
- `label_template_versions`
- `label_assets`
- `label_asset_variants`
- `template_asset_references`
- `printer_profiles`
- `template_audit_events`
- Existing or new printer-owned Outbox table

Add indexes and constraints for template code, version number, active version consistency, asset variants, status, and audit lookup.

## Commands

Implement:

```text
CreateTemplate
CreateTemplateVersion
UpdateDraftVersion
ValidateTemplateVersion
SubmitTemplateVersion
ApproveTemplateVersion
ActivateTemplateVersion
RetireTemplateVersion
UploadLabelAsset
DeactivateLabelAsset
AssignTemplateToPrinterProfile
```

Every mutation must atomically write state, audit, and Outbox records.

## Validation

Return structured validation issues with code, severity, element ID, field, message key, and parameters.

Validate canvas, bounds, duplicate IDs, bindings, variable schema, missing assets, barcode/QR settings, fonts, DPI, printer capabilities, unsafe expressions, and raw ZPL extensions.

## Events

Create versioned events for template creation, version creation, validation, submission, approval, activation, retirement, asset upload, asset variant creation, and printer profile updates.

## Seed data

Create repeatable seeds for Product, Packaging, QR, Rework, QC Hold, and Shipping templates, plus 203/300 DPI and incompatible printer profiles.

## Tests

Add domain lifecycle tests, schema tests, migration tests, transaction rollback tests, immutable-version tests, active-version tests, audit tests, Outbox atomicity tests, and idempotent seed tests.

## Acceptance gate

Pass only when schema, lifecycle, immutability, persistence, validation, audit, Outbox, seeds, migrations, and tests work without cross-service database access.

Continue immediately to Phase 3.
