# MES Resource Planning Phase 2 Full API Verification

Date: 2026-08-01
Phase: 2
Guardrail source: `process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md`
Phase source: `process-expand/mes-enterprise/docs/Phase-2-—-Full-API-Flow-Verification.md`
Result: `PASS_FOR_PHASE_2`

## Scope

Phase 2 verifies the current MES Resource Planning API flow end to end for a single Work Order created from a released Production Version, prepared with committed resource allocations for every operation, approved under strict resource policy, started for execution, persisted through allocation/reservation/audit/outbox tables, then cleaned up by exact Work Order ID.

This phase does not introduce or assume any two-line model.

## Implemented Artifacts

- Script: `scripts/test-mes-resource-planning-full-flow.mjs`
- NPM command: `npm run test:mes:resource-planning-full-flow:phase2`
- Machine-readable output: `artifacts/mes-resource-planning-full-flow/PHASE2-RP-1785580550354-M2B4C/phase2-full-flow.json`
- Markdown run output: `artifacts/mes-resource-planning-full-flow/PHASE2-RP-1785580550354-M2B4C/phase2-full-flow.md`
- Negative matrix output: `artifacts/mes-resource-planning-full-flow/PHASE2-RP-1785580550354-M2B4C/phase1-negative-matrix.json`

## Code Changes

- Added Phase 2 full-flow API runner with:
  - explicit local/test/staging mutation guard;
  - local database host guard;
  - deterministic run namespace;
  - trusted-gateway identity header verification;
  - Production Version/shift reuse through master-data APIs;
  - Work Order creation through async creation workflow;
  - compute-check, candidate retrieval, allocation commit, snapshot refresh, revalidation, strict approval, start execution, persistence verification, and exact cleanup;
  - local disposable print-station readiness repair for the exact allocated print workstation, restored after cleanup;
  - machine-readable JSON and Markdown artifacts.
- Extended the Phase 1 domain script with optional JSON artifact output via `MES_RESOURCE_PLANNING_PHASE1_OUTPUT`.
- Fixed strict approval policy enforcement in `ApproveWorkOrder`: the use case no longer re-enables `MES_DEMO_PRINT_ON_APPROVAL` after the router has calculated a strict request. The Phase 2 script asserts `approval_mode=STANDARD`, `approval_policy=Strict`, and `print_triggered_on_approval=false`.

## Full API Flow Evidence

Run ID: `PHASE2-RP-1785580550354-M2B4C`
Target date: `2026-08-03`
Production Version: `PV-20260801-0006`
Disposable Work Order: `WO-20260801-0075`

Passed steps:

1. Authenticated through supported trusted-gateway identity headers.
2. Reused deterministic released master data chain: Site, Work Center, Workstation, Machine Definition, Physical Machine Unit, Machine Requirement, Resource Assignment, Calendar/Shift, Capability, Production Standard, Item Revision, MBOM, Routing, Routing Operations, and Production Version.
3. Created Work Order from `production_version_id` through async creation workflow.
4. Loaded Work Order routing snapshot.
5. Ran Compute and Check.
6. Retrieved candidates and committed one Ready candidate for all 3 operations.
7. Repaired disposable local print-station readiness for the exact allocated print workstation.
8. Refreshed snapshots and revalidated all allocations.
9. Approved Work Order with strict resource-allocation policy.
10. Started execution and moved the Work Order to `InProgress`.
11. Verified allocation, reservation, audit, and outbox persistence.
12. Cleaned exact generated Work Order IDs and disposable fixtures.
13. Ran the required negative scenario matrix.

## Persistence Evidence

- Committed allocations: `3`
- Primary machine-unit snapshots: `3`
- Committed reservations: `9`
- Allocation audit rows: `3`
- Outbox events:
  - `MES.Execution.WOCreated.v1`: `1`
  - `MES.Execution.WOResourceAllocated.v1`: `3`
  - `MES.Execution.WOApproved.v1`: `1`
  - `MES.Execution.OperationDispatchQueued.v1`: `1`
- Start execution result: `status=InProgress`, `queued_operations=1`
- Cleanup result: deleted Work Orders `1`, remaining target rows `0`

## Required Scenario Matrix

The Phase 2 runner invokes the maintained Phase 1 domain negative suite and writes its JSON result. Run `PHASE1-RP-1785580554647-U6X0D` executed 20 scenarios with `20 passed`, `0 failed`, and `0 skipped`.

Required Phase 2 matrix coverage:

| Requirement | Evidence |
| --- | --- |
| Normal Ready flow | Phase 2 full positive API flow passed |
| Capacity conflict | `simultaneous allocation conflict rejects second commit` passed |
| Stale assignment before commit | `stale candidate is rejected at commit` passed |
| Machine maintenance before approval | `approval after resource state changed fails revalidation` passed |
| Missing calendar | `unavailable Resource Calendar blocks readiness` passed |
| Missing standard | `missing Production Standard blocks readiness` passed |
| Cancellation and replan | `allocation cancellation removes active reservations without deleting audit history` and `reallocation supersedes history and cancels old reservations` passed |
| Execution start guard | `execution start without valid allocation is rejected` passed |
| Idempotent replay | `idempotent replay returns the same allocation response` and `reused idempotency key with different request fails` passed |
| Unauthorized user | `unauthorized role cannot commit allocation` passed |

## Verification Commands

- `node --check scripts/test-mes-resource-planning-full-flow.mjs`
- `node --check scripts/test-mes-resource-planning-domain-phase1.mjs`
- `docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml build mes-execution-service`
- `docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml up -d --no-build --force-recreate mes-execution-service`
- `npm run test:mes:resource-planning-full-flow:phase2`

## Gate

Phase 2 gate is passed.

No skipped tests are counted as passed. The positive API flow succeeded, all required negative scenarios returned expected stable failures, strict approval policy is enforced, and exact generated Work Order cleanup verified zero remaining target rows.
