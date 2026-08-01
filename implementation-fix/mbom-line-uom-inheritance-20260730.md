# MBOM Line UOM Inheritance

Date: 2026-07-30

## Decision

The authoritative UOM for a manufacturing component is the Item Revision
`base_uom_id`. MBOM line UOM is derived metadata, not an independent choice.
The MBOM form therefore displays the UOM as read-only.

## Implementation

- Selecting an Item Revision automatically updates the line UOM from its
  `base_uom_id`.
- Opening an existing component editor rehydrates the derived UOM.
- The quantity input uses the derived UOM precision and fraction rules.
- MBOM line create, edit, structure replacement, and validation reject a line
  whose UOM differs from the Item Revision base UOM with
  `MBOM_LINE_UOM_MUST_MATCH_COMPONENT_REVISION`.
- Item, Item Revision, and MBOM header UOM management remain separate concerns.

## Verification

- MES Console typecheck passed.
- MES Master Data TypeScript build passed.
- UI no longer renders a UOM selector for MBOM component lines.
- Backend validation remains authoritative for direct API requests.
