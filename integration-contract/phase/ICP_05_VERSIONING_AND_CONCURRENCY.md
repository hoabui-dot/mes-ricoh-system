# ICP 05 VERSIONING AND CONCURRENCY — Versioning, Ordering, and Concurrency

## 1. Meaning of This Phase

Defines aggregate versions, event versions, source versions, ordering scopes, and conflict behavior.

## 2. Purpose

Prevent stale results, silent overwrite, and unsafe concurrent mutation.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- schema version
- event version
- aggregate version
- projection version
- command version
- source version
- ordering key
- optimistic concurrency
- version-gap handling
- concurrent request behavior

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- version taxonomy
- ordering matrix
- transition conflict matrix
- expected-version rules
- stale and future-gap behavior
- `reports/ICP_05_VERSIONING_AND_CONCURRENCY_REPORT.md`

## 7. Verification

Verification must be source-backed and must distinguish:

- runtime evidence;
- runtime smoke evidence;
- static evidence;
- proposed behavior;
- unresolved decisions;
- external blockers;
- not-applicable dependencies.

## 8. Acceptance Criteria

- [ ] older results cannot overwrite newer state
- [ ] ordering scope is explicit and not described as global unless guaranteed
- [ ] concurrent commands have deterministic outcomes
- [ ] future version gaps are parked or reconciled

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- source events have no usable ordering/version semantics
- multiple aggregates require impossible cross-partition global ordering
- concurrency requires a distributed transaction

## 10. Final Status

Use one of:

```text
APPROVED_AND_FROZEN
PARTIALLY_APPROVED
BLOCKED_BY_DECISION
BLOCKED_BY_CONTRACT_CONFLICT
BLOCKED_BY_ARCHITECTURE_CONFLICT
```

## 11. Downstream Dependency

Later phases must not assume this phase is complete unless its status is `APPROVED_AND_FROZEN`.
