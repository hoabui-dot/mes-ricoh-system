# ICP 07 FAILURE RECOVERY AND RECONCILIATION — Failure Recovery and Reconciliation

## 1. Meaning of This Phase

Defines how systems recover from outages, lost acknowledgements, stale projections, DLQ events, and mismatched business state.

## 2. Purpose

Make recovery deterministic, observable, and safe without destructive correction.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- Kafka outage
- producer failure
- consumer failure
- database failure
- outbox backlog
- lost acknowledgement
- DLQ
- replay
- snapshot
- projection rebuild
- business reconciliation
- inventory reconciliation

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- failure matrix
- retry classification
- DLQ contract
- replay authorization contract
- reconciliation ownership matrix
- snapshot and checkpoint contract
- `reports/ICP_07_FAILURE_RECOVERY_REPORT.md`

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

- [ ] every failure has a durable recovery path
- [ ] inventory is never silently auto-corrected without policy
- [ ] unknown aggregates retain evidence
- [ ] replay cannot fabricate missing identifiers
- [ ] reconciliation distinguishes conflicts from operational inconsistency

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- recovery requires deleting audit evidence
- legacy DLQ data lacks required metadata and would need fabricated values
- failure testing can impact unrelated shared workloads

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
