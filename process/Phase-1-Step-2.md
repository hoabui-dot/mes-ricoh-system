# BUILD PROMPT — Phase 1, Step 2: `mes-traceability-service`

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Phase:** Phase 1 (Step 2, out of order — see §0 Reconciliation)
**Language/Stack:** Go 1.22 (per `process/TECH-STACK-DECISION.md`)
**Status before this prompt:** NOT implemented. Phase 0 (platform foundation), Phase 1 Step 1 (`mes-master-data-service`), and Phase 1 Step 3 (`mes-execution-service` Stage A) are already built and verified. This step was skipped and must be built now, before any work begins on `mes-execution-service` Stage B.

---

## 0. Mandatory pre-work: Reconciliation audit (do this before writing any new code)

Before implementing anything in this prompt, audit the existing `services/mes-execution-service` codebase (Stage A: `DetermineDemand`, `CheckMasterDataReadiness`, `CreateWorkOrder`, `ComputeAndCheck`, `ApproveWorkOrder`) for any of the following boundary violations. If found, extract and note them — do not silently leave them in place, and do not fix them as part of this prompt without flagging it first:

- Any code that generates, formats, or validates a QR/label code string.
- Any code that implements area- or mass-balanced parent→child splitting (this is `md_qr_split_rule` logic and belongs only to this service).
- Any code that assigns or increments a numbering sequence (lot number, label number) for `md_item_revision` output.
- Any local table in `mes_execution_db` that duplicates `label_instance` or `genealogy_event` concepts.

Expected result: none of the above should exist yet, because Stage A only covers WO planning/approval and never reaches `OP-CUT` or `OP-MOLD` execution. Confirm this explicitly in the implementation report for this step. If anything is found, stop and report it instead of proceeding.

---

## 1. Objective & Domain Scope

Implement `mes-traceability-service` as the single source of truth for:

**Configuration data (Layer: Traceability Policy)**
- `md_traceability_policy` — which `md_item` / `md_item_revision` requires QR mother-child tracking, lot tracking, or serial tracking, and at which operation(s) it applies.
- `md_numbering_rule` — format and atomic sequence definition per site/item-group/operation (e.g. prefix, date segment, running counter, reset frequency).
- `md_qr_split_rule` — split algorithm configuration per component (area-based, mass-based, or fixed-count) for parent→child transformations such as `SFG-ROLL-EPDM` → cut pieces at `OP-CUT`.
- `md_label_template` — label layout metadata referenced when printing (content fields only, not a print-driver integration in this phase).

**Runtime/transactional data (do NOT defer to a later phase — build now)**
- `label_instance` — every mother or child label ever issued: `label_id`, `item_revision_id`, `lot_or_serial_no`, `parent_label_id` (nullable), `quantity`, `uom`, `status` (`ACTIVE` / `CONSUMED` / `SCRAPPED`), `created_by_operation`, `site_id`, `created_at`.
- `genealogy_event` — append-only, immutable log of every parent→child or consumption relationship: `event_id`, `label_id`, `related_label_id`, `relationship_type` (`SPLIT_FROM` / `CONSUMED_INTO` / `MERGED_INTO`), `operation_code`, `wo_id` (reference only, no FK — see §3), `occurred_at`.

> **Domain boundary reminder:** This service owns *how* QR/lot policy is configured and *what* the split/numbering result is. It does not own Work Order state, routing execution, or scheduling — those remain in `mes-execution-service`. It does not own Item/MBOM/Routing master data — those remain in `mes-master-data-service` and are only referenced by ID.

---

## 2. Why this must be built before `mes-execution-service` Stage B

Stage B will implement real-time Start/Finish confirmation at each operation, including `OP-CUT` (QR mother scan → child QR batch activation, per `md_qr_split_rule`) and `OP-MOLD` (QR child scan + pallet scan → output label). Stage B cannot be correctly implemented without a working numbering/split/genealogy API to call synchronously and an event contract to consume. Building traceability first avoids retrofitting Stage B logic later.

---

## 3. Cross-Service Communication Rules (no exceptions)

- **No direct DB access** to `mes_master_data_db` or `mes_execution_db`. This service maintains its own `mes_traceability_db`.
- **Consume events from `mes-master-data-service`** to build a local read-model of which item revisions require which policy:
  - `MES.MasterData.ItemRevisionReleased.v1`
  - `MES.MasterData.MBOMReleased.v1` (to know phantom-flagged components like `SFG-ROLL-EPDM` that require split-at-consumption behavior)
- **Expose a synchronous API** for `mes-execution-service` to call during Stage B execution (see §5). This is the one place where a synchronous cross-service call is justified — the operator is standing at a kiosk waiting for a printed label, so eventual consistency via events alone is not acceptable here. Apply a circuit breaker on the caller side (execution-service already uses `gobreaker`; reuse the same pattern).
- **Publish events** after every label issuance and genealogy write, using the standard `EventEnvelope` from `libs/shared-kernel-go`, so `mes-execution-service`, and later WMS/QMS, can build their own read-models instead of querying this service synchronously for historical data:
  - `MES.Traceability.LabelIssued.v1`
  - `MES.Traceability.QRSplitPerformed.v1`
  - `MES.Traceability.GenealogyRecorded.v1`
- `wo_id` stored in `genealogy_event` is a reference value only (no foreign key across databases), consistent with the platform-wide rule that `RoleCode`/`UserID`/cross-service IDs are references, not FKs.

---

## 4. Domain Rules to Implement

1. **Atomic numbering**: sequence generation must be safe under concurrent requests from multiple kiosks hitting the same site/item-group/operation combination simultaneously. Use a DB-level atomic increment (e.g. `SELECT ... FOR UPDATE` on a counter row, or `INSERT ... ON CONFLICT DO UPDATE RETURNING`) — do not generate numbers in application memory.
2. **QR Split Rule execution**: given a parent label, a target quantity, and the applicable `md_qr_split_rule`, compute the resulting child label set:
   - Area-based split (e.g. `SFG-ROLL-EPDM` in M², consistent with the phantom-flag MBOM line in `product-doc.md` §4).
   - Mass-based split.
   - Fixed-count split.
   - Every split must write one `genealogy_event` row per parent→child relationship and one `label_instance` row per child, in the same DB transaction, plus an outbox event — same outbox pattern used in `mes-master-data-service` and `mes-execution-service`.
3. **No hard deletes** on `label_instance` or `genealogy_event` — this is an audit-critical trail. Status changes only.
4. **Idempotency**: re-submitting the same scan/split request (same idempotency key from the kiosk) must not create duplicate labels or genealogy rows.

---

## 5. API Surface (called synchronously by `mes-execution-service` during Stage B, and by `mes-kiosk-gateway-service` later)

Mount under Kong route `/api/mes/traceability/*`.

- `POST /policies/resolve` — given `item_revision_id` + `operation_code`, return the applicable policy (tracking type, numbering rule, split rule if any). Used by execution-service before prompting the operator to scan.
- `POST /labels/issue` — issue a new mother label (e.g. at `OP-MIX` batch output). Returns `label_id` + formatted code per numbering rule.
- `POST /labels/split` — perform a parent→child split per §4.2. Returns full child label set.
- `POST /labels/consume` — mark a label as `CONSUMED` and record a `CONSUMED_INTO` genealogy event (used at `OP-MOLD` when child QR + metal pallet are scanned together).
- `GET /labels/{id}/genealogy` — full upstream/downstream trace for a given label (for QC/NCR use later).
- `GET /health`, `GET /metrics` — same pattern as `hello-world-service` and `mes-execution-service`.

---

## 6. Service Structure (must match the Go scaffolding template already established by `mes-execution-service`)

```
services/mes-traceability-service/
├── cmd/server/main.go
├── internal/
│   ├── domain/                # LabelInstance, GenealogyEvent, SplitRule, NumberingRule value objects
│   ├── application/usecase/   # ResolvePolicy, IssueLabel, SplitLabel, ConsumeLabel, GetGenealogy
│   ├── infrastructure/
│   │   ├── db/                 # golang-migrate migrations, sqlc-generated queries, pgxpool
│   │   ├── outbox/              # reuse libs/shared-kernel-go outbox relay worker
│   │   ├── events/               # Kafka consumer for MasterData events (read-model sync)
│   │   └── http/                  # chi router, matches header contract (X-User-ID, X-Role-Code, X-Trace-ID)
│   └── instrumentation/
├── migrations/
├── test/{unit,integration,contract}/
├── Dockerfile
├── docker-compose.override.yml
└── service.manifest.yaml
```

`service.manifest.yaml` content:

```yaml
service: mes-traceability-service
cluster: MES
owns_database: mes_traceability_db
publishes_events:
  - MES.Traceability.LabelIssued.v1
  - MES.Traceability.QRSplitPerformed.v1
  - MES.Traceability.GenealogyRecorded.v1
consumes_events:
  - MES.MasterData.ItemRevisionReleased.v1
  - MES.MasterData.MBOMReleased.v1
```

---

## 7. Infrastructure Changes Required

- Add `mes-traceability-service` + `mes-traceability-db` (Postgres, own container, own port in the `13xxx`/`15xxx` range following existing allocation) to `infra/docker-compose.mes.yml`.
- Add Kong route `/api/mes/traceability/*` in `infra/kong/kong.yml`, forwarding the same identity headers as the other two MES services.
- Register the 3 new event schemas in Confluent Schema Registry on service startup, same pattern as `mes-master-data-service`.

---

## 8. Definition of Done

| # | Item | Verification |
|---|---|---|
| 1 | `mes-traceability-db` and `mes-traceability-service` containers healthy | `docker compose ps` |
| 2 | Local read-model correctly updated from `mes-master-data-service` events | Publish a test `MBOMReleased` event, confirm policy read-model row appears |
| 3 | Numbering is atomic under concurrent load | Load test: N parallel `POST /labels/issue` requests for the same rule produce N unique sequential numbers, zero collisions |
| 4 | Area-based split matches expected quantities for `SFG-ROLL-EPDM` scenario from `product-doc.md` §4 | Integration test against the phantom-flag MBOM line |
| 5 | Genealogy trace returns full parent→child chain | `GET /labels/{id}/genealogy` on a split+consume scenario |
| 6 | Outbox → Kafka publishing works for all 3 event types | Kafka consumer check, `status = PUBLISHED` |
| 7 | Reconciliation audit from §0 completed and documented | Written confirmation in the implementation report, before or alongside this build |
| 8 | Kong routing verified | `curl http://localhost:18000/api/mes/traceability/health` |
| 9 | Idempotent split/consume requests verified | Duplicate request with same idempotency key produces no duplicate rows |

---

## 9. Explicit Non-Goals for This Step

- Do not build kiosk WebSocket/MQTT connectivity — that is `mes-kiosk-gateway-service` (Step 4).
- Do not implement label *printing* (physical printer driver integration) — only label *data* generation.
- Do not touch `mes-execution-service` Stage B in this step. Stage B is the next prompt, and it will consume the API defined in §5.
- Do not implement WMS/QMS event consumption yet — out of scope until Phase 2/3.