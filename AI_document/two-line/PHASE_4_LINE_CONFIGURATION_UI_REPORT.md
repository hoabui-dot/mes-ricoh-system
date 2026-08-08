# Phase 4 MES Console Line Configuration Workspace Report

Date: 2026-08-07

## Objective

Provide one Production Line detail workspace for Work Center topology, line-scoped execution resources, Production Version eligibility, backend readiness, and audit evidence.

## Baseline findings

- Production Line details exposed only generic master-data fields and did not provide an authoring workflow for Work Center membership or Resource Assignment scope.
- Backend readiness data existed on the detail response but was not presented as an authoritative readiness view.
- The Console had no API helpers or cache invalidation for line topology and resource-scope replacement.
- The generic release banner used Workstation and Print Station wording for Production Lines.

## Implementation summary

- Added Overview, Work Centers, Execution Resource Scope, Eligibility, Readiness, and History tabs to Production Line details.
- Added searchable Work Center selection, add/remove/reorder controls, mandatory flags, transactional save, inline diagnostics, and success feedback.
- Added searchable Resource Assignment selection constrained to configured Work Centers, scope identity/context display, remove/save behavior, and backend validation errors.
- Readiness displays the backend status and blockers; the Console does not infer runtime readiness locally.
- Added Production Line-specific release copy and completed Vietnamese, English, Japanese, and Korean labels for the new workspace.
- Added shared API helpers and invalidated affected Production Line, Work Center, and Resource Assignment query caches after mutations.

## Files changed

- `services/mes-console/src/lib/masterDataApi.ts`
- `services/mes-console/src/routes/master-data/ResourceFoundationScreen.tsx`
- `services/mes-console/src/i18n.ts`
- `e2e/resource-planning/phase6-production-lines.spec.ts`
- `AI_document/two-line/PHASE_4_LINE_CONFIGURATION_UI_REPORT.md`

## Tests and verification

- MES Console TypeScript/Vite production build: PASS.
- Docker image rebuild and Console restart: PASS.
- Console HTTP root and nginx startup log: PASS.
- Playwright Production Line workspace spec: PASS, 3/3.
- E2E proves Draft create/delete, all hierarchy tabs, backend readiness, Work Center save, Resource Scope save, and `409` protection when removing a scope from a Released line.
- E2E asserts the outbound replacement payload is actually reduced before checking the backend guard, preventing a false positive caused by stale UI state.
- Visual evidence: `artifacts/playwright/phase4-production-line-resource-scope.png`; no raw translation key, overlap, or incorrect Workstation release wording remains in the tested desktop viewport.

## Remaining risks

- The current Console bundle remains larger than Vite's advisory 500 kB threshold. This is pre-existing performance debt and does not block the line configuration flow.
- Mobile behavior is responsive by layout constraints but the phase E2E currently captures a desktop viewport only.

## Phase gate

PASS
