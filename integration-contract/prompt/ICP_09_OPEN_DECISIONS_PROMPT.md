# AI Execution Prompt — ICP 09 OPEN DECISIONS: Open Architecture and Product Decisions

## Prompt Meaning

Registers unresolved decisions and prevents AI agents from guessing.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_09_OPEN_DECISIONS.md
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

Provide one governed place for pending, approved, rejected, and superseded decisions.

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

## Required Acceptance

- every unresolved decision has an owner
- blocked phases reference decision IDs
- AI prompts contain stop conditions for pending decisions
- approved decisions are traceable

## Mandatory Stop Conditions

- a phase requires an unregistered decision
- an AI agent attempts to implement a pending decision
- two approved decisions conflict

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_09_OPEN_DECISIONS.md
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
