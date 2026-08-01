# EBOM UX Base Component Migration

Date: 2026-07-30

## Scope

Improve the MES Console EBOM screen using the existing Base component layer
without changing EBOM business logic, API contracts, validation, lifecycle, or
engineering-to-manufacturing conversion behavior.

## Changes

- `services/mes-console/src/routes/master-data/EbomScreen.tsx`
  - Replaced the hand-written EBOM header `<table>` with `BaseDataTable`,
    including shared sorting, pagination, loading, empty state, sticky header,
    and row selection behavior through the existing wrapper.
  - Routed create and component-edit dialogs through the shared `BaseModal`
    implementation, with centered placement and the common footer/content
    layout. The local `Modal` name is retained only as a compatibility alias.
  - Made `/master-data/eboms` list-only and added `/master-data/eboms/:id` for
    the full detail editor. The list row and its action icon navigate to the
    detail route; the detail action buttons are available from one More actions
    dropdown icon.
  - Kept the hierarchical design-tree renderer because it is a specialized
    parent/child editor. Add-child, reorder, expand/collapse, draft removal,
    validation, save, release, and conversion handlers were not changed.

## Explicitly unchanged

- EBOM API endpoints and payloads.
- Draft tree validation and cycle detection.
- Release lifecycle and immutable released behavior.
- EBOM-to-MBOM draft conversion.
- Local draft semantics before Save Tree.
- List/detail navigation and action-menu presentation are UI-only changes.

## Verification

- `npm --prefix services/mes-console run build` passed.
- `git diff --check` passed.
- No backend or database change was made for the EBOM UX migration.
## EBOM UX follow-up (2026-07-30)

The EBOM screen now follows the MBOM master/detail interaction model without changing the EBOM API or lifecycle rules:

- `/master-data/eboms` is a full-width `BaseDataTable`; selecting a row or its detail action navigates to `/master-data/eboms/:id`.
- The routed detail view uses padded cards and a dedicated context header. The global Create action is list-only.
- Detail mutations are behind one overflow menu. Expand All and Collapse All were removed, and Add Root is presented as Add Component while retaining the existing tree behavior.
- Release continues to call the existing `releaseResource('ebom-headers', ...)` path and therefore keeps backend validation and Draft-to-Released immutability unchanged.
- Draft-only Delete EBOM uses the existing `deleteResource` dependency-aware endpoint and `BaseConfirmation`; Released EBOMs expose neither delete nor edit actions.
- Existing line editing, replacement save, conversion, and localized field behavior were preserved.

Verification: `npm --prefix services/mes-console run build` passed after the UI-only changes. No database migration, API contract, backend lifecycle, or execution-flow change was made in this follow-up.
