# AI Execution Prompt — WMS Integration Baseline

## Prompt Meaning

Verifies the current WMS integration implementation and evidence before changing any WMS code.

This prompt is for the AI working inside the WMS repository.

## Read First

1. `../GLOBAL_RULE.md`
2. `../phase/WMS_IP_00_BASELINE.md`
3. MES–WMS Integration Contract Pack
4. Integration Validation Pack
5. Existing WMS architecture and enterprise WMS documents
6. Relevant current MES/PDA runtime reports

## Objective

Freeze the WMS-side baseline for Kafka, Schema Registry, Outbound, Inventory, Warehouse Execution, Shipping, PDA integration, migrations, reconciliation, and current blockers.

## Execution Instructions

1. Inspect the current WMS implementation before changing code.
2. Record the current baseline for all affected flows.
3. Work only within WMS ownership.
4. Preserve current service boundaries and verified Kafka transport.
5. Implement only this phase's scope.
6. Update migrations additively when required.
7. Test both clean data and migrated legacy data.
8. Re-run every affected business flow, not only changed endpoints.
9. Capture database, outbox, inbox, Kafka, movement, balance, task, command, and reconciliation evidence where applicable.
10. Do not modify MES.
11. Do not guess mapping, version, or event semantics.
12. Stop when a major architecture conflict is discovered.

## Scope

- current WMS runtime capabilities
- current contracts and event subjects
- current MES/WMS material-staging behavior
- current PDA/WMS projections and command flows
- current migration state
- current reconciliation gaps
- current fixture and mapping gaps

## Required Acceptance

- runtime evidence is separated from static evidence
- current blockers have explicit WMS or external owners
- working Kafka behavior is preserved
- no code or schema is changed

## Required Outputs

- code and migration changes when applicable;
- tests;
- runtime evidence;
- phase report;
- final status:
  - `PASS`
  - `PARTIAL`
  - `BLOCKED_BY_CONTRACT`
  - `BLOCKED_BY_ENVIRONMENT`
  - `BLOCKED_BY_ARCHITECTURE`

Do not claim completion from build or health checks alone.
