# Phase 2 Step 2 — WMS Inventory & Stock

**Date:** 2026-07-22  
**Prompt:** `process/Phase-2-Step-1-Patch-&-Step-2.md`  
**Status:** Completed

## Scope Implemented

- Patched `wms-master-data-service` storage locations with:
  - `location_purpose`: `Storage` / `WorkCenterStaging`
  - `staging_for_work_center_ref`: reference-only MES WorkCenter id
  - one staging location per WorkCenter via unique partial index
  - typed DB constraint handling for duplicate/check/FK violations
  - `GET /api/wms/master-data/locations?staging_for_work_center_ref=...`
- Added `wms-inventory-service` in Go:
  - owns `wms_inventory_db`
  - `inv_lot`, `inv_balance`, append-only `inv_stock_movement`, `inv_discrepancy_log`
  - consumes `MES.MasterData.ItemRevisionReleased.v2`, `WMS.MasterData.LocationCreated.v1`,
    `MES.Execution.MaterialConsumed.v1`
  - receipt, transfer-to-staging, FEFO balance query, consumption decrement from staging
- Added `wms-inbound-service` in Node.js:
  - owns `wms_inbound_db`
  - receipt header/lines
  - confirm calls inventory receipt API
  - receiving into WorkCenter staging is rejected by inventory
- Added `wms-outbound-service` in Go:
  - owns `wms_outbound_db`
  - staging-first material request algorithm
  - all-or-nothing shortage handling with typed breakdown
  - publishes `WMS.Outbound.MaterialStaged.v1` and `WMS.Outbound.MaterialShortageDeclared.v1`
- Added MES execution integration:
  - migration `000005_wms_stock_check_status.up.sql`
  - `stock_check_detail jsonb`
  - `POST /api/mes/execution/work-orders/{id}/stage-materials`
  - circuit-breaker guarded `WMSOutboundClient`
  - `MES.Execution.MaterialConsumed.v1` payload additively includes `work_center_id`
- Added Compose/Kong wiring:
  - `infra/docker-compose.wms.yml` includes WMS inventory/inbound/outbound DBs and services
  - root `infra/docker-compose.yml` includes WMS compose
  - Kong routes: `/api/wms/inventory`, `/api/wms/inbound`, `/api/wms/outbound`
  - WMS routes use the same Keycloak JWT policy as WMS master-data

## Verification Evidence

- Builds:
  - `npm run build --workspace=wms-master-data-service`: passed
  - `npm run build --workspace=wms-inbound-service`: passed
  - Docker build passed for `mes-execution-service`, `wms-inventory-service`,
    `wms-inbound-service`, `wms-outbound-service`, `wms-master-data-service`
- Runtime:
  - `mes-execution-service`: healthy on `13030`
  - `wms-master-data-service`: healthy on `13060`
  - `wms-inventory-service`: healthy on `13070`
  - `wms-inbound-service`: healthy on `13080`
  - `wms-outbound-service`: healthy on `13090`
  - `platform-kong`: healthy; `/api/wms/inventory/balances` returns `401 Bearer token required`
- Part A WMS location patch:
  - existing locations defaulted to `Storage`
  - creating `WorkCenterStaging` without `staging_for_work_center_ref` returned `422 STAGING_WORK_CENTER_REF_REQUIRED`
  - duplicate staging location for one WorkCenter returned `409 UNIQUE_CONSTRAINT_VIOLATION`
  - lookup by `staging_for_work_center_ref` returned the created staging location
- Inventory security:
  - `wms_inventory_user` has no DELETE on `inv_lot`, `inv_balance`, `inv_stock_movement`
  - `wms_inventory_user` has no UPDATE on `inv_stock_movement`
- Canonical scenario:
  - receipt: 100 sheets into Storage
  - outbound request: 60 sheets for WorkCenter staging returned `Staged`, `shortfall_qty=60`, `transferred_qty=60`
  - balances after staging: Warehouse 40, staging 60
  - published `MES.Execution.MaterialConsumed.v1` for 40 sheets with `work_center_id`
  - balances after consumption: Warehouse 40, staging 20
  - second request for 15 sheets returned `already_staged_qty=20`, `shortfall_qty=0`, `transferred_qty=0`
  - transfer movement count remained unchanged, proving leftover reuse
- Shortage:
  - request for 1000 sheets returned `409`, `error_code=INSUFFICIENT_STOCK`,
    `{ requested_qty: 1000, already_staged_qty: 20, shortfall_qty: 980, available_qty: 40 }`
- Expiry:
  - expired-only item request returned `409 INSUFFICIENT_STOCK`, `available_qty=0`
- FEFO:
  - two lots with expiry `2026-08-01` qty 30 and `2026-11-01` qty 50
  - request for 40 transferred 30 from earlier-expiry lot, then 10 from later-expiry lot

## Known Notes

- The existing dev Schema Registry subject for `WMS.MasterData.LocationCreated.v1` rejects additive
  fields under its current compatibility mode. The service now treats that specific dev-registry 409 as
  an expected warning and continues registering unrelated WMS subjects. Event payloads still carry the
  two new fields and live consumers verified them through Kafka.
- Full Tempo trace capture for the entire staging-consumption-reuse flow was not recorded in this pass;
  Kong and service runtime are healthy, and prior Step 1 closure already proved Kong/WMS/DB tracing.
