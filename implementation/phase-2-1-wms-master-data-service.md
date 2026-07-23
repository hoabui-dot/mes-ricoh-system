# Implementation Trace — Phase 2 Step 1: WMS Master Data Service

**Date:** 2026-07-22  
**Service:** `services/wms-master-data-service`  
**Status:** Completed

## Scope Delivered

- Added first WMS-cluster backend service, `wms-master-data-service`, using Node.js/TypeScript, Express, PostgreSQL, Drizzle schema definitions, KafkaJS, OpenTelemetry, and shared-kernel outbox/event helpers.
- Added owned WMS database schema from first migration:
  - `wms_warehouse`
  - `wms_zone`
  - `wms_storage_location`
  - `wms_storage_bin`
  - `wms_item_uom_mapping`
  - `rm_item_revision` local MES item revision read model
- Added audit trigger and `row_version` handling for WMS-owned mutable tables.
- Kept all translatable WMS fields as `LocalizedText` JSONB from day one:
  - `warehouse_name`
  - `zone_name`
  - `location_name`
  - `bin_name`
  - `rm_item_revision.item_name`
- Added HTTP API under `/api/wms/master-data`:
  - Warehouse CRUD
  - Zone CRUD nested under Warehouse
  - Location CRUD nested under Zone
  - Storage Bin CRUD nested under Location
  - Item UOM mapping create/read with validation against `rm_item_revision`
- Added typed 4xx handling:
  - Missing `vi` in LocalizedText returns `400`.
  - Unknown `item_revision_id` for WMS UOM mapping returns `422 ITEM_REVISION_NOT_FOUND_IN_WMS_READ_MODEL`.
- Added Kafka/event integration:
  - Publishes `WMS.MasterData.WarehouseCreated.v1`
  - Publishes `WMS.MasterData.ZoneCreated.v1`
  - Publishes `WMS.MasterData.LocationCreated.v1`
  - Publishes `WMS.MasterData.StorageBinCreated.v1`
  - Publishes `WMS.MasterData.ItemUOMMappingCreated.v1`
  - Consumes `MES.MasterData.ItemRevisionReleased.v2` into `rm_item_revision`.
- Added `infra/docker-compose.wms.yml` with `wms-master-data-db` and `wms-master-data-service`.
- Added Kong DB-less route `/api/wms/master-data` forwarding identity headers with default `WAREHOUSE_STAFF`.
- Added service manifest and focused unit tests for the WMS resource contract.

## Verification

Commands run:

```bash
npm install
npm run build --workspace=wms-master-data-service
npm run test --workspace=wms-master-data-service
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml -f infra/docker-compose.wms.yml up -d --build wms-master-data-service
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.mes.yml -f infra/docker-compose.wms.yml restart kong
```

Runtime checks:

- `GET http://127.0.0.1:13060/health` returned `{"status":"ok","service":"wms-master-data-service"}`.
- `GET http://127.0.0.1:18000/api/wms/master-data/warehouses` returned seeded WMS warehouse data through Kong.
- Created Warehouse with `{"warehouse_name":{"vi":"Kho kiểm thử WMS"}}`; response was `201`.
- Created Warehouse missing `vi`; response was `400`.
- Created Item UOM mapping with unknown `item_revision_id`; response was `422 ITEM_REVISION_NOT_FOUND_IN_WMS_READ_MODEL`.
- Completed Warehouse -> Zone -> Location -> Bin create walkthrough through Kong with multi-locale names.
- Updated Bin through Kong; `row_version` advanced from `1` to `2`.
- Created and released a fresh MES item revision through MES API; WMS consumed `MES.MasterData.ItemRevisionReleased.v2` into `rm_item_revision` with full `LocalizedText`.
- Created WMS Item UOM mapping for the consumed item revision; response was `201`.
- `outbox_events` showed all five WMS events as `PUBLISHED`.
- Kafka topics contained all five `WMS.MasterData.*.v1` topics.
- Schema Registry subjects contained all five `WMS.MasterData.*.v1-value` schemas.

## Follow-Ups

- Phase 2 Step 2 should consume these WMS master-data events into inventory/inbound/outbound read models.
- Phase 2 Step 3 should build `wms-console` with `libs/i18n-ui-shared` and the hardcoded-string scanner active from its first commit.

## Closure Addendum Verification

Closure prompt: `process/Phase-2-Step-1-Closure.md`  
Closure date: 2026-07-22

### Kong Auth Closure

Initial closure inspection found the WMS Kong route was assigning a default `WAREHOUSE_STAFF` role when no identity headers were present. This was a real auth bypass risk, so the route was corrected.

Current route behavior:

- `/api/wms/master-data` has Kong native `jwt` plugin enabled with Keycloak RS256 public key credentials for the `wonsealtech` realm.
- JWT `iss` is verified by Kong, `exp` is verified by Kong, and only `azp=wms-client` is accepted by the WMS pre-function.
- The WMS pre-function decodes the already-verified JWT payload and forwards:
  - `X-User-ID = sub`
  - `X-Role-Code = first supported realm role by WMS priority`
  - `X-Trace-ID = existing trace/correlation header`
- No anonymous/default WMS identity is assigned.

Manual auth tests:

- No token: `GET /api/wms/master-data/warehouses` returned `401 {"message":"Bearer token required"}` and did not reach WMS.
- `warehouse.staff` / role `WAREHOUSE_STAFF`: `POST /warehouses` returned `201`; WMS log showed `trace_id=closure-auth-warehouse-staff-fresh user_id=869494eb-1406-4fa4-a22c-3a8662395076 role_code=WAREHOUSE_STAFF`.
- `plant.manager` / role `PLANT_MANAGER`: `POST /warehouses` returned `201`; WMS log showed `trace_id=closure-auth-plant-manager-fresh user_id=6b519e77-e3d0-44f1-a74d-00381b143e0d role_code=PLANT_MANAGER`.

Supporting changes:

- Added `warehouse.staff` to `infra/keycloak/realm-export.json`.
- Enabled live `wms-client` direct access grants for test-token issuance; checked-in realm export already declares `directAccessGrantsEnabled: true`.
- Added Kong OpenTelemetry globally and enabled Kong tracing instrumentation so gateway spans are visible in Tempo.

### Full 4-Locale Round Trip

Created a Warehouse with all four locales and read it back through Kong using an authenticated WMS token.

Evidence:

```json
{
  "warehouse_id": "d5dba260-64b5-4b0e-b0c7-09e75202cd9a",
  "got_name": {
    "en": "Four locale canonical warehouse",
    "ja": "四言語正規順序倉庫",
    "ko": "4개 언어 정렬 검증 창고",
    "vi": "Kho kiểm chứng thứ tự chuẩn"
  },
  "canonical_byte_for_byte": true
}
```

Note: PostgreSQL `jsonb` canonicalizes key order. The byte-for-byte assertion was therefore performed against canonical `jsonb` key order while preserving all four locale values unchanged.

### Trace Closure

Fixed platform observability startup blockers:

- `infra/observability/tempo.yaml`: removed config keys rejected by `grafana/tempo:2.4.2` and used current compactor syntax.
- `infra/observability/otel-collector-config.yaml`: removed the unsupported Loki `labels` block for `otel/opentelemetry-collector-contrib:0.99.0`.
- `infra/docker-compose.platform.yml`: enabled Kong tracing with `KONG_TRACING_INSTRUMENTATIONS=all` and `KONG_TRACING_SAMPLING_RATE=1.0`.
- `infra/kong/kong.yml`: added global `opentelemetry` plugin targeting `http://otel-collector:4318/v1/traces`.
- `wms-master-data-service`: added focused manual spans for WMS DB insert/update operations because auto-instrumentation only showed `pg-pool.connect`.

Tempo evidence:

- Kong/WMS/DB trace ID: `109c39cb1a08c845eb19144d75cf50a0`
- Trace contained 16 spans, including:
  - `kong` span: `POST`, route `/api/wms/master-data`, status `201`
  - Kong plugin spans: `kong.access.plugin.jwt`, `kong.access.plugin.pre-function`, `kong.balancer`
  - WMS HTTP span: `POST /api/wms/master-data/warehouses`, status `201`
  - DB spans: `pg-pool.connect`, `db.insert wms_warehouse`
- Additional WMS DB-write trace ID: `408157c094f79ddce47c7260a6359fad`, showing `POST`, `pg-pool.connect`, and `db.insert wms_storage_bin`.

### DELETE Grant Closure

The original implementation used `wms_master_data_user` as table owner, so the closure query showed DELETE privileges. This was corrected by:

- Recreating the WMS DB volume using `wms_master_data_owner` as the migration/owner role.
- Creating `wms_master_data_user` as the runtime application role.
- Running migrations with `MIGRATION_DATABASE_URL`.
- Granting runtime role `SELECT, INSERT, UPDATE` only.

Closure query:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and privilege_type = 'DELETE'
  and table_name in (
    'wms_warehouse',
    'wms_zone',
    'wms_storage_location',
    'wms_storage_bin',
    'wms_item_uom_mapping'
  )
order by grantee, table_name;
```

Result as `wms_master_data_user`:

```text
 grantee | table_name | privilege_type
---------+------------+----------------
(0 rows)
```

### i18n Completeness Check

This service performed no `varchar -> jsonb` backfill migration — every `LocalizedText` column (`warehouse_name`, `zone_name`, `location_name`, `bin_name`, `rm_item_revision.item_name`) was created as `jsonb` from its first migration. The `vi`-key language-quality heuristic from the Step 8 hotfix therefore does not apply to this service's own migrations. Seed data used for manual verification (e.g. `{"vi":"Kho kiểm thử WMS"}`) was reviewed and contains no mixed-language values inside a single `vi` key.

### Phase 2 Step 2 Dependency Patch

As part of `process/Phase-2-Step-1-Patch-&-Step-2.md`, `wms_storage_location` was additively extended with
`location_purpose` and `staging_for_work_center_ref` so WMS inventory can model central Warehouse storage
and per-WorkCenter staging locations. Existing rows default to `Storage`; `WorkCenterStaging` requires a
reference-only WorkCenter id and is unique per WorkCenter. `WMS.MasterData.LocationCreated.v1` now carries
the two new fields. This did not use a version bump because there were no live external consumers before
Phase 2 Step 2; this is documented in the service manifest as a specific compatibility decision, not a
general versioning rule.

Patch verification is recorded in `implementation/phase-2-2-wms-inventory-stock.md`.

### Final Current-State Evidence After Closure Fixes

- `npm run build --workspace=wms-master-data-service`: passed.
- `npm run test --workspace=wms-master-data-service`: passed, 1 file / 2 tests.
- Runtime containers healthy/running:
  - `wms-master-data-db`
  - `wms-master-data-service`
  - `platform-kong`
  - `platform-tempo`
  - `platform-otel-collector`
- Current WMS read model contains MES revision `ffc62c93-362b-409f-aa53-45337ff0d67e` with full `LocalizedText`.
- Current WMS outbox status after DB reset and rerun:
  - `WMS.MasterData.WarehouseCreated.v1`: `PUBLISHED`
  - `WMS.MasterData.ZoneCreated.v1`: `PUBLISHED`
  - `WMS.MasterData.LocationCreated.v1`: `PUBLISHED`
  - `WMS.MasterData.StorageBinCreated.v1`: `PUBLISHED`
  - `WMS.MasterData.ItemUOMMappingCreated.v1`: `PUBLISHED`
