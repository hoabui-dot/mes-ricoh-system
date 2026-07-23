# Demo Page Detail Modals for MES Console and WMS Console

Date: 2026-07-22

## Requirement

Because this is a demo version, each MES Console and WMS Console page should expose a top-right detail button. Clicking it should open a styled, user-friendly modal explaining:

- What this page is for.
- How to use the page.
- What data appears on the page.
- Important statuses and business meanings.
- Demo-version notes and limitations.

The content must be client-side only and translated for VI/EN/JA/KO. It must not require database fields or backend APIs.

## Analysis Summary

Read and checked:

- Product overview: `product-doc/product-doc.md`
- WMS console build prompt and feature flow: `process/Phase-2-Step-3.md`
- Current MES routes in `services/mes-console/src/App.tsx`
- Current WMS routes in `services/wms-console/src/routes.tsx`
- Existing UI primitives and shell layout in both consoles
- Existing i18n package usage via `@mom-platform/i18n-ui-shared`

Domain findings:

- MES demo flow centers on Item Revision, MBOM, Routing, Production Version, Work Order planning, WorkCenter/labor capacity, and release/readiness checks.
- WMS demo flow centers on Warehouse/Zone/Location/Bin structure, stock balances, lots, movement ledger, inbound receipts, and material staging requests.
- Static explanatory content belongs in frontend locale/client content, not in the database. Database i18n remains for dynamic master-data fields.

## Implementation

### WMS Console

Added:

- `services/wms-console/src/components/shared/PageDetailButton.tsx`
- Wired into `services/wms-console/src/components/layout/AppShell.tsx`

The WMS detail modal uses existing Radix/shadcn-style `Dialog`, `Button`, and styled content blocks.

Route-aware content covers:

- Dashboard
- Warehouse Map
- Inventory Balances
- Inventory Movements
- WMS Master Data pages
- Inbound pages
- Outbound pages
- Generic fallback

### MES Console

Added:

- `services/mes-console/src/components/PageDetailButton.tsx`
- Wired into `services/mes-console/src/App.tsx`

MES currently has no dialog primitive dependency, so the component uses a dependency-free accessible fixed modal pattern styled with existing MES `Button` and `Card` primitives.

Route-aware content covers:

- Work Order list
- Work Order create
- Work Order detail
- Item & Revision
- MBOM
- Routing
- Production Version
- Labor/capacity pages
- Tier 2 master-data pages
- i18n Review
- Generic fallback

## UI Behavior

- The button appears at the top-right of the route content area.
- The modal uses four sections:
  - How to use
  - Data shown here
  - Important statuses
  - Demo notes
- Content is localized client-side using the active locale from `useI18n`.
- No backend or database change is required.

## Verification

- `npm run build --workspace=wms-console` passed.
- `npm run build --workspace=mes-console` passed.
- `npm run i18n:scan -- services/mes-console/src services/wms-console/src` passed.
