# WMS Integration Baseline

## Meaning of This Phase

Verifies the current WMS integration implementation and evidence before changing any WMS code.

## Objective

Freeze the WMS-side baseline for Kafka, Schema Registry, Outbound, Inventory, Warehouse Execution, Shipping, PDA integration, migrations, reconciliation, and current blockers.

## Scope

- current WMS runtime capabilities
- current contracts and event subjects
- current MES/WMS material-staging behavior
- current PDA/WMS projections and command flows
- current migration state
- current reconciliation gaps
- current fixture and mapping gaps

## Required Inputs

- WMS Integration Support `GLOBAL_RULE.md`
- MES–WMS Integration Contract Pack
- Integration Validation Pack
- Existing WMS architecture and enterprise WMS documentation
- Current MES and PDA integration reports relevant to this phase

## Architecture Constraints

- Work only inside WMS unless this phase is explicitly verification-only.
- Do not modify MES.
- Do not redesign WMS architecture.
- Preserve database-per-service ownership.
- Preserve verified Kafka transport.
- Do not add shared Redis or cross-database access.
- Do not implement deferred domains.

## Required Deliverables

- implementation or verification artifacts required by this phase;
- updated tests;
- migration files where required;
- runtime evidence;
- phase completion report;
- updated blocker and readiness status.

## Verification Requirements

Use all applicable levels:

- unit tests;
- contract tests;
- database integration;
- migration rehearsal;
- API behavior;
- Kafka integration;
- idempotency;
- concurrency;
- failure recovery;
- clean-data full flow;
- migrated-data full flow;
- MES/PDA joint verification where applicable.

## Acceptance Criteria

- [ ] runtime evidence is separated from static evidence
- [ ] current blockers have explicit WMS or external owners
- [ ] working Kafka behavior is preserved
- [ ] no code or schema is changed

## Stop Conditions

Stop and report when:

- a shared contract is unresolved;
- ownership would change;
- direct MES database access is required;
- an incompatible event change is required;
- a fixture requires unsafe production SQL;
- a major architecture conflict is discovered.

## Required Final Status

Use one:

```text
PASS
PARTIAL
BLOCKED_BY_CONTRACT
BLOCKED_BY_ENVIRONMENT
BLOCKED_BY_ARCHITECTURE
```
