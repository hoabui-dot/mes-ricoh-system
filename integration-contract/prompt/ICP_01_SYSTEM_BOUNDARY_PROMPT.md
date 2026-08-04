# AI Execution Prompt — ICP 01 SYSTEM BOUNDARY: Canonical System Boundary

## Prompt Meaning

Defines where MES, WMS, PDA Backend, and Platform responsibilities begin and end.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_01_SYSTEM_BOUNDARY.md
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

Eliminate cross-system responsibility ambiguity before aggregate-level ownership is defined.

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

- MES boundary
- WMS boundary
- Warehouse Execution boundary
- Shipping boundary
- PDA Backend boundary
- Platform boundary
- allowed communication paths
- forbidden communication paths
- data persistence boundaries

## Required Acceptance

- each system has explicit responsibilities, inputs, outputs, and persistence
- no system reads or writes another system's database
- PDA App calls PDA Backend only
- Kafka remains the approved asynchronous transport where defined

## Mandatory Stop Conditions

- a required capability has no system owner
- two systems claim authoritative persistence for the same state
- a boundary requires shared database access

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_01_SYSTEM_BOUNDARY.md
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
