# AI Execution Prompt — ICP 05 VERSIONING AND CONCURRENCY: Versioning, Ordering, and Concurrency

## Prompt Meaning

Defines aggregate versions, event versions, source versions, ordering scopes, and conflict behavior.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_05_VERSIONING_AND_CONCURRENCY.md
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

Prevent stale results, silent overwrite, and unsafe concurrent mutation.

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

- schema version
- event version
- aggregate version
- projection version
- command version
- source version
- ordering key
- optimistic concurrency
- version-gap handling
- concurrent request behavior

## Required Acceptance

- older results cannot overwrite newer state
- ordering scope is explicit and not described as global unless guaranteed
- concurrent commands have deterministic outcomes
- future version gaps are parked or reconciled

## Mandatory Stop Conditions

- source events have no usable ordering/version semantics
- multiple aggregates require impossible cross-partition global ordering
- concurrency requires a distributed transaction

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_05_VERSIONING_AND_CONCURRENCY.md
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
