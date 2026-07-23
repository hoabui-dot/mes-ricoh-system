# SSO Flow Portal Hotfix

Date: 2026-07-22  
Prompt: `process-fix/SSO-Flow.md`  
Type: SSO/IAM regression fix on completed Phase 0

## Result

The reported `plant.manager` behavior was verified against both hypotheses:

- H1, `portal-client` redirects to MES: not reproduced in checked-in config or live Keycloak after audit.
  `portal-client` points to `http://100.68.50.41:13000`.
- H2, Portal app-resolution sends a multi-app user to the first app: hardened. Portal now has explicit
  0/1/2+ app-resolution logic and tests.

Final behavior:

- `operator01` has only `OPERATOR`; Portal resolves exactly one live app and redirects to MES.
- `plant.manager` has `PLANT_MANAGER` and `EXECUTIVE`; Portal resolves MES + WMS + QMS and renders the
  chooser. WMS/QMS remain disabled pending cards.
- `admin` has `EXECUTIVE`; Portal resolves MES + WMS + QMS and renders the chooser.
- No-role users receive the Portal no-access page.

## Implementation

Code changes:

- Added `portal/src/lib/appResolution.ts`.
- Added `portal/src/lib/appResolution.test.ts`.
- Updated `portal/src/pages/PortalPage.tsx` to use explicit app decisions.
- Added `portal.redirecting` translations in VI/EN/JA/KO.
- Added `npm run test --workspace=mom-unified-portal` support in `portal/package.json`.

Policy:

- Role-entitled apps are counted even when a target app is not deployed yet.
- `0` apps -> no access.
- `1` live app -> direct redirect.
- `2+` apps -> chooser.
- Pending WMS/QMS are visible but disabled so multi-app users are not silently sent to MES.

AI rule update:

- `AI_CONTEXT.md` now documents that prompts in `process-fix/` write implementation evidence under
  `implementation-fix/`, while prompts in `process/` write under `implementation/`.

## Live Keycloak Audit

Checked and normalized live Keycloak clients via the admin API:

- `portal-client`: root/base URL `http://100.68.50.41:13000`; front-channel logout
  `http://100.68.50.41:13000/logout`.
- `mes-client`: root/base URL `http://100.68.50.41:13052`; front-channel logout
  `http://100.68.50.41:13052/logout`.
- At the time of the original hotfix, `wms-client` still showed the historical placeholder
  `http://100.68.50.41:4001`; the follow-up audit in
  `implementation-fix/sso-mes-wms-qms-verification.md` corrected the live and checked-in client to
  `http://100.68.50.41:13091`.
- At the time of the original hotfix, `qms-client` was also documented with the historical placeholder
  `http://100.68.50.41:4002`; the live and checked-in configuration is now `http://100.68.50.41:13130`.

Live drift fixed:

- Portal/MES/WMS logout URLs had localhost values in live Keycloak. The current WMS and QMS values are
  recorded in the follow-up audit and user guide.
- QMS live client only had localhost redirect/web-origin values; it now matches the realm export model.

## Verification

Commands run:

- `npm run test --workspace=mom-unified-portal` -> pass, 3 tests.
- `npm run build --workspace=mom-unified-portal` -> pass.
- `npm run lint --workspace=mom-unified-portal` -> pass.
- `docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml up -d --build portal` -> pass.
- `docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml ps portal keycloak mes-console`
  -> Portal healthy, Keycloak healthy, MES Console running.
- `curl -fsSI http://127.0.0.1:13000` -> HTTP 200.
- `curl -fsSI http://127.0.0.1:13052` -> HTTP 200.
- Keycloak token endpoint seed-user check:
  - `plant.manager` -> roles `PLANT_MANAGER`, `EXECUTIVE`.
  - `operator01` -> role `OPERATOR`.
  - `admin` -> role `EXECUTIVE`.

Browser-only checks not executed from this CLI session:

- Visual confirmation of Keycloak browser SSO session reuse across Portal -> MES.
- Browser front-channel logout callback fan-out.

The configuration and code paths for those flows were verified: each SPA uses its own Keycloak client,
all audited clients have front-channel logout enabled, and direct app URLs remain registered redirect URIs.
