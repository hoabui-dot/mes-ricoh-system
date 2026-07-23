# WMS Demo Seed Data

Date: 2026-07-22

## Purpose

Add repeatable, broad WMS demo data so the WMS console and WMS APIs show meaningful warehouse, inventory,
inbound, outbound, expiry, staging, shortage, and discrepancy scenarios.

The seed window is `2026-04-23` through `2026-07-22`, matching the requested three-month demo range.

## Added Script

Command:

```bash
npm run seed:wms:demo
```

Implementation:

- `scripts/seed-wms-demo.ts`
- Root `package.json` script: `seed:wms:demo`

The script is idempotent:

- Uses deterministic UUIDs.
- Uses upserts.
- Does not delete data.
- Can be rerun after partial failure or service restart.

Default local database URLs:

- MES master data: `localhost:15434`
- WMS master data: `localhost:15438`
- WMS inventory: `localhost:15439`
- WMS inbound: `localhost:15440`
- WMS outbound: `localhost:15441`

Each URL can be overridden with:

- `MES_MASTER_DATA_URL`
- `WMS_MASTER_DATA_URL`
- `WMS_INVENTORY_URL`
- `WMS_INBOUND_URL`
- `WMS_OUTBOUND_URL`

## Seed Scope

WMS master data:

- Raw material warehouse.
- WIP warehouse.
- Finished goods warehouse.
- Receiving, quarantine, rubber, chemical, metal, WIP, staging, and finished goods zones.
- Storage locations and WorkCenter staging locations.
- Bins for each seeded location.
- WMS item revision read models.
- Item/UOM mappings.

MES alignment:

- Reads released MES item revisions from `md_item_revision` when available.
- Reads released MES work centers from `md_work_center` when available.
- Uses those IDs for WMS `item_revision_id` and `staging_for_work_center_ref`.
- Adds deterministic demo fallback IDs only when MES seed data is absent.

Inventory:

- Active lots.
- Expired lots.
- Quarantined lots.
- Near-expiry lots.
- No-delete ledger movements:
  - `RECEIPT`
  - `TRANSFER_TO_STAGING`
  - `CONSUMPTION`
  - `ADJUSTMENT`
- Positive balances across storage and WorkCenter staging.
- Discrepancies:
  - `STAGING_OVER_CONSUMPTION`
  - `CYCLE_COUNT_VARIANCE`
  - `QUARANTINE_HOLD`

Inbound:

- Confirmed receipts across April, May, June, and July 2026.
- One current draft receipt.
- Receipt lines for rubber, steel, EPDM, bonding chemical, and primer lots.

Outbound:

- Staged material requests.
- Shortage material requests.
- Outbox records for staged and shortage events.

## Verification

Seed run:

```text
[Seed] WMS demo seed applied
warehouses: 11
locations: 20
bins: 43
item_revisions: 17
lots: 25
positive_balances: 36
stock_movements: 34
discrepancies: 3
inbound_receipts: 6
material_requests: 12
```

Idempotency:

- Reran `npm run seed:wms:demo`.
- Counts stayed stable.

Direct API checks:

```bash
curl -s 'http://127.0.0.1:13060/api/wms/master-data/warehouses?limit=100'
curl -s 'http://127.0.0.1:13060/api/wms/master-data/locations?limit=100'
curl -s 'http://127.0.0.1:13070/api/wms/inventory/balances'
```

Database checks:

```sql
select receipt_code,status,created_at::date,line_count
from (
  select r.receipt_code,r.status,r.created_at,count(l.line_id) line_count
  from inbound_receipt r
  left join inbound_receipt_line l on l.receipt_id=r.receipt_id
  group by r.receipt_code,r.status,r.created_at
) x
order by created_at desc;
```

Result includes:

- `RCV-DEMO-260423`
- `RCV-DEMO-260501`
- `RCV-DEMO-260514`
- `RCV-DEMO-260612`
- `RCV-DEMO-260701`
- `RCV-DEMO-260722`

Runtime fix found during verification:

- `wms-inbound-service` was crashing because Docker runtime dependencies did not include the workspace-local
  `@opentelemetry/api` package imported by the inbound inventory receipt client.
- Updated `services/wms-inbound-service/Dockerfile` to copy
  `/app/services/wms-inbound-service/node_modules` into runtime `/app/node_modules`.
- Rebuilt `wms-inbound-service`.
- Health check returned `HTTP/1.1 200 OK`.
- Logs show `[Bootstrap] wms-inbound-service listening on :3080`.
