# Phase 9 - Full API and E2E Regression after Two-Line Integration

Date: 2026-08-02

Status: PASS

## Scope

Phase 9 verified the full two-production-line resource planning behavior after Phase 8 console integration, plus maintained one-line API/browser regression coverage. The verification followed `process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md`:

- Inspect -> Document -> Design -> Implement -> Migrate -> Test -> Verify -> Fix -> Retest -> Report -> Gate.
- No skipped tests counted as pass.
- No cross-service database reads were introduced in source code.
- Candidate APIs remain advisory; commit/replan paths revalidate.
- Generated test data was cleaned up and orphan checks were performed.

## Environment

- Execution API: Docker service on `http://127.0.0.1:13030/api/mes/execution`.
- Phase 9 isolated execution API: local service on port `13993` against the local execution database.
- Master Data API: `http://127.0.0.1:13020/api/mes/master-data`.
- MES Console: Vite dev server on `http://127.0.0.1:13994`.
- Kong gateway for browser API calls: `http://127.0.0.1:18000`.
- Databases:
  - `postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db`
  - `postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db`

The `mes-master-data-service` container was rebuilt and restarted from current source during verification because the previously running container did not expose the Phase 6 production-line route. After rebuild, `/api/mes/master-data/production-lines` returned HTTP 200 and the Phase 6 browser regression passed.

## Implementation Completed for Phase 9

- Added `test:mes:two-line-full-regression:phase9` npm script.
- Extended `scripts/test-mes-two-line-resource-planning-phase7.mjs` for Phase 9 full-regression mode.
- Added Phase 9 scenarios for primary calendar outage, missing required operation resource, maintenance-style primary resource outage, primary-capacity competition, both-lines-capacity hold, new Work Order after eligibility change, and idempotent retry.
- Hardened maintained test harnesses to avoid date/site/work-center fixture drift.
- Replaced the previously skipped resource-planning authorization browser check with an executable negative API assertion.
- Stabilized Phase 8 production-version selection for localized console labels.

## API Regression Results

Command:

```bash
npm run test:mes:two-line-full-regression:phase9
```

Result:

- Declared: 19
- Passed: 19
- Failed: 0
- Skipped: 0

Scenario coverage:

| Required behavior | Result |
| --- | --- |
| Migration tables and line columns exist | PASS |
| Primary line Ready selected | PASS |
| Primary full / blocked, backup Ready fallback | PASS |
| Primary machine maintenance / resource outage, backup fallback | PASS |
| Primary calendar unavailable, backup fallback | PASS |
| Missing required operation resource on primary, backup fallback | PASS |
| Both lines blocked -> ResourceHold | PASS |
| Mixed-line allocation backend reject | PASS |
| Concurrent Work Orders compete for primary line capacity | PASS |
| First Work Order consumes primary, second falls back to backup | PASS |
| Both lines capacity exhausted -> ResourceHold | PASS |
| Replan before execution starts | PASS |
| Audited line change after release before start | PASS |
| Line change after execution start rejected | PASS |
| Snapshot immutable after eligibility change | PASS |
| New Work Order uses new eligibility | PASS |
| Idempotent retry creates one Work Order | PASS |
| Idempotent retry creates one line selection decision | PASS |
| Idempotent retry creates one WOCreated outbox event | PASS |

The Phase 9 selector validates Work Center, capability, standard, calendar, and reservation projections. Physical Machine Unit maintenance remains owned by machine-resource planning flows; the Phase 9 maintenance-style two-line outage is represented by disabling all primary-line Work Centers in the execution resource projection.

## Maintained API Regression Results

| Command | Result |
| --- | --- |
| `npm run test:mes:machine-flow` | PASS, 15 passed, 0 failed, 0 skipped |
| `npm run test:mes:resource-planning-flow` | PASS, committed 3 operation allocations, exact primary unit snapshots 3, idempotency replays 3 |
| `npm run test:mes:resource-planning-domain:phase1` | PASS, 20 passed, 0 failed, 0 skipped |
| `npm run test:mes:resource-planning-full-flow:phase2` | PASS_FOR_PHASE_2, nested Phase 1 PASS 20/20 |
| `npm run test:mes:product-definition-snapshot:phase4` | PASS |
| `npm run test:mes:two-line-master-data:phase6` | PASS, 9 passed, 0 failed, 0 skipped |

## Browser and Console Regression Results

| Command | Result |
| --- | --- |
| `npm --prefix services/mes-console run typecheck` | PASS |
| `npm --prefix services/mes-console run build` | PASS with non-blocking Vite chunk-size warning |
| `npm run test:e2e:resource-planning:phase3` | PASS, 6 passed |
| `npm run test:e2e:resource-planning:phase4` | PASS, 1 passed |
| `npm run test:e2e:resource-planning:phase6` | PASS, 1 passed |
| `npm run test:e2e:resource-planning:phase8` | PASS, 3 passed |
| `npm run test:e2e:resource-planning:all` | PASS, 16 passed, 0 failed, 0 skipped |
| `npm run test:e2e:machine:all` | PASS, 2 passed, 0 failed, 0 skipped |

Browser coverage confirmed:

- Line state and candidate filtering are visible in the console.
- Fallback message and allocation persistence survive page refresh.
- Approval and execution guards remain enforced.
- Authorization rejects unauthorized resource allocation.
- Localized production-version selection remains functional.
- Machine-flow browser regression remains green.

## Static and Build Verification

| Command | Result |
| --- | --- |
| `go test ./...` in `services/mes-execution-service` | PASS |
| `node --check scripts/test-mes-two-line-resource-planning-phase7.mjs` | PASS |
| `node --check scripts/test-mes-machine-flow.mjs` | PASS |
| `node --check scripts/test-mes-resource-planning-flow.mjs` | PASS |
| `node --check scripts/test-mes-resource-planning-full-flow.mjs` | PASS |
| `git diff --check` | PASS |

## Cleanup and Orphan Verification

| Area | Result |
| --- | --- |
| Phase 9 generated Work Orders | PASS, harness verified zero target `wo_header` rows after cleanup |
| Phase 9 generated workflows | PASS, harness verified zero target workflow rows after cleanup |
| Phase 9 fixture projection rows | PASS, harness verified zero target projection rows after cleanup |
| Phase 2 full-flow cleanup | PASS, deleted Work Orders: 2, remaining target rows: 0 |
| Phase 4 snapshot cleanup | PASS, remaining Work Orders: 0 |
| Browser resource-planning cleanup | PASS, cleanup logs reported remaining Work Orders 0 and shared fixtures restored |
| Browser machine-flow cleanup | PASS, result `CLEANED` |

## Gate

PASS.

- Required Phase 9 API scenarios pass with 19/19 and no skips.
- Required browser scenarios pass through aggregate and phase-specific Playwright suites.
- Maintained machine/resource-planning/Work Order/master-data/production-definition/browser/concurrency/numbering regressions pass.
- Mixed-line allocation is rejected by backend trigger coverage.
- Idempotency and outbox duplicate-prevention coverage pass.
- Cleanup is exact for generated data and orphan checks pass.
- No known guardrail violation remains for Phase 9.
