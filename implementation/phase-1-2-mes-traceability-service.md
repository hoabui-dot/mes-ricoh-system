# Implementation Trace — Phase 1, Step 2: `mes-traceability-service` (Go 1.22)

**Status:** Completed ✅  
**Service Name:** `mes-traceability-service`  
**Database:** `mes_traceability_db` (Postgres, port `15436`)  
**Language/Framework:** Go 1.22, Chi router, `pgx/v5`, `segmentio/kafka-go`, OTel SDK  
**Kong Gateway Route:** `/api/mes/traceability/*`  

---

## 1. Executive Summary

`mes-traceability-service` was implemented in Go 1.22 as the single source of truth for traceability configuration policies, numbering rules, QR parent-child split rules, label instances, and immutable genealogy logs.

It operates with:
- **Synchronous REST API** for real-time label resolution, issuance, splitting, consumption, and genealogy queries.
- **Atomic Sequence Generation** using PostgreSQL `SELECT FOR UPDATE` on `md_numbering_sequence`.
- **Idempotent Parent→Child Split Engine** supporting Area-based, Mass-based, and Fixed-count algorithms without duplicate label issuance.
- **Master Data Kafka Consumer** subscribing to `MES.MasterData.ItemRevisionReleased.v1` and `MES.MasterData.MBOMReleased.v1` to maintain local `rm_*` read-models.
- **Transactional Outbox Relay Worker** publishing `MES.Traceability.LabelIssued.v1`, `MES.Traceability.QRSplitPerformed.v1`, and `MES.Traceability.GenealogyRecorded.v1`.

---

## 2. Reconciliation Audit (§0)

A clean audit of `services/mes-execution-service` was performed before implementation:
- **QR / Label generation code**: 0 occurrences found.
- **Parent→Child splitting logic**: 0 occurrences found.
- **Numbering sequence logic**: 0 occurrences found.
- **Duplicate tables**: 0 occurrences found.

---

## 3. Database Schema (`mes_traceability_db`)

Created via migration `000001_initial_traceability_schema.up.sql`:
1. `md_label_template` — Label layout metadata.
2. `md_numbering_rule` — Prefix, date format, sequence length, reset frequency per site/item/operation.
3. `md_numbering_sequence` — Atomic counter table for sequence generation (`rule_id`, `sequence_key`, `current_value`).
4. `md_qr_split_rule` — Split algorithm configuration (`AREA_BASED`, `MASS_BASED`, `FIXED_COUNT`).
5. `md_traceability_policy` — Tracking policy assignment per item revision and operation (`MOTHER_CHILD_QR`, `LOT`, `SERIAL`).
6. `label_instance` — Active, consumed, or scrapped tracking labels with `idempotency_key`.
7. `genealogy_event` — Immutable parent-child transformation log (`SPLIT_FROM`, `CONSUMED_INTO`, `MERGED_INTO`).
8. `outbox_events` — Standard transactional outbox table.
9. Local read-models: `rm_item_revision`, `rm_mbom_header`, `rm_mbom_line`.

---

## 4. End-to-End Verification Results

Verification executed via [`scripts/test_traceability_flow.py`](file:///home/neurosus/mes-system/scripts/test_traceability_flow.py):

| # | Test Case | Expected Result | Status |
|---|---|---|---|
| 1 | **Policy Resolution** (`POST /policies/resolve`) | Resolved `MOTHER_CHILD_QR` policy for `FG-WS-CM01` at `OP-MIX` | **PASS** ✅ |
| 2 | **Mother Label Issuance** (`POST /labels/issue`) | Issued `EPDM-20260721-00003` with 100 M² quantity | **PASS** ✅ |
| 3 | **Atomic Sequence Increment** | Second issue request produced `EPDM-20260721-00004` | **PASS** ✅ |
| 4 | **QR Split at `OP-CUT`** (`POST /labels/split`) | Created child labels `EPDM-20260721-00001-C1` (30 M²) & `EPDM-20260721-00001-C2` (40 M²), `SPLIT_FROM` genealogy event | **PASS** ✅ |
| 5 | **Idempotency Verification** | Re-sent split request returned existing child labels without creating duplicates | **PASS** ✅ |
| 6 | **Label Consumption at `OP-MOLD`** (`POST /labels/consume`) | Marked child label `CONSUMED` and logged `CONSUMED_INTO` genealogy event | **PASS** ✅ |
| 7 | **Lineage Genealogy Graph** (`GET /labels/{id}/genealogy`) | Returned complete upstream/downstream parent-child event graph | **PASS** ✅ |
| 8 | **Kafka Outbox Event Relay** | Published `MES.Traceability.LabelIssued.v1`, `MES.Traceability.QRSplitPerformed.v1`, `MES.Traceability.GenealogyRecorded.v1` (`status = PUBLISHED`) | **PASS** ✅ |
| 9 | **Kong Gateway Route** (`http://100.68.50.41:18000/api/mes/traceability/*`) | Routes forwarded user context headers (`X-User-ID`, `X-Role-Code`) | **PASS** ✅ |

---

## 5. Artifacts & Source Code References

- **Migration**: [`services/mes-traceability-service/migrations/000001_initial_traceability_schema.up.sql`](file:///home/neurosus/mes-system/services/mes-traceability-service/migrations/000001_initial_traceability_schema.up.sql)
- **Domain Model**: [`services/mes-traceability-service/internal/domain/traceability.go`](file:///home/neurosus/mes-system/services/mes-traceability-service/internal/domain/traceability.go)
- **Use Cases**:
  - [`resolve_policy.go`](file:///home/neurosus/mes-system/services/mes-traceability-service/internal/application/usecase/resolve_policy.go)
  - [`issue_label.go`](file:///home/neurosus/mes-system/services/mes-traceability-service/internal/application/usecase/issue_label.go)
  - [`split_label.go`](file:///home/neurosus/mes-system/services/mes-traceability-service/internal/application/usecase/split_label.go)
  - [`consume_label.go`](file:///home/neurosus/mes-system/services/mes-traceability-service/internal/application/usecase/consume_label.go)
  - [`get_genealogy.go`](file:///home/neurosus/mes-system/services/mes-traceability-service/internal/application/usecase/get_genealogy.go)
- **HTTP Router**: [`services/mes-traceability-service/internal/infrastructure/http/router.go`](file:///home/neurosus/mes-system/services/mes-traceability-service/internal/infrastructure/http/router.go)
- **Test Suite**: [`scripts/test_traceability_flow.py`](file:///home/neurosus/mes-system/scripts/test_traceability_flow.py)
