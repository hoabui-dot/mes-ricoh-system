# AI Execution Prompt — ICP 07 FAILURE RECOVERY AND RECONCILIATION: Failure Recovery and Reconciliation

## Prompt Meaning

Defines how systems recover from outages, lost acknowledgements, stale projections, DLQ events, and mismatched business state.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_07_FAILURE_RECOVERY_AND_RECONCILIATION.md
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

Make recovery deterministic, observable, and safe without destructive correction.

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

- Kafka outage
- producer failure
- consumer failure
- database failure
- outbox backlog
- lost acknowledgement
- DLQ
- replay
- snapshot
- projection rebuild
- business reconciliation
- inventory reconciliation

## Required Acceptance

- every failure has a durable recovery path
- inventory is never silently auto-corrected without policy
- unknown aggregates retain evidence
- replay cannot fabricate missing identifiers
- reconciliation distinguishes conflicts from operational inconsistency

## Mandatory Stop Conditions

- recovery requires deleting audit evidence
- legacy DLQ data lacks required metadata and would need fabricated values
- failure testing can impact unrelated shared workloads

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_07_FAILURE_RECOVERY_AND_RECONCILIATION.md
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
