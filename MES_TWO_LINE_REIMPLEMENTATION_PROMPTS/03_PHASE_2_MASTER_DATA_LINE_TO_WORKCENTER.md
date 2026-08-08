# Phase 2 — Production Line to Work Center Master-Data Completion

## Objective

Complete and harden the Production Line -> Work Center topology as first-class master data.

## Backend requirements

Inspect and reuse the existing `md_production_line_work_center` model and existing endpoints before adding anything new.

Ensure the backend supports:

- list Work Centers attached to a Production Line,
- attach/replace Work Center membership,
- remove Work Center membership safely,
- sequence/order,
- optional primary marker only if already meaningful,
- effectivity,
- validation that Work Centers belong to the correct site/area hierarchy,
- prevention of invalid duplicates,
- stable audit behavior.

Do not add a direct Workstation FK to Production Line in this phase.

## Validation rules

At minimum verify:

- invalid Work Center ID rejected,
- wrong-area/wrong-site Work Center rejected when hierarchy requires it,
- duplicate Work Center membership rejected or normalized deterministically,
- inactive/expired records handled consistently,
- removing a Work Center referenced by a released/active line is guarded according to lifecycle rules.

## API contract

Document exact request/response bodies and error codes.

Prefer existing routes such as:

`PUT /production-lines/:id/work-centers`

if already present and appropriate.

## Tests

Add unit/integration tests for create/read/update membership and negative validation.

Run MES Master Data service build and all affected tests.

## Deliverable

Create:

`AI_document/two-line/PHASE_2_LINE_WORKCENTER_REPORT.md`

## Phase gate

PASS when source proves a Production Line can own an ordered, validated Work Center topology without manual DB edits.
