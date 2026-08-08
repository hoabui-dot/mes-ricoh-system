# Phase 8 — Resource Planning Alignment, Exact Allocation, and Revalidation

## Objective

Ensure exact resource planning remains consistent with the selected Production Line and does not undo or bypass the new line-selection contract.

## Required invariants

After line selection:

- candidate APIs must return resources from the selected line only,
- exact Workstation/Machine/Resource Assignment selection may be automatic proposal or manual planner choice,
- resource commit must reject candidates outside the selected line,
- reservation/capacity logic remains authoritative,
- reallocation must remain within the selected line unless an explicit line replan occurs,
- line replan before execution must rerun complete-line feasibility,
- approval and execution start must revalidate committed resources.

## Important separation

Keep these concepts separate:

```text
Automatic Line Selection
!=
Exact Resource Allocation
```

Line selection answers:

`Which complete Production Line can run this Work Order?`

Resource allocation answers:

`Which exact Workstation/Machine/worker/time-slot inside that selected line will execute each operation?`

Do not merge them into one opaque step.

## Revalidation rules

Before approval/start, detect changes such as:

- Workstation inactive,
- Machine Unit inactive/down when blocking,
- assignment expired/inactive,
- capacity/reservation conflict,
- candidate no longer in selected line scope.

Follow existing lifecycle semantics for replan/hold/reject.

## Tests

Prove:

1. selected Backup line returns only Backup candidates,
2. committing a Primary resource after Backup is selected is rejected,
3. reallocation remains on selected line,
4. exact resource degradation is detected before approval,
5. approval cannot bypass invalid committed resources,
6. execution start cannot bypass invalid committed resources,
7. allowed pre-start line replan reruns selection,
8. no automatic post-start cross-line switch.

## Deliverable

Create:

`AI_document/two-line/PHASE_8_RESOURCE_PLANNING_ALIGNMENT_REPORT.md`

## Phase gate

PASS when line selection and exact allocation are consistent across planning, commit, approval, and start-execution lifecycle.
