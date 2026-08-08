# Phase 6 — Side-Effect-Free Complete-Line Feasibility Evaluator

## Objective

Build or refactor a reusable backend feasibility evaluator that determines whether an eligible Production Line can execute an entire Work Order without reserving resources.

## Key requirement

Do not duplicate candidate logic. Reuse the same authoritative constraints used by resource planning wherever possible.

The evaluator must answer:

```text
For each mandatory routing operation:
Does this candidate line have at least one feasible execution candidate?
```

## Evaluation flow

For each eligible line:

1. Resolve Work Order / Production Version / Routing snapshot.
2. Resolve the Work Centers applicable to the line.
3. Resolve line-scoped Resource Assignments/resources.
4. Generate candidate resources for each mandatory routing operation.
5. Apply approved blocking dimensions.
6. Count feasible candidates.
7. Persist/return structured diagnostics.
8. Produce final line status: `READY` or `BLOCKED`.

## Required candidate semantics

Example:

```text
OP20
WS-A / Machine-A -> INACTIVE
WS-B / Machine-B -> READY
```

Result:

```text
OP20 = READY
candidate_count = 1
```

Not:

```text
OP20 = BLOCKED because one machine is inactive
```

Only zero feasible candidates blocks the operation.

## No side effects

This evaluator must not:

- create reservations,
- commit resource allocations,
- mutate Work Order status merely by probing candidates,
- publish execution events as a side effect of evaluation.

## Diagnostics

Return enough evidence for backend tests and MES Console, including:

- operation code/name,
- work center mapping,
- total candidates considered,
- feasible candidate count,
- excluded candidate reasons,
- final blocker code when zero candidates remain.

Avoid returning massive internal payloads when a compact reason summary is sufficient.

## Tests

Cover at minimum:

- one failed candidate + one ready candidate => operation READY,
- all Workstations inactive => operation BLOCKED,
- all Machine Units unavailable => operation BLOCKED,
- expired assignment => excluded,
- capability mismatch => excluded,
- calendar unavailable => excluded when blocking,
- capacity exhausted => excluded when blocking,
- reservation conflict => excluded when blocking,
- resource outside line scope => never considered,
- every mandatory operation feasible => line READY,
- one mandatory operation blocked => line BLOCKED.

## Deliverable

Create:

`AI_document/two-line/PHASE_6_LINE_FEASIBILITY_REPORT.md`

## Phase gate

PASS when the evaluator can accurately determine complete-line feasibility and all focused tests pass without creating reservations.
