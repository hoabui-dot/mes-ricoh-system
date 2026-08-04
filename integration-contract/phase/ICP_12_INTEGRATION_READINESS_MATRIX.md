# ICP 12 INTEGRATION READINESS MATRIX — Integration Readiness Matrix

## 1. Meaning of This Phase

Provides the shared status dashboard for MES, WMS, PDA Backend, and Platform readiness.

## 2. Purpose

Replace vague blocker labels with precise owner, evidence, dependency, and release status.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- capability readiness
- owner readiness
- contract readiness
- runtime readiness
- fixture readiness
- migration readiness
- failure readiness
- device readiness
- production governance

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- shared readiness matrix
- capability owner matrix
- evidence links
- blocker links
- release recommendation
- `reports/ICP_12_INTEGRATION_READINESS_REPORT.md`

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

- [ ] every capability has a status, owner, and evidence link
- [ ] blocked items identify exact dependency
- [ ] not-applicable items are not release blockers
- [ ] support phases and main phases can consume the matrix

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- status cannot be supported by evidence
- one capability has conflicting owner reports
- release recommendation ignores an open critical gate

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
