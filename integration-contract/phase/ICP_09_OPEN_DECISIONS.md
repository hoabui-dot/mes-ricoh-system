# ICP 09 OPEN DECISIONS — Open Architecture and Product Decisions

## 1. Meaning of This Phase

Registers unresolved decisions and prevents AI agents from guessing.

## 2. Purpose

Provide one governed place for pending, approved, rejected, and superseded decisions.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- demand parent/line model
- state machine
- retry semantics
- version owner
- mapping identifiers
- schema compatibility
- Redis future architecture
- authorization
- replay ownership
- fixture ownership

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- decision register
- decision template
- status definitions
- owner and due-date fields
- dependency map
- `reports/ICP_09_OPEN_DECISIONS_REPORT.md`

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

- [ ] every unresolved decision has an owner
- [ ] blocked phases reference decision IDs
- [ ] AI prompts contain stop conditions for pending decisions
- [ ] approved decisions are traceable

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- a phase requires an unregistered decision
- an AI agent attempts to implement a pending decision
- two approved decisions conflict

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
