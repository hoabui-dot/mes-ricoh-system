# Phase UI-08 Report - Work Order List And Two-Line Detail Diagnostics

Date: 2026-08-02

Status: PASSED

Gate: `PHASE_UI_08_PASSED_READY_FOR_UI_09`

## Scope

Implemented additive Work Order list triage, server-backed filters, typed Work Order contracts, backend-owned line-evaluation dimensions, blocker navigation, operation-line consistency evidence, allocation history, and approval/execution gate summary.

Print Station and third-party flows remained outside this phase as instructed.

## Changed Files

- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `services/mes-console/src/routes/work-orders/WOListScreen.tsx`
- `services/mes-console/src/routes/work-orders/WODetailScreen.tsx`
- `services/mes-console/src/routes/work-orders/workOrderDetail.ts`
- `services/mes-console/src/routes/work-orders/workOrderContracts.ts`
- `services/mes-console/src/i18n.ts`
- `e2e/resource-planning/phase8-work-order-list-diagnostics.spec.ts`
- `package.json`

No migration or canonical seed changes were required.

## API Contract

`GET /api/mes/execution/work-orders` now accepts `search`, `status`, `selected_line`, `line_selection_status`, `hold`, `fallback_used`, `production_version`, `site`, `date_from`, and `date_to`. It returns selected-line, Primary/Backup, fallback, hold, approval, and execution triage fields.

`GET /api/mes/execution/work-orders/{id}` now returns `allocation_history`, `gate_summary`, and backend-provided 13-dimension line matrices. Dimensions not separately persisted by the current selector are explicitly marked `NotPersisted`; React does not calculate readiness.

## Verification Evidence

- `npm run typecheck --workspace services/mes-console`: passed.
- `npm run build --workspace services/mes-console`: passed.
- `go test ./...` in `services/mes-execution-service`: passed.
- Execution and Console Docker builds: passed.
- `npm run verify:mes:two-line-uat`: 3 declared, 3 executed, 3 passed, 0 failed, 0 skipped.
- `npm run test:e2e:two-line-uat:phase2`: 1 passed.
- `npm run test:e2e:work-order-diagnostics:phase8`: 1 passed.
- `npm run test:e2e:resource-planning:phase8`: 3 passed.
- `npm run cleanup:mes:two-line-uat`: 3 removed, 0 leaks.
- `npm run verify:mes:canonical-seed`: passed with 0 Work Orders remaining.

## Artifacts

Run directory: `artifacts/mes-console-remediation/phase-08/phase-08-20260802T1755Z/`

Required contracts, evidence, acceptance, cleanup, and screenshot index files are present. Screenshots cover the three-state list and Resource Hold detail matrix.

## Known Limitation

The execution service has no local site read model, so the server-backed `site` filter is authoritative by `site_id` UUID. A site-code filter would require an additive execution read-model projection or gateway contract and was not introduced across service ownership boundaries.

## Rollback

Revert only the Phase UI-08 changed files and redeploy the previous execution and console images. No migration rollback is required. Temporary UAT fixtures were cleaned up and calendar state restored.

## Completion Gate

`PHASE_UI_08_PASSED_READY_FOR_UI_09`
