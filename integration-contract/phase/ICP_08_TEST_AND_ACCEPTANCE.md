# ICP 08 TEST AND ACCEPTANCE — Shared Test and Acceptance Contract

## 1. Meaning of This Phase

Defines the evidence levels and minimum tests required to close integration phases.

## 2. Purpose

Prevent static, health-only, or transport-only evidence from being misrepresented as full business verification.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- unit tests
- contract tests
- database integration
- migration rehearsal
- Kafka integration
- failure recovery
- concurrency
- clean-data flow
- migrated-data flow
- PDA runtime
- production readiness

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- evidence-level model
- test matrix
- business-flow acceptance matrix
- artifact requirements
- release-gate rules
- `reports/ICP_08_TEST_AND_ACCEPTANCE_REPORT.md`

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

- [ ] evidence classifications are precise
- [ ] health-only tests are not full-flow passes
- [ ] every changed API or event reruns affected business flows
- [ ] clean and migrated data are both tested
- [ ] release gates are explicit

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- required evidence cannot be isolated safely
- tests require production data without approval
- a phase attempts to claim runtime success using static evidence

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
