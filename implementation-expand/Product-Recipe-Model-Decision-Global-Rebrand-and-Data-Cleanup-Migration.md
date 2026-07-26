# Product Recipe, Global Rebrand, and Demo Data Cleanup

Date: 2026-07-23
Source process: `process-expand/Product-Recipe-Model-Decision-Global-Rebrand-and-Data-Cleanup-Migration.md`
Implementation location: `implementation-expand/` (explicit user instruction; the source prompt's implementation-fix wording was overridden).

## Decision and scope

Completion status: **IMPLEMENTED_AND_VERIFIED for repository/build/runtime scope; DEMO_ONLY for the
cleanup/reseed dataset; EBOM remains MISSING by design under the selected Option 2 decision.**

The repository does not currently contain an `EBOM` table or service-owned recipe aggregate. Items,
item revisions, MBOM headers/lines, routings/operations, production versions, work centers, and
production standards are separate MES master-data resources. Item types include finished goods,
semi-finished goods, and raw materials, so a recipe view is valuable; creating a new persisted
aggregate would duplicate ownership and create migration/event ambiguity.

Decision: **Option 2, read/navigation aggregator consolidated into Production Version**.
`/master-data/production-versions` is the single workspace and each row opens the combined detail
view for its Item Revision, MBOM, Routing, and Production Version. The former
`/master-data/product-recipes` URL redirects there for bookmark compatibility; no second screen or
navigation entry remains. EBOM is explicitly shown as unavailable rather than inferred from MBOM.
Existing CRUD pages remain authoritative writers. This is a deliberate gap, not a hidden fallback.

## Implemented changes

1. Work Order list rows and the detail action now open a responsive detail modal. The modal uses the
   same document normalization contract as `WODetailScreen`, shows business codes/localized names,
   operations, material requirements with WMS status/detail, site, planned dates, approval history,
   status, quantity, UOM, and target date. The full route remains the action surface for compute,
   approve/reject, and material staging; the business modal remains separate from the Page Detail guide.
2. Removed Create Work Order from the sidebar while preserving the list page's create button.
3. Removed the redundant right-side route path/context from the shared route header; breadcrumbs remain.
4. Consolidated Product Recipe detail into Production Version row detail. The row is click/keyboard
   activatable, shows the Item Revision/MBOM/Routing relationship and explicit EBOM gap, and keeps
   release action behavior. The old Product Recipe path redirects to Production Version.
5. Added a shared `normalizeWorkOrderDetail` helper and localized text helper to prevent flat-vs-document
   response regressions.
6. Updated `LocalizedTextFields` with bordered light/dark-theme-compatible controls and clear locale
   sections. Existing Apply for all behavior is preserved.
7. Rebranded active user-facing runtime surfaces, portal, MES title/header, kiosk login, Keycloak
   display name, product documentation, seed site name, and MES flow-test expectation to S-Factory.
   Technical identifiers such as the Keycloak realm `wonsealtech` remain unchanged intentionally.
8. Added `scripts/consolidated-demo-cleanup-reseed.sh`. It is dry-run by default, requires
   `APP_ENV=development|demo`, `APPLY=1`, and `CONFIRM_DEMO_CLEANUP=YES`, runs service-owned SQL in
   dependency order, preserves all master-data databases, invokes existing WMS/QMS seed tooling,
   and prints post-run counts.
9. Updated the existing WMS demo seed to populate mandatory `request_code`, work-order/work-center
   business fields, item code, name, and UOM fields. This fixed a real post-migration seed failure.
10. Added `InfoTooltip`, Item Type `Description (CODE)` labels in list/select/detail surfaces, and an
    Item + Revision detail modal opened by row click/keyboard activation.
11. Added migration `0009_work_center_capability_cycle_time` to the existing
    `md_resource_capability` ownership boundary. Work Center CRUD now edits supported operations and
    required cycle time. Routing creation now displays localized revision names, translated Routing
    Type options, removes Change Reason from its UI, and creates an operation flow only from active
    capabilities for the selected Work Center. The API rejects routing operations without a positive
    cycle-time capability.

## Verification

- `npm --prefix services/mes-console run build`: PASS. Vite emitted only the existing chunk-size warning.
- `npm run typecheck --workspace=mes-console`: PASS.
- `npm run i18n:scan`: PASS (`i18n static coverage check passed`); localized field components no
  longer render translation placeholders.
- `npm run build --workspace=mes-master-data-service`: PASS after migration and seed changes.
- `git diff --check`: PASS.
- `docker compose -f infra/docker-compose.yml ps`: PASS. MES, WMS, QMS, Keycloak, Kong, and console
  containers were running and database health checks were healthy.
- `npm run build --workspaces --if-present`: PASS for shared libraries, kiosk, MES Console,
  master-data, QMS Console/services, WMS Console/services, and portal. Existing Vite chunk-size
  warnings remain non-blocking.
- Rebuilt and recreated `mes-console`, `portal`, `kiosk-operator-ui`, and
  `mes-master-data-service`; final `docker compose ps` showed the containers running and the
  master-data service healthy. Startup logs confirmed migrations through 0008 and seed completion.
- Rebuilt/recreated MES Console and master-data after migration 0009. Startup logs confirmed
  migration 0009 applied, seed completion, and healthy service status. Live capability API returned
  HTTP 200 with positive `cycle_time_sec` values.
- Final MES Console image rebuild/recreate completed; MES Console and master-data containers are up,
  with master-data healthy. Browser interaction remains unautomated, but compiled controls and API
  contract checks passed.
- Cleanup dry run: PASS; refused destructive execution without flags.
- Guarded cleanup/reseed run: PASS after seed fix. Results: WMS 11 warehouses, 20 locations, 43 bins,
  20 lots, 24 stock movements, 6 inbound receipts, 7 material requests; QMS 4 inspection results,
  4 NCRs, and 4 CAPAs; MES execution transaction tables were empty after cleanup. Master-data DBs
  were not truncated.
- First guarded run exposed `material_request.request_code` missing from `scripts/seed-wms-demo.ts`;
  the seed was corrected and the complete run was repeated successfully.

## Known limits and follow-up

- Product Recipe currently reads existing resources; it does not add recipe persistence or EBOM CRUD.
- This is `IMPLEMENTED_AND_VERIFIED` for the selected Option 2 aggregator and `MISSING` only for EBOM,
  which was explicitly kept out of scope rather than conflated with MBOM.
- Related-record filtering depends on the fields present in each existing API response. A backend
  read-model contract should be added before making this page a transactional recipe editor.
- Browser-level click verification remains `IMPLEMENTED_BUT_NOT_TESTED` in this environment; compile,
  live compose health, API, migration, and database/seed verification were completed.
- Historical implementation/process reports may retain the former brand as historical evidence;
  active runtime/configuration surfaces were changed. The Keycloak realm technical name remains
  `wonsealtech` for SSO compatibility.
