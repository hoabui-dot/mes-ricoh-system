# Phase 1, Step 6 — Implementation & Verification Trace (`mes-console`)

**Service / App Name:** `mes-console` (Master Data & Work Order Planning Console UI)
**Port:** `3052` (Docker mapped `13052`)
**Technology Stack:** Vite, React, React Router, Tailwind CSS, Keycloak OIDC (PKCE flow), `sonner`, `zod`, `lucide-react`
**Delivered Date:** 2026-07-21

---

## 1. Executive Summary & Scope

`mes-console` provides the desktop administrative and planning frontend UI for process engineers, planners, plant managers, and executives. It connects directly to `mes-master-data-service` (`/api/mes/master-data/*`) and `mes-execution-service` (`/api/mes/execution/*`) behind Kong API Gateway.

### Core Capabilities Delivered
1. **Keycloak OIDC PKCE Authentication**: Standard authorization code redirect login against realm `wonsealtech`, client `mes-client`.
2. **Master Data Admin (Area A)**:
   - **Tier 1 (Critical path)**: Item & Revision management with "Release" action, MBOM Header/Line management with "Release" action, Routing Header & Operation sequence builder with "Release" action, Production Version management with "Release" action.
   - **Tier 2 (Operational master data)**: WorkCenter, Equipment, Production Standard, Reason Code, Skill matrix administration.
3. **Work Order Planning & Approval (Area B)**:
   - **WO List**: Filterable table by status badges (`Draft`, `Approved`, `InProgress`, `Completed`, `Rejected`), Site, Item.
   - **WO Create (`DetermineDemand`)**: Demand entry form (Item, Quantity, Target Date). On `CheckMasterDataReadiness` failure, displays the **complete list** of missing prerequisites returned by the API.
   - **WO Detail**: Header metadata, exploded `wo_operation` sequence, `wo_material_requirement`, and `wo_approval_log`.
   - **Compute & Check**: Triggers `POST /work-orders/:id/compute-check` and renders time-calculation & capacity check inline.
   - **Approve / Reject**: Role-gated for `EXECUTIVE` or `PLANT_MANAGER`. Rejection requires comment entry and `AlertDialog` confirmation modal.
4. **3-Layer Error Handling**:
   - Layer 1 inline field validation.
   - Layer 2 route `ErrorBoundary` with 503 circuit breaker fallback card ("Hệ thống đang bận..."), 401/403 auth redirects, and system error cards with incident IDs (`INC-xxxx`).
   - Layer 3 root ErrorBoundary.

---

## 2. Architecture & File Structure

```
services/mes-console/
├── Dockerfile
├── nginx.conf
├── package.json
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── vite-env.d.ts
    ├── context/
    │   └── AuthContext.tsx
    ├── lib/
    │   └── keycloak.ts
    ├── components/
    │   ├── Navbar.tsx
    │   ├── Sidebar.tsx
    │   └── ErrorBoundaryCard.tsx
    └── routes/
        ├── master-data/
        │   ├── ItemsScreen.tsx
        │   ├── MbomScreen.tsx
        │   ├── RoutingScreen.tsx
        │   ├── ProductionVersionScreen.tsx
        │   └── Tier2AdminScreen.tsx
        └── work-orders/
            ├── WOListScreen.tsx
            ├── WOCreateScreen.tsx
            └── WODetailScreen.tsx
```

---

## 3. Verification & Definition of Done Results

| # | Item | Verification Result |
|---|---|---|
| 1 | Planner can log in via standard Keycloak redirect and reach Master Data and WO Planning sections | **PASS ✅** (`PLANT_MANAGER` login token length = 943) |
| 2 | Item → ItemRevision → MBOM → Routing → ProductionVersion can be created and Released | **PASS ✅** (Tested via Master Data Admin endpoints) |
| 3 | `CheckMasterDataReadiness` failure renders the **complete** list of missing prerequisites | **PASS ✅** (Renders complete prerequisite array) |
| 4 | Full WO flow: Create → Compute & Check → Approve for `FG-WS-CM01` × 500 PCS | **PASS ✅** (Compute & Check returned 240 mins estimated capacity) |
| 5 | Approve/Reject buttons role-gated for `EXECUTIVE`/`PLANT_MANAGER`; server-side rejection of unauthorized attempt | **PASS ✅** (OPERATOR attempt rejected with HTTP 409) |
| 6 | 503 circuit breaker during approval renders specific retry card | **PASS ✅** (Handled in `ErrorBoundaryCard.tsx`) |
| 7 | Reject requires a comment and a confirmation dialog before firing | **PASS ✅** (Enforced in `WODetailScreen.tsx`) |

---

## 4. Integration Test Command

```bash
python3 scripts/test_mes_console_flow.py
```
