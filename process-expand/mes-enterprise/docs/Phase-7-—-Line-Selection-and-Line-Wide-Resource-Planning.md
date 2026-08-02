# Phase 7 — Implement Production-Line Selection and Line-Wide Resource Planning

## Objective

Integrate Production Version Line Eligibility into Work Order creation and Resource Planning.

One Work Order must select one complete Production Line before per-operation allocations are committed.

## Required flow

### Work Order creation

When creating a Work Order:

1. Resolve the released/effective Production Version.
2. Load effective Production Version Line Eligibility.
3. Order eligible lines by:
   - primary first;
   - priority ascending;
   - deterministic tie breaker.
4. Create immutable product/process snapshots.
5. Evaluate complete-line feasibility.
6. Select exactly one Ready line.
7. Persist selected-line snapshot and selection reasons.
8. Restrict all operation planning to the selected line.
9. If no line is Ready, persist `RESOURCE_HOLD` with structured blockers.

### Complete-line evaluation

For every mandatory Routing Operation, evaluate inside the same Production Line:

- required Work Center capability;
- Work Center membership;
- candidate Workstations;
- Machine Requirements;
- effective Resource Assignments;
- Equipment and Machine Units;
- operational state;
- planning eligibility;
- Resource Calendar;
- Shift;
- Production Standard;
- resource capacity;
- overlapping reservations;
- labor feasibility if currently implemented;
- required print/IoT readiness only when strict policy owns that gate.

A line is Ready only when every mandatory operation is feasible on that line.

### Candidate restriction

After line selection:

- `GET resource-candidates` must return only candidates inside the selected line.
- allocation commit must reject resources from another line.
- approval must revalidate line consistency.
- execution start must reject mixed-line allocations.

### Fallback

When the primary line fails:

- store its blocking reasons;
- evaluate the backup line;
- select backup only if the complete backup line is Ready;
- expose a translated fallback warning in MES Console;
- preserve the selection decision in audit and snapshot.

### Line lock

Before Release:

- authorized users may rerun planning or change line according to policy.

After Release but before Start:

- only an explicit audited replan action may change line.

After execution has started:

- do not remap the Work Order in place.
- return an explicit error indicating that Execution Segment or Child Work Order handling is required.

## Required API changes

Implement or extend:

- Work Order creation response with line-selection state;
- line readiness endpoint;
- Compute & Check line evaluation;
- resource candidate filtering by selected line;
- audited replan/change-line action;
- structured fallback and RESOURCE_HOLD errors.

## Required persistence

Persist:

- selected line ID;
- code/name snapshot;
- selection mode;
- selection status;
- evaluated line results;
- selected reason;
- fallback reason;
- locked timestamp;
- row version;
- audit;
- outbox event where needed.

## Concurrency

- prevent concurrent line selection/replan races;
- use row version or serializable transaction where needed;
- preserve idempotency;
- reject stale request payloads.

## Required tests

API tests must cover:

- primary line Ready;
- primary blocked, backup Ready;
- both blocked;
- primary capacity full;
- primary machine maintenance;
- primary missing required Work Center;
- backup missing one mandatory operation;
- mixed-line commit attempt;
- line changed before release;
- line change after release with authorization;
- line change after execution start rejected;
- concurrent line selection;
- idempotent Work Order creation;
- historical Work Order unaffected by changed eligibility.

## Required report

Create:

`mes-system/process-expand/mes-enterprise/ai-report/phase-7/mes-two-line-resource-planning-implementation-YYYYMMDD.md`

## Completion gate

The phase passes only when no Work Order can persist or execute mixed-line resource allocations.