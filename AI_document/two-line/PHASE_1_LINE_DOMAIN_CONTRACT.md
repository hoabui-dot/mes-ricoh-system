# Phase 1 Line Domain Contract

Date: 2026-08-07

## Lifecycle

Production Line uses the existing lifecycle values; the two-line flow recognizes:

```text
Draft -> Released -> Retired
```

Only active, `Released`, effective lines and effective Production Version eligibility rows participate in selection. No new lifecycle state is required.

## Whole-Work-Order invariant

```text
Create or explicit pre-execution replan
  -> evaluate complete eligible lines
  -> READY(selected_line_id) or RESOURCE_HOLD
  -> exact resource commit restricted to selected_line_id
  -> approval/revalidation
  -> execution lock/start
```

A normal Work Order has one selected line. Every operation, allocation, reservation, and execution candidate must belong to that line. Per-operation line mixing is invalid. After execution starts, automatic fallback is forbidden; recovery requires an explicit audited transfer/rework/child-WO design.

## Complete-line feasibility

For every mandatory Routing operation `op` and candidate line `line`:

```text
feasible(op, line) = count(feasible exact candidates scoped to line) >= 1
feasible(line) = every mandatory op satisfies feasible(op, line)
```

One valid candidate is sufficient. One inactive workstation or machine does not block an operation when another candidate in the same line is feasible. Optional operations with zero candidates do not block line selection unless later business policy explicitly marks them mandatory.

Evaluation is read-only. It never reserves or commits a candidate.

## Deterministic ordering and fallback

1. `PRIMARY` before `BACKUP`.
2. Lower eligibility priority first.
3. Line code, then line ID as deterministic tie breakers.

The first complete feasible line is selected. A blocked Primary causes evaluation of Backup. No feasible eligible line yields `RESOURCE_HOLD` with `NO_COMPLETE_FEASIBLE_LINE`; no released/effective eligibility yields `NO_RELEASED_EFFECTIVE_LINE_ELIGIBILITY`.

## Dimension policy

| Dimension | Policy | Rule |
| --- | --- | --- |
| Eligibility/effectivity | Structural blocking | Line cannot be evaluated without released effective PV eligibility |
| Work Center coverage | Structural blocking | Every mandatory operation needs line-scoped coverage |
| Capability | Structural blocking | A candidate must support the operation |
| Production standard | Structural blocking | Required planning values must resolve |
| Workstation state/effectivity | Runtime blocking | At least one active/effective candidate must remain |
| Resource assignment state/effectivity | Runtime blocking | Candidate mapping must be active/effective |
| Machine Unit state/effectivity | Runtime blocking | Required machine candidate must have an available unit |
| Machine operational status | Runtime blocking | Authoritative unavailable/down state rejects that candidate |
| Machine requirement | Runtime blocking | Candidate must satisfy mandatory requirement/capability |
| Calendar/shift | Runtime blocking | MES resolves shift candidates from target-date calendars; a resource candidate must cover the resulting execution window. Shift is not a create-WO user input. |
| Capacity | Runtime blocking | At least one candidate must retain sufficient capacity |
| Reservation conflict | Runtime blocking | Conflicted candidate is rejected; alternatives still count |
| Worker skill/labor | Deferred to exact allocation | Current approved source treats labor as allocation-stage evidence, not line-selection blocking |

Runtime blocking applies to a candidate first. It blocks an operation only when it reduces feasible candidate count to zero. It blocks a line only when that operation is mandatory.

## Executable contract

`line_readiness_contract.go` defines a side-effect-free contract evaluator used by unit tests and intended for the later exact-evidence integration phases. Its essential input/output shape is:

```json
{
  "status": "READY",
  "selected_production_line_id": "line-2",
  "selected_role": "BACKUP",
  "reason_code": "BACKUP_LINE_READY",
  "fallback_reason": "PRIMARY_LINE_BLOCKED",
  "evaluated_lines": [
    {
      "production_line_id": "line-1",
      "production_line_code": "ASM-L01",
      "selection_role": "PRIMARY",
      "priority": 1,
      "status": "BLOCKED",
      "blocker_codes": ["MACHINE_REQUIREMENT_NOT_SATISFIED"],
      "operations": [
        {
          "routing_operation_id": "routing-op-20",
          "operation_code": "TEST5",
          "mandatory": true,
          "feasible_candidate_count": 0,
          "blocker_codes": ["MACHINE_REQUIREMENT_NOT_SATISFIED"],
          "status": "BLOCKED"
        }
      ],
      "selection_reason": "LINE_NOT_SELECTED_BLOCKED"
    }
  ]
}
```

## Persisted diagnostic contract

The backend persists, for every line evaluated before the decision:

- line ID, business code, localized name, role, and priority;
- line final status and selection reason;
- every mandatory operation ID/code and status;
- feasible candidate count;
- stable blocker codes;
- safe candidate evidence identifiers plus workstation/machine/resource business code where available;
- evaluation timestamp and policy version;
- selected/fallback/hold reason on the Work Order.

Diagnostics must not expose SQL, connection strings, internal stack traces, credentials, or another service's database identifiers. UI localization uses stable reason codes and does not recompute readiness.

## State transitions

```text
No decision
  |-- Primary READY ----------------------> READY(PRIMARY)
  |-- Primary BLOCKED, Backup READY ------> READY(BACKUP)
  `-- all eligible lines BLOCKED ---------> RESOURCE_HOLD

READY before execution
  |-- explicit replan, line remains ready -> READY(new audited snapshot)
  `-- degradation, no complete line ------> RESOURCE_HOLD

Execution started
  `-- degradation ------------------------> HOLD/RECOVERY REQUIRED
                                           (no automatic line switch)
```

## Compatibility

This phase does not change persisted schema, HTTP routes, current selector behavior, event envelopes, or UI. It adds the explicit pure contract and tests required for the subsequent implementation phases.
