# MES Resource Planning Domain Verification

Date: 2026-08-01
Phase: 1 - Current Resource Planning correctness audit
Status: IMPLEMENTED_AND_VERIFIED

## Scope

Phase 1 verifies and hardens the current Work Center, Workstation, Equipment, Machine Unit, Resource Assignment, calendar, standard, candidate resolution, allocation, reallocation, cancellation, approval revalidation, execution-start, idempotency, authorization, and capacity-conflict behavior.

Production Line selection was not implemented in this phase.

## Defects Found and Root Cause

| Defect | Root cause | Fix |
|---|---|---|
| Machine-group readiness could treat invalid physical Machine Units as usable. | The group-candidate branch did not validate Equipment Site/Work Center, Equipment planning flag, Equipment lifecycle/status, Machine Unit active flag, Machine Unit physical identity, or Machine Unit planning flag with the same rigor as direct equipment candidates. | Hardened group candidate validation in MES Master Data readiness. |
| Allocation cancellation did not cancel committed allocations. | Delete path only updated `Draft` and `Validated` allocations while normal allocation commits rows as `Committed`. | Cancellation now includes `Committed`, cancels reservations, and writes a cancellation audit row. |
| Execution start could proceed without committed valid resource allocations. | `StartExecution` and `StartOperation` did not enforce committed valid allocation coverage before queue/start. | Added Work Order-level and operation-level allocation guards returning `WO_RESOURCE_ALLOCATION_INVALID`. |
| Approval revalidation could miss stale physical Machine Unit state. | Revalidation only matched Workstation/Equipment and ignored committed machine group and primary physical Machine Unit snapshot. | Revalidation now matches Workstation, Equipment, Machine Group, and primary Machine Unit. |
| Strict allocation approval could not be verified while demo print-on-approval is enabled. | `MES_DEMO_PRINT_ON_APPROVAL=true` globally bypassed strict allocation validation. | Added `X-MES-Approval-Policy: Strict` request override while preserving demo compatibility. |
| Default E2E fixture was date brittle and hierarchy-stale. | Tests defaulted to the current date even on weekends, while labor seed only schedules weekdays; seed helper verified the demo group but did not repair its primary Equipment/Machine Unit hierarchy. | Test/seed defaults now choose the next weekday, and the seed repairs the deterministic demo primary equipment/unit assignment. |

## Code Changes

| Area | Files |
|---|---|
| MES Master Data readiness | `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts` |
| MES Execution allocation cancellation | `services/mes-execution-service/internal/infrastructure/http/router.go` |
| MES Execution approval policy override | `services/mes-execution-service/internal/infrastructure/http/router.go` |
| MES Execution start guards | `services/mes-execution-service/internal/application/usecase/dispatch_execution.go`, `services/mes-execution-service/internal/application/usecase/start_operation.go` |
| MES Execution allocation revalidation | `services/mes-execution-service/internal/application/usecase/resource_allocation.go` |
| Phase 1 API verification | `scripts/test-mes-resource-planning-domain-phase1.mjs`, `package.json` |
| Existing API regression stability | `scripts/test-mes-resource-planning-flow.mjs` |
| Deterministic seed repair | `scripts/seed-mes-wo-complete-dataset.mjs` |

## Migrations

No database migrations were added.

Reason: Phase 1 defects were validation, transaction, audit-path, fixture, and test coverage gaps. Existing schema already contains the required allocation, reservation, audit, machine group, machine unit, labor, calendar, and standard fields.

## Tests Added

Added:

`npm run test:mes:resource-planning-domain:phase1`

The script verifies 20 required API-level scenarios:

1. missing Primary Machine Requirement;
2. insufficient physical Machine Units;
3. expired Resource Assignment;
4. Workstation in another Work Center;
5. Machine Unit in another Site;
6. Machine Unit under maintenance;
7. Machine Unit out of service;
8. Machine Unit not planning eligible;
9. unavailable Resource Calendar;
10. invalid Shift;
11. missing Production Standard;
12. stale candidate;
13. simultaneous allocation conflict;
14. idempotent replay;
15. reused idempotency key with a different request;
16. reallocation;
17. allocation cancellation;
18. approval after resource state changed;
19. execution start without valid allocation;
20. unauthorized role.

The script uses real HTTP APIs for behavior assertions and local guarded database fixture mutations/restores for negative scenario setup. It requires:

- `MES_ENV=development`
- `ALLOW_RESOURCE_PLANNING_MUTATION=true`
- local MES Master Data and MES Execution database URLs

## Commands Executed

| Command | Result |
|---|---|
| `go test ./...` in `services/mes-execution-service` | PASS |
| `npm run typecheck` in `services/mes-master-data-service` | PASS |
| `npm run rebuild:mes` | PASS |
| `docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml build mes-execution-service && docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml up -d --no-build --force-recreate mes-execution-service` | PASS |
| `npm run test:mes:resource-planning-domain:phase1` | PASS, run `PHASE1-RP-1785578476116-B6WDE`, 20 declared, 20 executed, 20 passed, 0 failed, 0 skipped |
| `npm run test:mes:resource-planning-domain:phase1` | PASS, run `PHASE1-RP-1785578491856-37O7I`, 20 declared, 20 executed, 20 passed, 0 failed, 0 skipped |
| `npm run test:mes:resource-planning-flow` | PASS, run `E2E-RP-1785578717029-JFKV1`, 3 operations committed, 3 primary Machine Unit snapshots, revalidation valid |
| `npm run test:mes:resource-planning-domain:phase1` | PASS, run `PHASE1-RP-1785578727451-3YLJR`, 20 declared, 20 executed, 20 passed, 0 failed, 0 skipped |

## Seed and Environment Notes

The MES seed was rerun in a guarded local environment to repair MES-side deterministic fixtures. The seed still reports a WMS component-stock readiness failure in the current local WMS dataset:

`WMS_COMPONENT_STOCK_READINESS` for component revision `SFG-MET-CM01-R1` has available quantity `0`.

This is not a Phase 1 Resource Planning invariant, but it remains a cross-domain seed limitation for later WMS/material phases.

The local print station runtime is offline. Seed verification was run with `ALLOW_PRINT_STATION_OFFLINE=true` when focusing on Resource Planning.

## Phase 1 Gate

Result: PASS.

All required Phase 1 API scenarios pass repeatedly. Current resource model invariants for Work Center, Workstation, Equipment, Machine Unit, Resource Assignment, calendar, standard, candidate advisory behavior, authoritative allocation commit, capacity exclusivity, allocation history, reallocation, cancellation, approval revalidation, execution start, idempotency, and authorization are verified for the current one-line Resource Planning model.

Production Line selection remains not implemented and is reserved for later phases.
