# AI Execution Prompt — PDA Projection and Reconciliation Closure

## Prompt Meaning

Closes WMS-side gaps preventing clean PDA reconciliation and deterministic isolated runtime evidence.

This prompt is for the AI working inside the WMS repository.

## Read First

1. `../GLOBAL_RULE.md`
2. `../phase/WMS_IP_06_PDA_RECONCILIATION_AND_RUNTIME.md`
3. MES–WMS Integration Contract Pack
4. Integration Validation Pack
5. Existing WMS architecture and enterprise WMS documents
6. Relevant current MES/PDA runtime reports

## Objective

Ensure WMS execution, inventory, and shipping events can be consumed by one isolated PDA owner with correct projection and reconciliation semantics.

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

- isolated consumer groups
- execution/inventory/shipping event evidence
- conflict classification
- stale and version-gap handling
- clean reconciliation scope
- checkpoint and replay evidence
- cache invalidation evidence
- command result correlation

## Required Acceptance

- clean isolated reconciliation can return healthy
- conflict rows remain durable but do not falsely imply projection mismatch
- older deployments do not interfere with rehearsal
- lag returns to zero after restart and outage

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
