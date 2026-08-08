# Phase 4 — MES Console Production Line Configuration Workspace

## Objective

Replace the incomplete Production Line experience with a complete configuration workflow while preserving the simple Create form for line identity/basic hierarchy.

## UX principle

Do not overload the initial Create Line modal with every resource decision.

Expected flow:

```text
Create Line
  -> Draft Line
  -> Configure Work Centers
  -> Configure Resource Scope
  -> Validate Readiness
  -> Release
```

## Route

Enhance:

`/master-data/production-lines/:id`

Reuse existing routing conventions and shared components.

## Required sections/tabs

### Overview

- code,
- localized name,
- site,
- production area,
- line type,
- lifecycle/status,
- effectivity.

### Work Center Coverage

- attached Work Centers,
- business code/name,
- sequence,
- add/remove/reorder,
- clear validation errors.

### Execution Resource Scope

For each relevant Work Center show the resources scoped to the line:

- Workstation,
- Resource Assignment,
- Machine Unit/equipment context where available,
- active/effective state,
- operation-specific scope where applicable.

### Readiness

Display backend-provided structural readiness. Do not calculate readiness in React.

### Production Version Usage

Show which Production Versions reference the line and whether it is Primary/Backup/priority.

### History/Audit

Use existing audit/history APIs if present.

## UI rules

- localized name first, business code second,
- never use raw UUID as the operator-facing primary label,
- use existing TanStack Query/shared mutation patterns,
- invalidate/refetch the correct queries after mutations,
- no browser `alert`,
- preserve VI default and current EN/JA/KO localization structure,
- make empty/loading/error states explicit.

## Tests

Add component/integration/E2E coverage for:

- create Draft line,
- attach Work Centers,
- configure resource scope,
- remove invalid scope,
- validation feedback,
- permissions if role guards already exist.

Run typecheck/build/lint and affected frontend tests.

## Deliverable

Create:

`AI_document/two-line/PHASE_4_LINE_CONFIGURATION_UI_REPORT.md`

## Phase gate

PASS when an operator/admin can configure a complete line topology and resource scope through MES Console with no direct DB edits.
