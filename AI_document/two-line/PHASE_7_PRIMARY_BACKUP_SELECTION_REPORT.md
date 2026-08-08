# Phase 7 Primary/Backup Selection and Fallback Report

Date: 2026-08-07

## Objective

Integrate exact complete-line feasibility into deterministic Work Order Primary/Backup selection, fallback, `RESOURCE_HOLD`, and pre-start replan behavior.

## Baseline findings

- Production Line ordering and persisted selection diagnostics already existed, but selection used coarse Work Center-level checks.
- The exact Resource Planning readiness API is owned by Master Data, while the legacy Phase 7 fixture populated only the Execution projection database. That fixture could not prove the real cross-service contract.
- Candidate and commit paths already scoped requests to the selected line and rejected mixed-line allocations.
- Replan already rejected Work Orders after execution started, but it needed to rerun the exact evaluator.

## Implementation summary

- Injected the existing Resource Planning client into direct Work Order creation, creation workflows, and line replan.
- Evaluated every mandatory Routing Operation against exact candidates for each eligible line before selecting it.
- Preserved deterministic role, priority, code, and ID ordering.
- Kept a line Ready when at least one exact candidate remains for every mandatory operation.
- Persisted compact per-operation feasibility evidence and blocker codes in the existing evaluated-line snapshot.
- Selected the Primary when complete, selected the Backup with a fallback reason when Primary was blocked, and entered `ResourceHold` when both lines were blocked.
- Added a read-only Execution capacity inspector for active reservation conflicts without creating reservations during line selection.
- Corrected Master Data readiness context resolution so a line-mapped Work Center can be evaluated while operation identity remains derived from the Routing Operation.
- Updated canonical UAT calendar mutation/restoration to change both the authoritative Master Data calendar and the Execution read projection.
- Replaced the official Phase 7 gate command with an authoritative two-database fixture lifecycle. Cleanup executes in `finally`.

## Files changed

- `services/mes-execution-service/internal/application/usecase/line_feasibility_evaluator.go`
- `services/mes-execution-service/internal/application/usecase/line_selection.go`
- `services/mes-execution-service/internal/application/usecase/create_work_order.go`
- `services/mes-execution-service/internal/infrastructure/http/creation_workflow.go`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
- `scripts/mes-two-line-uat-fixtures.mjs`
- `scripts/test-mes-two-line-exact-selection-phase7.mjs`
- `package.json`
- `AI_document/two-line/PHASE_7_PRIMARY_BACKUP_SELECTION_REPORT.md`

## Schema and API changes

- No new migration in Phase 7.
- Work Order detail keeps the existing additive `evaluated_line_results` contract and now includes `operations` plus `complete_line_feasibility_status` for every evaluated line.
- Existing selection mode, selected line, status, fallback reason, policy version, and evaluation timestamp remain persisted.

## Tests and commands

- Full MES Execution `go test ./...`: PASS.
- MES Master Data build and unit tests, 40/40: PASS.
- `npm run test:mes:two-line-resource-planning:phase7`: PASS.
- Canonical scenario verification, 3 declared / 3 executed / 3 passed / 0 skipped: PASS.
- Primary complete line selected: PASS.
- Primary blocked and Backup complete line selected with fallback reason: PASS.
- Both lines blocked and Work Order entered `ResourceHold`: PASS.
- Candidate evidence remained inside the selected line: PASS.
- Cleanup removed 3 Work Orders and left 0 reservations, 0 allocations, and 0 Work Orders: PASS.

## Remaining risks

- Legacy coarse dimension fields remain in the additive diagnostics payload for compatibility. Exact per-operation evidence is authoritative; Phase 9 will align Console rendering with that evidence.
- The former projection-only fixture remains available as `test:mes:two-line-resource-planning:legacy`; it is not an authoritative Phase 7 gate because it bypasses Master Data ownership.
- Approval/start revalidation and exact allocation lifecycle alignment are Phase 8 scope.

## Phase gate

PASS
