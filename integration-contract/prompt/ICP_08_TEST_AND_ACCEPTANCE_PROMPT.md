# AI Execution Prompt — ICP 08 TEST AND ACCEPTANCE: Shared Test and Acceptance Contract

## Prompt Meaning

Defines the evidence levels and minimum tests required to close integration phases.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_08_TEST_AND_ACCEPTANCE.md
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

Prevent static, health-only, or transport-only evidence from being misrepresented as full business verification.

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

- unit tests
- contract tests
- database integration
- migration rehearsal
- Kafka integration
- failure recovery
- concurrency
- clean-data flow
- migrated-data flow
- PDA runtime
- production readiness

## Required Acceptance

- evidence classifications are precise
- health-only tests are not full-flow passes
- every changed API or event reruns affected business flows
- clean and migrated data are both tested
- release gates are explicit

## Mandatory Stop Conditions

- required evidence cannot be isolated safely
- tests require production data without approval
- a phase attempts to claim runtime success using static evidence

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_08_TEST_AND_ACCEPTANCE.md
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
