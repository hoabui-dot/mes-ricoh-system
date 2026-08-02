# Phase 6 — Implement Two-Line Master Data and Production Version Eligibility

Implement only master-data structures in this phase.

Do not modify Work Order line selection or runtime allocation yet.

## Objective

Add the canonical Production Line model and allow one released Production Version to reference multiple eligible Production Lines with one primary and ordered backups.

## Required implementation

### Production Line

Implement:

- code;
- localized name;
- Site;
- Production Area;
- calendar where supported;
- lifecycle;
- active status;
- effectivity;
- row version;
- dependency-aware delete/deactivation.

### Work Center ownership

Add or verify an effective relationship from Work Center to exactly one Production Line for the relevant period.

Validate:

- same Site;
- compatible Production Area;
- no conflicting active line ownership;
- referenced Released data cannot be rewritten destructively.

### Production Version Line Eligibility

Implement:

- Production Version;
- Production Line;
- primary flag;
- priority;
- efficiency factor;
- status;
- effectivity;
- row version.

Validate:

- same Site;
- released/effective Production Version;
- released/effective Production Line;
- unique active eligibility;
- maximum one active primary line;
- deterministic priority order;
- all required operation capabilities can potentially be resolved under the line.

## API requirements

Add version-compatible APIs for:

- Production Line CRUD/lifecycle;
- Work Center line assignment;
- Production Version line eligibility;
- Production Version line-readiness preview.

## Event requirements

Publish versioned master-data facts through outbox.

Do not reuse an unrelated event name.

## MES Console requirements

Use existing Base components.

Add:

- Production Line list/detail/create/edit;
- Work Center line display;
- Production Version Line Eligibility section;
- primary and backup priority controls;
- readiness preview;
- translated validation errors.

## Migration requirements

- Forward-only.
- Additive.
- Preserve existing records.
- Backfill only when the relationship is unambiguous.
- Do not automatically assign historical Work Centers to arbitrary lines.
- Document rows requiring manual resolution.

## Tests

Add:

- migration tests;
- API tests;
- lifecycle tests;
- same-site tests;
- single-primary validation;
- duplicate eligibility tests;
- dependency deletion tests;
- UI E2E for master-data authoring.

## Required report

Create:

`mes-system/process-expand/mes-enterprise/ai-report/phase-6/mes-two-line-master-data-implementation-YYYYMMDD.md`