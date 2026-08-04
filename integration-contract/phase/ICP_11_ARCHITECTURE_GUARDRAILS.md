# ICP 11 ARCHITECTURE GUARDRAILS — Architecture Guardrails

## 1. Meaning of This Phase

Defines prohibited shortcuts and mandatory boundaries that protect both systems from architectural erosion.

## 2. Purpose

Stop AI agents from resolving local blockers by damaging the shared architecture.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- database boundaries
- service ownership
- transport boundaries
- cache boundaries
- aggregate rules
- migration rules
- event rules
- security rules
- observability rules
- deferred-scope rules

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- mandatory guardrail list
- prohibited-pattern catalog
- architecture violation template
- exception approval process
- `reports/ICP_11_ARCHITECTURE_GUARDRAILS_REPORT.md`

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

- [ ] shared database, hidden Redis, and cross-database access are prohibited
- [ ] verified transport is preserved
- [ ] deferred domains remain deferred
- [ ] violations require stop-and-report behavior

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- any implementation requires violating a guardrail
- an exception has no architecture approval
- a temporary workaround creates permanent coupling

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
