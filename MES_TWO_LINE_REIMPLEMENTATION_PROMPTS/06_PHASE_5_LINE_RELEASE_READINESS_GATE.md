# Phase 5 — Production Line Release and Structural Readiness Gate

## Objective

Prevent an incompletely configured Production Line from being treated as production-ready.

## Important distinction

Release readiness is primarily structural/master-data readiness. Do not require transient runtime conditions such as a machine being online at the exact release moment unless that is already an approved domain rule.

## Required backend behavior

Before a line can become Released/usable for Production Version eligibility, validate at minimum:

- required Work Center topology exists,
- Work Center relationships are valid/effective,
- required line resource scope exists where necessary,
- resource scopes resolve to valid Resource Assignments/resources,
- no invalid hierarchy conflict,
- no impossible duplicate/conflicting scope,
- required references are active/effective according to the approved contract.

Return structured validation diagnostics, not only a generic 400/409 message.

## MES Console behavior

Add a readiness panel and Release action that:

- fetches backend validation,
- shows blockers by category,
- disables/prevents release while blockers remain,
- clearly distinguishes warning vs blocking issue,
- refreshes status after successful release.

## Tests

Prove:

1. empty line cannot release,
2. line with Work Centers but missing required resource scope cannot release when scope is required,
3. invalid/expired membership blocks release when contract says so,
4. correctly configured line releases,
5. released line remains auditable,
6. destructive topology edits against a released/used line are appropriately guarded.

## Deliverable

Create:

`AI_document/two-line/PHASE_5_LINE_RELEASE_GATE_REPORT.md`

## Phase gate

PASS when only structurally valid Production Lines can participate in downstream Primary/Backup planning.
