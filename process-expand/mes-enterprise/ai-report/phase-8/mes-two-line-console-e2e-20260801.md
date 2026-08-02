# Phase 8 Report: MES Console Two-Line UX

Date: 2026-08-01

Status: IMPLEMENTED_AND_VERIFIED

## Implemented

- Work Order detail shows selected Production Line, line-selection mode/status, fallback reason, line lock state, primary/backup evaluated results, `ResourceHold` blockers, and operation line scope.
- Resource candidate panel shows the selected line context and renders only backend-returned candidates/blockers.
- Audited line replan UI requires a reason and calls `POST /work-orders/{id}/line-replan`.
- Replan controls are hidden for unauthorized users and after execution start.
- Work Order creation UI exposes Auto line selection and the one-WO-one-line invariant.
- Creation workflow summary displays backend line-selection status, selected line code, and fallback reason.
- Added VI, EN, JA, and KO translations for line selection, fallback, resource hold, line lock, replan, and new backend error codes.

## Verification

Commands executed:

- `npm --prefix services/mes-console run typecheck`
- `npm --prefix services/mes-console run build`
- `MES_E2E_BASE_URL=http://127.0.0.1:13994 npm run test:e2e:resource-planning:phase8`
- `go test ./...` from `services/mes-execution-service`
- `git diff --check`

Browser E2E scenarios:

- backend fallback selected line, blockers, replan action, refresh persistence, and no raw UUID display: passed
- `ResourceHold` blocker translation and unauthorized replan hidden: passed
- Work Order creation Auto line selection and post-start in-place line transfer hidden/explained: passed

Declared: 3
Executed: 3
Passed: 3
Failed: 0
Skipped: 0

Environment:

- Fresh MES Console Vite server: `http://127.0.0.1:13994`
- Browser project: Chromium
- API responses for Phase 8 browser assertions were mocked in Playwright for deterministic UI-state coverage; backend invariants remain verified by Phase 7 execution API tests.

## Gate

Phase 8 gate passed for MES Console UX. The browser displays backend-owned line planning state and does not calculate or promote line readiness independently.
