# WMS Integration Support Global Rules

## 1. Purpose

These rules apply to every WMS Integration Support phase.

## 2. Preserve Existing Architecture

Do not:

- redesign WMS service boundaries;
- move Warehouse Execution task ownership into Inventory;
- move MES Work Order or material requirement ownership into WMS;
- merge WMS databases;
- create shared MES/WMS tables;
- read or write MES databases directly;
- expose WMS APIs directly to PDA App;
- add Redis to the MES/WMS material-staging path without an approved platform decision;
- replace working Kafka transport with direct database access or ad hoc synchronous coupling.

## 3. Authoritative Ownership

- Master Data owns warehouse, zone, location, bin, barcode alias, and WMS scan policy.
- Inventory owns balances, lots, reservations, movements, adjustments, and stock reconciliation.
- Inbound owns receipt workflow.
- Outbound owns MES material-request staging.
- Warehouse Execution owns putaway, picking, replenishment, and task lifecycle.
- Shipping owns package and shipment execution.
- PDA Backend owns PDA-facing APIs, operator/device/session, projections, command status, and reconciliation state.
- MES owns Work Orders and material requirements.

## 4. Contract-First Rule

Do not implement unresolved:

- identifier mappings;
- quantity semantics;
- version semantics;
- event keys;
- result ownership;
- idempotency identities;
- fixture mappings.

Stop and report when a required shared contract is unresolved.

## 5. Migration Rule

Every migration must be verified with:

```text
previous schema
-> legacy seed
-> migration
-> row/reference checks
-> updated service startup
-> affected API calls
-> affected full business flows
-> final balance/ledger/reconciliation evidence
```

SQL success alone is not completion.

## 6. Inventory Safety

- Never update balance without an immutable movement.
- Never delete movement history.
- Never apply duplicate commands twice.
- Transfers must preserve total stock.
- Receipts must increase stock once.
- Picks and shipments must decrease stock once.
- Adjustments must include reason, evidence, actor, and before/after quantity.
- Reconciliation must not silently auto-correct stock without approved policy.

## 7. Kafka and Event Rules

- Preserve current verified Kafka transport.
- Use outbox for outbound events.
- Use inbox for inbound event idempotency.
- Commit offsets only after durable processing.
- Same event ID and same payload is a no-op.
- Same event ID and different payload is a conflict.
- Preserve original DLQ metadata.
- Do not fabricate missing event IDs or versions.
- Do not silently change `v1` semantics incompatibly.

## 8. API and Flow Verification

An endpoint test is not enough.

Any changed API or event requires rerunning all affected business flows.

Examples:

- Outbound result change -> MES staging request, shortage, staged result, MES update.
- Inventory change -> transfer, reservation, picking, staging, consumption, reconciliation.
- Shipping change -> package verify, confirm, duplicate confirm, stock and ledger checks.
- Mapping change -> every MES/WMS and PDA/WMS scenario using that mapping.

## 9. Fixture Rule

WMS may create only WMS-owned disposable fixture data.

Do not create MES Work Orders or MES material requirements.

WMS fixture setup must be:

- deterministic;
- scoped;
- repeatable;
- cleanable;
- API/domain-owned where possible;
- safe for isolated runtime rehearsal.

## 10. Deferred Scope

Do not implement:

- Wave Picking;
- Quality Management;
- Cross Dock;
- ASN;
- Cycle Count.

Picking remains in scope.

Stock Adjustment remains in scope.

## 11. Stop Conditions

Stop immediately and create an architecture blocker report when:

- a change requires cross-database access;
- ownership becomes ambiguous;
- a shared event contract is unresolved;
- a `v1` event requires incompatible semantic change;
- a fixture requires undocumented production SQL;
- failure testing may affect unrelated shared workloads;
- the proposed fix places task state in Inventory;
- a workaround would create permanent coupling.

## 12. Completion Standard

A phase is complete only when:

- implementation is present;
- migrations are verified where required;
- clean and migrated data pass;
- affected APIs pass;
- affected full flows pass;
- idempotency and concurrency pass;
- failure recovery passes;
- runtime evidence is captured;
- documentation is updated;
- no architecture rule is violated.
