# MES, WMS, and QMS SSO Verification

Date: 2026-07-23  
Type: Cross-console SSO audit and user documentation

## Scope

This audit checked the shared Keycloak realm, all four browser entry points, Portal role resolution,
client redirect configuration, and Kong behavior for MES, WMS, and QMS. The user-facing result is
[`docs/SSO-USER-GUIDE-MES-WMS-QMS.md`](../docs/SSO-USER-GUIDE-MES-WMS-QMS.md).

## Findings and Changes

1. All three consoles are deployed: MES `13052`, WMS `13091`, QMS `13130`.
2. Portal defaults were stale for WMS (`4001`) and QMS (`4002`), and both cards were marked
   `coming-soon`. Portal defaults now use `13091` and `13130`, and both cards are live.
3. Checked-in `infra/keycloak/realm-export.json` now uses the WMS `13091` root, redirect, web-origin,
   admin, and front-channel logout URLs.
4. Live Keycloak `wms-client` was updated through the admin API to the same `13091` values.
5. `portal-client`, `mes-client`, `wms-client`, and `qms-client` each issue tokens with the expected
   `azp` client and realm roles.
6. WMS and QMS Kong routes enforce bearer authentication and reject a token issued for the other client.
7. MES browser SSO works, but the legacy MES Kong routes currently rely on pre-function forwarded-header
   behavior and return data without a bearer token. This is recorded as a Phase 4 security gap; it was
   not silently presented as equivalent to WMS/QMS enforcement in the user guide.

## Verified Results

| Check | Result |
|---|---|
| Portal HTTP health | PASS, HTTP 200 |
| MES Console HTTP health | PASS, HTTP 200 |
| WMS Console HTTP health | PASS, HTTP 200 |
| QMS Console HTTP health | PASS, HTTP 200 |
| Portal token (`admin`) | PASS, `azp=portal-client`, `EXECUTIVE` |
| MES token (`operator01`) | PASS, `azp=mes-client`, `OPERATOR` |
| WMS token (`warehouse.staff`) | PASS, `azp=wms-client`, `WAREHOUSE_STAFF` |
| QMS token (`qc.tech01`) | PASS, `azp=qms-client`, `QC_TECHNICIAN` |
| MES authenticated API request | PASS, HTTP 200 |
| WMS authenticated API request | PASS, HTTP 200 |
| QMS authenticated API request | PASS, HTTP 200 |
| WMS request without token | PASS rejection, HTTP 401 |
| QMS request without token | PASS rejection, HTTP 401 |
| MES request without token | GAP, HTTP 200 due to legacy route policy |
| WMS with QMS token | PASS rejection, HTTP 403 |
| QMS with WMS token | PASS rejection, HTTP 403 |

## User Flow Policy

- No entitled application: show no-access state.
- Exactly one entitled live application: redirect directly.
- Two or more entitled applications: show the chooser.
- All three applications are currently deployed and live.
- Direct URLs remain supported because each console owns its own PKCE client flow.

## Remaining Work

Phase 4 security hardening should add the same native Keycloak JWT verification and client/role policy to
the MES Kong routes. MES frontend API clients must send the current bearer token when that gateway policy
is enabled. This change should be implemented and tested as one coordinated task to avoid breaking the
MES Console API.

Browser-only visual SSO reuse and front-channel logout fan-out remain manual/Playwright checks; CLI
verification established the live URLs, client settings, token issuance, and gateway behavior.
