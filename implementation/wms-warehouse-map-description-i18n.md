# WMS Warehouse Map Description and i18n Enum Coverage

Date: 2026-07-22

## Requirement

Add a hover tooltip icon on warehouse-map warehouse cards so users can see a domain description of each warehouse. The description must be stored in the database, not hardcoded in the UI. Also review WMS Console i18n behavior because some menu and data enum labels still showed only Vietnamese/English or raw backend enum values.

## Product and i18n Design Decision

The Phase 1 Step 8 i18n rule separates static UI strings from dynamic master data:

- Static UI labels, menu labels, statuses, and enum display names stay in locale bundles.
- User/domain-authored master data, such as warehouse name and warehouse description, lives as `LocalizedText` JSONB on the owning table.

Following that rule, warehouse descriptions were added as `wms_warehouse.warehouse_description JSONB NULL` with the same LocalizedText contract used by warehouse names.

## Backend Implementation

- Added `warehouse_description` to `wms_warehouse`.
- Added migration `0004_wms_warehouse_description_i18n`.
- Added localized check constraint `ck_wms_warehouse_description_localized`.
- Added Drizzle schema field `warehouseDescription`.
- Added `warehouse_description` to WMS warehouse resource localized columns.
- Allowed warehouse create/update APIs to accept `warehouse_description`.
- Included `warehouse_description` in `WMS.MasterData.WarehouseCreated.v1` payload schema and event payload.
- Updated WMS master-data seed with a four-language warehouse description.
- Updated large demo seed so all demo warehouses have VI/EN/JA/KO descriptions.

## UI Implementation

- Added `warehouse_description` to the WMS Console `Warehouse` API type.
- Changed warehouse map from zone-only cards to warehouse cards containing their zones.
- Added an `Info` icon beside each warehouse code.
- Hovering the icon shows the localized warehouse description from `warehouse_description`.
- Added warehouse description display on warehouse detail overview.
- Added warehouse description input to warehouse create flow.

## i18n Fixes

- Added static translation key `map.warehouseDescription`.
- Added static zone type keys:
  - `zone.type.Receiving`
  - `zone.type.Storage`
  - `zone.type.Picking`
  - `zone.type.Staging`
  - `zone.type.Shipping`
- Replaced raw `zone_type` rendering in WMS Console with translated labels.
- Expanded Japanese and Korean WMS Console locale entries for left navigation, common actions, status labels, purpose labels, warehouse-map labels, zone types, and movement types.

## Verification

- `npm run build --workspace=wms-console` passed.
- `npm run typecheck --workspace=wms-master-data-service` passed.
- `npm run test --workspace=wms-master-data-service` passed.
- `npm run i18n:scan:wms-console` passed.

## Operational Follow-Up

Docker rebuild/start and demo seed should be run after this change so the live WMS master-data database receives migration `0004_wms_warehouse_description_i18n` and seeded warehouse descriptions.
