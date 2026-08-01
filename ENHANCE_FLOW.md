# MES Implementation Workload Process

Version: MVP Enterprise Roadmap
Last verified: 2026-07-31
Status: Active

This file is the current implementation workload and process overview. It is not a changelog. Historical incident details belong in the implementation reports linked below.

## System objective

Deliver a deterministic manufacturing flow:

```text
Item + Revision
  -> EBOM (engineering definition, optional production baseline)
  -> MBOM (authoritative manufacturing material definition)
  -> Routing (authoritative operation and Workstation definition)
  -> Released Production Version
  -> Work Order snapshot
  -> Compute & Check
  -> Resource candidate readiness
  -> Planner allocation
  -> Approval / release
  -> Execution
```

The Work Order executes only the frozen MBOM and Routing snapshots selected by `production_version_id`. EBOM is engineering-only and does not participate in material explosion, capacity, staging, execution, or readiness gates.

## Current implementation status

| Domain | Status | Verified state |
|---|---|---|
| Master Data foundation | Implemented | Factory hierarchy, Work Center, Workstation, machines, calendars, skills, standards, and Print Station APIs/UI are running. |
| Product definition | Implemented | Item Revision owns EBOM, MBOM, and Routing; released records follow lifecycle/effectivity rules. |
| Production Version | Implemented | Released configuration joins matching Item Revision, MBOM, Routing, site, and readiness dependencies. |
| Machine Flow | Implemented with remaining edge coverage | Machine Definition -> Physical Unit -> Requirement -> Resource Assignment -> readiness is browser verified. |
| Resource Planning | Implemented, browser coverage partial | Candidate resolution, capacity checks, allocation, idempotency, concurrency conflict, and numbering are runtime verified. |
| Work Order snapshots | Implemented | Production Version creates immutable operation, planning, material, routing, and resource context snapshots. |
| Execution | Existing and integrated | Start/confirm/print paths exist; dedicated full execution browser matrix remains incomplete. |
| MES-to-WMS material flow | In progress | Automatic requisition and operation-level readiness are being completed and verified. |
| Physical Print Station flow | Integrated | Kafka-based remote Printer Adapter and projection/Kiosk flow are deployed separately; full dashboard/physical coverage remains partial. |
| Quality | Future / partial | QMS exists but is outside the current MES planning completion gate. |
| APS / optimization | Out of scope | No scoring, optimization, or autonomous scheduling is introduced in the current workload. |

## Authoritative domain ownership

```text
Factory -> Shopfloor -> Production Area -> Work Center -> Workstation
Workstation -> Machine Requirements
Workstation -> effective md_resource_assignment rows
Equipment -> Physical Machine Units
Work Order Operation -> committed resource allocation snapshot
```

- `md_resource_assignment` is authoritative for effective Workstation-to-Equipment/Machine Unit assignment.
- Machine Requirements describe what a Workstation needs; they are not proof that a physical machine is assigned.
- Work Order Resource Allocation describes the actual resource committed to one operation and time window.
- Routing Operation owns the default Workstation used by the operation. Runtime allocation remains a separate planning decision.
- MBOM owns manufacturing material composition. Routing owns operation sequence and operation resources.
- Production Version is the authoritative selectable manufacturing configuration for Work Order creation.

## Current production process

1. Create or maintain Item and Item Revision with effective dates and base UOM.
2. Define optional engineering composition in EBOM.
3. Define manufacturing components in MBOM. UOM is derived from Item Revision and is view-only in MBOM.
4. Define Routing Operations with Operation, Work Center, Workstation, sequence, predecessor, scheduling, and timing rules.
5. Release MBOM and Routing only after validation succeeds.
6. Create/release a Production Version whose Item Revision ownership matches MBOM and Routing.
7. Create a Work Order using only the released Production Version, quantity, target date, and shift.
8. Work Order creation snapshots the selected configuration; later master-data changes do not rewrite the snapshot.
9. Compute & Check resolves operation candidates using Work Center, Workstation, Machine Requirements, effective assignments, equipment state, capability, calendar, shift, Production Standard, and worker readiness.
10. Planner selects and commits a Ready candidate per operation. Allocation uses idempotency, row-version checks, advisory locking, capacity reservations, and immutable snapshots.
11. Work Order approval requires current valid committed allocations in the strict flow. The temporary demo print-on-approval path is controlled separately by its explicit demo flag and must not be treated as the normal production rule.
12. Execution starts only when Work Order lifecycle, predecessor, resource snapshot, material policy, and Print Station requirements pass.

## Resource Planning workload

### Completed and verified

- Candidate Resolver API and Console Resource Planning UI.
- Ready and Blocked candidate presentation.
- Machine requirement, assignment, calendar, capability, standard, shift, and capacity checks.
- Commit allocation with Workstation, Equipment, Machine Group, primary Machine Unit, and supporting unit snapshots.
- Idempotent allocation replay and exact conflict response.
- PostgreSQL serialization conflict mapping to `RESOURCE_CAPACITY_CONFLICT` HTTP 409.
- Mutation authorization for `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, and `EXECUTIVE`.
- Sequential and concurrent Work Order business-code uniqueness checks.
- Exact-ID cleanup of Work Orders, operations, allocations, reservations, snapshots, workflows, and outbox references.

### Current verified E2E result

The latest full Resource Planning browser run has:

```text
Declared: 5
Executed: 4
Passed: 4
Failed: 0
Skipped: 1
```

The skipped test is Viewer authorization because dedicated Keycloak Viewer credentials are not configured. It is not counted as coverage.

### Remaining Resource Planning workload

- Provision Viewer, Operator, Admin, and Cross-Site Keycloak fixtures.
- Add browser cases for stale assignment, stale Workstation, maintenance/out-of-service units, pending identification, wrong machine definition, and capacity boundaries.
- Add cancellation and replan browser coverage.
- Add execution start guards for missing, cancelled, and committed allocations.
- Add logout/login persistence and reconnect state coverage.
- Add independent page objects/common auth fixtures after the domain fixtures stabilize.

## Machine Flow workload

Verified browser flow:

```text
Create Machine Definition
  -> Create Physical Units
  -> Reject duplicate serial
  -> Create Workstation Machine Requirement
  -> Resolve effective Resource Assignment
  -> Verify Ready
  -> End assignment
  -> Verify Blocked and assignment history
  -> Verify dependency-protected deletion
```

Latest Machine full browser run: `2 passed`, `0 failed`, `0 skipped`. Remaining edge cases are edit/deactivate/delete success, duplicate definition code/name, search/filter/sort, invalid effectivity, overlapping assignment, and full unit state transitions.

## E2E commands

```bash
npm run test:e2e:machine:smoke
npm run test:e2e:machine:all
npm run test:e2e:resource-planning:smoke
npm run test:e2e:resource-planning:all
npm run test:e2e:resource-planning:concurrency
npm run test:e2e:resource-planning:numbering
npm run test:e2e:all
npm run test:e2e:regression
npm run test:e2e:report
```

Mutation tests require runtime-only credentials and local database URLs for exact cleanup:

```bash
MES_E2E_USERNAME=plant.manager \
MES_E2E_PASSWORD='...' \
ALLOW_E2E_MUTATION=true \
MES_MASTER_DATA_DATABASE_URL=... \
MES_EXECUTION_DATABASE_URL=... \
npm run test:e2e:regression
```

Without credentials, tests explicitly skip rather than mutate or claim success.

## Reports and authoritative references

### Resource Planning AI/implementation report

The current focused Resource Planning E2E report is:

`implementation-fix/resource-planning-full-e2e-improvement-20260731.md`

It records the placeholder replacement, concurrency implementation, numbering test, authorization limitation, cleanup behavior, and latest test counts.

The broader enterprise browser audit/report is:

`implementation-fix/browser-e2e-final-report-20260731.md`

Coverage and inventory:

- `implementation-fix/e2e-audit-20260731.md`
- `docs/testing/browser-e2e-usecase-inventory.md`
- `docs/testing/browser-e2e-coverage-matrix.md`
- `docs/testing/mes-resource-planning-e2e-matrix.md`

## Next implementation priorities

1. Complete Resource Planning stale-state, cancellation/replan, execution, and authorization fixtures.
2. Complete MES-to-WMS automatic material requisition and operation-level readiness.
3. Complete strict Work Order execution-to-physical-print E2E with live Kafka/projection/Kiosk evidence.
4. Add CI execution with isolated databases and provisioned Keycloak roles.
5. Expand Machine and Resource Planning browser coverage to all mandatory inventory cases.

## Engineering constraints

- Do not bypass lifecycle, ownership, effectivity, readiness, or authorization rules to make tests pass.
- Do not use business codes for destructive cleanup; use exact IDs.
- Do not rewrite historical Work Order snapshots when master data changes.
- Do not duplicate EBOM into manufacturing material requirements.
- Do not use API-only verification as a replacement for browser behavior.
- Do not claim a suite is complete while mandatory tests are skipped or missing.
