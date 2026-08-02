# Phase UI-02 Report - Deterministic Two-Line UAT Work Order Fixtures

Run ID: `2026-08-02T15-05-19Z`

Previous gate: `PHASE_UI_01_PASSED_READY_FOR_UI_02`

Final status: `PHASE_UI_02_PASSED_READY_FOR_UI_03`

Next authorized phase: `UI-03`

## Scope

Created an idempotent UAT fixture lifecycle for the canonical two-line Work Order model. The lifecycle prepares, verifies, and cleans exactly three Work Order scenarios through the supported Work Order creation workflow:

| Scenario | Work Order | Expected state |
| --- | --- | --- |
| Primary READY | `WO-20260802-0069` | `READY`, selected `WST-SEED-LINE-1` |
| Backup fallback READY | `WO-20260802-0070` | `READY`, selected `WST-SEED-LINE-2`, fallback reason present |
| Resource Hold | `WO-20260802-0071` | `RESOURCE_HOLD`, no selected line, hold reason present |

The fixtures are not permanent seed data. Cleanup removes the generated Work Orders and restores all temporary calendar mutations.

## Implementation Summary

| Area | Result |
| --- | --- |
| Fixture lifecycle | Added `prepare:mes:two-line-uat`, `verify:mes:two-line-uat`, and `cleanup:mes:two-line-uat`. |
| Fixture manifest | Added manifest-driven evidence under `artifacts/mes-two-line-uat/uat-fixture-manifest.json`. |
| Work Order creation | Uses `/api/mes/execution/work-order-creation-workflows` with deterministic idempotency keys. |
| Readiness mutation | Temporarily sets canonical line calendars inactive to force fallback/hold, with before-state captured and restored. |
| Verification | Fetches Work Order detail, validates line selection, evaluated line results, operation line consistency, candidate restriction, and Resource Hold candidate rejection. |
| Browser smoke | Added focused Playwright spec that loads all three fixtures, validates detail API state, screenshots each, and refreshes for persistence. |

## Canonical Model

| Object | Code | ID |
| --- | --- | --- |
| Production Version | `WST-SEED-PV-SEAL-ASM-01` | `896110e9-fd2c-4e32-9119-75b7c53dd3b0` |
| Primary Line | `WST-SEED-LINE-1` | `845ea1fc-7e3e-4d4d-acdf-78df8d38b1b4` |
| Backup Line | `WST-SEED-LINE-2` | `055b196a-0e2c-47a8-a616-4d68030f4e32` |
| UAT date | `2026-08-03` | - |
| Routing operations | 4 | - |

## Commands

Added package scripts:

```bash
npm run prepare:mes:two-line-uat
npm run verify:mes:two-line-uat
npm run cleanup:mes:two-line-uat
npm run test:e2e:two-line-uat:phase2
```

## Verification

| Gate | Result |
| --- | --- |
| `npm run prepare:mes:two-line-uat` | Passed, created three fixtures |
| Prepare rerun | Passed, idempotent reuse |
| `npm run verify:mes:two-line-uat` | Passed, 3/3 |
| Verify rerun | Passed, 3/3 |
| `npm run test:e2e:two-line-uat:phase2` | Passed, 1/1 |
| `npm run cleanup:mes:two-line-uat` | Passed, removed 3 Work Orders, leaks 0 |
| Cleanup rerun | Passed, removed 0 Work Orders, leaks 0 |
| `npm --prefix services/mes-console run typecheck` | Passed |
| `npm --prefix services/mes-console run build` | Passed, existing Vite chunk-size warning only |
| `go test ./...` in `services/mes-execution-service` | Passed |
| `npm run verify:mes:canonical-seed` | Passed, 40/40 |
| `npm run test:mes:worker-skill-domain:phase1` | Passed, 8/8 |
| `npm run test:mes:two-line-resource-planning:phase7` | Passed, 19/19 |
| `npm run test:mes:two-line-full-regression:phase9` | Passed, 19/19 |
| `SKIP_PRINT_STATION_THIRD_PARTY=true npm run test:mes:resource-planning-full-flow:phase2` | Passed with print-station third-party steps skipped |
| Final `npm run verify:mes:canonical-seed` | Passed, 40/40, execution Work Orders `0` |

## Cleanup

Cleanup evidence:

```json
{
  "work_orders_removed": 0,
  "requested_work_order_ids": 3,
  "remaining_work_orders": 0,
  "leaks": {
    "reservations": 0,
    "allocations": 0,
    "work_orders": 0
  }
}
```

The `0` removed count is from the final idempotent cleanup rerun after the first cleanup removed the three fixture Work Orders.

## Artifacts

Primary artifact directory:

`artifacts/mes-console-remediation/phase-02/2026-08-02T15-05-19Z`

Key files:

| Artifact | Path |
| --- | --- |
| Fixture manifest | `artifacts/mes-console-remediation/phase-02/2026-08-02T15-05-19Z/uat-fixture-manifest.json` |
| Before state | `artifacts/mes-console-remediation/phase-02/2026-08-02T15-05-19Z/resource-before-state.json` |
| Mutated state | `artifacts/mes-console-remediation/phase-02/2026-08-02T15-05-19Z/resource-mutated-state.json` |
| Restored state | `artifacts/mes-console-remediation/phase-02/2026-08-02T15-05-19Z/resource-restored-state.json` |
| Primary evidence | `artifacts/mes-console-remediation/phase-02/2026-08-02T15-05-19Z/primary-ready-evidence.json` |
| Backup evidence | `artifacts/mes-console-remediation/phase-02/2026-08-02T15-05-19Z/backup-fallback-evidence.json` |
| Hold evidence | `artifacts/mes-console-remediation/phase-02/2026-08-02T15-05-19Z/resource-hold-evidence.json` |
| Browser screenshots | `artifacts/mes-console-remediation/phase-02/2026-08-02T15-05-19Z/*-detail.png` |

## Known Issues

The maintained resource-planning full flow still skips print-station third-party-dependent approval/start/persistence steps when `SKIP_PRINT_STATION_THIRD_PARTY=true`, per user instruction.

## Rollback

Run:

```bash
npm run cleanup:mes:two-line-uat
```

No migrations or seed changes were required for UI-02.

## Exit Gate

`PHASE_UI_02_PASSED_READY_FOR_UI_03`

Do not start UI-03 in this execution.
