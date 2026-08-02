# Phase 11 - MES Two-Line Final Readiness Report

Date: 2026-08-02

Status: PASSED_FOR_IMPLEMENTED_SCOPE

Go-live recommendation: CONDITIONAL_GO for controlled MES Resource Planning and two-line Work Order planning after business acceptance of the listed limitations. Not a blanket production go-live for unimplemented future capabilities.

## 1. Executive Summary

The MES codebase is ready for the implemented two-line Resource Planning scope:

- one Work Order selects exactly one Production Line;
- all mandatory operations are assigned to the selected line;
- primary line is evaluated first;
- complete backup line is selected when primary is blocked;
- no feasible line puts the Work Order on `ResourceHold`;
- mixed-line allocation/reservation persistence is rejected by backend validation;
- selected line and Work Order planning snapshots are immutable unless an audited pre-start replan is executed;
- post-start line transfer is rejected;
- deterministic reset/seed and repeatable verification exist.

The final evidence includes API, database, browser, concurrency, reset/seed, and regression tests through Phase 10.

## 2. Final Architecture

The final architecture keeps service ownership boundaries intact:

- MES Master Data owns Production Lines, Work Centers, Resource Assignments, capabilities, standards, calendars, Routing, MBOM, Production Version, and Production Version line eligibility.
- MES Execution owns Work Orders, selected-line snapshots, operation line assignment, runtime resource allocations, capacity reservations, line-selection audit, and execution state.
- Execution consumes Master Data through APIs/events/projections, not cross-service database reads in source.
- Browser UI reads backend state and does not calculate readiness independently.

Primary source files:

- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
- `services/mes-master-data-service/src/infrastructure/db/migrate.ts`
- `services/mes-execution-service/internal/application/usecase/line_selection.go`
- `services/mes-execution-service/internal/application/usecase/create_work_order.go`
- `services/mes-execution-service/internal/application/usecase/resource_allocation.go`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `services/mes-console/src/routes/work-orders/WODetailScreen.tsx`

## 3. Final Domain Model

Final implemented concepts remain separate:

- Routing Operation: process step.
- Work Center: logical capability/capacity node.
- Production Line: selected execution scope.
- Workstation: operator execution point.
- Machine Definition and Physical Machine Unit: equipment identity/readiness.
- Resource Assignment: effective master-data availability.
- Work Order Resource Allocation: runtime commitment.
- Capacity Reservation: execution-owned conflict prevention.

The final two-line invariant is implemented as Production Version line eligibility plus line-scoped Work Centers and runtime selected-line snapshots.

## 4. Database Migrations

Master Data migration:

- `md_production_line`
- `md_production_line_work_center`
- `md_production_line_resource_scope`
- `md_production_version_line_eligibility`
- validation triggers for site/area/scope/capability consistency

Execution migration:

- `rm_production_line`
- `rm_production_line_work_center`
- `rm_production_version_line_eligibility`
- `wo_header.selected_production_line_id`
- `wo_operation.production_line_id`
- `wo_resource_allocation.planned_production_line_id`
- `wo_capacity_reservation.production_line_id`
- `wo_line_selection_audit`
- `fn_validate_wo_line_consistency`

Evidence:

- `services/mes-master-data-service/src/infrastructure/db/migrate.ts`
- `services/mes-execution-service/migrations/000023_production_line_selection.up.sql`

## 5. Backward Compatibility

Backward compatibility is preserved for existing one-line Work Order and Resource Planning flows:

- legacy Work Orders can continue without line selection until they are replanned or recreated through the new flow;
- candidate APIs remain advisory;
- commit/replan paths revalidate;
- legacy resource capability/workstation operation surfaces remain compatibility surfaces, not new Routing authority.

Verified by maintained Phase 1, Phase 2, Phase 3, Phase 4, Phase 6, Phase 9, and Phase 10 regression runs.

## 6. Current Resource Planning Flow

Final implemented flow:

1. Create Work Order from released Production Version.
2. Snapshot product definition, routing, MBOM, planning values, and selected Production Line.
3. Run Compute & Check.
4. Load resource candidates from backend readiness APIs.
5. Commit selected candidates.
6. Persist resource allocation and capacity reservation.
7. Revalidate allocations.
8. Approve under strict resource-allocation policy.

Evidence:

- `scripts/test-mes-resource-planning-flow.mjs`
- `scripts/test-mes-resource-planning-full-flow.mjs`
- `scripts/mes-phase10-reset-seed-verify.mjs`
- `services/mes-execution-service/internal/application/usecase/resource_allocation.go`

## 7. Two-Line Selection Flow

Final implemented flow:

1. Query released/effective line eligibility for the Production Version.
2. Evaluate primary line before backup.
3. For each line, verify every mandatory operation has a feasible line Work Center.
4. Validate capability, production standard, calendar, and reservation constraints.
5. Select first complete Ready line.
6. Persist selected line on Work Order header and operations.
7. Persist evaluated-line results and fallback/resource-hold reason.

Evidence:

- `services/mes-execution-service/internal/application/usecase/line_selection.go`
- `scripts/test-mes-two-line-resource-planning-phase7.mjs`

## 8. Primary/Backup Fallback

Verified fallback conditions:

- primary capacity full -> backup selected;
- primary calendar unavailable -> backup selected;
- primary missing operation capability -> backup selected;
- primary maintenance-style resource outage -> backup selected;
- both lines blocked -> `ResourceHold`;
- first Work Order consumes primary capacity and second falls back deterministically.

Final Phase 9 regression result: 19 declared, 19 passed, 0 failed, 0 skipped.

## 9. Work Order Snapshots

Implemented snapshot behavior:

- Work Order stores Production Version, item revision, MBOM, Routing, planning values, selected line, and per-operation line/work-center assignment.
- Existing Work Order selected-line snapshot is not rewritten by later eligibility changes.
- New Work Order uses new eligibility.
- Audited replan is required to change line before start.

Evidence:

- `services/mes-execution-service/internal/application/usecase/create_work_order.go`
- `services/mes-execution-service/internal/application/usecase/line_selection.go`
- Phase 4 and Phase 9 reports.

## 10. Resource Allocation and Reservations

Implemented:

- resource allocation persists `planned_production_line_id`;
- capacity reservation persists `production_line_id`;
- backend trigger rejects mixed-line allocation and mixed-line reservation;
- ResourceHold blocks candidate/commit flow;
- replan supersedes old allocations/reservations before applying new line;
- idempotent allocation replay is verified.

Evidence:

- `services/mes-execution-service/internal/application/usecase/resource_allocation.go`
- `services/mes-execution-service/migrations/000023_production_line_selection.up.sql`
- `scripts/test-mes-two-line-resource-planning-phase7.mjs`

## 11. API Coverage

Maintained API coverage passed:

| Area | Result |
| --- | --- |
| Machine flow | PASS, 15 passed |
| Resource Planning flow | PASS |
| Phase 1 domain correctness | PASS, 20 passed |
| Phase 2 full API flow | PASS_FOR_PHASE_2 |
| Phase 4 product definition/snapshot | PASS |
| Phase 6 two-line master data | PASS, 9 passed |
| Phase 9 full two-line regression | PASS, 19 passed |
| Phase 10 reset/seed/verify | PASS |

## 12. Browser E2E Coverage

Browser coverage passed:

| Suite | Result |
| --- | --- |
| Console typecheck | PASS |
| Console build | PASS, non-blocking Vite chunk warning |
| Resource Planning Phase 3 | PASS, 6 passed |
| Product Definition Phase 4 | PASS, 1 passed |
| Production Lines Phase 6 | PASS, 1 passed |
| Two-Line Console Phase 8 | PASS, 3 passed |
| Resource Planning aggregate | PASS, 16 passed |
| Machine aggregate | PASS, 2 passed |

UI evidence:

- `services/mes-console/src/routes/work-orders/WODetailScreen.tsx`
- `services/mes-console/src/routes/work-orders/WOCreateScreen.tsx`
- `services/mes-console/src/routes/master-data/ResourceFoundationScreen.tsx`
- `e2e/resource-planning/phase8-two-line-console.spec.ts`

## 13. Concurrency Coverage

Verified:

- concurrent line replan rejects stale row version;
- two Work Orders compete for primary capacity deterministically;
- one succeeds on primary and another falls back or holds according to backup feasibility;
- no mixed-line partial commit is accepted;
- idempotent retry creates one Work Order, one selection decision, and one `WOCreated` event.

Evidence:

- `scripts/test-mes-two-line-resource-planning-phase7.mjs`
- `e2e/resource-planning/concurrency/resource-planning-concurrency.spec.ts`

## 14. Seed/Reset Verification

Phase 10 implemented and verified:

- `npm run reset:seed:mes`
- `npm run seed:mes:won-seal-tech`
- `npm run verify:mes:seed`
- `npm run test:mes:two-line-flow`

Final artifact:

- `artifacts/mes-seed-verification-20260802.json`

Artifact final status:

- `PASS`
- mode: `--two-line-flow`
- Production Version: `WST-SEED-PV-SEAL-ASM-01`
- committed operation allocations: 4
- verification cleanup remaining Work Orders: 0
- Phase 9 regression exit code: 0

## 15. Security and Authorization

Implemented and verified:

- backend validates authorization for resource allocation;
- viewer-role negative test rejects unauthorized commit with `RESOURCE_ALLOCATION_FORBIDDEN`;
- line replan and allocation mutation paths require resource-planning mutation permissions;
- strict approval policy requires committed valid allocations.

Remaining boundary:

- full role matrix and full Kong bearer enforcement parity are not proven for every MES endpoint.

## 16. Known Limitations

Known limitations are documented in `AI_document/19_KNOWN_LIMITATIONS.md`.

Current relevant limitations:

- `MES_DEMO_PRINT_ON_APPROVAL=true` is demo-only and not production strict approval behavior.
- `stage-materials` is compatibility/manual recovery, not proof of final automatic WMS material lifecycle.
- legacy E2E WO seed can delegate to WMS and is excluded from default Phase 10 MES-owned reset contract.
- physical print verification depends on external printer/adapter/Kafka/CUPS runtime.
- full Viewer/Operator/Admin role matrix is not exhaustively proven.
- final MES/WMS material request parent/line model remains a future migration area.
- complete event schema coverage remains future work.

## 17. Not Implemented Features

The following must not be described as implemented:

| Feature | Final result |
| --- | --- |
| Automatic labor assignment | NOT_IMPLEMENTED |
| Check-in availability sessions | NOT_IMPLEMENTED |
| Equipment Authorization | NOT_IMPLEMENTED |
| IIoT Production Context | NOT_IMPLEMENTED |
| Partial Work Order line transfer after start | NOT_IMPLEMENTED |
| Execution Segment for line transfer | NOT_IMPLEMENTED |
| Child Work Order fallback | NOT_IMPLEMENTED |
| Full WMS/QMS destructive reset contract | NOT_IMPLEMENTED |

## 18. Operational Runbook

Recommended local verification sequence:

```bash
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml up -d --build mes-master-data-service mes-execution-service
npm run reset:seed:mes
npm run verify:mes:seed
npm run test:mes:two-line-flow
npm run test:mes:two-line-full-regression:phase9
npm run test:mes:resource-planning-flow
npm run test:mes:machine-flow
```

For browser regression, start MES Console and run:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
npm run test:e2e:resource-planning:all
npm run test:e2e:machine:all
```

Operational cautions:

- run destructive seed commands only in disposable environments;
- require `ALLOW_DESTRUCTIVE_SEED=true`;
- verify target DB hosts/databases before mutation;
- review generated `artifacts/mes-seed-verification-YYYYMMDD.json`;
- do not include WMS/QMS destructive reset without separate approved contracts.

## 19. Rollback Strategy

Code rollback:

- revert source changes through normal Git release rollback.
- redeploy previous service images.

Database recovery:

- migrations are forward-only.
- do not edit applied migrations.
- for local disposable environments, rerun reset/seed.
- for persistent environments, create forward recovery migration to deactivate/end effective rows or repair projections.

Operational recovery:

- stop mutating clients;
- preserve audit/outbox tables;
- identify affected Work Orders by exact IDs;
- cancel/supersede allocations and reservations through supported APIs or forward repair scripts;
- do not delete historical production rows.

## 20. Go-Live Recommendation

Recommendation: CONDITIONAL_GO.

The MES codebase is ready for controlled use of the implemented Resource Planning and two-line Work Order planning scope after business acceptance of known limitations.

It is not a full enterprise production go-live for labor auto-assignment, post-start line transfer, Execution Segment/Child Work Order fallback, IIoT production context, full WMS/QMS lifecycle reset, or physical printer proof.

## Requirement Traceability Matrix

| Requirement ID | Source document | Implementation file | Migration | API | UI screen | API test | E2E test | Final result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-001 Resource model separation | Guardrails §5 | `line_selection.go`, `resource_allocation.go` | `000023_production_line_selection.up.sql` | Resource allocation APIs | WO detail | Phase 1, Phase 9 | Phase 3 aggregate | PASSED |
| R-002 Production Line master data | Phase 6 | `master-data.router.ts` | `migrate.ts` 0062 | `/production-lines` | Resource foundation | `test-mes-two-line-master-data-phase6.mjs` | `phase6-production-lines.spec.ts` | PASSED |
| R-003 Production Version line eligibility | Phase 6 | `master-data.router.ts` | `migrate.ts` 0062 | `/production-versions/:id/line-eligibility` | Resource foundation / WO create | Phase 6 | Phase 6/8 | PASSED |
| R-004 One WO selects exactly one line | Guardrails §6 | `line_selection.go`, `create_work_order.go` | `000023...` | `/work-orders`, `/line-replan` | WO detail | Phase 7/9 | Phase 8 | PASSED |
| R-005 All mandatory ops same line | Guardrails §6 | `line_selection.go` | `fn_validate_wo_line_consistency` | `/work-orders/:id` | WO detail | Phase 7/9 | Phase 8 | PASSED |
| R-006 Primary evaluated first | Phase 7 | `line_selection.go` | `rm_production_version_line_eligibility` | create/replan | WO detail evaluated lines | Phase 7/9 | Phase 8 | PASSED |
| R-007 Backup only complete-line feasible | Phase 7 | `line_selection.go` | `rm_production_line_work_center` | create/replan | WO detail | Phase 7/9 | Phase 8 | PASSED |
| R-008 No feasible line -> ResourceHold | Phase 7 | `line_selection.go`, `resource_allocation.go` | `wo_header.line_selection_status` | create/candidates | WO detail | Phase 7/9 | Phase 8 | PASSED |
| R-009 Mixed-line backend reject | Guardrails §6 | DB trigger | `fn_validate_wo_line_consistency` | allocation commit | N/A | Phase 7/9 | Phase 3 aggregate indirectly | PASSED |
| R-010 Snapshot immutable | Phase 4/7 | `create_work_order.go`, `line_selection.go` | WO snapshot columns | `/work-orders/:id` | WO detail | Phase 4/9 | Phase 4 | PASSED |
| R-011 Pre-start audited replan | Phase 7/8 | `line_selection.go`, `router.go` | `wo_line_selection_audit` | `/work-orders/:id/line-replan` | WO detail replan modal | Phase 7/9 | Phase 8 | PASSED |
| R-012 Post-start line transfer rejected | Guardrails §6 | `line_selection.go` | status/audit tables | `/line-replan` | WO detail guard | Phase 7/9 | Phase 8 | PASSED |
| R-013 Resource candidates advisory | Guardrails §10 | `resource_allocation.go` | allocation/reservation tables | `/resource-candidates`, `/resource-allocation` | WO detail candidates | Phase 2/3/9/10 | Phase 3 aggregate | PASSED |
| R-014 Commit revalidates | Guardrails §10 | `resource_allocation.go` | `wo_resource_allocation` | `/resource-allocation`, `/revalidate` | WO detail | Phase 2/10 | Phase 3 aggregate | PASSED |
| R-015 Capacity reservations | Phase 2/7 | `resource_allocation.go` | `wo_capacity_reservation` | allocation commit | WO detail | Phase 2/9/10 | concurrency spec | PASSED |
| R-016 Idempotent mutation | Guardrails §10 | workflow/allocation use cases | idempotency tables | workflow/allocation APIs | N/A | Phase 2/9 | Phase 3 | PASSED |
| R-017 Browser line UX | Phase 8 | `WODetailScreen.tsx`, i18n | N/A | WO APIs | WO detail | Phase 9 API | Phase 8 | PASSED |
| R-018 Browser resource planning persistence | Phase 3/9 | `WODetailScreen.tsx` | allocation tables | allocation APIs | WO detail | Phase 2/9 | resource-planning aggregate | PASSED |
| R-019 Authorization | Guardrails §10 | `router.go` | N/A | allocation/replan/approve | WO detail | Phase 3 negative API | resource-planning authorization | PASSED |
| R-020 Reset/seed safety | Phase 10 | `mes-phase10-reset-seed-verify.mjs` | N/A | create/replan/allocation/approve | N/A | Phase 10 commands | N/A | PASSED |
| R-021 Exact cleanup | Guardrails §14 | reset/seed/test scripts | N/A | N/A | N/A | Phase 2/9/10 | E2E cleanup logs | PASSED |
| R-022 Automatic labor assignment | Phase 11 warning | none | none | none | none | none | none | NOT_IMPLEMENTED |
| R-023 Check-in availability sessions | Phase 11 warning | none | none | none | none | none | none | NOT_IMPLEMENTED |
| R-024 Equipment Authorization | Phase 11 warning | none | none | none | none | none | none | NOT_IMPLEMENTED |
| R-025 IIoT Production Context | Phase 11 warning | none | none | none | none | none | none | NOT_IMPLEMENTED |
| R-026 Partial post-start line transfer | Phase 11 warning | explicit rejection in `line_selection.go` | N/A | `/line-replan` | guarded | Phase 7/9 | Phase 8 | NOT_IMPLEMENTED |
| R-027 Execution Segment / Child WO fallback | Phase 11 warning | none | none | none | none | none | none | NOT_IMPLEMENTED |

## Final Completion Gate

Implemented MES Resource Planning and two-line planning requirements: PASSED.

Mandatory reset/seed and verification requirements: PASSED.

Remaining limitations and not-implemented features are explicitly listed. The overall project can be treated as complete for the implemented scope only after the business accepts those limitations.
