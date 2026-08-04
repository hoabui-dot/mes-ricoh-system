# AI Execution Prompt — Shipment Idempotency and Reconciliation

## Prompt Meaning

Closes duplicate shipment confirmation and package/shipment stock-effect gaps.

This prompt is for the AI working inside the WMS repository.

## Read First

1. `../GLOBAL_RULE.md`
2. `../phase/WMS_IP_05_SHIPMENT_IDEMPOTENCY_AND_RECONCILIATION.md`
3. MES–WMS Integration Contract Pack
4. Integration Validation Pack
5. Existing WMS architecture and enterprise WMS documents
6. Relevant current MES/PDA runtime reports

## Objective

Guarantee package verification and final shipment confirmation create one durable business effect.

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

- package verification
- shipment readiness
- shipment confirmation
- duplicate confirmation
- concurrent confirmation
- inventory decrement
- movement ledger
- outbox result
- PDA command status
- reconciliation

## Required Acceptance

- duplicate confirmation does not decrement stock twice
- concurrent confirmations produce one business effect
- shipment and inventory states reconcile
- PDA receives authoritative command status

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
