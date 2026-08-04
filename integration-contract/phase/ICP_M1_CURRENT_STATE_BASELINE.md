# ICP M1 CURRENT STATE BASELINE — Current State Integration Baseline

## 1. Meaning of This Phase

Freezes the verified current integration state before any shared contract is changed.

## 2. Purpose

Separate runtime evidence, static evidence, missing implementation, missing fixtures, and unresolved governance.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- Kafka transport baseline
- Schema Registry baseline
- Redis applicability
- MES current capability and P0 gaps
- WMS runtime capability and remaining data-integrity gaps
- PDA Backend projections and reconciliation gaps
- migration, fixture, and device blockers
- deferred business scope

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- `baseline/CURRENT_RUNTIME_CAPABILITY_MATRIX.md`
- `baseline/CURRENT_BLOCKER_REGISTER.md`
- `baseline/CURRENT_EVENT_AND_TOPIC_MATRIX.md`
- `baseline/CURRENT_ENVIRONMENT_DEPENDENCY_MATRIX.md`
- `baseline/CURRENT_EVIDENCE_INDEX.md`
- `reports/ICP_M1_CURRENT_STATE_BASELINE_REPORT.md`

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

- [ ] Kafka transport is classified separately from business correctness
- [ ] Redis is marked not applicable to current material staging unless source proves otherwise
- [ ] MES P0 consumer gaps are explicit
- [ ] WMS remaining runtime and migration gaps are explicit
- [ ] all blockers have an owner and precise classification
- [ ] no application code or contract is changed

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- runtime evidence contradicts documented ownership
- current identifiers cannot be mapped without guessing
- historical documentation conflicts with current implementation and cannot be resolved

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
