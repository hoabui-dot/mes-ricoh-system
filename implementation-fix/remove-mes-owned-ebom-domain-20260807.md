# Remove MES-Owned EBOM Domain

Date: 2026-08-07
Status: Implemented and verified

## Business decision

SAP owns EBOM when an engineering BOM exists. MES does not currently author, persist, seed, expose, select, or use
EBOM. A future SAP integration may retain an immutable copy for comparison, but that capability is outside the
current contract.

MBOM remains the only material authority for Production Version and Work Order material explosion. Routing remains
the operation authority. Production Version combines one Item Revision, one Released/effective MBOM, and one
Released/effective Routing.

## Dependency audit

- Master Data previously owned `md_ebom_header`, `md_ebom_line`, `md_mbom_line.source_ebom_line_id`, and
  `md_production_version.ebom_header_id`.
- MES Console previously exposed `/master-data/eboms`, an EBOM menu entry, EBOM CRUD/editor logic, and an optional
  EBOM selector on Production Version.
- Canonical seed scripts created EBOM data and connected it to Production Version.
- Execution and Traceability have no EBOM projection, consumer, material explosion, or runtime dependency.
- Work Order snapshots contain MBOM and Routing data, not EBOM lines.

The audit found no business dependency that blocks removal.

## Implemented contract

- Migration `0070_remove_mes_owned_ebom_domain` drops the two EBOM tables and both referencing columns after cleaning
  the obsolete structure reconciliation rows and constraint.
- EBOM resources were removed from the Master Data registry and all explicit/generic HTTP handling.
- Legacy requests to create or update a Production Version with `ebom_header_id` receive stable error
  `PRODUCTION_VERSION_EBOM_NOT_SUPPORTED` instead of silently accepting obsolete input.
- The EBOM Console route, navigation, screen, query key, API projection, and Production Version field were removed.
- Current canonical/reset/full-flow seed scripts no longer discover, create, verify, or clean EBOM records.
- Current architecture, ERD, product, frontend, UAT, and AI context documents state the SAP ownership boundary.
- Historical migrations and historical implementation prompts remain unchanged as an audit trail. They are not the
  current product contract.

## Deferred SAP integration contract

Before implementing an SAP EBOM copy or comparison view, product and integration owners must approve:

1. SAP message/command/event transport, schema, idempotency key, and ordering policy.
2. SAP material and revision identity mapping to MES Item Revision.
3. EBOM version/effectivity semantics and whether snapshots are full or delta based.
4. Immutable retention, correction, deletion, and audit requirements.
5. Reconciliation rules between SAP EBOM and MES MBOM, including acceptable differences and ownership of resolution.
6. Failure recovery, replay, dead-letter, observability, and authorization contracts.
7. Whether the future snapshot belongs in MES Master Data or a dedicated integration/read-model boundary.

These questions are deferred work, not blockers for removing the unsupported MES-owned EBOM flow.

## Verification checklist

- [x] Master Data unit tests and typecheck pass: 5 files, 13 tests.
- [x] MES Console typecheck and production build pass.
- [x] Migration `0070_remove_mes_owned_ebom_domain` is applied at `2026-08-07 01:12:23 UTC`.
- [x] EBOM tables and reference columns are absent.
- [x] Legacy EBOM API returns 404; Console route renders Not Found and the sidebar has no EBOM entry.
- [x] Production Version API contains no EBOM field.
- [x] Canonical seed verification, product-definition snapshot, canonical full-flow, route E2E, and Production
  Version UI E2E pass.
- [x] Rebuilt Docker services are healthy with no startup errors.

## Verification results

- `npm run verify:mes:canonical-seed`: PASS after seed and again after E2E cleanup.
- `npm run test:mes:product-definition-snapshot:phase4`: PASS; Work Order materials are sourced only from MBOM.
- `npm run test:mes:canonical-full-flow`: PASS; 20/20 resource-planning negative cases and 19/19 two-line cases.
- `npm run test:e2e:route-navigation:phase3`: 1/1 PASS, including the removed EBOM route/menu assertions.
- `npm run test:e2e:product-definition-ui:phase5`: 1/1 PASS.
- Print Station/third-party-dependent approval/start/persistence steps were skipped according to the existing test
  contract; all MES-owned checks passed.
- Final fixture cleanup removed three temporary Work Orders with zero remaining allocation/reservation/WO leaks.
- Final runtime health: Master Data `healthy`, health payload `ok`, Kafka `Connected`, Print Station runtime consumer
  `Connected`; MES Console running and serving the rebuilt bundle.

During verification, the canonical base calendars were found to retain the previous planning date because the
startup seed used `ON CONFLICT DO NOTHING`. The seed now updates only `md_resource_calendar.calendar_date` and
`updated_at` on conflict. This preserves user-owned master fields while making the canonical seed rerunnable.
