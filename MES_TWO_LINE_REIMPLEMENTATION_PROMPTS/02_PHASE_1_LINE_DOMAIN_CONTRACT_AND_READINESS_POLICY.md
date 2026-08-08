# Phase 1 — Line Domain Contract and Readiness Policy

## Objective

Turn the two-line business intent into an explicit backend contract before implementation.

## Required design decisions

Define and document:

### Production Line lifecycle

Use the current source where possible. If lifecycle is incomplete, design an additive model such as:

```text
DRAFT -> RELEASED -> RETIRED
```

Do not introduce states that are not needed.

### Whole-WO line selection invariant

A normal Work Order must lock to one line before exact resource commit.

### Complete-line feasibility rule

A line is feasible only when every mandatory routing operation has at least one feasible execution candidate inside that line scope.

### Alternative candidate semantics

One failed workstation/machine does not block an operation when another candidate remains feasible.

### Blocking policy per dimension

For each dimension, classify it as:

- structural blocking,
- runtime blocking,
- warning only,
- deferred to exact allocation,
- not applicable.

At minimum assess:

- line eligibility,
- Work Center coverage,
- Workstation status/effectivity,
- Resource Assignment status/effectivity,
- Machine Unit status/effectivity,
- machine operational status,
- capability/machine requirement,
- calendar/shift,
- production standard,
- capacity,
- reservation conflict,
- worker skill/labor.

### Fallback contract

Define deterministic line ordering from Production Version eligibility, e.g. Primary/Backup or priority order.

### Persisted diagnostic contract

Define the backend response/persistence required for each evaluated line:

- line id/code/name,
- role/priority,
- final status,
- per-operation result,
- candidate counts,
- blocker codes,
- machine/workstation/resource evidence,
- selected/fallback reason.

Do not expose infrastructure internals unnecessarily.

## Deliverable

Create:

`AI_document/two-line/PHASE_1_LINE_DOMAIN_CONTRACT.md`

Include API/domain examples and state transition diagrams.

## Implementation

Only make minimal type/enumeration/domain-contract changes required to support later phases. Avoid large behavior changes here.

## Tests

Add contract/unit tests for:

- one feasible candidate is enough,
- zero feasible candidates blocks an operation,
- one blocked mandatory operation blocks a line,
- Primary blocked leads to Backup evaluation contract,
- no line feasible leads to `RESOURCE_HOLD` contract.

## Phase gate

PASS when the rules are executable/testable and no ambiguity remains about what `READY`, `BLOCKED`, fallback, and `RESOURCE_HOLD` mean.
