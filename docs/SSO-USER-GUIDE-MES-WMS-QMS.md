# S-Factory MOM Platform
## User Guide: SSO and the MES, WMS, and QMS Flow

**Audience:** plant managers, executives, operators, warehouse staff, and QC technicians

**Verified:** 2026-07-23

This guide describes the currently deployed user flow for the three operational consoles. It is based on
the running containers, the `wonsealtech` Keycloak realm, the portal source, and live Kong API checks.

## 1. System Entry Points

| Area | URL | Main users | Purpose |
|---|---|---|---|
| Unified Portal | `http://100.68.50.41:13000` | Everyone | One starting point for the available applications. |
| MES Console | `http://100.68.50.41:13052` | Executive, plant manager, operator, QC | Production master data, work orders, execution visibility, and traceability. |
| WMS Console | `http://100.68.50.41:13091` | Executive, plant manager, warehouse staff | Warehouses, locations, inventory, inbound receiving, and outbound staging. |
| QMS Console | `http://100.68.50.41:13130` | Executive, plant manager, QC technician | Inspection plans/results, nonconformance, disposition, and CAPA. |

Keycloak login is provided by:
`http://100.68.50.41:18080/realms/wonsealtech`.
Users do not create separate accounts for each console. The same Keycloak account and realm roles are
used across the platform.

## 2. Before You Start

1. Use a current desktop or tablet browser with JavaScript and cookies enabled.
2. Connect to the network that can reach ports `13000`, `13052`, `13091`, `13130`, and `18080`.
3. Start at the Unified Portal unless an administrator has given you a direct console link.
4. Use the language selector in the application header. Vietnamese is the default; the supported locales
   are Vietnamese, English, Japanese, and Korean.
5. Never use the demo passwords in production. Replace seeded credentials before a real plant rollout.

## 3. Demo Accounts and Access

These accounts are for the installed demonstration environment only.

| User | Password | Realm role | Portal behavior |
|---|---|---|---|
| `admin` | `Admin@123!` | `EXECUTIVE` | Shows the MES, WMS, and QMS chooser. |
| `plant.manager` | `Manager@123!` | `PLANT_MANAGER` and, in the live seed, `EXECUTIVE` | Shows the MES, WMS, and QMS chooser. |
| `operator01` | `Operator@123!` | `OPERATOR` | Goes directly to MES. |
| `warehouse.staff` | `Warehouse@123!` | `WAREHOUSE_STAFF` | Goes directly to WMS. |
| `qc.tech01` | `Quality@123!` | `QC_TECHNICIAN` | Shows the MES and QMS chooser; both consoles are directly accessible. |

The portal does not decide permissions from the username. It reads the Keycloak realm roles in the
access token. A user may therefore see a different set of applications after an administrator changes
their role assignment.

## 4. What SSO Does

The platform uses one Keycloak realm and four OIDC clients:

| Client | Application |
|---|---|
| `portal-client` | Unified Portal |
| `mes-client` | MES Console |
| `wms-client` | WMS Console |
| `qms-client` | QMS Console |

Each browser console uses Authorization Code with PKCE. The normal flow is:

```text
User -> Portal -> Keycloak login -> portal-client token
                         |
                         +-> selected console -> console client token
                                                -> Kong API with Bearer token
```

The Keycloak browser session is shared by the clients in the `wonsealtech` realm. When a user opens a
second console, that console still performs its own client login redirect, but Keycloak normally reuses
the existing session and does not ask for the password again.

## 5. First Login Through the Portal

1. Open `http://100.68.50.41:13000`.
2. The portal redirects to the Keycloak login page.
3. Enter the account credentials and submit the form.
4. Keycloak returns the browser to the portal with the authenticated session.
5. The portal reads `realm_access.roles` and calculates the applications entitled to the user.
6. If exactly one entitled application is live, the portal redirects to it.
7. If two or more applications are entitled, the portal shows an application chooser.
8. If no application is entitled, the portal shows an access-denied/no-access state.

Executive and plant-manager users see all three live applications. A single-purpose operator, warehouse
staff member, or QC technician normally goes directly to their primary console.

When the chooser is shown, selecting an application opens that console in a new browser tab. WMS and QMS
are deployed and live; they are not pending portal cards.

## 6. Direct Console Login and SSO Reuse

Direct URLs are supported for all three consoles:

1. Open the console URL.
2. The console checks its own Keycloak client session.
3. If there is no session, it redirects to Keycloak.
4. If the Keycloak session already exists, Keycloak returns to the console without asking for credentials.
5. The console stores the authenticated user, subject ID, roles, and access token in its auth context.
6. API requests use the console client token where gateway authentication is enabled.

This means a manager can open WMS directly after using MES and normally will not log in again. Direct
access does not bypass role checks: the console and its backend still evaluate the role assigned to the
token.

## 7. MES User Flow

**URL:** `http://100.68.50.41:13052`

MES is the production execution and planning console. A typical office-user flow is:

1. Sign in through the portal or open the MES URL directly.
2. Review master data such as items, revisions, routings, MBOMs, production versions, work centers,
   employees, shifts, and work calendars.
3. Confirm that the item revision, routing, MBOM, work center, and production version are released and
   valid before planning a work order.
4. Create or open a work order.
5. Use **Determine Demand** to calculate material demand from the production version and MBOM.
6. Use **Compute and Check** to validate master-data readiness and operation/material consistency.
7. A planner or manager reviews the result and approves or rejects the work order according to their
   role. Rejection should include a reason and the planner corrects the source data before retrying.
8. Shop-floor operators execute the approved operations through the MES execution flow or the kiosk UI.
9. The execution flow records operation start/finish, material scans, quantities, scrap, labels, and
   traceability relationships.
10. At the QC operation, PASS can issue the finished label. FAIL requires a reason and does not issue a
    PASS label; it emits the inspection-failure business event used by QMS.

The main production route in the demo is `FG-WS-CM01`: mixing, metal preparation, cutting, molding,
trimming, and final QC. The kiosk uses a separate operator-oriented login pattern with Keycloak Direct
Access Grant and is intended for trusted shop-floor terminals rather than shared office navigation.

## 8. WMS User Flow

**URL:** `http://100.68.50.41:13091`

WMS manages the physical stock location and warehouse movement lifecycle:

1. Sign in through the portal or open WMS directly.
2. Review the warehouse map and warehouse/location master data.
3. Check inventory balances by product, lot, expiry date, warehouse, zone, and location.
4. For inbound stock, create or open an inbound request, receive the material, validate quantities and
   lot/expiry data, and complete putaway to a storage location.
5. For outbound demand, create or open an outbound request, allocate stock using the available lot data
   and FEFO rules, stage the picked stock at the work-center staging location, and confirm dispatch.
6. Use the stock movement history and recent-movement details to verify the audit trail.
7. Do not treat a work-center staging location as ordinary storage: it represents stock made available
   to production and is part of the MES/WMS handoff.

Warehouse staff normally receive only the WMS application from the portal. Plant managers and executives
can use WMS alongside MES and QMS.

## 9. QMS User Flow

**URL:** `http://100.68.50.41:13130`

QMS manages inspection evidence and corrective action:

1. Sign in through the portal or open QMS directly.
2. Open the inspection queue and filter pending, passed, failed, or historical results.
3. Open a pending result and review the inspection plan, product/lot context, characteristic type,
   specification limits, unit, and sampling information.
4. Record Attribute results as pass/fail and Variable results as measured values. Check the displayed
   limits before submitting.
5. Submit the result only after reviewing the values. The UI asks for confirmation before the state
   changes.
6. A passing result completes the inspection normally.
7. A failing result requires a defect/reason context. The inspection service publishes the failure event,
   and the nonconformance service creates or reuses an NCR idempotently.
8. Open the NCR queue to review severity, source inspection, affected product/lot, containment, and
   status.
9. Record a disposition such as use-as-is, rework, return, or scrap when authorized.
10. Open or update the linked CAPA, assign an owner and due date, record root cause/corrective action,
    and move it through its lifecycle.
11. Use the NCR-to-CAPA links and inspection history to demonstrate traceability during review.

The QMS demo seed contains plan lifecycle states, Attribute and Variable characteristics, pending/pass/
fail/history results, defect codes, NCR states, dispositions, CAPA states, and NCR/CAPA links so each
screen can be exercised without inventing records.

## 10. Roles at a Glance

| Role | MES | WMS | QMS | Typical responsibility |
|---|---:|---:|---:|---|
| `EXECUTIVE` | Yes | Yes | Yes | Cross-cluster oversight and review. |
| `PLANT_MANAGER` | Yes | Yes | Yes | Planning, warehouse coordination, and quality escalation. |
| `OPERATOR` | Yes | No | No | Shop-floor execution and operation confirmation. |
| `WAREHOUSE_STAFF` | No | Yes | No | Receiving, putaway, inventory, picking, staging, and dispatch. |
| `QC_TECHNICIAN` | Yes | No | Yes | QC execution, inspection results, NCR, and CAPA work. |

Application visibility is the first role gate. Fine-grained business permissions remain owned by the
domain services and may restrict actions inside an application even when the application itself is visible.

## 11. Logout, Expiry, and Multiple Tabs

- Use the user menu's logout action in the console you are leaving.
- The console calls Keycloak logout and returns to its own origin.
- Front-channel logout is enabled for Portal, MES, WMS, and QMS clients, so Keycloak can notify open
  application sessions. A browser refresh may be needed if a tab was suspended by the browser.
- Console access tokens are short-lived and are refreshed by the MES and WMS auth contexts while the
  session remains valid. QMS follows the same Keycloak session model.
- If refresh fails or the session expires, return to the portal and sign in again.
- Avoid opening the same console in several tabs while a deployment is being rebuilt; close stale tabs
  after a login or logout configuration change.

## 12. Troubleshooting

| Symptom | Likely cause | User action |
|---|---|---|
| Repeated redirect to Keycloak | Expired/corrupt browser session | Log out from Keycloak, clear site cookies for the host, then reopen the portal. |
| `invalid redirect_uri` | Wrong URL, port, or stale bookmark | Use the URLs in Section 1 and report the exact URL to the administrator. |
| Portal says no access | No entitled realm role | Ask the Keycloak administrator to verify the user's realm role. |
| Console loads but API shows `401` | Missing or expired bearer token | Refresh the page and sign in again. |
| API shows `403` | Token belongs to another client or lacks the required role | Open the correct console and ask for the correct role assignment. |
| WMS/QMS data is blocked by CORS | Origin or gateway configuration mismatch | Report the browser origin, API URL, and timestamp; do not disable browser security. |
| MES page has data without a token | Legacy MES Kong route behavior | Treat as a platform security issue and report it; this is scheduled for Phase 4 hardening. |
| `Keycloak instance can only be initialized once` | Stale frontend bundle or duplicate initialization regression | Hard-refresh the console; if it persists, report the console and browser. The current MES/WMS/QMS code uses an idempotent initialization guard. |
| Page is unavailable | Container or reverse proxy is down | Check the platform status and contact the platform administrator. |

## 13. Administrator Verification Checklist

Use this checklist after a deployment or Keycloak change:

- [ ] Portal, MES, WMS, and QMS return HTTP 200 on their documented ports.
- [ ] Keycloak realm `wonsealtech` is healthy.
- [ ] `portal-client`, `mes-client`, `wms-client`, and `qms-client` redirect to `13000`, `13052`,
      `13091`, and `13130` respectively.
- [ ] Front-channel logout URLs use the same four deployed origins.
- [ ] A role-scoped token has the expected `azp`, `sub`, `preferred_username`, and realm roles.
- [ ] WMS and QMS Kong APIs return `401` without a token and `403` for a wrong client token.
- [ ] MES browser login works, but MES API routes currently require the Phase 4 security decision to
      add the same bearer-token enforcement used by WMS and QMS.
- [ ] The portal build uses `VITE_MES_URL`, `VITE_WMS_URL`, and `VITE_QMS_URL` values matching the
      deployed ports; Vite values are build-time values.

## 14. Verified Current State

On 2026-07-23, live checks confirmed:

- All four web entry points returned HTTP 200.
- Keycloak issued `portal-client`, `mes-client`, `wms-client`, and `qms-client` tokens.
- MES, WMS, and QMS authenticated API checks returned HTTP 200 with the expected role-scoped users.
- WMS and QMS unauthenticated checks returned HTTP 401.
- WMS with a QMS token and QMS with a WMS token returned HTTP 403.
- The live WMS Keycloak client was corrected from the stale `4001` origin to `13091`.
- MES master-data currently returned HTTP 200 without a bearer token because its Kong routes still use
  legacy forwarded-header behavior. This does not invalidate browser SSO, but it is not equivalent to
  WMS/QMS API enforcement and must be closed as part of the Phase 4 security audit.

## 15. Related Technical Records

- [AI context](../AI_CONTEXT.md)
- [Product and process overview](../product-doc/product-doc.md)
- [SSO implementation audit](../implementation-fix/sso-mes-wms-qms-verification.md)
- [Portal SSO hotfix](../implementation-fix/sso-flow-portal-hotfix.md)
- [Project workload tracker](../process/PROJECT_WORKLOAD_PROGRESS.md)
