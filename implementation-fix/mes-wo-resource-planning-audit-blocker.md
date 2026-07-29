# MES Work Order Resource Planning Audit Blocker

**Date:** 2026-07-27  
**Process:** `process-fix/Audit-and-Repair-Work-Order-Compute-&-Check,-Resource-Proposal,-and-Complete-MES-Seed-Data.md`  
**Status:** BLOCKED  
**Blocking code:** `COMPUTE_CHECK_HARD_CODED`  
**Secondary status:** `RESOURCE_PLANNING_SEED_INCOMPLETE`

## Stage

The audit stopped at Work Order Compute & Check. The process requires a hard
stop when Compute & Check is hard-coded, snapshot errors are hidden, or
resource readiness cannot be proven from real data.

No Work Order reset, cleanup, migration, or new seed was run after this
blocker was identified.

## Expected Behaviour

Compute & Check must use persisted Work Order production snapshots and
validated planning inputs. Missing or invalid required values must return a
structured blocker. Different quantities, standards, yields, efficiencies,
calendars, queue times, and move times must produce explainable results.

Resource Proposal must use effective site, shift, capability, assignment,
calendar, production-standard, and worker/skill data for every operation.
Missing dependencies must be `Blocked` or a structured dependency error.

## Actual Behaviour

File: `services/mes-execution-service/internal/application/usecase/compute_and_check.go`

The query reads nullable planning fields, ignores the `rows.Scan` error, and
then applies hard-coded defaults: setup `15.0`, cycle `45.0`, efficiency
`1.0`, base quantity `1.0`, and yield `1.0`. A NULL or failed scan can thus
produce a successful calculation with fabricated inputs.

The duration formula is calculated from those values. The calendar lookup only
checks for a matching row and appends a warning when none exists; it does not
make available minutes, availability status, planned-down status, or capacity
factor part of the calculation or blocking decision.

## Root Cause

Compute & Check is still a fallback/demo calculation instead of a strict
snapshot-driven calculation. SQL scan errors are discarded and missing values
are hidden by defaults.

The current seed also does not prove a complete resource-planning matrix for
each operation: capability, assignment, calendar, production-standard, shift,
and worker/skill coverage are not verified as one complete dataset.

## Backend Evidence

`compute_and_check.go` lines 21-75 query `wo_operation`, discard `rows.Scan`
errors, and apply the defaults. Lines 91-93 calculate duration from them.
Lines 99-106 only warn when no calendar window is found.

`services/mes-execution-service/internal/infrastructure/http/router.go` line
55 exposes `POST /api/mes/execution/work-orders/{id}/compute-check`. The handler
near lines 553-567 returns a successful calculation whenever the use case does
not return an error; missing snapshots are not distinguished from valid data.

`services/mes-execution-service/internal/application/usecase/resource_allocation.go`
calls master-data readiness before allocation.

`services/mes-execution-service/internal/infrastructure/client/resource_planning_client.go`
calls `POST /api/mes/master-data/resource-planning/readiness`. Any 5xx is
converted to a retryable `mes-master-data-service` dependency error. This
matches the observed message: `readiness failed: 500 Internal Server Error`.

`services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
queries assignments, capabilities, calendars, standards, and skills, but also
uses a 480-minute/capacity-factor-1 calendar fallback when no calendar exists.
That fallback cannot be production capacity evidence without an explicit
policy.

## Seed Evidence

Artifact:
`artifacts/mes-reset-seed-verify/2026-07-27T17-03-22-673Z/summary.json`

The cleanup summary records `resource_capabilities: 0`,
`production_standards: 3`, and `routing_operations: 3`. Production Version
readiness was true, but that only proves the item/revision/MBOM/routing/PV
relationship. It does not prove resource readiness or Compute & Check.

The existing `scripts/seed-mes-wo-complete-dataset.mjs` does not independently
verify a complete capability, assignment, calendar, standard, shift, and
worker/skill matrix for all seeded operations.

## Frontend Impact

`services/mes-console/src/routes/work-orders/WODetailScreen.tsx` calls the
Compute & Check and Resource Proposal APIs and displays their responses. It
does not authoritatively calculate duration or readiness, so it can display a
consistent-looking result based on invalid backend defaults.

The frontend was not changed because the root cause is backend calculation
and seed data completeness.

## Runtime Verification Status

No fresh Resource Proposal request was run after the blocker was identified.
The exact SQL exception behind the historical master-data 500 was not
reproduced in this audit run. The complete WO-to-physical-printer flow is not
verified by this process.

## Required Repair Before Continuing

1. Remove production-path hard-coded Compute & Check defaults.
2. Check every SQL scan and dependent query error.
3. Treat missing required snapshots as structured blockers.
4. Define and test the authoritative formula and source fields.
5. Make calendar availability, planned-down state, and capacity factor part of
   the calculation and blocking decision.
6. Return stable API contracts for missing snapshots and dependency failures.
7. Expand the existing `reset:seed:mes:wo` flow with complete capability,
   assignment, calendar, standard, shift, worker, and skill data.
8. Add tests proving quantity and planning-input changes alter results.
9. Prove missing planning data cannot return `Ready`.
10. Re-run the full audit before resetting or seeding the MES dataset.

## Stop-Policy Conclusion

The process requirement is not complete. It is blocked by
`COMPUTE_CHECK_HARD_CODED` and an incomplete resource-planning seed baseline.
No implementation or seed completion should be claimed until the backend
repairs and deterministic dataset verification pass.
