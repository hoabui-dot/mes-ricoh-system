# MES Resource Planning into Work Order Allocation

Date: 2026-07-24
Process source: `process-fix/Phase-3—Integrate-Resource-Planning-into-Work-Order-Allocation.md`

## Root-cause audit

Before this phase, `wo_operation` stored the routing operation UUID, logical Work Center, and
planned timestamps, but it had no execution-owned Workstation/Equipment/Shift allocation history,
capacity occupancy, immutable planning snapshot, idempotency record, or allocation audit trail.
The approval handler only checked Production Version freshness and could release a Work Order
without a persisted resource plan. Phase 2 readiness existed only in master-data and was not called
from allocation or release.

## Implementation

Migration `000010_resource_allocations.up.sql` adds:

- `wo_resource_allocation`: one current allocation plus superseded history per Work Order operation,
  compact validation snapshot, lifecycle/status, warning codes, references, row version, and actor.
- `wo_capacity_reservation`: execution-owned occupancy for Equipment, Workstation, and Work Center,
  with active-window indexes and cancellation state.
- `wo_resource_allocation_audit`: business audit records for allocate/reallocate and validation facts.
- `wo_resource_allocation_idempotency`: request hash and response replay for safe retries.
- `wo_operation.routing_operation_id`: preserves the master-data Routing Operation identity needed
  to call the Phase 2 readiness contract without treating Equipment as Routing master data.

`ResourcePlanningClient` calls `POST /api/mes/master-data/resource-planning/readiness` through the
shared circuit breaker with a bounded seven-second timeout. No cross-service database query was
added. `AllocationService` implements candidate retrieval, candidate revalidation, atomic allocation,
reservation overlap checks under a serializable transaction and resource advisory lock, idempotency,
supersession, audit, outbox events, and Work Order revalidation.

New execution endpoints:

- `GET /api/mes/execution/work-orders/:id/operations/:opId/resource-candidates`
- `POST /api/mes/execution/work-orders/:id/operations/:opId/resource-allocation`
- `POST /api/mes/execution/work-orders/:id/operations/:opId/reallocate`
- `DELETE /api/mes/execution/work-orders/:id/operations/:opId/resource-allocation`
- `POST /api/mes/execution/work-orders/:id/resource-allocations/revalidate`

Allocation mutations re-call readiness and never trust a prior candidate response. Equipment,
Workstation, and Work Center overlapping active reservations are rejected with
`RESOURCE_CAPACITY_CONFLICT`. Historical allocation rows are superseded/cancelled, never overwritten.
Approval now calls Work Order allocation revalidation first and blocks release if any operation is
missing a valid committed allocation or has become stale.

The Work Order detail API exposes allocation status, validation status, planned resource IDs/times,
shift, and warning codes per operation. The MES Console Work Order detail page adds a translated
Resource Planning section, candidate cards, capacity/conflict indicators, and an explicit select-and-
commit action. It displays business operation/resource names and codes, not UUIDs.

## Lifecycle and policy decisions

The current mutation endpoint validates and commits a selected allocation atomically. Reallocation
requires a change reason and creates a new allocation plus reservation. Historical Work Orders are not
backfilled. Existing Released demo data therefore remains historically unchanged and is expected to
fail the new release revalidation until a planner supplies allocations through the new workflow.

Calendar fallback and infinite-capacity policy remain owned by the Phase 2 readiness response; warning
codes are stored in the snapshot and surfaced in candidate cards. Employee capacity, autonomous
scheduling, operator assignment, actual equipment confirmation, telemetry, and OEE remain out of
scope for Phase 3.

## Verification

- MES execution image build: passed with `go build` in Docker.
- MES Console build: passed; only the existing Vite large-chunk advisory remains.
- MES master-data unit tests: 2 files, 3 tests passed.
- `git diff --check`: passed.
- MES execution container recreated and healthy on port `13030`.
- Migration log confirmed `000010_resource_allocations.up.sql` applied.
- Live database confirmed allocation, reservation, audit, and idempotency tables exist and are empty.
- Live Work Order detail response returned `row_version`, `shift_id`, and per-operation
  `resource_allocation` objects without UUIDs being rendered by the Console.
- Schema Registry retained the existing non-fatal WOCreated 409 compatibility warning.

## Remaining verification gap

The shared demo database contained only an already Released Work Order with no shift and no eligible
Draft fixture at verification time. Therefore a destructive end-to-end allocate/conflict/reallocate
scenario was not run against shared data. A dedicated isolated Phase 3 script/database fixture is
still required before claiming concurrency, release-success, stale-maintenance, and reallocation
integration coverage complete.
