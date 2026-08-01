# Complete Browser E2E Verification and Demo Polishing: Machine Flow

## Inspection

- Existing framework: `@playwright/test` was already a root dev dependency, but there was no maintained Machine browser suite or Playwright configuration.
- Runtime feasibility: verified from the Ubuntu development host. MES Console `http://100.68.50.41:13052/`, Portal `:13000`, and Master Data health `http://100.68.50.41:13020/health` returned HTTP 200. Docker services, Keycloak, Kong, Kafka, MES Console, and Master Data were running.
- SSO: verified with the current Keycloak redirect and `wonsealtech` realm. No alternate login path was added.
- Existing reusable verification: `test:mes:machine-flow`, `machines:reset`, and `machines:verify` remain the API/seed checks. Browser coverage is additive.
- Existing domain: Machine Definition, Physical Machine Unit, Workstation Machine Requirement, `md_resource_assignment`, and Work Order allocation remain separate owners.

## Implemented

- Added `playwright.config.ts` with serial Chromium execution, explicit timeouts, failure screenshots/video/traces, and HTML report output.
- Added `e2e/machine/machine-flow.spec.ts` with unique namespace, Keycloak login, UI create/refresh/unit/duplicate/Workstation requirement/assignment/readiness/history/dependency checks, and scoped cleanup.
- Added `scripts/cleanup-mes-machine-e2e.mjs`; cleanup is child-before-parent, namespace-scoped, development-only, and never targets `WST-*` demo fixtures.
- Added stable `data-testid` selectors for Machine list/form, Physical Unit panel/form/cards, and Resource Assignment selectors.
- Added Physical Machine Unit selection to Resource Assignment UI. The selector is loaded from the selected Equipment and sends `machine_unit_id`, matching the authoritative assignment model.
- Added `test:e2e:machine`, headed, debug, and report commands.
- Added `docs/testing/mes-machine-browser-e2e.md`.

## Verification status

The browser runtime was installed with `npx playwright install chromium`. The full mutating suite passed against the Ubuntu server through the real Keycloak redirect:

```text
Base URL: http://100.68.50.41:13052
Run ID: E2E-MACHINE-1785486699734-A719AA
Browser: Chromium
Result: 1 passed, 0 failed
Cleanup: CLEANED
Cleanup counts: 1 assignment, 1 requirement, 1 group, 1 workstation, 2 units, 1 machine definition
```

The suite is intentionally scoped to the Machine master-data flow. It does not test Work Order allocation, APS, dispatch, OEE, or Print Station execution.

## Findings and corrections

- The original browser harness expected a serial number on Workstation detail, while the UI correctly displays the physical unit business code. The assertion now checks the unit code and keeps serial validation on the Machine detail page.
- The cleanup connection was documented and executed against the server's published master-data database port `15434`, not the unrelated `15432` port.
- The Workstation create form previously sent `machine_groups` in the create request and then sent the same groups again through the replacement endpoint. That produced duplicate groups and assignments. Create now lets the create endpoint persist the initial groups; the replacement endpoint is used only for edit.
- The test fixture now creates the Workstation and Machine Requirement through the browser. The backend requires a Primary requirement and atomically creates its effective assignment, so the suite verifies that invariant rather than issuing a duplicate standalone assignment.

## Additional verification

```text
npm run machines:verify       PASS (19 machines, 40 units, 17 groups, 37 assignments, invalid=0)
npm run test:mes:machine-flow PASS (15 passed, 0 failed, 0 skipped; cleanup PASS)
npm run build --workspace=mes-console PASS
npx tsc --noEmit -p services/mes-console/tsconfig.json PASS
git diff --check              PASS
Docker mes-console rebuild    PASS; container started
```

The Vite bundle still reports the existing non-blocking large-chunk warning.
