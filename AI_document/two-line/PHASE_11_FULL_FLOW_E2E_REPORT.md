# Phase 11 Full-Flow E2E Report

Date: 2026-08-07

## Environment

- Local Docker Compose MES stack.
- MES Console: `http://localhost:13000`.
- Master Data API: `http://localhost:13020/api/mes/master-data`.
- Execution API: `http://localhost:13030/api/mes/execution`.
- PostgreSQL test endpoints: Master Data `localhost:15434`, Execution `localhost:15435`.
- Canonical seed date: `2026-08-07`.
- Print Station and third-party integration behavior was not exercised, per scope. Resource validation remained strict.

## Implementation and fixes

- Added `scripts/test-mes-two-line-full-flow-phase11.mjs`, a guarded local/test release gate with 12 mandatory scenarios, per-scenario JSON evidence, state restoration, stale-fixture cleanup, and leak verification.
- Updated the Phase 6 Master Data test to respect the release gate: create Draft line, attach Work Center, then release.
- Updated the canonical regression runner to use current two-line authoritative fixtures rather than obsolete one-line machine-group fixtures.
- Corrected the old Phase 1 Production Version comparator discovered during regression. The remaining legacy test model requires `machine_group + primary_machine`, while the current canonical model uses direct `workstation + equipment + machine_unit`; it is not used as two-line release evidence.

## Mandatory scenarios

| # | Scenario | Result | Key evidence |
| --- | --- | --- | --- |
| 1 | Primary selected | PASS | Primary selected; four operation proposals restricted to Primary |
| 2 | One Primary candidate inactive, alternative remains | PASS | 2 total, 1 feasible, `WORKSTATION_INACTIVE=1` |
| 3 | All candidates for one Primary operation unavailable | PASS | Primary blocked; Backup selected |
| 4 | Primary assignments expired | PASS | Expired candidates excluded; Backup selected |
| 5 | Capability mismatch | PASS | Primary blocked by capability policy; Backup selected |
| 6 | Calendar/shift unavailable | PASS | Primary blocked by calendar policy; Backup selected |
| 7 | Capacity/reservation conflict | PASS | Conflicting Work Center time-window commit returned `RESOURCE_CAPACITY_CONFLICT` |
| 8 | Primary and Backup blocked | PASS | No selected line; persisted `RESOURCE_HOLD` and both-line diagnostics |
| 9 | Cross-line commit attack | PASS | Primary candidate against selected Backup returned `RESOURCE_CANDIDATE_STALE` |
| 10 | Resource degrades before approval | PASS | Revalidation failed; approval returned `WO_RESOURCE_ALLOCATION_INVALID` |
| 11 | Resource degrades before execution start | PASS | Start returned `WO_RESOURCE_ALLOCATION_INVALID` |
| 12 | Resource fails after execution start | PASS | Operation moved to `ExecutionError`, WO to `Paused`; retry restored `InProgress`; line unchanged |

Result: 12 declared, 12 executed, 12 passed, 0 failed, 0 skipped.

## Full lifecycle and persistence evidence

Scenario 12 executed:

`Master Data -> Production Version -> WO creation -> line selection -> proposals -> commit -> revalidation -> approval -> start execution -> start operation -> fail -> pause -> retry`

The outbox contained `MES.Execution.OperationFailed.v1`, `MES.Execution.OperationRetryRequested.v1`, and two `MES.Execution.WOStatusChanged.v1` events. Cleanup reported zero Work Orders, allocations, and reservations from the Phase 11 namespace.

Evidence directory: `artifacts/mes-two-line-phase11/`.

## Regression commands

- `go test ./...` in MES Execution: PASS.
- `npm test && npm run build` in MES Master Data: PASS, 40/40 tests.
- `npm run build` in MES Console: PASS.
- `npm run test:mes:two-line-master-data:phase6`: PASS.
- `npm run test:mes:two-line-resource-planning:phase7`: PASS, 4/4, 0 skipped.
- `npm run test:mes:two-line-resource-lifecycle:phase8`: PASS, 5/5, 0 skipped.
- `npm run test:mes:two-line-full-flow:phase11`: PASS, 12/12, 0 skipped.
- `npm run verify:mes:canonical-seed`: PASS, all integrity checks.
- Selected MES Console Playwright release suite: PASS, 11/11.
- `git diff --check`: PASS.

## UI evidence

- Production Line authoring, Work Center membership, resource hierarchy, and backend readiness: PASS.
- WO list selected-line/fallback/hold triage: PASS.
- WO detail evaluated-line and per-operation feasibility matrix: PASS.
- Resource Hold warning and authorization behavior: PASS.
- Responsive diagnostics at tablet width: PASS.
- Screenshots: `artifacts/playwright/two-line-phase11/` and `artifacts/playwright/two-line-phase9/`.

## Known non-blocking observations

- The Vite build reports an existing JavaScript chunk-size warning; it does not fail compilation or UI tests.
- Historical WMS replay messages with invalid legacy non-UUID references can appear in Execution logs and are outside this two-line flow.
- The old one-line machine-group negative script models a superseded fixture shape. Its current two-line equivalents are covered by the Phase 11 gate and Go unit/integration tests.

## Phase gate

PASS
