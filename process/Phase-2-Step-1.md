# BUILD PROMPT — Phase 2, Step 1: `wms-master-data-service`

> Current-state note added by documentation audit on 2026-07-22: this is a historical Step 1 prompt.
> The Step 2 WMS inventory/inbound/outbound services now exist, and WMS uses the two-echelon Warehouse ↔
> WorkCenter staging model described in `process/Phase-2-Step-1-Patch-&-Step-2.md` and
> `implementation/phase-2-2-wms-inventory-stock.md`. The non-goals below remain true only for this
> Step 1 prompt's original implementation scope.

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Phase:** Phase 2, Step 1 (roadmap row #9 in `process/PROJECT_WORKLOAD_PROGRESS.md`)
**Status before this prompt:** Phase 1 (Steps 0–8) fully `Completed ✅`, including the i18n Platform
Foundation retrofit (Step 8). This is the **first WMS-cluster service** ever built — there is no
existing WMS code to extend. `mes-master-data-service` is the closest analog for both business pattern
and tech stack, and must be treated as the reference implementation throughout this prompt.

---

## 0. Mandatory pre-work — read before writing any code

### 0.1 Reconciliation audit (do this first)

Before scaffolding anything, confirm the following are true. If any is false, stop and report instead
of proceeding:

- `libs/shared-kernel` exports `LocalizedText`, `SupportedLocale`, `resolveLocalizedText`,
  `localizedTextSchema` (built in Step 8) — these must exist and be imported, not re-implemented.
- `MES.MasterData.ItemRevisionReleased.v2` (i18n-bumped, Step 8) is the current live schema in
  Confluent Schema Registry. If a `.v1` consumer pattern is copied from an old MES example, it must be
  updated to `.v2` shape (`item_name` is a `LocalizedText` object, not a plain string).
- Kong is already routing `/api/mes/*`; this step adds a **new** top-level route `/api/wms/*` that does
  not yet exist — confirm it is genuinely absent before adding it (do not assume and duplicate).
- No existing table, service, or route anywhere in the codebase currently owns Warehouse/Zone/
  Location/Storage Bin data. This is greenfield for WMS.
- **The i18n Coverage & Data Quality Hotfix (retroactive Step 8 fix) has landed** — specifically the
  governance amendment to `stragegy.md` §7 adding the "i18n Completeness Check" gate. Confirm the
  hardcoded-string CI scanner exists in the repo's shared lint config before this step's future
  `wms-console` (Step 3) is built, and note that this service's own data is exempt from the
  hotfix's `vi`-key language-quality audit (§A of the hotfix) *only because* every `LocalizedText`
  column here is written as `jsonb` from its first migration — there is no `varchar → jsonb` backfill
  in this step for that heuristic to run against. Do not treat this exemption as a reason to skip care
  with seed/test data: any seed script written for this service must not mix languages inside a single
  `vi` key, the same mistake that caused the hotfix in the first place.

### 0.2 Two contracts this service inherits and must not violate

1. **Cross-service data rule** (`stragegy.md` §3.1): this service **never queries `mes_master_data_db`
   directly**. Any reference to an Item/Item Revision (needed for UOM mapping, see §2.4) must come from
   a local read-model populated by consuming Master Data events — same Anti-Corruption Layer pattern
   already proven by `mes-execution-service` and `mes-traceability-service`.
2. **i18n contract** (`process/PROJECT_WORKLOAD_PROGRESS.md`, Step 8 prerequisite rule): **every
   translatable field this service introduces must use the `LocalizedText` `jsonb` shape from its first
   migration.** Do not build it as `varchar` now "to move faster" and retrofit later — that is exactly
   the class of rework Step 8 was built to prevent going forward. Non-translatable fields (all `*Code`
   fields) stay plain `varchar`, per Step 8 Part 0's explicit rule.

---

## 1. Fixed Technology Decisions (do not revisit — see `TECH-STACK-DECISION.md` §2)

| Concern | Decision | Reasoning |
|---|---|---|
| Language | **Node.js / TypeScript** | Warehouse/Zone/Location/Storage Bin is CRUD, read-heavy, no concurrency-write pressure — identical workload shape to `mes-master-data-service`, which is the documented reason for choosing Node over Go here |
| HTTP framework | Express | Consistent with `mes-master-data-service` |
| ORM | Drizzle ORM | Consistent with `mes-master-data-service` |
| Migration tool | Drizzle Kit → plain SQL output | Same convention as MES Node services |
| Kafka client | kafkajs (or node-rdkafka, whichever `mes-master-data-service` uses) | Consistency |
| Shared kernel | `libs/shared-kernel` (TypeScript) — including the Step 8 i18n exports | Do not reimplement `EventEnvelope`, `OutboxRelayWorker`, `LocalizedText`, or `resolveLocalizedText` |
| i18n frontend package | `libs/i18n-ui-shared` — **not consumed by this service directly** (this is a backend-only step; the package is relevant only when `wms-console` is built in Step 3) | Noted here so the boundary is explicit: this step ships API + events with `LocalizedText` payloads; it does not touch any frontend |
| OTel | Node SDK, same Collector endpoint | Consistency |
| DB | PostgreSQL, own database `wms_master_data_db` | Database-per-service rule, unchanged |

---

## 2. Domain Scope

Per `stragegy.md` §1.2, this service owns: **Warehouse, Zone, Location, Storage Bin, UOM mapping**,
scoped to a single Site (reference-only `site_id`, no cross-DB FK to `mes_master_data_db.md_site`).

### 2.1 `wms_warehouse`
- `warehouse_id uuid pk`, `warehouse_code varchar(30) unique not null` (plain, non-translatable)
- `warehouse_name jsonb not null` — `LocalizedText`, `vi` key required
- `site_id uuid not null` (reference only — resolved via `rm_site` read-model if one exists, or accepted
  as an opaque reference if MES does not yet publish a Site event; do not block this step waiting on a
  Site event that doesn't exist — flag as a follow-up if so)
- `status varchar(20) not null default 'Active'` (`Active` / `Inactive`)
- `row_version integer not null default 1`, standard audit trigger applied

### 2.2 `wms_zone`
- `zone_id uuid pk`, `warehouse_id uuid fk → wms_warehouse`
- `zone_code varchar(30) not null` (unique within `warehouse_id`)
- `zone_name jsonb not null` — `LocalizedText`
- `zone_type varchar(30) not null` (`Receiving` / `Storage` / `Picking` / `Staging` / `Shipping` —
  minimum viable enum, extend only if a concrete downstream need appears in Step 2)
- `status varchar(20) not null default 'Active'`

### 2.3 `wms_storage_location` and `wms_storage_bin`
Model these as two distinct levels of granularity (per the roadmap's explicit "Location, Storage Bin"
wording — do not collapse them into one table):

- **`wms_storage_location`** — an addressable area within a zone (e.g. aisle/rack): `location_id uuid pk`,
  `zone_id uuid fk`, `location_code varchar(30)` (unique within `zone_id`), `location_name jsonb`
  (`LocalizedText`), `status`.
- **`wms_storage_bin`** — the smallest addressable storage unit within a location: `bin_id uuid pk`,
  `location_id uuid fk`, `bin_code varchar(30)` (unique within `location_id`), `bin_name jsonb`
  (`LocalizedText`, optional — bins are often code-only in practice; still store as `LocalizedText` for
  contract consistency, `vi` required if any name is given, but allow a bin to have no display name
  distinct from its code), `capacity_qty decimal(18,3)` (nullable), `capacity_uom_id uuid` (nullable,
  reference to §2.4), `status`.

### 2.4 UOM mapping — `wms_item_uom_mapping`

WMS does not own UOM master data (that stays in `mes-master-data-service`'s `md_uom`). This table maps
how a specific Item (by `item_revision_id`, reference only) is **stored and handled in the warehouse**,
which may differ from its production-BOM UOM (e.g. produced in `M2`, stored/counted in `PCS` per pallet):

- `mapping_id uuid pk`
- `item_revision_id uuid not null` — reference only, validated against the local `rm_item_revision`
  read-model (see §3), no cross-DB FK
- `storage_uom_code varchar(20) not null` — plain code, references `mes-master-data-service`'s UOM
  catalog by code (not by live FK); do not build a separate WMS UOM catalog — reuse the code as the
  shared vocabulary, consistent with the platform's reference-not-FK convention used everywhere else
  (`wo_id`, `RoleCode`, etc.)
- `conversion_factor decimal(18,6) not null check (conversion_factor > 0)` — `1 storage_uom = factor ×
  item's base UOM` (mirrors the semantics of `MD_UOM_CONVERSION.Factor` already defined in the MES
  catalog, applied here for the WMS storage context specifically)
- `default_bin_capacity_qty decimal(18,3)` (nullable) — default capacity assumption per bin for this
  item, storage-UOM denominated
- `row_version integer not null default 1`

**Do not** build a general-purpose UOM conversion engine here — this table only captures the WMS storage
UOM per item, per the roadmap's literal scope ("UOM mapping"), not a full quantity-conversion service.

---

## 3. Anti-Corruption Layer — local read-model of MES Item data

Build `internal_read_model` consumer (naming convention matches Node service style, not the Go
`internal/` layout) subscribing to:

- `MES.MasterData.ItemRevisionReleased.v2` (the i18n-bumped version — **do not consume `.v1`**, since
  Step 8 already updated every live consumer to `.v2` and this is a brand-new consumer)

Populate `rm_item_revision` (`item_revision_id`, `item_code`, `item_name jsonb` — stored as the full
multi-locale object exactly as received, no server-side resolution, same rule Step 8 Part C established
for Go read-models and which applies equally here) — used only to validate that `item_revision_id`
values referenced in `wms_item_uom_mapping` correspond to a real, Released item. Do not project any
other field from the event; this is a minimal Anti-Corruption Layer, not a full item mirror.

---

## 4. API Surface

Add Kong route `/api/wms/master-data/*` in `infra/kong/kong.yml` — **new top-level `/api/wms/*` prefix**,
first time this prefix is used on the platform. Follow the exact header-forwarding convention already
used for `/api/mes/*` (Kong forwards `X-User-ID`, `X-Role-Code`, `X-Trace-ID`; this service does not
verify JWTs itself).

| Endpoint | Notes |
|---|---|
| `GET/POST /warehouses`, `GET/PUT /warehouses/:id` | `warehouse_name` accepted/returned as full `LocalizedText` object, validated with `localizedTextSchema` (reject writes missing `vi`) |
| `GET/POST /warehouses/:id/zones`, `GET/PUT /zones/:id` | Same i18n handling for `zone_name` |
| `GET/POST /zones/:id/locations`, `GET/PUT /locations/:id` | Same for `location_name` |
| `GET/POST /locations/:id/bins`, `GET/PUT /bins/:id` | Same for `bin_name` |
| `GET/POST /item-uom-mappings`, `GET /item-uom-mappings/:id` | Validates `item_revision_id` against `rm_item_revision`; returns a typed error (not a 500) if the item is not found in the local read-model |

Do **not** add an `Accept-Language`-based resolution layer on any read endpoint — identical rule to
Step 8 §B.4: resolution is a frontend concern (`wms-console`, Step 3), this API always returns the full
multi-locale object.

---

## 5. Events Published

Register in Schema Registry on startup, same pattern as `mes-master-data-service`:

```
WMS.MasterData.WarehouseCreated.v1
WMS.MasterData.ZoneCreated.v1
WMS.MasterData.LocationCreated.v1
WMS.MasterData.StorageBinCreated.v1
WMS.MasterData.ItemUOMMappingCreated.v1
```

All translatable fields in these payloads (`warehouse_name`, `zone_name`, `location_name`, `bin_name`)
are published as `LocalizedText` objects from day one — **there is no `.v1`-plain-string version of
these WMS events to ever bump from**, since this service is being built after the i18n contract already
exists. This is the direct payoff of doing Step 8 before Phase 2, called out explicitly in Step 8's own
process reminder.

These events exist for `wms-inventory-service`, `wms-inbound-service`, `wms-outbound-service` (Step 2)
to consume when they need to resolve a Warehouse/Zone/Location/Bin reference into their own local
read-models. Do not build those consumers now — that is Step 2's responsibility.

---

## 6. Service Scaffolding & Infrastructure

- Directory: `services/wms-master-data-service/`, following the exact Node scaffolding layout already
  established by `mes-master-data-service` (`src/domain/`, `src/application/`, `src/infrastructure/
  {db,outbox,events,http}/`, `src/main.ts`, `migrations/`, `test/{unit,integration,contract}/`,
  `Dockerfile`, `docker-compose.override.yml`, `service.manifest.yaml`).
- Add `wms-master-data-service` + `wms-master-data-db` (own Postgres container) to a **new**
  `infra/docker-compose.wms.yml` (per `stragegy.md` §6 — do not add WMS services into
  `docker-compose.mes.yml`).
- `service.manifest.yaml`:

```yaml
service: wms-master-data-service
cluster: WMS
language: node
owns_database: wms_master_data_db
publishes_events:
  - WMS.MasterData.WarehouseCreated.v1
  - WMS.MasterData.ZoneCreated.v1
  - WMS.MasterData.LocationCreated.v1
  - WMS.MasterData.StorageBinCreated.v1
  - WMS.MasterData.ItemUOMMappingCreated.v1
consumes_events:
  - MES.MasterData.ItemRevisionReleased.v2
notes:
  - "First service in Cluster WMS. Node.js chosen per TECH-STACK-DECISION.md: CRUD/read-heavy workload,
     same shape as mes-master-data-service."
  - "All translatable fields (warehouse_name, zone_name, location_name, bin_name) use the LocalizedText
     jsonb contract from libs/shared-kernel (Step 8) from their first migration — no i18n retrofit was
     needed or performed for this service."
  - "Consumes MES.MasterData.ItemRevisionReleased.v2 (i18n-bumped) into a minimal rm_item_revision
     read-model, used only to validate item_revision_id references in wms_item_uom_mapping. No other
     MES data is mirrored."
  - "wms-console (Phase 2 Step 3) Bounded Context Canvas must be drafted in parallel with this step per
     the Console/UI Readiness addendum — do not defer Console design to the end of Phase 2 as happened
     with MES."
  - "i18n Completeness Check (docs/adr/000X-i18n-completeness-governance.md, added by the Step 8 hotfix)
     applies to this service going forward. No backfill audit was required at build time since all
     LocalizedText columns started as jsonb from the first migration. wms-console (Step 3) must ship
     with the hardcoded-string CI scanner active from its first commit, not retrofitted."
```

---

## 7. Explicit Non-Goals for This Step

- Do not build `wms-inventory-service`, `wms-inbound-service`, or `wms-outbound-service` — Phase 2 Step 2.
- Do not build `wms-console` — Phase 2 Step 3. This step only produces the API those UIs will call.
- Do not build a general UOM conversion engine — only the per-item storage-UOM mapping in §2.4.
- Do not build MES→WMS stock reservation/check integration — that is `wms-outbound-service`'s job
  (Phase 2 Step 2, per `TECH-STACK-DECISION.md` §2, the service that will implement `stock_check_status`).
- Do not add any Go service in this step — the WMS cluster's Go services (`wms-inventory-service`,
  `wms-outbound-service`) are Step 2, per the already-decided language matrix.
- Do not touch `mes-*` services or their schemas.

---

## 8. Definition of Done

| # | Item | Verification |
|---|---|---|
| 1 | `wms_master_data_db` and `wms-master-data-service` containers healthy alongside existing platform + MES services | `docker compose -f docker-compose.platform.yml -f docker-compose.mes.yml -f docker-compose.wms.yml up` |
| 2 | All 5 tables created with `row_version` + audit trigger + no `DELETE` grant | Migration review |
| 3 | `warehouse_name`/`zone_name`/`location_name`/`bin_name` are `jsonb`, reject writes missing `vi`, accept full 4-locale writes | Manual test: create Warehouse with only `vi` (succeeds), attempt with `vi` omitted (rejected client contract via `localizedTextSchema`) |
| 4 | Kong route `/api/wms/master-data/*` live, forwarding identity headers correctly | `curl http://localhost:18000/api/wms/master-data/warehouses` with a valid token |
| 5 | `rm_item_revision` read-model populates correctly from a live `MES.MasterData.ItemRevisionReleased.v2` event | Publish/observe a real Release from `mes-master-data-service`, confirm row appears with full `LocalizedText` `item_name` |
| 6 | `wms_item_uom_mapping` write against an unknown `item_revision_id` returns a typed 4xx error, not a 500 or a silent accept | Manual test |
| 7 | All 5 WMS events observed in Kafka via `kafka-console-consumer`, schemas registered in Schema Registry | Kafka consumer check |
| 8 | Full CRUD walkthrough: Warehouse → Zone → Location → Bin, each created/edited via API with multi-locale names | Manual walkthrough |
| 9 | Trace for a full create round trip (Warehouse→Zone→Location→Bin) visible end-to-end in Grafana Tempo | Grafana UI check |
| 10 | `docs/adr/` gains no new ADR unless a genuine new architectural decision was made in this step (tech stack and i18n were already decided) — confirm no redundant ADR was written | Review |
| 11 | i18n Completeness Check (governance gate from the Step 8 hotfix, `docs/adr/000X-i18n-completeness-governance.md`) is satisfied: no `varchar → jsonb` backfill exists in this service to audit, and seed data was reviewed to confirm no mixed-language values were placed inside a single `vi` key | Migration + seed-script review, explicitly documented in the implementation report rather than silently assumed |

---

## 9. Process Reminder

1. Update `process/PROJECT_WORKLOAD_PROGRESS.md`: mark row #9 (`Phase 2, Step 1: WMS Master Data`) as
   `Completed ✅`, link this step's implementation trace, and set the new **Current Active Milestone**
   to Phase 2, Step 2 (WMS Inventory & Stock).
2. Per the Console/UI Readiness addendum (`stragegy-update.md` §4.3): draft the **Bounded Context
   Canvas for `wms-console`** now, in parallel, even though it will not be built until Phase 2 Step 3 —
   do not let it slip to the end of the phase again.
3. Update `product-doc.md` §6/§7 (system architecture / service responsibilities tables) to list
   `wms-master-data-service` as the first live WMS Cluster service, replacing its current "Planned" status.
