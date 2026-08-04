# AI Execution Prompt — ICP 06 IDEMPOTENCY AND EXACTLY ONCE: Idempotency and Exactly-Once Business Effect

## Prompt Meaning

Defines command identities, event deduplication, inbox/outbox behavior, and replay safety.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_06_IDEMPOTENCY_AND_EXACTLY_ONCE.md
all previously approved Integration Contract Pack phases
```

## Role

Act as:

- senior enterprise integration architect;
- MES domain architect;
- WMS domain architect;
- Kafka and event-contract architect;
- data-consistency and migration reviewer;
- production-readiness and recovery reviewer;
- technical documentation author.

## Objective

Ensure at-least-once transport produces one deterministic business effect.

## Execution Instructions

1. Inspect current MES, WMS, PDA Backend, platform, contract, migration, test, and runtime evidence relevant to this phase.
2. Preserve verified behavior.
3. Separate implementation facts from proposed contracts.
4. Create every required deliverable listed in the phase document.
5. Register unresolved issues in ICP-09 rather than guessing.
6. Record source files, runtime evidence, assumptions, and blockers.
7. Do not modify application code unless explicitly required by an approved contract or evidence harness.
8. Do not change shared event semantics unilaterally.
9. Do not introduce cross-database access, shared business tables, or undocumented Redis coupling.
10. Stop when a major architectural contradiction is discovered.

## Scope

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

## Required Acceptance

- duplicate commands cannot create duplicate stock movement
- same event and same payload is a no-op
- same event and different payload is a durable conflict
- offset commit occurs only after durable processing
- replay preserves event identity

## Mandatory Stop Conditions

- no stable logical request identity exists
- business effect cannot be made idempotent
- consumer code requires acknowledging before durable commit

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_06_IDEMPOTENCY_AND_EXACTLY_ONCE.md
```

End with one final status:

```text
APPROVED_AND_FROZEN
PARTIALLY_APPROVED
BLOCKED_BY_DECISION
BLOCKED_BY_CONTRACT_CONFLICT
BLOCKED_BY_ARCHITECTURE_CONFLICT
```

Do not claim approval without evidence.
