# AI Execution Prompt — Migration and Failure Rehearsal

## Prompt Meaning

Converts WMS static and smoke evidence into repeatable migration and recovery evidence.

This prompt is for the AI working inside the WMS repository.

## Read First

1. `../GLOBAL_RULE.md`
2. `../phase/WMS_IP_07_MIGRATION_AND_FAILURE_REHEARSAL.md`
3. MES–WMS Integration Contract Pack
4. Integration Validation Pack
5. Existing WMS architecture and enterprise WMS documents
6. Relevant current MES/PDA runtime reports

## Objective

Run clean-database, legacy-database, outage, replay, concurrency, and recovery scenarios across affected WMS services.

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

- legacy schema/data setup
- migration apply
- row/reference checks
- service restart
- Kafka outage and recovery
- consumer restart
- outbox backlog
- DLQ replay
- database failure
- projection rebuild
- concurrency

## Required Acceptance

- legacy data remains operational
- recovery procedures are executable
- no data loss or duplicate stock occurs
- artifacts capture before/after state

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
