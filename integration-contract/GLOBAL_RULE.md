# Global Rules for the MES–WMS Integration Contract Pack

## 1. Authority

This file is the highest-level shared rule for all Integration Contract Pack phases.

Every MES AI, WMS AI, PDA Backend AI, platform AI, reviewer, and implementation agent must read and follow it before performing any integration work.

## 2. System Independence

MES, WMS, PDA Backend, and platform services remain independently deployable systems.

Never create:

- a shared business database;
- cross-system repositories;
- cross-database reads or writes;
- distributed database transactions;
- hidden synchronous coupling;
- undocumented shared Redis state;
- duplicated aggregate ownership.

## 3. Preserve Current Verified Behavior

Do not rewrite working Kafka transport, outbox publication, consumer groups, or Schema Registry registration merely because business fixtures or correctness guarantees are incomplete.

Transport correctness and business-state correctness are separate concerns.

## 4. One Authoritative Owner

Every aggregate and business state must have exactly one authoritative owner.

A projection, cache, read model, PDA Room database, Redis cache, or external consumer is never automatically authoritative.

## 5. Contract-First Rule

Do not implement behavior that depends on unresolved:

- aggregate identity;
- event identity;
- logical request identity;
- field mapping;
- state transition;
- version semantics;
- ordering scope;
- quantity semantics;
- ownership;
- compatibility policy.

When a required decision is unresolved, stop and record it in ICP-09.

## 6. Event Compatibility

Do not silently change the meaning of an existing versioned event.

Backward-compatible additive changes may remain in the current version only when approved by the contract owner and compatibility tests pass.

Semantic changes require evaluation of a new event version.

## 7. Idempotency

Every mutation crossing a system boundary must use a stable command or logical request identity.

Every consumed event must support durable duplicate detection.

Same event ID and same payload must be a successful no-op.

Same event ID and different payload must be a durable conflict.

## 8. Durable Consumer Rule

A consumer must not commit its Kafka offset before durable processing is complete.

Inbox persistence, business-state transition, reconciliation metadata, and audit effects must be transactionally consistent within the consuming service.

## 9. Migration Safety

Database changes must be additive first.

Required sequence:

```text
expand
-> deploy compatible code
-> backfill
-> verify legacy data
-> execute affected business flows
-> enforce stricter constraints later
```

A migration is not complete because SQL succeeded.

## 10. Full-Flow Verification

An API, event, migration, consumer, or command is not verified by an isolated test alone.

Every change must rerun all affected business flows.

## 11. No Destructive Evidence Cleanup

Do not delete conflict, DLQ, replay, or reconciliation evidence to produce a green report.

Classify evidence correctly instead.

## 12. Redis Rule

Redis must remain service-scoped unless an approved platform decision defines shared ownership, network, credentials, namespaces, TTLs, persistence, availability, and outage behavior.

Redis is not required for the current MES/WMS material-staging path.

## 13. Stop Conditions

Stop implementation and create an architecture blocker report when:

- ownership is ambiguous;
- a change requires shared database access;
- a `v1` event requires incompatible semantic change;
- a stable event or request identity is unavailable;
- version or ordering semantics are undefined;
- recovery requires fabricating identifiers;
- a proposed failure test can affect unrelated shared workloads;
- the implementation would bypass an aggregate or domain rule;
- a quick fix would move responsibility into the wrong service.

## 14. Completion Standard

A phase is complete only when:

- its required artifacts exist;
- its decisions are explicit;
- its acceptance criteria pass;
- unresolved issues are registered;
- no architecture guardrail is violated;
- implementation evidence is classified correctly;
- downstream phases can rely on the result without guessing.
