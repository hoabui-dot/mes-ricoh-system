# AI Execution Prompt — Inventory and Ledger Integrity Closure

## Prompt Meaning

Closes remaining reservation, movement, adjustment, transfer, staging, and reconciliation evidence gaps.

This prompt is for the AI working inside the WMS repository.

## Read First

1. `../GLOBAL_RULE.md`
2. `../phase/WMS_IP_04_INVENTORY_AND_LEDGER_CLOSURE.md`
3. MES–WMS Integration Contract Pack
4. Integration Validation Pack
5. Existing WMS architecture and enterprise WMS documents
6. Relevant current MES/PDA runtime reports

## Objective

Prove authoritative WMS balances and immutable movements remain consistent across all affected integration flows.

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

- receipt posting
- reservation create/release
- FEFO allocation
- reservation consumption
- internal transfer
- stock adjustment
- MES staging transfer
- material consumption
- balance/ledger reconciliation
- concurrency

## Required Acceptance

- balance and ledger reconcile
- concurrent reservations cannot over-allocate
- duplicate commands do not duplicate movements
- staging and consumption preserve correct quantities
- clean and migrated data both pass

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
