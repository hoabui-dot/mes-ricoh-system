# MES Machine Browser E2E

## Scope

This suite verifies the Machine master-data flow only:

`Machine Definition -> Physical Machine Unit -> Workstation requirement -> effective Resource Assignment -> readiness/history -> dependency protection`.

Work Order candidate resolution, Work Order allocation, APS, dispatch, OEE, and predictive maintenance are intentionally excluded.

## Runtime prerequisites

- Ubuntu Docker Compose stack is running.
- MES Console is reachable at `MES_E2E_BASE_URL` (server default: `http://100.68.50.41:13052`).
- The configured Keycloak SSO and Kong/MES Master Data API are reachable.
- A released `SITE-KZ3`, Work Center (default `WC-MIXING`), and Workstation (default `WS-MIXING-01`) exist.
- Playwright Chromium is installed with `npx playwright install chromium`.

Credentials are never stored in the repository. Supply `MES_E2E_USERNAME` and `MES_E2E_PASSWORD` at runtime.

## Commands

```bash
MES_E2E_BASE_URL=http://100.68.50.41:13052 \
MES_E2E_USERNAME=... MES_E2E_PASSWORD=... \
ALLOW_E2E_MUTATION=true \
MES_MASTER_DATA_DATABASE_URL=... \
npm run test:e2e:machine
```

Use `npm run test:e2e:machine:headed` for a visible browser and
`npm run test:e2e:machine:debug` for Playwright Inspector. Use
`npm run test:e2e:machine:report` to open the generated HTML report.

The test is serial and generates a unique `E2E-MACHINE-*` namespace. The after-suite cleanup deletes only resources whose localized name begins with that run ID, in child-before-parent order. Cleanup refuses production and reports when a database URL is unavailable.

## Authentication and API setup

The browser uses the existing Keycloak redirect and PKCE login; credentials are supplied only at runtime. The test captures the current Console request identity headers from the browser's normal MES API traffic; it does not create a second login mechanism. Site and Work Center are read through the API as prerequisites. Machine Definition, Physical Unit, Workstation, and Machine Requirement mutations are performed through the Console UI.

## Verified browser flow

The suite creates a unique Machine Definition, refreshes the list, registers a Physical Machine Unit, refreshes the detail page, rejects a duplicate serial, creates a disposable Workstation and Primary Machine Requirement through the Workstation UI, and verifies the current backend invariant that requirement persistence creates the effective Resource Assignment atomically. It then verifies the exact unit, readiness/history, ends the assignment, and verifies dependency-aware deletion.

The current backend intentionally does not require a second assignment mutation for the same requirement. The standalone Resource Assignment form still supports `machine_unit_id` for direct assignment cases, but the E2E flow avoids creating a duplicate assignment for a requirement-owned unit.

## Troubleshooting

- `ECONNREFUSED` or HTTP 5xx: check `docker compose ... ps`, `13052`, `13020`, Kong `18000`, and Keycloak `18080`.
- Login page remains open: verify the demo Keycloak user and that the current Console bundle points at the current Keycloak URL.
- Missing fixture: set `MES_E2E_SITE_CODE`, `MES_E2E_WORK_CENTER_CODE`, or `MES_E2E_WORKSTATION_CODE` to a released fixture.
- Cleanup blocked: run only in a development/demo database and provide `MES_MASTER_DATA_DATABASE_URL`.

## Demo presentation rules

Machine Definitions show localized name first and business code second. Physical units are separate cards with asset/serial identity, execution/lifecycle state, planning eligibility, assignment context, and paginated card navigation. Requirements, assigned machines, readiness, and assignment history are separate concepts. No raw UUID or Work Order allocation state is part of this suite.
