# PATCH + BUILD PROMPT — Phase 2, Step 1 Patch & Step 2: Two-Echelon Inventory (Warehouse ↔ Work Center Staging)

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Trigger:** A core business requirement was surfaced that the original `stragegy.md` §1.2 WMS domain
sketch did not model explicitly: the plant operates **two echelons of inventory** — a central Warehouse
and a per-Work-Center **staging inventory** ("kho tạm"). Material is transferred in bulk from Warehouse
to a Work Center's staging location against a WO's planned requirement; actual consumption during
execution draws down that staging balance; any leftover **stays at the Work Center**, available to the
next WO at that same Work Center, without an automatic return to the main Warehouse.

**Concrete example driving this design (keep this as the canonical acceptance scenario):**
Warehouse holds 100 sheets of an EPDM rubber component. A WO at Work Center `WC-CUTTING` needs 60 sheets
to produce 20 tires. WMS transfers 60 sheets from Warehouse to `WC-CUTTING`'s staging location
(Warehouse balance → 40, staging balance → 60). Production actually consumes 40 sheets. The remaining
20 sheets stay on hand at `WC-CUTTING`'s staging location (not returned to Warehouse) and must be
available to satisfy the *next* WO's material request at `WC-CUTTING` before any new transfer from
Warehouse is requested.

**Status before this prompt:** Phase 2 Step 1 (`wms-master-data-service`) is `Completed ✅`, closure
addendum verified (native Kong JWT auth, DB owner/app role split with no DELETE grant, Tempo tracing,
4-locale round trip). **One trailing item remains:** an explicit i18n Completeness Check statement must
still be added to `implementation/phase-2-1-wms-master-data-service.md` (no code change — pure
documentation, does not block this prompt, but must be done before Step 1 is considered fully closed
in every sense).

---

## PART A — Minimal Patch to `wms-master-data-service` (retroactive, additive only)

**Do not re-architect or re-migrate anything already built.** This is one additive migration on top of
the existing `wms_storage_location` table.

### A.1 Schema change

```sql
alter table wms_storage_location
  add column location_purpose varchar(30) not null default 'Storage',
  add column staging_for_work_center_ref uuid null;

alter table wms_storage_location
  add constraint chk_location_purpose
    check (location_purpose in ('Storage', 'WorkCenterStaging'));

alter table wms_storage_location
  add constraint chk_staging_ref_matches_purpose
    check (
      (location_purpose = 'WorkCenterStaging' and staging_for_work_center_ref is not null)
      or
      (location_purpose = 'Storage' and staging_for_work_center_ref is null)
    );

create unique index uq_location_staging_work_center
  on wms_storage_location (staging_for_work_center_ref)
  where staging_for_work_center_ref is not null;
```

- `staging_for_work_center_ref` is a **reference-only** value (the platform's existing convention —
  same treatment as `wo_id`, `RoleCode`, `site_id` elsewhere). It points to `mes-master-data-service`'s
  `md_work_center.work_center_id`. Do not add a cross-DB FK. Do not validate it synchronously against
  MES on write — accept it as an opaque reference, exactly like `site_id` was already accepted in Step 1
  without a live Site event to validate against.
- MVP simplification: **exactly one staging location per Work Center** (the unique index enforces this).
  If a Work Center genuinely needs multiple staging areas later, that's a follow-up, not now.
- A `WorkCenterStaging` location may still have multiple `wms_storage_bin` rows underneath it (e.g. to
  separate lots physically) — no change needed to the Bin table.

### A.2 API change

Extend the existing `POST/PUT /locations` payload to accept `location_purpose` and
`staging_for_work_center_ref`. No new endpoints needed. Add one convenience read endpoint:

- `GET /locations?staging_for_work_center_ref=:workCenterId` — used by `wms-outbound-service` (Part B)
  to resolve "the staging location for Work Center X" without needing its own copy of this mapping.

### A.3 Event impact

**No version bump required.** `WMS.MasterData.LocationCreated.v1` has zero live external consumers
today (Step 2 didn't exist until this prompt) — the two new fields are simply added to the existing
`.v1` payload. This is different from the MES `.v1 → .v2` i18n bump, which was justified specifically
*because* live consumers already existed and needed a version signal. Document this distinction
explicitly in the service manifest so it isn't miscopied as "always bump on any payload change."

### A.4 Patch Definition of Done

| # | Item | Verification |
|---|---|---|
| 1 | Migration applies cleanly on top of existing `wms_master_data_db` schema, no data loss | Migration run + row count check on existing rows (`location_purpose` defaults to `Storage`) |
| 2 | Creating a `WorkCenterStaging` location without `staging_for_work_center_ref` is rejected | Manual test, expect 4xx |
| 3 | Two `WorkCenterStaging` locations cannot be created for the same `staging_for_work_center_ref` | Manual test, expect unique-constraint violation surfaced as typed 409/422 |
| 4 | `GET /locations?staging_for_work_center_ref=:id` returns the correct single location | Manual test |

---

## PART B — Build Prompt: Phase 2, Step 2 — `wms-inventory-service`, `wms-inbound-service`, `wms-outbound-service`

### 0. Mandatory pre-work

1. Confirm Part A's patch is live and verified before starting — all three services below depend on
   `wms_storage_location.location_purpose`/`staging_for_work_center_ref` existing.
2. Re-read `stragegy.md` §3 (cross-service communication rules) — nothing here changes those rules.
   Stock movement is entirely internal to the WMS cluster's own services; the only new cross-cluster
   interaction is the synchronous call from `mes-execution-service` described in §4 below, which follows
   the same justified-synchronous-call pattern already used for Traceability calls at `OP-CUT`/`OP-MOLD`
   (Phase 1 Step 4 §3) and the Approval-gate calls (Phase 1 Step 3 §2) — **this is not a new category of
   exception, it is the third instance of an already-established one.**

### 1. Fixed Technology Decisions (per `TECH-STACK-DECISION.md` §2 — unchanged, do not revisit)

| Service | Language | Reasoning (already decided) |
|---|---|---|
| `wms-inventory-service` | **Go** | Append-only ledger, high-concurrency writes from multiple sources (inbound receipt, staging transfer, consumption decrement) — same shape as `mes-traceability-service` |
| `wms-inbound-service` | **Node.js** | Receiving/putaway, batch/shift cadence, CRUD + business rule, no special concurrency pressure |
| `wms-outbound-service` | **Go** | Real-time picking/allocation on the critical path of WO approval; must answer stock availability with low latency; consumes high-frequency events from MES |

Go services follow the exact scaffolding/library conventions already established in
`mes-traceability-service`/`mes-execution-service` (chi, sqlc+pgx, golang-migrate, confluent-kafka-go,
gobreaker, OTel Go SDK, `internal/` layout). Node service follows `wms-master-data-service`'s conventions.

### 2. Domain Model — Two-Echelon Inventory

#### 2.1 `wms-inventory-service` — owns the stock ledger (`wms_inventory_db`)

**`inv_lot`** — a receivable unit of stock with identity and expiry:
- `lot_id uuid pk`, `lot_code varchar(50) unique not null` (human-readable, numbering scheme is this
  service's own concern — do not reuse `mes-traceability-service`'s numbering rule engine, that is a
  different bounded context per `stragegy.md` §1.1's traceability note)
- `item_revision_id uuid not null` — reference only, validated against a local `rm_item_revision`
  read-model (reuse the same Anti-Corruption Layer pattern already built in `wms-master-data-service`
  Step 1 — consume `MES.MasterData.ItemRevisionReleased.v2` here too, do not share the read-model table
  across WMS services; each service keeps its own minimal projection)
- `received_at timestamptz not null`, `expiry_date date` (nullable — not every item has a shelf life)
- `status varchar(20) not null default 'Active'` (`Active` / `Expired` / `Quarantined` / `Consumed`)
- `original_qty decimal(18,3) not null`, `uom_code varchar(20) not null` (plain code reference, same
  convention as `wms_item_uom_mapping.storage_uom_code` from Step 1)

**`inv_balance`** — current on-hand quantity per `(lot_id, location_id)`:
- `balance_id uuid pk`, `lot_id uuid fk`, `location_id uuid not null` (reference to
  `wms-master-data-service`'s `wms_storage_location`, resolved via a local read-model consumed from
  `WMS.MasterData.LocationCreated.v1`, **including the new `location_purpose`/`staging_for_work_center_ref`
  fields from Part A**)
- `on_hand_qty decimal(18,3) not null check (on_hand_qty >= 0)`
- `row_version integer not null default 1`
- unique constraint on `(lot_id, location_id)`

**`inv_stock_movement`** — append-only ledger, the single source of truth `inv_balance` is a projection
of (never write `inv_balance` without a corresponding movement row in the same transaction):
- `movement_id uuid pk`, `movement_type varchar(30) not null` (`RECEIPT` / `TRANSFER_TO_STAGING` /
  `CONSUMPTION` / `ADJUSTMENT`)
- `lot_id uuid fk`, `from_location_id uuid null`, `to_location_id uuid null` (`RECEIPT` has null `from`;
  `CONSUMPTION` has null `to`; `TRANSFER_TO_STAGING` has both)
- `qty decimal(18,3) not null check (qty > 0)`
- `wo_id uuid null` — reference only, populated for `TRANSFER_TO_STAGING` and `CONSUMPTION` movements
- `work_center_ref uuid null` — reference only, populated for movements touching a staging location
- `occurred_at timestamptz not null default now()`, `created_by uuid`
- **No `DELETE` grant, no update to historical rows** — same audit-critical, append-only rule already
  applied to `mes-traceability-service`'s `genealogy_event`.

Local read-models (Anti-Corruption Layer, same minimal-projection discipline as Step 1):
- `rm_item_revision` (from `MES.MasterData.ItemRevisionReleased.v2`)
- `rm_storage_location` (from `WMS.MasterData.LocationCreated.v1`, **carrying `location_purpose` and
  `staging_for_work_center_ref`** — this is the field that makes the staging-location concept usable
  here without querying `wms_master_data_db` directly)

#### 2.2 `wms-inbound-service` — receiving into Warehouse locations only

- Domain: `inbound_receipt` (receipt header) + `inbound_receipt_line` (item, qty, lot creation
  parameters — expiry date, if applicable).
- On confirmation, calls `wms-inventory-service`'s `POST /movements/receipt` (synchronous, same cluster,
  simple internal API call — no circuit breaker needed for intra-cluster calls unless load testing later
  proves otherwise) to create the `inv_lot` + `RECEIPT` movement + initial `inv_balance` row at a
  Warehouse (non-staging) location.
- **Explicit non-goal:** this service never writes directly to a `WorkCenterStaging` location — receiving
  always lands in ordinary Warehouse storage. Only `wms-outbound-service`'s transfer logic (§2.3) moves
  stock into staging.

#### 2.3 `wms-outbound-service` — the allocation/transfer/staging engine

This is where the two-echelon business rule lives. Implement one core use case,
`RequestMaterialForWorkCenter`, as a single data-driven algorithm (not per-item hardcoded branches):

**Input:** `item_revision_id`, `work_center_ref`, `required_qty`, `wo_id` (all reference values).

**Algorithm (implement exactly this order — this is the business rule from the driving example):**

1. **Resolve the Work Center's staging location** via `rm_storage_location` (filter
   `location_purpose = 'WorkCenterStaging' and staging_for_work_center_ref = :work_center_ref`). If none
   exists, return a typed error `NO_STAGING_LOCATION_CONFIGURED` — do not silently create one; staging
   location provisioning is a master-data decision (Part A's API), not something Outbound improvises.
2. **Compute already-staged quantity**: sum `inv_balance.on_hand_qty` across all `Active`-status lots
   currently at that staging location for this `item_revision_id`. This is the "20 sheets already at
   `WC-CUTTING`" case from the driving example.
3. **Compute shortfall**: `shortfall = max(0, required_qty - already_staged_qty)`.
4. **If `shortfall == 0`**: no transfer needed at all — return success immediately with
   `transferred_qty = 0`, `already_staged_qty` covering the full request. **This is the critical rule
   that was entirely missing from the original design**: a second WO at the same Work Center must reuse
   leftover stock before ever touching the Warehouse again.
5. **If `shortfall > 0`**: query available Warehouse-side lots for this item — `status = 'Active'`,
   `expiry_date is null or expiry_date > current_date`, at locations where `location_purpose = 'Storage'`
   (never pull from another Work Center's staging location) — ordered by `expiry_date asc nulls last`
   (**FEFO — first-expire-first-out**). Sum available quantity across these lots.
   - **If available quantity < shortfall**: return a typed error `INSUFFICIENT_STOCK` with a full
     breakdown: `{ requested_qty, already_staged_qty, shortfall_qty, available_qty }`. **Do not partially
     transfer and do not silently succeed with less than requested** — this must be an explicit decision
     surfaced to the planner (via `mes-execution-service`, see §4), not something Outbound decides
     unilaterally. All-or-nothing per material line is the MVP behavior; partial-fulfillment workflows
     are an explicit follow-up, not built now.
   - **If available quantity >= shortfall**: execute the transfer as a single DB transaction across one
     or more lots (FEFO order, splitting across lots as needed to cover `shortfall`):
     - For each lot consumed: write a `TRANSFER_TO_STAGING` movement (`from_location_id` = the Warehouse
       location holding that lot, `to_location_id` = the Work Center's staging location, `wo_id`,
       `work_center_ref` populated), decrement `inv_balance` at the source, increment (or create)
       `inv_balance` at the staging location **for that same `lot_id`** — lot identity is preserved
       across the transfer, it is not merged into a generic staging pool, so genealogy/expiry stays
       intact at the staging location too.
   - Publish `WMS.Outbound.MaterialStaged.v1` (see §5) on success.
6. **Expired-lot handling**: an expired lot is never included in either the "already staged" sum (§2) or
   the "available Warehouse" sum (§5) for the purposes of *new* allocation — but its `inv_balance` row is
   not deleted or silently zeroed; it remains visible in the ledger as `Expired`-status stock for
   inventory audit/write-off purposes (a separate, out-of-scope-for-now workflow). Lazy status check only
   — evaluate `expiry_date > current_date` at query time; a background job to proactively flip
   `Active → Expired` is a follow-up, not required this step.

**API surface (`wms-outbound-service`, mounted at `/api/wms/outbound/*`):**
- `POST /material-requests` — implements the algorithm above, called synchronously by
  `mes-execution-service` (§4).
- `GET /material-requests/:id` — for audit/troubleshooting.

**Explicit non-goals for `wms-outbound-service` in this step:**
- No automatic "return to Warehouse" transaction for unused staging leftover — leftover simply sits at
  the Work Center indefinitely until consumed by a future WO. A manual return workflow is a follow-up.
- No partial-fulfillment / backorder workflow — all-or-nothing per material request, per §2.3 step 5.
- No cross-Warehouse transfer logic — single-Warehouse MVP scope, consistent with Step 1's
  single-`site_id` Warehouse model.
- No picking-by-employee/pick-list UI — that is `wms-console` (Phase 2 Step 3) territory once this API
  exists to call.

### 3. Consumption decrement — reacting to MES's `MaterialConsumed` event

`wms-inventory-service` consumes `MES.Execution.MaterialConsumed.v1` (already published today by
`mes-execution-service`, per Phase 1 Step 4 §5 — no change needed on the MES side for this event to
exist, it's simply unconsumed until now):

- On receipt: resolve `work_center_ref` (the event already carries WO/operation context —
  `mes-execution-service`'s `wo_operation` snapshot has `work_center_id`; if the event payload doesn't
  currently carry it, this is the one small addition needed to `MES.Execution.MaterialConsumed.v1` — add
  `work_center_id` as a reference field, no version bump needed since this is an additive field on an
  event with a genuinely new first-time consumer, same reasoning as Part A.3).
- Write a `CONSUMPTION` movement: decrement `inv_balance` at the Work Center's staging location for the
  matching `item_revision_id`, FEFO order among lots present there, by the consumed quantity.
- If the consumed quantity somehow exceeds what's on hand at staging (a data inconsistency — e.g. this
  event arrives before the corresponding `TRANSFER_TO_STAGING` was processed) — do not go negative;
  clamp at zero and write a discrepancy log entry, flag for manual reconciliation. Do not crash the
  consumer or drop the event silently.

This is the mechanism that produces the "20 sheets remain at `WC-CUTTING`" outcome from the driving
example: 60 staged, 40 consumed via this event handler, 20 remain in `inv_balance` at that location —
picked up automatically by §2.3 step 2 on the next material request for that Work Center.

### 4. Required (small, additive) change to `mes-execution-service`

This is the one integration point back into an already-completed service. Keep it minimal:

- Add a new use case, `StageMaterialsForWorkOrder`, invoked once per WO right after `ApproveWorkOrder`
  transitions status to `Released` (or as an explicit separate action — developer's choice, but do not
  block the Approval transaction itself on this call; it should be its own step so a WMS outage doesn't
  prevent WO approval from completing).
- For each non-phantom `wo_material_requirement` line (phantom lines like `SFG-ROLL-EPDM-R1` are
  **excluded** from this bulk pre-staging flow — their actual consumption quantity is resolved at
  `OP-CUT` via the traceability split, not a static planned quantity, so bulk-staging them ahead of time
  doesn't fit the same model; this is an explicit, documented gap, not an oversight, and is a follow-up
  for a future step once the interaction between QR-split output and staging inventory is designed): call
  `wms-outbound-service`'s `POST /material-requests`, circuit-breaker guarded (`gobreaker`, same pattern
  as the existing Traceability/Approval-gate calls).
- Extend `wo_material_requirement.stock_check_status` enum from just `'NotChecked'` to
  `'NotChecked' | 'Staged' | 'Shortage'` (additive migration, one new nullable `stock_check_detail jsonb`
  column storing the shortage breakdown from `INSUFFICIENT_STOCK` responses, for the planner to see).
- This is the **first real implementation** of the `stock_check_status` column that Phase 1 Step 3 §6
  deliberately left inert — that earlier decision was correct at the time (WMS didn't exist yet); this is
  the planned follow-up, arriving on schedule.

### 5. Events

New, published by `wms-outbound-service`:
```
WMS.Outbound.MaterialStaged.v1
WMS.Outbound.MaterialShortageDeclared.v1
```
Both carry `wo_id`, `work_center_ref`, `item_revision_id` (all reference values) plus the quantity
breakdown described in §2.3. These exist for audit/observability and for any future consumer (e.g.
`wms-console`'s dashboard) — `mes-execution-service` gets its answer synchronously via the HTTP response
in §4, it does not need to consume these events to update its own `stock_check_status`.

Consumed:
- `wms-inventory-service` consumes `MES.MasterData.ItemRevisionReleased.v2`,
  `WMS.MasterData.LocationCreated.v1`, `MES.Execution.MaterialConsumed.v1`.
- `wms-outbound-service` consumes the same `rm_item_revision`/`rm_storage_location` read-models (either
  by also subscribing directly, or by calling `wms-inventory-service`'s internal API for balance queries
  — developer's choice; intra-cluster coupling is more tolerable than cross-cluster, but prefer each
  service keeping its own minimal read-model if the query pattern is simple enough, consistent with the
  Anti-Corruption discipline already applied everywhere else).

### 6. Definition of Done

| # | Item | Verification |
|---|---|---|
| 1 | Driving scenario end-to-end: Warehouse has 100 sheets (1 lot); WO requests 60 for `WC-CUTTING` → transfer succeeds, Warehouse balance = 40, staging balance = 60 | Integration test |
| 2 | MES publishes `MaterialConsumed` for 40 sheets against that WO → staging balance becomes 20, Warehouse stays at 40 | Integration test |
| 3 | A second WO at `WC-CUTTING` requests 15 sheets of the same item → algorithm finds 20 already staged, `shortfall = 0`, **no Warehouse movement occurs**, request succeeds immediately | Integration test — this is the single most important behavior this prompt exists to guarantee |
| 4 | A request exceeding total available stock (already-staged + Warehouse) returns `INSUFFICIENT_STOCK` with correct breakdown numbers, and creates **no partial movement** | Integration test |
| 5 | A lot past `expiry_date` is excluded from both already-staged and available-Warehouse sums | Integration test with a deliberately expired seed lot |
| 6 | FEFO ordering verified: when Warehouse holds 2 lots of the same item with different expiry dates, the nearer-expiry lot is consumed first | Integration test |
| 7 | `mes-execution-service`'s `wo_material_requirement.stock_check_status` correctly reflects `Staged`/`Shortage` after the new `StageMaterialsForWorkOrder` use case runs | Integration test against a live WO |
| 8 | Circuit breaker trips gracefully if `wms-outbound-service` is down when `StageMaterialsForWorkOrder` runs — WO approval itself is unaffected, staging step is retryable | Fault injection test |
| 9 | No `DELETE` grant on `inv_lot`/`inv_balance`/`inv_stock_movement` | `information_schema` query, same pattern as the Step 1 closure addendum |
| 10 | Trace for the full staging→consumption→re-request flow visible in Grafana Tempo | Grafana check |

### 7. Non-Goals (explicit, restated)

- No `wms-console` UI (Phase 2 Step 3).
- No return-to-Warehouse transaction, no partial fulfillment, no cross-Warehouse transfer, no proactive
  expiry batch job — all flagged as follow-ups above, not silently dropped.
- No handling of phantom/QR-split components in the bulk staging flow (§4) — flagged as a known,
  documented gap for a future step, not an oversight.
- No changes to `mes-traceability-service` or Stage B's QR-split logic.

### 8. Process Reminder

1. Update `process/PROJECT_WORKLOAD_PROGRESS.md`: mark Part A's patch and Part B's Step 2 build both
   under the existing "Phase 2, Step 2" row, since Part A is a small dependency-patch to Step 1 rather
   than a new roadmap row.
2. Update `AI_CONTEXT.md` §3 (Architectural Principles) with a new permanent rule:
   > "WMS inventory is a two-echelon model: a central Warehouse and per-Work-Center staging locations
   > (`wms_storage_location.location_purpose = 'WorkCenterStaging'`, tagged with a reference-only
   > `staging_for_work_center_ref`). Material requests must always check existing staging balance before
   > requesting a new transfer from the Warehouse (staging-first allocation). Leftover staged material is
   > not automatically returned to the Warehouse."
3. Update `AI_CONTEXT.md` §7 with the three new services' ownership, endpoints, and events, and correct
   the `mes-execution-service` entry to note `stock_check_status` is no longer inert.
4. Add the trailing i18n Completeness Check statement to `implementation/phase-2-1-wms-master-data-service.md`
   before considering Phase 2 Step 1 fully closed in every respect (documentation-only, does not block
   this prompt's work).