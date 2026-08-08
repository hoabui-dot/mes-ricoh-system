# Independent Routing and MBOM-Derived Production Version

Date: 2026-08-07

## Implemented Contract

- MBOM owns one FG/SFG output Item Revision.
- Routing is an independent, reusable operation flow and does not own an Item Revision.
- Production Version create/edit accepts MBOM and Routing as its production-definition inputs.
- Backend and database derive `ProductionVersion.item_revision_id` from MBOM and `site_id` from Routing Work Centers.
- Production Version rejects a Routing spanning zero/multiple Sites or a Routing Site different from the MBOM output Revision Site.
- Work Order continues to select only Production Version and retains immutable Item Revision, MBOM, Routing, and Site snapshots.

## Persistence and Compatibility

Migration `0072_independent_routing_and_mbom_derived_production_version` removes
`md_routing_header.item_revision_id`, removes its ownership trigger/index/reconciliation rows, repairs existing
Production Version Revision snapshots from MBOM, and replaces the derivation trigger.

Legacy Routing API payloads containing `item_revision_id` are accepted but the field is discarded. Routing release
events no longer publish that property. Execution Routing read-model seed rows retain their nullable compatibility
column with a `NULL` value.

## Verification

- Master Data unit tests: 16 passed.
- MES Console and Master Data typecheck/build: passed.
- Routing/PV derivation Playwright E2E: passed.
- Phase 4 product-definition snapshot regression: all 7 steps passed with exact cleanup.
- Phase 4 browser Work Order creation E2E: passed with exact cleanup.
- Live database: migration applied, Routing Revision column absent, zero PV/MBOM Revision mismatches, zero multi-Site Routings.
- Rebuilt Docker services: `mes-master-data-service` healthy and MES Console HTTP endpoint available.
