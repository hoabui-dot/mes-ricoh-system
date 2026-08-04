# AI Execution Prompt — ICP 11 ARCHITECTURE GUARDRAILS: Architecture Guardrails

## Prompt Meaning

Defines prohibited shortcuts and mandatory boundaries that protect both systems from architectural erosion.

This prompt instructs an AI agent to execute the shared integration-contract phase. It does not authorize unilateral changes in MES or WMS.

## Required Reading

Before execution, read:

```text
../GLOBAL_RULE.md
../phase/ICP_11_ARCHITECTURE_GUARDRAILS.md
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

Stop AI agents from resolving local blockers by damaging the shared architecture.

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

- database boundaries
- service ownership
- transport boundaries
- cache boundaries
- aggregate rules
- migration rules
- event rules
- security rules
- observability rules
- deferred-scope rules

## Required Acceptance

- shared database, hidden Redis, and cross-database access are prohibited
- verified transport is preserved
- deferred domains remain deferred
- violations require stop-and-report behavior

## Mandatory Stop Conditions

- any implementation requires violating a guardrail
- an exception has no architecture approval
- a temporary workaround creates permanent coupling

## Required Output

Produce the phase report and all artifacts defined in:

```text
../phase/ICP_11_ARCHITECTURE_GUARDRAILS.md
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
