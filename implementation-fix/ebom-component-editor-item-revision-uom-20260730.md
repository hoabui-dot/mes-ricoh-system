# EBOM Component Editor Reconciliation

Date: 2026-07-30

## Scope

The former EBOM tree editor was replaced with a flat component table without changing
the EBOM aggregate or adding manufacturing behavior. The editor remains engineering-only.

## Changes

- Added a searchable Component Item editor using the shared `ComboboxBase`.
- Added Item -> Item Revision dependency. Revision choices are filtered by `item_id`, and changing
  the Item clears the selected Revision and derived UOM.
- A sole matching Item Revision is auto-selected and displayed read-only; a selector is shown only
  when two or more matching revisions exist.
- Sequence is displayed as a flat row number and normalized by the complete save; it is not an Add
  Component input.
- Replaced the tree presentation with a flat `BaseDataTable` containing Sequence, Component Item,
  Component Revision, derived UOM, Quantity, and Remove action.
- Removed expand/collapse, root, add-child, parent/child, and reorder controls from the UI.
- Replaced the editable UOM selector with a non-input information block showing the localized UOM
  name derived from the selected Item Revision base UOM.
- Removed Parent Component and Reference Designator from the EBOM editor. `parent_line_id` remains
  only as a backward-compatible storage field and flat saves normalize it to null; it is not a
  manufacturing main/substitute concept.
- Replaced the raw quantity input with `UomNumberInput`, including positive quantity, decimal
  precision, and fraction-policy validation.
- Add Component opens the component dialog immediately; saving appends one flat row.
- Added VI/EN/JA/KO translations for the new fields, numeric validation messages, and
  `ebom.saveAction`.
- Improved shared `ComboboxBase` so it actually filters options using `searchText`, label, and
  description.
- Updated EBOM detail API mapping to return `component_item_id` and localized `uom_name`.
- Updated design-tree persistence to derive the authoritative UOM from the selected component
  Item Revision and validate that derived UOM is Released. Client UOM IDs are not authoritative.
- The design-tree endpoint now normalizes every submitted line to `parent_line_id = null`, so direct
  API callers cannot recreate a manufacturing-style hierarchy. Legacy columns remain for historical
  compatibility and are not exposed by the engineering editor.

## Scope protection

No Issue Operation, Scrap, Substitute, Phantom, Backflush, Optional, or Maximum Usage field was
added to the EBOM editor. MBOM conversion and Work Order material explosion remain the only
manufacturing paths.

## Verification

- `npm --prefix services/mes-console run build` passed.
- `npm --prefix services/mes-master-data-service run build` passed.
- `git diff --check` passed after the final common-combobox and backend validation edits.
- Rebuilt and recreated `mes-console` and `mes-master-data-service` with the MES compose files.
- `GET /api/mes/master-data/ebom-headers` and `GET /api/mes/master-data/ebom-headers/:id` returned
  successfully after restart; detail response included the EBOM target and current line payload.
- Runtime service started and ran migrations through `0058`; health was temporarily `degraded`
  because Kafka was disconnected during the check, unrelated to the EBOM HTTP/API path.

## Remaining note

The production bundle retains the existing size warning from Vite. No EBOM schema migration was
needed because the requested behavior reuses the existing Item Revision base UOM and tree replacement
contract.
