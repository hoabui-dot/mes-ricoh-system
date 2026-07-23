# Implementation Trace — Phase 2 Step 3: WMS Console

**Date:** 2026-07-22  
**Prompt:** `process/Phase-2-Step-3.md`  
**Service:** `services/wms-console`  
**Status:** Completed

## Scope Delivered

- Added `wms-console` as a React 18 + Vite + TypeScript SPA, matching the actual `mes-console` stack rather than introducing Remix.
- Added Docker/nginx static serving:
  - `services/wms-console/Dockerfile`
  - `services/wms-console/nginx.conf`
  - host port `13091` -> container port `3091`
- Added compose wiring in `infra/docker-compose.wms.yml`.
- Added Keycloak Authorization Code + PKCE auth using realm `wonsealtech` and client `wms-client`.
- Preserved the one-time Keycloak init guard pattern to avoid the `"Keycloak instance can only be initialized once"` regression.
- Added app shell:
  - navy sidebar
  - top warehouse selector
  - locale switcher
  - command palette
  - dependency health indicator based on React Query 503 errors
  - route-level error boundary and 404 route
- Added i18n from first implementation using `libs/i18n-ui-shared`.
- Added React Query for server state and retry behavior that does not retry open-circuit `503` indefinitely.
- Added TanStack Table wrapper for dense grids.
- Added shadcn-style primitives used by the console:
  - Button
  - Input
  - Select
  - Badge
  - Card
  - Dialog
  - Sheet
  - Tabs
  - Tooltip
  - Table
- Added dashboard:
  - total on-hand quantity
  - near-expiry lot count
  - shortage navigation
  - staging-stock count
  - location quantity bar chart with Recharts
- Added Warehouse Map:
  - logical schematic for Zone -> Location -> Bin
  - live balance polling every 20s
  - Storage vs WorkCenterStaging visual distinction
  - expiry/near-expiry/occupied visual encoding
  - search-to-highlight
  - hover tooltip
  - right-side drawer with Overview/Balances/Movements tabs
- Added WMS Master Data UI:
  - Warehouses list/detail/create/status transition
  - Zones list/detail/create/status transition
  - Locations list/detail/create/status transition
  - Bins list/create under Location
  - Item UOM mapping list/create
- Added Inventory UI:
  - Balances list with filters
  - Lot detail from balance data
  - Movements backend-gap screen
  - Discrepancies backend-gap screen
- Added Inbound UI:
  - Receipt list route with backend-gap state
  - multi-line receipt create page
  - receipt detail route
  - confirm receipt action with pessimistic loading and 503 retry error state
- Added Outbound UI:
  - Material request list route with backend-gap state
  - material request create page
  - request detail route showing staging-first allocation breakdown

## Real Endpoint Verification

Verified from source before wiring UI:

- `wms-master-data-service`
  - `GET /api/wms/master-data/warehouses`
  - `POST /api/wms/master-data/warehouses`
  - `GET /api/wms/master-data/warehouses/:id`
  - `PUT /api/wms/master-data/warehouses/:id`
  - `GET /api/wms/master-data/warehouses/:id/zones`
  - `POST /api/wms/master-data/warehouses/:id/zones`
  - `GET /api/wms/master-data/zones/:id`
  - `PUT /api/wms/master-data/zones/:id`
  - `GET /api/wms/master-data/zones/:id/locations`
  - `POST /api/wms/master-data/zones/:id/locations`
  - `GET /api/wms/master-data/locations`
  - `GET /api/wms/master-data/locations/:id`
  - `PUT /api/wms/master-data/locations/:id`
  - `GET /api/wms/master-data/locations/:id/bins`
  - `POST /api/wms/master-data/locations/:id/bins`
  - `GET /api/wms/master-data/bins/:id`
  - `PUT /api/wms/master-data/bins/:id`
  - `GET /api/wms/master-data/item-uom-mappings`
  - `POST /api/wms/master-data/item-uom-mappings`
- `wms-inventory-service`
  - `GET /api/wms/inventory/balances`
  - `GET /api/wms/inventory/movements`
  - `POST /api/wms/inventory/movements/receipt`
  - `POST /api/wms/inventory/movements/transfer-to-staging`
- `wms-inbound-service`
  - `POST /api/wms/inbound/receipts`
  - `GET /api/wms/inbound/receipts/:id`
  - `POST /api/wms/inbound/receipts/:id/confirm`
- `wms-outbound-service`
  - `POST /api/wms/outbound/material-requests`
  - `GET /api/wms/outbound/material-requests/:id`

## Backend Gaps Found

The prompt explicitly said not to fabricate missing endpoints. These routes are therefore implemented as visible backend-gap empty states:

- `GET /api/wms/inbound/receipts` is not exposed. Receipt list cannot show real rows yet.
- `GET /api/wms/outbound/material-requests` is not exposed. Request list cannot show real rows yet.
- Inventory movement ledger read endpoint was added after the initial WMS Console implementation. Trace:
  `implementation/wms-warehouse-map-movement-ledger.md`.
- Discrepancy log read endpoint is not exposed. `inv_discrepancy_log` exists in the DB but has no read HTTP route.
- Receipt detail endpoint currently returns the header row only; receipt line read endpoint is not exposed.

## No-Delete Rule

- No DELETE API calls are implemented.
- No delete buttons or destructive delete confirmations are present.
- Deactivation uses status update (`Active`/`Inactive`) for Warehouse, Zone, and Location.

## Verification Evidence

Local build:

```bash
npm run build --workspace=wms-console
```

Result: passed.

i18n static scanner:

```bash
npm run i18n:scan:wms-console
```

Result: passed. The scanner needed elevated execution in this sandbox because `tsx` opens a local IPC pipe.

Docker build/run:

```bash
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml up -d --build wms-console
```

Result:

- `mom-platform-wms-console` image built.
- `wms-console` container started.

Container status:

```text
NAME          IMAGE                      COMMAND                  SERVICE       STATUS       PORTS
wms-console   mom-platform-wms-console   "/docker-entrypoint.…"   wms-console   Up           80/tcp, 0.0.0.0:13091->3091/tcp
```

Log check:

```text
wms-console  | /docker-entrypoint.sh: Configuration complete; ready for start up
wms-console  | 172.17.8.1 - - [22/Jul/2026:17:14:31 +0000] "HEAD /dashboard HTTP/1.1" 200 0 "-" "curl/7.81.0"
```

HTTP check:

```bash
curl -I http://127.0.0.1:13091/dashboard
```

Result:

```text
HTTP/1.1 200 OK
Server: nginx/1.31.3
Content-Type: text/html
```

## Manual UI Readiness Note

The implemented UI contains the full browser paths for:

- Warehouse -> Zone -> Location -> Bin creation.
- Receipt creation and confirmation.
- Material request creation and allocation-result detail.

Because this execution environment cannot complete an authenticated browser walkthrough through Keycloak, the verification evidence is build, i18n scan, Docker startup, nginx logs, and HTTP route serving. The backend API gaps above are visible in the UI instead of hidden with fabricated data.

## Dashboard Router Hotfix

Date: 2026-07-22.

Reported issue:

```text
Failed to execute 'text' on 'Response': body stream already read
```

Root cause:

- The WMS console fetch wrapper attempted `response.json()` first and then attempted `response.text()` in the catch branch for the same response body.
- Browser `Response` bodies are streams and can only be consumed once.
- During dashboard API failures or non-JSON responses, this made the original API state impossible to display cleanly.

Fix:

- `services/wms-console/src/lib/api/client.ts` now reads the response body once with `response.text()`.
- The cached body text is parsed as JSON when possible and retained as text otherwise.
- Empty bodies are handled as `null`.
- API calls now use `VITE_API_BASE_URL` when explicitly configured and otherwise default to same-origin `/api`.
- `services/wms-console/nginx.conf` proxies `/api/` to `http://kong:8000`, so the browser no longer needs cross-origin calls for normal WMS console traffic.
- `services/wms-console/Dockerfile` and `infra/docker-compose.wms.yml` now pass `VITE_API_BASE_URL` into the Vite build.
- WMS Kong auth pre-function now skips `OPTIONS` requests so direct Kong browser preflight can be answered by the global CORS plugin.

Verification:

```bash
npm run build --workspace=wms-console
npm run i18n:scan:wms-console
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml up -d --build wms-console
curl -I http://127.0.0.1:13091/dashboard
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml logs --tail=80 wms-console
```

Follow-up CORS verification:

```bash
curl -i -X OPTIONS 'http://127.0.0.1:13091/api/wms/master-data/locations?limit=500' \
  -H 'Origin: http://100.68.50.41:13091' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'

curl -i -X OPTIONS 'http://127.0.0.1:18000/api/wms/master-data/locations?limit=500' \
  -H 'Origin: http://100.68.50.41:13091' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

Result: both returned `HTTP/1.1 200 OK` with `Access-Control-Allow-Origin: http://100.68.50.41:13091`.
