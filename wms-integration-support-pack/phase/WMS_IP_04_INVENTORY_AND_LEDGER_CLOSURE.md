# Inventory and Ledger Integrity Closure

## Meaning of This Phase

Closes remaining reservation, movement, adjustment, transfer, staging, and reconciliation evidence gaps.

## Objective

Prove authoritative WMS balances and immutable movements remain consistent across all affected integration flows.

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

- [ ] balance and ledger reconcile
- [ ] concurrent reservations cannot over-allocate
- [ ] duplicate commands do not duplicate movements
- [ ] staging and consumption preserve correct quantities
- [ ] clean and migrated data both pass

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
