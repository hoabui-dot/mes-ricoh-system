# WMS Contract and Mapping Support

## Meaning of This Phase

Completes the WMS-owned side of the shared MES/WMS mapping and result contracts.

## Objective

Provide exact WMS result schemas, request identity, mapping manifest, quantity semantics, version semantics, and evidence interfaces required by MES.

## Scope

- WMS staged and shortage result schemas
- logical material-request identity
- Work Center to staging-location mapping
- item revision and UOM mapping
- warehouse/site mapping
- result version and ordering semantics
- quantity precision and meaning
- WMS-side evidence queries or APIs

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

- [ ] MES can create valid fixtures without reading WMS databases
- [ ] all cross-system identifiers are explicit
- [ ] result contracts are source-controlled and contract-tested
- [ ] no incompatible silent `v1` change exists

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
