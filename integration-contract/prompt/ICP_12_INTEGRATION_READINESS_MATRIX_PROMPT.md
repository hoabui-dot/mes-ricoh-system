# AI Execution Prompt — ICP 12 INTEGRATION READINESS MATRIX: Integration Readiness Matrix

## Prompt Meaning

Provides the shared status dashboard for MES, WMS, PDA Backend, and Platform readiness.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_12_INTEGRATION_READINESS_MATRIX.md
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

Replace vague blocker labels with precise owner, evidence, dependency, and release status.

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

- capability readiness
- owner readiness
- contract readiness
- runtime readiness
- fixture readiness
- migration readiness
- failure readiness
- device readiness
- production governance

## Required Acceptance

- every capability has a status, owner, and evidence link
- blocked items identify exact dependency
- not-applicable items are not release blockers
- support phases and main phases can consume the matrix

## Mandatory Stop Conditions

- status cannot be supported by evidence
- one capability has conflicting owner reports
- release recommendation ignores an open critical gate

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_12_INTEGRATION_READINESS_MATRIX.md
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
