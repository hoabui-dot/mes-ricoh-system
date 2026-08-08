# Phase 8 Resource Planning Alignment Report

Date: 2026-08-07

## Objective

Keep exact resource allocation inside the selected Production Line and require current resource readiness before approval or execution start.

## Baseline findings

- Candidate and commit requests already included the selected Production Line, and the database consistency guard rejected mixed-line operation, allocation, and reservation rows.
- Revalidation existed but assumed `candidates` always had one JSON shape and did not use the shared candidate-ready predicate.
- Strict approval revalidated resources, but the enabled demo-print path bypassed revalidation and generated synthetic allocations.
- `start-execution` and manual/kiosk operation start trusted stored `validation_status` without refreshing authoritative readiness.

## Implementation summary

- Revalidation now safely handles missing candidate arrays and applies the same readiness, blocker, and capacity-conflict predicate as proposal selection.
- Approval always runs exact revalidation, including demo-print mode.
- Demo print no longer creates synthetic resource allocations or records a resource-allocation bypass; it only retains its explicit material-staging bypass.
- `start-execution` now runs exact revalidation before changing Work Order state or dispatching operations.
- Manual and kiosk operation start now run exact revalidation before a new start. An already `InProgress` operation keeps its idempotent retry behavior.
- Added one shared HTTP lifecycle guard and one stable `WO_RESOURCE_ALLOCATION_INVALID` response contract with diagnostic details.
- Added a canonical two-database Phase 8 harness covering Backup candidate scope, wrong-line rejection, exact allocation, replan lifecycle, resource degradation, approval, and start.

## Files changed

- `services/mes-execution-service/internal/application/usecase/resource_allocation.go`
- `services/mes-execution-service/internal/application/usecase/resource_allocation_test.go`
- `services/mes-execution-service/internal/application/usecase/approve_work_order.go`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `scripts/test-mes-two-line-resource-lifecycle-phase8.mjs`
- `package.json`
- `AI_document/two-line/PHASE_8_RESOURCE_PLANNING_ALIGNMENT_REPORT.md`

## Schema and API changes

- No schema migration.
- Approval, `start-execution`, and operation-start endpoints now return HTTP 409 with `WO_RESOURCE_ALLOCATION_INVALID` and revalidation details when committed resources are stale or incomplete.
- Existing candidate, commit, reallocate, and revalidate request/response shapes remain unchanged.

## Tests and commands

- Full MES Execution `go test ./...`: PASS.
- `npm run test:mes:two-line-resource-lifecycle:phase8`: PASS, 5/5 scenarios, 0 skipped.
- Backup candidate APIs returned only Backup-scoped resources: PASS.
- Primary resource commit against a Backup-selected WO returned `RESOURCE_CANDIDATE_STALE`: PASS.
- Exact allocations and reallocation candidates remained on Backup: PASS.
- Pre-start replan reran exact selection: PASS.
- Post-start replan returned `WO_LINE_REPLAN_AFTER_START_REQUIRES_EXECUTION_SEGMENT`: PASS.
- Authoritative Workstation degradation failed revalidation and blocked both approval and execution start: PASS.
- Cleanup left 0 Work Orders, allocations, reservations, and inactive canonical Backup Workstations: PASS.
- Rebuilt and restarted `mes-execution-service`; `/health` returned OK.

## Remaining risks

- Historical WMS Kafka replay messages contain non-UUID reservation references and continue to log consumer errors. They predate and are outside the two-line resource lifecycle path.
- This phase intentionally does not execute a print-station dispatch or other third-party integration.

## Phase gate

PASS
