# Workstation Operation Capability Terminology and Help Content

## Scope

Implemented `process-fix/Correct-Workstation-Operation-Capability-Terminology-and-Help-Content.md` for the MES Console. The existing capability contract remains unchanged: each row still stores `operation_id`, `cycle_time_sec`, `setup_time_min`, and `base_quantity` on the Workstation-to-Operation relationship.

## Changes

- Renamed the user-facing `Base quantity` translation to `Reference quantity` / `Số lượng tham chiếu` and equivalent Japanese/Korean terminology. Planning and Production Standard forms reuse the same translation key, so the terminology is consistent without changing database column names.
- Rewrote Supported operations helper text in Vietnamese, English, Japanese, and Korean to explain that timing belongs to the specific Workstation + Operation pair.
- Added the reusable `FieldHelpPopover` based on the existing shadcn/Radix Popover primitives. It opens on hover, keyboard focus, click, and mobile interaction, with localized content and opaque elevated-surface styling.
- Added help controls for Supported Operation, Cycle Time, Setup Time, and Reference Quantity.
- Added localized business definitions covering planning use, setup occurring once before production, and reference-quantity scaling examples.
- Added a Workstation detail capability section showing operation name/code and the stored timing values, plus a localized planning-flow help popover. UUIDs are not displayed.
- Added a Workstation-specific Page Details guide covering Operation Catalog, capability setup, Work Center assignment, Routing selection, Workstation resolution, Machine Groups, and planning duration.

## Verification

- `npm run build --workspace=services/mes-console`: passed.
- Existing capability fields and save payload remain unchanged.
- `git diff --check`: passed.
- Runtime Docker rebuild/restart is recorded after this report is written.
