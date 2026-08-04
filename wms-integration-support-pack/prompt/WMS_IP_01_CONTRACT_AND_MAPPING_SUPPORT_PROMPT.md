# AI Execution Prompt — WMS Contract and Mapping Support

## Prompt Meaning

Completes the WMS-owned side of the shared MES/WMS mapping and result contracts.

This prompt is for the AI working inside the WMS repository.

## Read First

1. `../GLOBAL_RULE.md`
2. `../phase/WMS_IP_01_CONTRACT_AND_MAPPING_SUPPORT.md`
3. MES–WMS Integration Contract Pack
4. Integration Validation Pack
5. Existing WMS architecture and enterprise WMS documents
6. Relevant current MES/PDA runtime reports

## Objective

Provide exact WMS result schemas, request identity, mapping manifest, quantity semantics, version semantics, and evidence interfaces required by MES.

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

- WMS staged and shortage result schemas
- logical material-request identity
- Work Center to staging-location mapping
- item revision and UOM mapping
- warehouse/site mapping
- result version and ordering semantics
- quantity precision and meaning
- WMS-side evidence queries or APIs

## Required Acceptance

- MES can create valid fixtures without reading WMS databases
- all cross-system identifiers are explicit
- result contracts are source-controlled and contract-tested
- no incompatible silent `v1` change exists

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
