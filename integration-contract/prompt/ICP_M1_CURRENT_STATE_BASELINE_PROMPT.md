# AI Execution Prompt — ICP M1 CURRENT STATE BASELINE: Current State Integration Baseline

## Prompt Meaning

Freezes the verified current integration state before any shared contract is changed.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_M1_CURRENT_STATE_BASELINE.md
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

Separate runtime evidence, static evidence, missing implementation, missing fixtures, and unresolved governance.

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

- Kafka transport baseline
- Schema Registry baseline
- Redis applicability
- MES current capability and P0 gaps
- WMS runtime capability and remaining data-integrity gaps
- PDA Backend projections and reconciliation gaps
- migration, fixture, and device blockers
- deferred business scope

## Required Acceptance

- Kafka transport is classified separately from business correctness
- Redis is marked not applicable to current material staging unless source proves otherwise
- MES P0 consumer gaps are explicit
- WMS remaining runtime and migration gaps are explicit
- all blockers have an owner and precise classification
- no application code or contract is changed

## Mandatory Stop Conditions

- runtime evidence contradicts documented ownership
- current identifiers cannot be mapped without guessing
- historical documentation conflicts with current implementation and cannot be resolved

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_M1_CURRENT_STATE_BASELINE.md
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
