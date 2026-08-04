# Disposable Stock Fixture and Cleanup

## Meaning of This Phase

Creates deterministic WMS-owned setup for one Staged and one Shortage MES scenario.

## Objective

Provide isolated warehouse, location, item, UOM, lot, balance, staging-location, and cleanup flows required for joint runtime verification.

## Scope

- recovery scope identity
- warehouse and staging-location setup
- item revision and UOM mapping
- sufficient-stock scenario
- shortage scenario
- fixture cleanup
- fixture evidence manifest

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

- [ ] fixture setup is repeatable
- [ ] one scenario can stage successfully
- [ ] one scenario produces shortage
- [ ] cleanup removes only scoped WMS-owned data
- [ ] no MES data is inserted or mutated

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
