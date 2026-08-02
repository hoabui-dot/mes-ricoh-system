# Phase UI-04 Report — Shared UI Components and Server-State Standardization

Status: PASSED  
Date: 2026-08-02  
Artifact directory: `artifacts/mes-console-remediation/phase-04/2026-08-02T15-37-53Z/`

## Entry Gate

Previous report `AI_document/Phase-03/REPORT_PHASE_03.md` contains:

```text
PHASE_UI_03_PASSED_READY_FOR_UI_04
```

Phase UI-04 was authorized.

## Scope Implemented

- Added typed frontend API contracts in `apiTypes.ts`.
- Added typed `fetchResourceEnvelope<T>()`, `queryString()`, and `normalizeApiError()` without breaking legacy `fetchResource()`.
- Added `BaseFilterBar` with stable query-state and dependent filter reset support.
- Added `BaseBlockerList` for translated backend blocker display with diagnostic expansion.
- Added `BaseDependencyPanel` and `BaseAuditTimeline` foundations.
- Extended `BaseDataTable` with error/retry and filtered-empty behavior.
- Extended `BaseStates` with recoverable error and forbidden states.
- Extended `StatusBadge` with typed `kind` variants for lifecycle, Work Order, readiness, line selection, resource, and active states.
- Migrated `ProductionVersionScreen` as the representative retained screen to TanStack Query, typed API rows, server-backed URL filters, shared table states, shared dependency panel, and shared audit timeline.

## Files Changed

- `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md`
- `AI_document/Phase-04/REPORT_PHASE_04.md`
- `e2e/resource-planning/phase4-shared-ui-foundation.spec.ts`
- `package.json`
- `services/mes-console/src/components/StatusBadge.tsx`
- `services/mes-console/src/components/base/BaseBlockerList.tsx`
- `services/mes-console/src/components/base/BaseDataTable.tsx`
- `services/mes-console/src/components/base/BaseFilterBar.tsx`
- `services/mes-console/src/components/base/BasePanels.tsx`
- `services/mes-console/src/components/base/BaseStates.tsx`
- `services/mes-console/src/components/base/index.ts`
- `services/mes-console/src/i18n.ts`
- `services/mes-console/src/lib/apiTypes.ts`
- `services/mes-console/src/lib/masterDataApi.ts`
- `services/mes-console/src/lib/queryKeys.ts`
- `services/mes-console/src/routes/master-data/ProductionVersionScreen.tsx`

## API, Database, Seed, Migration Impact

- Backend API changes: none.
- Database migrations: none.
- Canonical seed changes: none.
- UAT fixture behavior unchanged.
- Temporary UAT Work Orders were prepared only for retained regression tests and then cleaned up.

## Artifacts

- `manifest.json`
- `baseline.json`
- `changes.json`
- `build-results.json`
- `api-integration-results.json`
- `browser-e2e-results.json`
- `cleanup-results.json`
- `acceptance-results.json`
- `component-inventory.json`
- `component-decision-matrix.json`
- `consumer-migration-matrix.json`
- `query-key-inventory.json`
- `accessibility-smoke.json`
- Screenshot: `production-version-shared-ui.png`

## Verification

Static/build:

- `npm --prefix services/mes-console run typecheck`: passed.
- `npm --prefix services/mes-console run build`: passed, existing Vite chunk-size warning only.
- `docker build -t mom-platform-mes-console -f services/mes-console/Dockerfile --build-arg VITE_KEYCLOAK_URL=http://100.68.50.41:18080 --build-arg VITE_API_BASE_URL=http://100.68.50.41:18000 .`: passed, existing npm audit warnings only.
- Recreated `mes-console` container on `platform-net`, port `13052`: passed.
- `git diff --check`: passed.

API health:

- `GET /api/mes/master-data/production-versions?limit=10&lifecycle_status=Released`: passed.
- `GET /api/mes/master-data/item-revisions?limit=10`: passed.
- `GET /api/mes/master-data/items?limit=10`: passed.
- Count: declared 3, executed 3, passed 3, failed 0, skipped 0.

Browser E2E:

- `npm run test:e2e:shared-ui:phase4`: declared 1, executed 1, passed 1, failed 0, skipped 0.
- `npm run test:e2e:route-navigation:phase3`: declared 1, executed 1, passed 1, failed 0, skipped 0. The first run failed because UAT Work Orders had been intentionally cleaned up; after `npm run prepare:mes:two-line-uat`, the retained route smoke passed.
- `npm run test:e2e:two-line-uat:phase2`: declared 1, executed 1, passed 1, failed 0, skipped 0.

Accessibility smoke:

- Production Version heading, table, filter labels, reset, refresh, detail dialog, and Escape close behavior passed.
- Count: declared 8, executed 8, passed 8, failed 0, skipped 0.

Cleanup and seed:

- `npm run cleanup:mes:two-line-uat`: removed 3 Work Orders, remaining Work Orders 0, leaks 0.
- Final `npm run verify:mes:canonical-seed`: passed 40/40 checks; execution Work Orders 0.

## Known Issues

- The repository has no `mes-console` unit-test script despite an existing isolated Vitest test file. UI-04 component behavior was verified through TypeScript, build, browser smoke, and accessibility smoke.
- Legacy page-local tables/modals/status spans still exist in screens not migrated in this phase. They are inventoried and intentionally deferred to their owning later phases to avoid a broad rewrite.
- `BaseAuditTimeline` is a display foundation only; no backend audit endpoint was added in UI-04.
- Print station and third-party flows remain outside this phase and were not required for this gate.

## Rollback

- Revert `ProductionVersionScreen.tsx` to the previous `useEffect`/manual fetch implementation if the representative migration must be backed out.
- Remove `BaseFilterBar`, `BaseBlockerList`, `BasePanels`, and `apiTypes.ts` if the shared foundation needs to be reverted.
- Restore previous `StatusBadge`, `BaseDataTable`, `BaseStates`, `masterDataApi`, and `queryKeys` changes.
- Remove `e2e/resource-planning/phase4-shared-ui-foundation.spec.ts` and `test:e2e:shared-ui:phase4`.

## Acceptance

- One canonical wrapper exists for each approved shared concern: passed.
- No new duplicate table/modal/status implementation introduced: passed.
- Modified server-state paths use TanStack Query consistently: passed.
- Modified API contracts are typed: passed.
- Representative retained screen uses the shared foundation: passed.
- Loading/error/empty/retry behavior is consistent: passed.
- Accessibility smoke passes: passed.
- Retained-route smoke passes: passed.
- No domain behavior changed: passed.
- No mandatory test skipped: passed.
- Report authorizes UI-05: passed.

```text
PHASE_UI_04_PASSED_READY_FOR_UI_05
```
