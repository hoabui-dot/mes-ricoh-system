# AI Execution Prompt — ICP 10 CHANGE MANAGEMENT: Contract Change Management

## Prompt Meaning

Defines how shared contracts may be proposed, reviewed, versioned, approved, rolled out, or rolled back.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_10_CHANGE_MANAGEMENT.md
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

Prevent one system from silently changing a shared contract.

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

- change request
- impact analysis
- compatibility analysis
- schema evolution
- deployment order
- migration order
- consumer readiness
- rollback
- deprecation
- contract freeze

## Required Acceptance

- shared contract changes require approval from affected owners
- breaking changes require explicit versioning
- producer and consumer deployment order is documented
- rollback and compatibility windows are defined

## Mandatory Stop Conditions

- a change is being made in only one repository without shared approval
- impact analysis is missing
- rollback is impossible and no migration plan exists

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_10_CHANGE_MANAGEMENT.md
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
