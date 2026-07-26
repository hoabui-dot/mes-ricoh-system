# WMS Material Request Fulfillment Detail Implementation

Date: 2026-07-24
Process source: `implementation-fix/WMS-Material-Request-Fulfillment-Detail.md`

## Root Cause and Evidence

- **IMPLEMENTED_AND_VERIFIED:** `MR-724ED238` is fulfilled from existing staging stock. Its real
  staging location is `STG-WC-MOLD` in `WH-KZ3-WIP / ZONE-WC-STAGING`, and the inventory ledger has a
  current `12.250 KG` balance with expiry `2026-07-25`. The detail API now returns the staging location
  ID, so the UI can resolve the hierarchy instead of showing prose only.
- **IMPLEMENTED_AND_VERIFIED:** Transfer rows are filtered by Work Order, Work Center, and Item
  Revision. A live `RM-STL-05-R1` request returns its single real transfer row, `367.525 PCS`, from
  `MET-M01-R01` to `STG-WC-MOLD`, with lot and expiry data. The previous implementation omitted the
  item filter and could have shown another component's transfer rows; that defect is fixed.
- **IMPLEMENTED:** The WMS detail page now renders a per-lot/per-movement table, existing-staging
  balance rows, UOM, expiry, movement timestamp/type, full Warehouse → Zone → Location → available Bin
  hierarchy, links to each existing detail route, and a warehouse-map deep link scoped by location ID.
  Shortage requests retain this traceability table and show the shortage amount above it, so a shortage
  state does not hide movement rows that do exist.
  The map consumes its existing implementation and now honors `?location_id=`.
- **IMPLEMENTED:** WMS quantities use one `formatWmsQuantity` utility based on fixed `en-US` grouping
  and decimal punctuation. This removes locale-dependent ambiguous comma output. The utility is used
  by outbound list/detail, inventory, map, and dashboard quantity displays.
- **IMPLEMENTED:** The visible `common.notAvailable` leak was caused by two facts: older outbound rows
  had null `item_name`, and WMS Console had no `common.notAvailable` resource. The resource is now
  translated in all four locales. A WMS outbound item-revision read model and consumer were added for
  future/retained MES item events; rows with no authoritative name remain a translated unavailable
  state rather than a raw key.
- **IMPLEMENTED_AND_VERIFIED:** `npm run i18n:scan` now validates literal `t('dotted.key')` calls
  against shared and app resource bundles. A temporary fixture with `t('fixture.missing_key')`
  failed the scanner, then was removed; the repository scan passes after the fix.
- **PROCESS GAP:** The prior scanner enhancement only inspected JSX text and selected JSX attributes.
  It did not inspect translation calls or resolve resource keys, so it could not detect a missing
  `common.notAvailable` resource. The new call/resource-key check closes that gap.

## Changed Boundaries

- Inventory movement response: lot expiry/UOM, item filtering, and existing location display fields.
- Outbound detail response: `staging_location_id` and item read-model fallback.
- Outbound read model: migration `000008_item_revision_read_model` and replay consumer group v2.
- WMS Console: fulfillment hierarchy resolver, movement table, map scope, Bin detail route, and
  translated strings.
- Scanner/shared i18n: missing-key detection and shared common resources.

## Verification

- `go test ./...` passed in WMS inventory and WMS outbound.
- `npm run build` passed in WMS Console.
- `npm run i18n:scan` passed.
- Temporary scanner regression fixture failed as expected for an unknown dotted key.
- WMS inventory, outbound, and console images were rebuilt and restarted; inventory/outbound health
  endpoints returned 200 and outbound migration `000008` applied.
- **UNVERIFIED:** Browser screenshots, click-through navigation, and a genuine single-request multi-lot
  live fixture. Current live ledger contains no single request with multiple transfer lots, though the
  API/UI table supports multiple rows.
