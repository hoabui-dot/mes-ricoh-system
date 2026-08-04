# AI Execution Prompt — Outbound Material Result Hardening

## Prompt Meaning

Hardens WMS Outbound result identity, versioning, idempotency, persistence, and Schema Registry compliance.

This prompt is for the AI working inside the WMS repository.

## Read First

1. `../GLOBAL_RULE.md`
2. `../phase/WMS_IP_03_OUTBOUND_RESULT_HARDENING.md`
3. MES–WMS Integration Contract Pack
4. Integration Validation Pack
5. Existing WMS architecture and enterprise WMS documents
6. Relevant current MES/PDA runtime reports

## Objective

Ensure MES material-staging requests produce deterministic Staged or Shortage results that can be safely consumed and reconciled.

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

- request inbox validation
- logical request idempotency
- staged result payload
- shortage result payload
- correlation and causation
- result event version
- outbox durability
- Schema Registry registration
- duplicate request behavior

## Required Acceptance

- duplicate MES request does not create duplicate transfer
- same logical request returns the same authoritative result
- result events include approved identity and quantities
- outbox recovery is runtime verified

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
