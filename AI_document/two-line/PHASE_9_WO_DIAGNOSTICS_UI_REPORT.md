# Phase 9 Work Order Diagnostics UI Report

Date: 2026-08-07

## Objective

Make Production Version Primary/Backup configuration and Work Order line-selection decisions understandable in MES Console without duplicating backend rules.

## Baseline findings

- Production Version detail/edit already displayed line name/code, Primary/Backup role, priority, effective configuration, and backend structural readiness.
- Work Order list already exposed selected line, selection mode/status, fallback, Resource Hold, and Primary/Backup summaries with server-side filters.
- Work Order detail displayed persisted coarse dimensions but ignored the exact per-operation evidence added in Phase 7.
- Exact line evaluation could therefore be Ready or Blocked while old resource dimensions still appeared Deferred, obscuring the actual decision.

## Implementation summary

- Added a typed exact operation-evaluation contract to the Console.
- Added a backend-driven Primary/Backup operation feasibility matrix to Work Order detail.
- Each matrix cell shows operation status, feasible/total candidate count, and the first translated backend blocker.
- Added a complete-line result row and selected/not-selected decision label.
- Preserved existing coarse dimension diagnostics as historical/compatibility evidence; no readiness is recalculated in the browser.
- Added Vietnamese, English, Japanese, and Korean labels.
- Extended mocked and persisted Playwright coverage, including a locator screenshot of the exact matrix.

## Files changed

- `services/mes-console/src/routes/work-orders/workOrderContracts.ts`
- `services/mes-console/src/routes/work-orders/WODetailScreen.tsx`
- `services/mes-console/src/i18n.ts`
- `e2e/resource-planning/phase8-two-line-console.spec.ts`
- `e2e/resource-planning/phase8-work-order-list-diagnostics.spec.ts`
- `AI_document/two-line/PHASE_9_WO_DIAGNOSTICS_UI_REPORT.md`

## Schema and API changes

- No schema or backend API change.
- Console consumes the additive `evaluated_line_results[].operations[]` and `complete_line_feasibility_status` fields.

## Tests and commands

- MES Console TypeScript/Vite production build: PASS.
- Docker image build and restart for `mes-console`: PASS.
- Mocked Phase 9 browser diagnostics: 3/3 PASS.
- Persisted canonical list/filter/detail/refresh browser test: 1/1 PASS.
- Primary-selected, Backup fallback, Resource Hold, matrix rendering, hidden unauthorized action, and post-start replan UI: PASS.
- Visual evidence: `artifacts/playwright/two-line-phase9/work-order-list-three-states.png`.
- Visual evidence: `artifacts/playwright/two-line-phase9/work-order-hold-detail-matrix.png`.
- Visual evidence: `artifacts/playwright/two-line-phase9/work-order-operation-feasibility-matrix.png`.
- Canonical UI fixture cleanup removed 3 Work Orders with 0 allocation/reservation/WO leaks: PASS.

## Remaining risks

- The Work Order list is intentionally dense and relies on the existing horizontally scrollable data-table behavior at narrower widths.
- Legacy Work Orders created before exact diagnostics have no operation matrix; the existing evidence-unavailable notice remains for those records.

## Phase gate

PASS
