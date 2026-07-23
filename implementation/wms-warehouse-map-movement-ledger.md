# WMS Warehouse Map Movement Ledger

Date: 2026-07-22

## Requirement

The WMS Console warehouse-map location detail drawer had a `Di chuyển gần đây` tab, but it displayed:

```text
Backend chưa có endpoint đọc dữ liệu này.
```

The inventory database already owned `inv_stock_movement` as the append-only stock ledger, and the demo
seed already inserted movement rows. The missing work was a read endpoint and UI integration.

## Domain Decision

Movement history belongs to `wms-inventory-service` because it owns:

- `inv_lot`
- `inv_balance`
- `inv_stock_movement`
- `inv_discrepancy_log`

The endpoint is read-only. It does not mutate balances and does not weaken the no-delete ledger rule.

Location filtering uses:

- `from_location_id = location_id`
- `to_location_id = location_id`

This gives the correct physical location timeline for receipts, transfers, staging, consumption, and
adjustments.

## Implementation Steps

1. Added `MovementRow` DTO in `services/wms-inventory-service/internal/application/usecase/inventory.go`.
2. Added `ListMovements(ctx, pool, locationID, lotID, limit)` in the inventory usecase.
3. Added `GET /api/wms/inventory/movements` in `services/wms-inventory-service/internal/infrastructure/http/router.go`.
4. Updated `services/wms-inventory-service/service.manifest.yaml`.
5. Added WMS Console `InventoryMovement` type.
6. Added `api.listMovements(...)`.
7. Added query key `qk.movements(...)`.
8. Replaced the warehouse-map drawer backend-gap message with a real movement table.
9. Reused the same endpoint for `/inventory/movements`.
10. Added i18n keys for movement columns and movement types.
11. Extended `scripts/seed-wms-demo.ts` so every seeded warehouse-map location has at least one recent
    movement row.

## Endpoint

```http
GET /api/wms/inventory/movements?location_id=<uuid>&lot_id=<uuid>&limit=50
```

Parameters:

- `location_id` optional. Matches either `from_location_id` or `to_location_id`.
- `lot_id` optional.
- `limit` optional. Defaults to `50`, capped at `200`.

Response fields:

- `movement_id`
- `movement_type`
- `lot_id`
- `lot_code`
- `item_revision_id`
- `from_location_id`
- `to_location_id`
- `qty`
- `wo_id`
- `work_center_ref`
- `occurred_at`

## Seed Update

`npm run seed:wms:demo` now inserts recent demo movements for each seeded map location.

Latest applied seed count:

```text
stock_movements: 34
```

## Verification

Commands:

```bash
go test ./...
npm run build --workspace=wms-console
npm run i18n:scan:wms-console
npm run seed:wms:demo
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml up -d --build wms-inventory-service wms-console
```

Endpoint check:

```bash
curl -s 'http://127.0.0.1:13070/api/wms/inventory/movements?location_id=925de345-2d50-48d8-8e2a-ed08686b653a&limit=20'
```

Result:

- Returned recent rows for `STG-WC-MOLD`.
- Included `ADJUSTMENT`, `CONSUMPTION`, and `TRANSFER_TO_STAGING`.
- No backend-gap message remains in the warehouse-map movement tab.

Runtime:

- `wms-inventory-service` rebuilt and healthy.
- `wms-console` rebuilt and running on `13091`.
- Logs checked for both services.

Known environment note:

- `gofmt` is currently resolved to `/snap/bin/gofmt` in this environment and fails with a snap
  permissions error. The modified Go files are already tab-formatted and `go test ./...` passes.
