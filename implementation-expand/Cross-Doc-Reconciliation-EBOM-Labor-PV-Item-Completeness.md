# Cross-Document Reconciliation, EBOM, Labor Matching, Production Version CRUD, Item Completeness

Date: 2026-07-24
Process: `process-expand/Cross-Doc-Reconciliation,-EBOM-Design,-Labor/Shift-Matching,-Production-Version-CRUD,-Item-Master-Data-Completeness.md`

## Audit gate

`AI_CONTEXT.md` section 39 records the source-of-truth reconciliation before implementation. The
running schemas differ from the product catalogs in several optional/product-planning fields; code
and migrations remain authoritative. The existing employee schedule already has `schedule_status`
(`Scheduled`, `Absent`, `OnLeave`, `Cancelled`). There is no real-time attendance model. No EBOM
tables/UI, dedicated Production Version CRUD screen, or labor matching runtime existed before this
change.

## Implemented

- Master-data migration `0010_ebom_and_mbom_traceability` creates localized `md_ebom_header`,
  tree-shaped `md_ebom_line`, and nullable `md_mbom_line.source_ebom_line_id`.
- EBOM resources are registered in the generic master-data API. Released EBOMs can create a Draft MBOM
  through `POST /api/mes/master-data/ebom-headers/:id/create-mbom-draft`; generated lines preserve
  source EBOM line IDs and leave manufacturing-only fields at defaults.
- MES Console `/master-data/eboms` provides EBOM create, line add, release, detail tree, and MBOM draft
  conversion. UUIDs are not displayed as business identity.
- MES Console has `/master-data/production-versions/new` and `/:id/edit`. MBOM and Routing candidates
  are reloaded server-side using Item Revision, Site, and `lifecycle_status=Released` predicates.
- Item create/edit now submits required `base_uom_id`; the screen loads UOM business codes, supports
  Draft item editing, and uses a confirmed lifecycle deactivation action.
- Execution migration `000009_labor_assignments_and_read_models.up.sql` adds labor read-model tables,
  `wo_operation_labor_assignment`, and explicit migration-runner registration.
- Compute & Check returns structured labor assignments, optional warnings, and mandatory shortages with
  HTTP 409. Proposed assignments recalculate before approval; approved/in-progress orders retain them.
  Work Order detail renders matched business identities.

## Verification

- `npm run typecheck --workspace=mes-console`: PASS.
- `npm run build --workspace=mes-console`: PASS; existing Vite chunk-size warning remains.
- `npm run build --workspace=mes-master-data-service`: PASS.
- `go test ./...` in `services/mes-execution-service`: PASS.
- Docker rebuilt and recreated the three affected MES services.
- Runtime logs confirm master-data migration `0010` and execution migration `000009` applied.
- Master-data was healthy; execution started successfully. Existing Schema Registry 409 compatibility
  warnings remain non-blocking and predate this work.

## Evidence status and limits

- EBOM schema/API/UI: **IMPLEMENTED_AND_RUNTIME_VERIFIED** for migration/startup and build; browser
  create/release/conversion is **IMPLEMENTED_BUT_NOT_TESTED** because browser automation is unavailable.
- Production Version CRUD/server filtering: **IMPLEMENTED_AND_RUNTIME_VERIFIED** for build/code paths;
  browser submission is **IMPLEMENTED_BUT_NOT_TESTED**.
- Item UOM/edit/deactivate: **IMPLEMENTED_BUT_NOT_TESTED** against a live item fixture.
- Labor scoring/persistence: **PARTIALLY_IMPLEMENTED**. Logic/tables exist, but current event projections
  do not populate employee, skill, schedule, or operation-skill read models; live matching reports the
  corresponding read-model gap until projections are supplied. Real-time attendance is **MISSING**.
- Work Order execution remains MBOM-only; no EBOM reference was added to execution explosion logic.
