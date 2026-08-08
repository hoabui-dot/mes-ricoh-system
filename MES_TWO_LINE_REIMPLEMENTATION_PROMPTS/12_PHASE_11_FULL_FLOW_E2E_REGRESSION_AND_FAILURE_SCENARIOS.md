# Phase 11 — Full-Flow E2E Regression and Failure Scenarios

## Objective

Verify the complete MES two-line lifecycle end-to-end after all implementation phases.

This phase is a release gate, not a documentation-only exercise.

## Required full flow

Run an end-to-end flow covering:

```text
Master Data
-> Production Line topology
-> Resource Scope
-> Line Release
-> Production Version Primary/Backup eligibility
-> Work Order creation
-> automatic line feasibility
-> Primary/Backup decision
-> exact resource planning
-> commit/reservation
-> revalidation
-> approval
-> start execution
-> execution state persistence/events
```

## Mandatory scenarios

### 1. Primary selected

All mandatory Primary operations have >= 1 feasible candidate.

Expected:

- Primary selected,
- no fallback reason,
- candidate APIs restricted to Primary.

### 2. One Primary machine inactive but alternative remains

Expected:

- Primary remains READY,
- inactive candidate excluded,
- remaining candidate selectable.

### 3. All machines/workstations for one Primary operation unavailable

Expected:

- Primary BLOCKED,
- Backup evaluated,
- Backup selected when complete.

### 4. Primary assignment expired

Expected:

- expired candidate excluded,
- fallback only when zero feasible candidates remain for a mandatory operation.

### 5. Capability mismatch

Expected according to approved blocking policy.

### 6. Calendar/shift unavailable

Expected according to approved blocking policy.

### 7. Capacity exhausted / reservation conflict

Expected according to approved blocking policy.

### 8. Primary and Backup both blocked

Expected:

- no selected line,
- `RESOURCE_HOLD`,
- clear persisted blocker diagnostics.

### 9. Cross-line commit attack

When Backup is selected, attempt to commit a Primary resource.

Expected: rejected.

### 10. Resource degrades before approval

Expected:

- revalidation fails or forces replan according to lifecycle contract,
- approval cannot bypass the failure.

### 11. Resource degrades before execution start

Expected:

- start blocked/replan required according to contract.

### 12. Resource fails after execution start

Expected:

- no silent automatic move to Backup,
- controlled hold/recovery path only.

## Regression scope

Run all maintained tests for:

- MES Master Data,
- MES Execution,
- MES Console,
- two-line API/integration tests,
- existing resource-planning negative scenarios,
- approval/start guards,
- seed verification.

Do not skip existing tests merely because new behavior changed them. Update tests only when the old expectation is proven obsolete by the approved new contract.

## UI verification

Verify MES Console shows:

- line configuration,
- Work Center membership,
- resource scope,
- line readiness,
- PV Primary/Backup eligibility,
- WO selected line,
- fallback reason,
- `RESOURCE_HOLD`,
- evaluated-line diagnostics,
- exact resource candidate restriction.

## Deliverable

Create:

`AI_document/two-line/PHASE_11_FULL_FLOW_E2E_REPORT.md`

Include:

- environment,
- seed/reset command,
- exact test commands,
- scenario-by-scenario result,
- relevant API evidence,
- DB/event evidence where appropriate,
- UI evidence references,
- failures fixed during this phase,
- final result.

## Phase gate

PASS only when every mandatory scenario passes with no skipped critical test.
