# AI Execution Prompt — ICP 02 DOMAIN OWNERSHIP: Domain and Aggregate Ownership

## Prompt Meaning

Assigns one authoritative owner to every shared aggregate, command, projection, and audit state.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_02_DOMAIN_OWNERSHIP.md
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

Prevent duplicate business authority and define lifecycle responsibility.

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

- Work Order
- material requirement
- material staging request
- warehouse inventory
- lot, reservation, movement
- warehouse execution task
- shipment and package
- PDA operator/device/session
- outbox, inbox, DLQ, reconciliation
- master-data projections

## Required Acceptance

- every aggregate has exactly one owner
- all non-owner copies are identified as projections, caches, or audit evidence
- inventory authority remains WMS
- Work Order and material requirement authority remain MES

## Mandatory Stop Conditions

- one aggregate requires two authoritative writers
- ownership contradicts current database-per-service architecture
- a projection is being used as authoritative state

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_02_DOMAIN_OWNERSHIP.md
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
