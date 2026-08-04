# ICP 06 IDEMPOTENCY AND EXACTLY ONCE — Idempotency and Exactly-Once Business Effect

## 1. Meaning of This Phase

Defines command identities, event deduplication, inbox/outbox behavior, and replay safety.

## 2. Purpose

Ensure at-least-once transport produces one deterministic business effect.

## 3. Why This Phase Exists

This phase exists to remove ambiguity before MES and WMS implementation agents perform dependent work.

It is a shared integration-contract phase and does not belong exclusively to either repository.

## 4. Scope

- logical request identity
- command ID
- idempotency key
- event ID
- payload hash
- inbox
- outbox
- duplicate request
- duplicate event
- conflicting duplicate
- retry and replay

## 5. Architecture Constraints

- Follow `GLOBAL_RULE.md`.
- Preserve verified runtime transport unless this phase explicitly approves a contract change.
- Do not modify application code during contract-definition work unless the phase explicitly requires evidence-generation tooling.
- Do not invent missing product, platform, mapping, or ownership decisions.
- Keep MES and WMS independently deployable.
- Do not use direct cross-database access.

## 6. Required Deliverables

- idempotency identity matrix
- duplicate behavior matrix
- inbox transaction contract
- outbox transaction contract
- replay contract
- `reports/ICP_06_IDEMPOTENCY_REPORT.md`

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

- [ ] duplicate commands cannot create duplicate stock movement
- [ ] same event and same payload is a no-op
- [ ] same event and different payload is a durable conflict
- [ ] offset commit occurs only after durable processing
- [ ] replay preserves event identity

## 9. Stop Conditions

Stop and create an architecture blocker report when:

- no stable logical request identity exists
- business effect cannot be made idempotent
- consumer code requires acknowledging before durable commit

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
