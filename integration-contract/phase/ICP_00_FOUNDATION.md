# ICP 00 FOUNDATION — Integration Program Foundation

## 1. Meaning of This Phase

Defines why the shared integration program exists and the principles every later phase must follow.

## 2. Purpose

Freeze the program vision, scope, non-goals, success definition, working method, and governance hierarchy.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- program vision
- business goals
- non-goals
- architecture principles
- system independence
- success criteria
- document authority
- AI working method
- review and freeze process

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- `reports/ICP_00_FOUNDATION_REPORT.md`
- approved program principles
- approved non-goals
- approved phase dependency order

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

- [ ] success is defined by deterministic business effect rather than Kafka delivery alone
- [ ] independent deployment is preserved
- [ ] one owner per aggregate is mandatory
- [ ] shared databases and hidden coupling are prohibited
- [ ] all later phases can reference the foundation without ambiguity

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- stakeholders disagree on the integration program purpose
- the proposed foundation requires rewriting one system
- the foundation duplicates ownership across systems

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
