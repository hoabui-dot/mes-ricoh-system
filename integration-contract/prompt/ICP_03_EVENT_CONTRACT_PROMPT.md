# AI Execution Prompt — ICP 03 EVENT CONTRACT: Canonical Event Contract

## Prompt Meaning

Defines the shared event families, envelopes, payloads, topics, keys, and result semantics.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_03_EVENT_CONTRACT.md
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

Create source-controlled contracts that both MES and WMS can implement without guessing.

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

- `MES.Execution.MaterialStagingRequested`
- `WMS.Outbound.MaterialStaged`
- `WMS.Outbound.MaterialShortageDeclared`
- PDA/WMS execution result families
- event envelope
- payload schema
- topic mapping
- partition key
- required fields
- error/result semantics

## Required Acceptance

- every event has a stable event ID and logical aggregate/request identity
- topic and event type are consistent
- required and optional fields are explicit
- quantity and UOM semantics are explicit
- current runtime events remain compatible or are versioned correctly

## Mandatory Stop Conditions

- an existing `v1` requires incompatible semantic change
- the producer and consumer disagree on identity or quantity meaning
- an event lacks sufficient data for durable reconciliation

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_03_EVENT_CONTRACT.md
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
