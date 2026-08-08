# Complete MES MBOM End-to-End Workflow Implementation

> Architecture correction, 2026-08-06: MBOM has one business identity and no create-version workflow. Any create-new-version statement below is historical and superseded.

Date: 2026-07-29
Status: PARTIALLY_IMPLEMENTED

## Gap matrix

| Capability | Source evidence | Status | Implementation / verification |
|---|---|---|---|
| Independent MBOM/Routing ownership | migrations 0030 and 0039 | IMPLEMENTED_AND_VERIFIED | No ownership FK reintroduced |
| Released MBOM immutability | `master-data.router.ts` release and line guards | IMPLEMENTED_AND_VERIFIED | Released edit rejected |
| Structure optimistic concurrency | `structure_version`, migration 0050, replace endpoint | IMPLEMENTED | Source/build verified; competing browser mutation test remains |
| Create new MBOM version | `POST mbom-headers/:id/create-new-version` | IMPLEMENTED | Copies current lines/substitutes into Draft; runtime endpoint test remains |
| Hierarchical line CRUD | detail tree, line PUT/DELETE/reorder/replace APIs, Console actions | IMPLEMENTED | Build verified; full browser workflow remains |
| Substitute audit | audit table, approve/reject routes | IMPLEMENTED | Build/migration verified |
| Substitute technical group/UOM policy | create route checks item group and active conversion | PARTIALLY_IMPLEMENTED | Explicit approved exception fields exist; UI approval workflow remains |
| Production Version compatibility | validation engine | IMPLEMENTED | Adds current-line, UOM, issue-operation and site checks |
| WO explosion scale/snapshot traceability | `create_work_order.go`, execution migration 022 | IMPLEMENTED | Build and migration verified; AB/X runtime fixture not yet run |
| WMS parent requisition | current WMS remains flat `material_request` per line/work center | MISSING | Requires aggregate migration and event consumer |
| Automatic approval-to-WMS requisition | current flow still uses stage-materials client | MISSING | Must be implemented before claiming strict end-to-end completion |
| AB/X, phantom, substitute physical E2E | no deterministic fixture in current seed | MISSING | Requires dedicated data seed and runtime evidence |

## Implemented changes

- Master-data migration 0050 adds MBOM `structure_version`, substitute policy
  exception fields and immutable approval audit rows.
- `create-new-version` copies only current active structure into a new Draft
  MBOM and preserves the Released source.
- Complete line replacement requires `expected_structure_version`; stale
  updates return `409 MBOM_STRUCTURE_VERSION_CONFLICT` with the latest version.
- Structure mutations bump the version.
- Substitute creation validates same technical group or an explicit approved
  exception and same UOM or an active central conversion. Approval and rejection
  are audited without overwriting the history.
- Production Version validation ignores ended MBOM lines and rejects UOM
  mismatch and issue operations outside the selected Routing.
- Work Order material explosion now scales with:

  `required = quantity_per × (WO quantity / MBOM base quantity) × (1 + scrap_rate)`

  rounded to six decimal places, skips unselected optional lines, avoids
  material demand for phantom parents with children, and stores MBOM line,
  parent, version, scaled quantity, scrap and optional snapshots.
- Execution projection consumes released MBOM line events including hierarchy
  and optional flags.
- MES Console supports structure save, conflict notification, line edit/remove,
  validation and create-new-version.

## Runtime verification

- MES master-data TypeScript build: passed.
- MES execution `go test ./...`: passed.
- MES Console `tsc && vite build`: passed.
- Master-data migration 0050: applied.
- Execution migration 000022: applied.
- `mes-master-data-service`: healthy.
- `mes-execution-service`: healthy.
- MES Console: HTTP 200.
- `npm run verify:mes:mbom`: passed.

## Remaining blockers

The process completion criteria are not honestly met yet. WMS still owns a
flat, synchronous material-request flow and the approval transaction does not
publish/consume a parent `MaterialRequisitionRequested` aggregate. The complete
WMS parent/line workflow, operation-level material readiness projection, AB/X
fixture, substitute actual-consumption traceability, and browser concurrency
test remain required work.
