# Global Execution Rules — MES Two-Line Primary/Backup Reimplementation

## Mission

Execute the complete phased reimplementation of the MES two-line Primary/Backup resource-lane flow in `https://github.com/hoabui-dot/mes-ricoh-system`.

The authoritative behavior is the current source code plus the verified business intent in `WO-2-LINE.md`. Never invent unsupported APIs, tables, states, or UI behavior. When the document and code disagree, inspect the source and record the discrepancy before changing behavior.

## Non-negotiable architectural rules

1. Preserve service boundaries and database-per-service isolation.
2. Never read another service's database directly.
3. Preserve existing event/outbox patterns and idempotency guarantees.
4. Use additive migrations only. Never rewrite historical migrations that may already have been applied.
5. Backend remains authoritative for eligibility, readiness, line feasibility, selection, fallback, resource candidate validation, reservation, approval, and execution guards.
6. Frontend must not reimplement backend readiness logic.
7. Preserve auditability and historical snapshots.
8. Do not use raw UUIDs as primary operator-facing labels when a business code/name exists.
9. Preserve localization conventions and existing MES Console shared components.
10. Do not remove routes, tables, APIs, or pages without proving all consumers and providing a migration/redirect path where required.

## Core business invariants

### Whole-Work-Order line lock

A Work Order must select exactly one complete Production Line for normal execution.

Forbidden behavior:

```text
OP10 -> LINE-1
OP20 -> LINE-2
OP30 -> LINE-1
```

Expected behavior:

```text
WO -> selected_line_id = LINE-1
all execution candidates -> LINE-1 scope only
```

or:

```text
WO -> selected_line_id = LINE-2
all execution candidates -> LINE-2 scope only
```

### Primary/Backup semantics

A Primary line is considered feasible only when every mandatory routing operation has at least one feasible execution candidate within the Primary line scope.

A single inactive workstation or machine must not block the line if another valid candidate exists for that operation.

If at least one mandatory operation has zero feasible candidates, the Primary line is blocked and the Backup line must be evaluated automatically.

If all eligible lines are blocked, the Work Order must enter `RESOURCE_HOLD` with persisted diagnostics.

### Line feasibility is side-effect-free

Line feasibility evaluation must not reserve or commit resources. It may calculate candidate feasibility, but resource reservation/commit belongs to resource planning/allocation.

### No silent hot-switch after execution begins

Before execution lock/start, a failed Primary line may trigger automatic fallback/replan according to the approved workflow.

After a Work Order is in progress, do not silently move remaining operations to another line. Hold the operation/WO and require an explicit recovery, transfer, rework, or replan flow.

## Readiness dimensions

At minimum, inspect whether the existing source supports evaluating:

- Production Version line eligibility
- Work Center coverage
- Workstation active/effective state
- Resource Assignment active/effective state
- Machine Unit active/effective state
- Machine operational state when authoritative runtime data exists
- Capability / machine requirements
- Calendar / shift availability
- Production standard
- Capacity feasibility
- Reservation conflicts
- Worker skill/labor only if the approved business rule says labor is a blocking line-selection dimension

Do not add a blocking dimension merely because it exists in the model. Each blocking rule must be explicitly justified and tested.

## Continuous execution rule

Run every phase in order. Do not stop after producing code for one phase.

For every phase:

1. Inspect current source and relevant tests.
2. Write a concise implementation plan.
3. Implement the smallest correct change.
4. Run focused unit/integration tests.
5. Run affected service build/typecheck/lint.
6. Fix failures immediately.
7. Re-run tests until passing.
8. Record changed files, migrations, API contracts, tests, and known limitations in the phase report.
9. Only then continue to the next phase.

Do not proceed to the next phase with known failing tests in the current phase.

## Stuck rule

Only stop when genuinely blocked by something that cannot be resolved from the repository or local environment, such as:

- missing secret/credential that is required for the next verification step,
- unavailable external dependency with no local/mock path,
- contradictory business decisions that materially change schema/behavior,
- corrupt or missing source required for compilation,
- destructive production-only action that cannot be safely simulated.

When stuck, create:

`AI_document/TWO_LINE_STUCK_REPORT.md`

The report must include:

- exact phase,
- exact command/action that failed,
- exact error,
- investigation performed,
- files inspected,
- what was ruled out,
- smallest missing decision/access/dependency required,
- safe next action.

Do not create a stuck report for ordinary build errors, test failures, type errors, seed defects, or migration defects. Fix those and continue.

## Required phase reports

After each phase create:

`AI_document/two-line/PHASE_<N>_REPORT.md`

Each report must contain:

- objective,
- baseline findings,
- implementation summary,
- files changed,
- schema/API changes,
- tests added/updated,
- commands executed,
- test/build results,
- remaining risks,
- phase gate: `PASS` or `FAIL`.

## Final verification rule

The project is not complete until Phase 11 full-flow regression and Phase 12 final audit both pass.

A successful final result must prove at least these canonical scenarios:

1. Primary line selected when fully feasible.
2. Primary retains selection when one resource fails but another feasible candidate remains.
3. Backup line selected when Primary has zero candidates for one mandatory operation.
4. `RESOURCE_HOLD` when both Primary and Backup are blocked.
5. Exact resource candidates are restricted to the selected line.
6. Attempting to commit a resource from the non-selected line is rejected.
7. Revalidation detects resource degradation before approval/start.
8. Approval/start cannot bypass invalid committed resources.
9. No automatic cross-line hot-switch after execution starts.
10. MES Console visibly explains why each line passed or failed without duplicating backend logic.
