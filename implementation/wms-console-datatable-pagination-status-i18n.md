# WMS Console DataTable Pagination and Status i18n

Date: 2026-07-22

## Requirement

Fix the missing `status.Quarantined` key shown in `inventory/balances`, and make every WMS Console table use a common paginated table component. Default page size must be 10 rows, with selectable limits of 10, 50, and 100.

## Implementation

- Updated the shared `DataTable` component used by all current WMS Console tables.
- Added TanStack Table pagination with `getPaginationRowModel`.
- Defaulted pagination state to `pageSize: 10`.
- Added page-size options `10`, `50`, and `100`.
- Added previous/next pagination controls and row range text.
- Used the existing shadcn/Radix-style `SelectBase` for the page-size selector.
- Added missing status translations:
  - `status.Quarantined`
  - `status.Expired`
- Added table control i18n keys in VI/EN/JA/KO.

## Coverage

Because all current WMS table pages already use `components/shared/DataTable.tsx`, pagination now applies to:

- Inventory balances
- Lot detail balances
- Inventory movements
- Warehouse-map drawer balances
- Warehouse-map drawer movements
- Warehouses
- Zones
- Locations
- Bins
- Item UOM mappings
- Detail page nested zones/locations/bins

## Verification

- `npm run build --workspace=wms-console` passed.
- `npm run i18n:scan:wms-console` passed.
