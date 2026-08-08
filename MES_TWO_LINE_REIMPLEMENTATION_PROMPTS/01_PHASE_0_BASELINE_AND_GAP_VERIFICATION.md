# Phase 0 — Baseline, Source-of-Truth Verification, and Gap Map

## Objective

Establish an exact implementation baseline before changing code. Confirm how `WO-2-LINE.md`, database schema, MES Master Data, MES Execution, and MES Console currently implement Production Line, Work Center membership, resource scope, Production Version eligibility, Work Order line selection, resource planning, approval, and execution.

## Required inspection

Inspect at minimum:

- `WO-2-LINE.md`
- Production Line tables and migrations
- `md_production_line_work_center`
- `md_production_line_resource_scope`
- Production Version line eligibility persistence/model
- Production Line HTTP routes/use cases
- MES Console `/master-data/production-lines`
- Production Version UI
- Work Order create/list/detail UI
- `line_selection.go`
- `resource_allocation.go`
- approval/revalidation/start-execution use cases
- current two-line tests, seed data, and reports

## Questions that must be answered from source

1. How is a Production Line created today?
2. How is a Work Center attached/detached from a line today?
3. Is line-to-resource-scope already writable through an API or only represented in schema?
4. How does Resource Assignment identify Workstation/Machine relationships?
5. Which readiness dimensions are currently checked by line selection?
6. Which dimensions are explicitly deferred to resource planning?
7. Does current fallback reevaluate Backup after an exact-resource failure?
8. What states cause `RESOURCE_HOLD` today?
9. How is selected line persisted/snapshotted on the Work Order?
10. Which UI fields/actions are currently missing?
11. Which current tests accidentally encode incomplete behavior and must be updated?

## Deliverable

Create:

`AI_document/two-line/PHASE_0_BASELINE_GAP_MAP.md`

It must contain:

- source-derived current architecture,
- exact route/table/type/use-case references,
- intended behavior from `WO-2-LINE.md`,
- gap matrix: intended vs current,
- no-code-change recommendation for each gap,
- risk classification: P0/P1/P2,
- candidate reuse opportunities,
- explicit list of behaviors that must not change.

## Verification

Run baseline builds/tests for affected services and MES Console before implementation. Record current failures separately from new failures.

Do not implement production changes in this phase.

## Phase gate

PASS only when the gap map is specific enough to implement without guessing.
