# ICP 10 CHANGE MANAGEMENT — Contract Change Management

## 1. Meaning of This Phase

Defines how shared contracts may be proposed, reviewed, versioned, approved, rolled out, or rolled back.

## 2. Purpose

Prevent one system from silently changing a shared contract.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- change request
- impact analysis
- compatibility analysis
- schema evolution
- deployment order
- migration order
- consumer readiness
- rollback
- deprecation
- contract freeze

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- change request template
- impact assessment template
- approval workflow
- versioning rules
- deployment sequencing rules
- `reports/ICP_10_CHANGE_MANAGEMENT_REPORT.md`

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

- [ ] shared contract changes require approval from affected owners
- [ ] breaking changes require explicit versioning
- [ ] producer and consumer deployment order is documented
- [ ] rollback and compatibility windows are defined

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- a change is being made in only one repository without shared approval
- impact analysis is missing
- rollback is impossible and no migration plan exists

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
