# MES Console Modal and Panel Layout Fix

Date: 2026-07-24
Status: **EBOM implemented and verified; canonical primitive established; legacy modal consumers remain migration work**

## Root cause

Create EBOM used a screen-local `fixed inset-0 z-50` overlay with no portal, no dedicated scroll
region, and no viewport height contract. The navbar is `sticky top-0 z-40`, so copied overlays could
compete with the navbar stacking context. Long localized forms overflowed instead of scrolling
inside a capped panel.

## Fix

Added `services/mes-console/src/components/ui/modal.tsx`, exported through the shared UI index. It
uses `createPortal(document.body)`, `z-[100]`, semantic surface tokens, viewport-relative max
height, body-only scrolling, and shrink-to-content pinned header/footer regions. Create EBOM now
uses this primitive; its locale fields, validation, handler, and payload are unchanged. The footer
Create button submits the existing form by ID.

## Blast-radius audit

Screen-local overlays found: `EbomScreen` (migrated), `ItemsScreen` (create/detail/edit),
`EmployeesScreen` (create/edit), `WorkCentersScreen` (create/edit/capability), `ShiftsScreen`
(create/edit), `WorkCalendarScreen` (confirmation), `WOCreateScreen` (workflow), `WODetailScreen`
(reject), `ProductionVersionScreen`, `RoutingScreen`, `WorkOrderDetailModal`, and
`PageDetailButton`. Existing detail panels have some viewport caps, but these consumers still use
screen-local wrappers and are explicitly not claimed as migrated.

## Verification

- MES Console `npm run build`: PASS.
- Navbar is `z-40`; canonical modal is `z-[100]`.
- Modal body is the only scroll region; header/footer are `shrink-0`.
- Browser screenshots and short-viewport automation were unavailable; verification is source/layout
  inspection plus production build.
