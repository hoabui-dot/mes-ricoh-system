# Phase 5 Production Line Release Gate Report

Date: 2026-08-07

## Objective

Prevent structurally incomplete Production Lines from becoming Released or participating as downstream Primary/Backup candidates.

## Baseline findings

- Generic Production Line release updated lifecycle without validating topology or Resource Assignment scope.
- Detail readiness only counted Work Centers and Production Version eligibility; it did not validate hierarchy, effectivity, resource references, or shared Work Center scope.
- Missing Production Version eligibility was represented as a blocker even though eligibility is configured downstream after line release.
- The Console rendered backend blockers but did not prevent the release action when blockers existed.

## Implementation summary

- Added one structural readiness evaluator shared by detail, explicit readiness, and release endpoints.
- Structural blockers cover inactive/expired lines, empty or expired Work Center membership, unreleased/inactive/expired Work Centers, Site/Area mismatch, missing explicit scope for shared Work Centers, invalid scope hierarchy, inactive/unreleased assignment or resource references, and cross-line assignment conflicts.
- A dedicated Work Center may retain the approved no-scope fallback. A shared Work Center requires explicit line scope.
- Missing Production Version eligibility is a non-blocking warning, avoiding a release/eligibility dependency cycle.
- Runtime operational state, capacity, and online status are intentionally excluded from structural release.
- Generic release now evaluates readiness inside the same database transaction and returns `422 PRODUCTION_LINE_RELEASE_NOT_READY` with categorized diagnostics before any lifecycle update.
- Console release is disabled while backend blockers exist, diagnostics show category and severity, and a successful release reloads authoritative detail/readiness.

## Files changed

- `services/mes-master-data-service/src/infrastructure/http/line-release-readiness.ts`
- `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
- `services/mes-master-data-service/service.manifest.yaml`
- `services/mes-master-data-service/test/unit/line-release-readiness.test.ts`
- `services/mes-console/src/routes/master-data/ResourceFoundationScreen.tsx`
- `services/mes-console/src/i18n.ts`
- `e2e/resource-planning/phase5-line-release.spec.ts`
- `AI_document/two-line/PHASE_5_LINE_RELEASE_GATE_REPORT.md`

## Schema and API changes

- No schema migration.
- Added `GET /api/mes/master-data/production-lines/:id/readiness`.
- `GET /api/mes/master-data/production-lines/:id` now returns the same authoritative `readiness_summary` contract.
- `POST /api/mes/master-data/production-lines/:id/release` now returns `422` with `{ valid: false, error, readiness }` when structurally blocked.

## Tests and commands

- Master Data unit suite: PASS, 9 files and 40 tests.
- Master Data TypeScript build: PASS.
- MES Console TypeScript/Vite production build: PASS.
- Docker rebuild/restart of Master Data and Console: PASS; health endpoints OK.
- Phase 5 Playwright E2E: PASS.
- Phase 4 and Phase 5 combined regression: PASS, 4/4.
- E2E proves empty-line rejection, disabled Console release, structured diagnostics, shared-Work-Center missing-scope rejection, valid scoped release, persisted `approved_at`, post-release readiness, and exact fixture cleanup.
- Existing Phase 4 E2E continues to prove destructive Work Center/Resource Scope removal is rejected for Released lines.

## Remaining risks

- Release readiness validates structural resource lifecycle/effectivity but intentionally does not prove operation-level candidate feasibility; Phase 6 owns that side-effect-free evaluation.
- Historical outbox rows from disposable E2E releases are retained as audit/event evidence; fixture master-data rows are removed exactly.

## Phase gate

PASS
