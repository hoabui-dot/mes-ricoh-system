# AI Execution Prompt — ICP 00 FOUNDATION: Integration Program Foundation

## Prompt Meaning

Defines why the shared integration program exists and the principles every later phase must follow.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_00_FOUNDATION.md
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

Freeze the program vision, scope, non-goals, success definition, working method, and governance hierarchy.

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

- program vision
- business goals
- non-goals
- architecture principles
- system independence
- success criteria
- document authority
- AI working method
- review and freeze process

## Required Acceptance

- success is defined by deterministic business effect rather than Kafka delivery alone
- independent deployment is preserved
- one owner per aggregate is mandatory
- shared databases and hidden coupling are prohibited
- all later phases can reference the foundation without ambiguity

## Mandatory Stop Conditions

- stakeholders disagree on the integration program purpose
- the proposed foundation requires rewriting one system
- the foundation duplicates ownership across systems

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_00_FOUNDATION.md
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
