# BUILD PROMPT — Phase 1, Step 4: `mes-execution-service` Stage B (Real-Time Operation Execution)

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Phase:** Phase 1, Step 4
**Language/Stack:** Go 1.22 (existing service, extend — do not rewrite Stage A)
**Status before this prompt:** Stage A (WO planning/creation/approval) is implemented and verified. `mes-traceability-service` (Step 2) is implemented and verified, exposing `/policies/resolve`, `/labels/issue`, `/labels/split`, `/labels/consume`, `/labels/{id}/genealogy` under `http://.../api/mes/traceability/*`.

---

## 0. Mandatory pre-work: Boundary re-check

Before writing new code, re-confirm the Stage A boundary is still intact (per the Step 3 reconciliation audit — already verified clean). Additionally, before implementing Stage B, confirm:

- No table already exists in `mes_execution_db` named `label_instance`, `genealogy_event`, or anything that duplicates traceability data beyond a plain reference column (`label_id`).
- The existing `masterdata_consumer.go` pattern (from Stage A, consuming `MES.MasterData.ProductionVersionReleased.v1`) is reused, not reimplemented, for any new read-model needs in this step.
- Confirm `mes-traceability-service`'s `/policies/resolve`, `/labels/split`, `/labels/consume` endpoints are reachable from `mes-execution-service` via Kong (`http://kong/api/mes/traceability/*`) or direct service-to-service call — decide and document which, and apply `gobreaker` circuit breaker on the call (same library already used in `ApproveWorkOrder`).

If any violation is found, stop and report before proceeding.

---

## 1. Objective & Domain Scope

Implement real-time Start/Finish execution for each `md_operation` in a released Work Order's routing snapshot, driven by the operation behavior table below (source: product spec §3). This table is the authoritative confirmation-engine configuration — implement it as data-driven logic, not per-operation hardcoded branches, so future operations can be added via master-data without code changes.

| OperationCode | OperationType | ConfirmationMode | RequiresMaterialScan | RequiresOutputLabel | Special Rule |
|---|---|---|---|---|---|
| `OP-MIX` | Production | StartFinish | Yes (raw material/chemical scan) | Yes (issue mother label, batch) | Enforce Banbury mix-time/temperature window (record only — no closed-loop control in this phase) |
| `OP-PREP` | Production | QuantityOnly | Yes (raw steel scan) | No | Count-based, no label |
| `OP-CUT` | Production | StartFinish | Yes (scan mother QR) | Yes (activate batch of child QR) | **Calls `mes-traceability-service` `POST /labels/split`** |
| `OP-MOLD` | Production | StartFinish | Yes (scan child QR + pallet) | Yes (issue output label per lot/box) | **Calls `mes-traceability-service` `POST /labels/consume`**, then `POST /labels/issue` for the output. Enforce curing time window 150°C–180°C (record only) |
| `OP-TRIM` | Production | QuantityOnly | No | No | Records scrap quantity/rate |
| `OP-QC` | Inspection | StartFinish | No | Yes (PASS label only) | Requires `reason_code` on fail (bong keo, khuyết liệu, etc. — pull valid codes from `md_reason_code` read-model) |

**New domain concepts owned by this service (extend existing WO aggregate — do not create a separate service):**
- `execution_session` — one per operator/terminal/WO-operation instance: `session_id`, `wo_operation_id`, `terminal_ref` (reference only, `mes-kiosk-gateway-service` not built yet — accept a plain string terminal identifier for now), `operator_user_id`, `started_at`, `ended_at`, `status` (`IN_PROGRESS` / `COMPLETED` / `ABORTED`).
- `operation_confirmation` — the actual Start/Finish or Quantity confirmation record: `confirmation_id`, `wo_operation_id`, `session_id`, `qty_good`, `qty_scrap`, `reason_code` (nullable, required if `qty_scrap > 0` or operation is `OP-QC` fail), `input_label_id` (nullable, reference only), `output_label_id` (nullable, reference only), `confirmed_at`.
- `material_consumption` — one row per MBOM line actually consumed against a WO operation: `consumption_id`, `wo_id`, `wo_operation_id`, `component_revision_id`, `qty_consumed`, `uom`, `source` (`BACKFLUSH` / `MANUAL_SCAN`), `label_id` (nullable, reference only), `consumed_at`.

---

## 2. Backflush Logic

For every MBOM line on the WO with `BackflushFlag = true` (per Stage A's stored MBOM snapshot), automatically create a `material_consumption` row with `source = BACKFLUSH` when the line's `IssueOperationID` is confirmed as Finished — quantity computed as `QuantityPer × WO good quantity`, adjusted by `ScrapRate`. Lines with `BackflushFlag = false` (e.g. `RM-STL-05-R1` at `OP-PREP`) require an explicit manual consumption entry instead (`source = MANUAL_SCAN`) tied to the material scan already required by that operation's `RequiresMaterialScan = Yes`.

Phantom-flagged lines (`SFG-ROLL-EPDM-R1` at `OP-CUT`) are **not** consumed via plain backflush math — their consumption quantity comes from the actual QR split result returned by `mes-traceability-service` (§3 below), not from the static MBOM ratio alone, since real cut area can vary from the planned quantity.

---

## 3. Traceability Service Integration (synchronous calls)

- **At `OP-CUT` Start (or Finish, per `ConfirmationMode = StartFinish` — confirm on Finish to avoid partial-scan states):** call `POST /labels/split` on `mes-traceability-service` with the scanned mother `label_id`, target quantity, and applicable `md_qr_split_rule`. Store the returned child label IDs as `output_label_id` references (one `operation_confirmation` row per child, or a single row with a child-label-set reference — pick one and document it in the manifest). Record a `material_consumption` row for the phantom MBOM line using the actual split-out quantity.
- **At `OP-MOLD` Finish:** call `POST /labels/consume` for the scanned child QR label, then `POST /labels/issue` for the new finished-lot output label. Store both `input_label_id` and `output_label_id` on the `operation_confirmation` row.
- **At `OP-MIX` Finish:** call `POST /labels/issue` to mint the mother label for the compound batch.
- **At `OP-QC` Finish with PASS:** call `POST /labels/issue` for the PASS label only; on FAIL, do not call traceability at all — just record `reason_code`.
- Before any of the above, call `POST /policies/resolve` once per WO-operation (cache the result on the `wo_operation` row from Stage A, or re-resolve per confirmation — decide based on whether policy can change mid-WO; default to resolve-once-and-cache since WO is already Released and immutable per master-data rules) to confirm whether a policy applies at all — some item revisions may not require `MOTHER_CHILD_QR` tracking.
- Apply the idempotency key pattern already proven by `mes-traceability-service` (§ its Definition of Done #9) on every call — generate the key from `wo_operation_id + confirmation attempt` so a kiosk retry after a network drop never double-splits or double-consumes.

---

## 4. Use Cases to Implement

1. `StartOperation` — validate WO is `Released`, validate operation sequence/predecessor completion (per routing snapshot from Stage A), create `execution_session`, transition `wo_operation.status` to `IN_PROGRESS`.
2. `ConfirmOperation` — the core state-driven confirmation engine described in §1's table. Branches only on data (`ConfirmationMode`, `RequiresMaterialScan`, `RequiresOutputLabel`) read from the operation's stored config, not on hardcoded `if OperationCode == "OP-CUT"` chains, except for the specific traceability API call routing in §3 which is inherently operation-specific business behavior.
3. `RecordMaterialConsumption` — implements §2 backflush + manual scan logic.
4. `CompleteWorkOrder` — when the last operation in the routing sequence reaches `Finished` with no open `IN_PROGRESS` sessions, transition WO to `Completed` and publish `MES.Execution.WOCompleted.v1`.
5. `AbortSession` — operator-initiated or timeout-initiated session abort, no destructive data changes (no hard delete), `execution_session.status = ABORTED`.

---

## 5. Events to Publish (extend existing outbox, same pattern as Stage A)

- `MES.Execution.OperationStarted.v1`
- `MES.Execution.OperationFinished.v1`
- `MES.Execution.MaterialConsumed.v1`
- `MES.Execution.WOCompleted.v1`

---

## 6. API Surface (extend existing `/api/mes/execution/work-orders` router)

- `POST /work-orders/{id}/operations/{opId}/start`
- `POST /work-orders/{id}/operations/{opId}/confirm` (body includes qty, scanned label(s), reason_code if applicable)
- `POST /work-orders/{id}/operations/{opId}/abort`
- `GET /work-orders/{id}/operations/{opId}/consumption` (for QC/audit visibility)

---

## 7. Explicit Non-Goals for This Step

> Current-state note added by documentation audit on 2026-07-22: the WMS stock-check non-goal below was
> correct for this historical Stage B prompt. Phase 2 Step 2 now implements WMS material staging and
> consumption decrement; see `implementation/phase-2-2-wms-inventory-stock.md`.

- Do not build kiosk WebSocket/MQTT/offline-sync — `terminal_ref` stays a plain string field until `mes-kiosk-gateway-service` (Step 5) exists to own real terminal identity.
- Do not implement WMS stock-check or reservation calls — `mes-execution-service` does not yet know inventory availability; this remains a known gap until `wms-outbound-service` (Phase 2) exists, consistent with Stage A's `ComputeAndCheck` already excluding stock fields.
- Do not implement QMS inspection-plan logic beyond the minimal PASS/FAIL + reason_code capture at `OP-QC` — full inspection plan management belongs to `qms-inspection-service` (Phase 3).
- Do not modify `mes-traceability-service` — only call its existing API.

---

## 8. Definition of Done

| # | Item | Verification |
|---|---|---|
| 1 | Full happy-path WO execution: Start → Confirm at each of `OP-MIX`→`OP-PREP`→`OP-CUT`→`OP-MOLD`→`OP-TRIM`→`OP-QC` → WO auto-`Completed` | Integration test against `WO-1000` created in Stage A |
| 2 | `OP-CUT` confirmation produces child labels matching traceability service's split result | Cross-service integration test, compare returned `label_id`s |
| 3 | `OP-MOLD` confirmation consumes child label and issues new output label | Same |
| 4 | Backflush consumption quantities match `QuantityPer × qty_good` adjusted for `ScrapRate` for all `BackflushFlag = true` lines | Unit test against MBOM snapshot from `product-doc.md` §4 |
| 5 | Manual-scan consumption required and enforced for `BackflushFlag = false` lines | Unit test for `RM-STL-05-R1` |
| 6 | Idempotent retry of `/confirm` at `OP-CUT`/`OP-MOLD` does not double-call traceability service | Retry test with same idempotency key |
| 7 | `OP-QC` FAIL requires `reason_code`, does not call traceability | Unit test |
| 8 | All 4 new events published via outbox, `status = PUBLISHED` | Kafka consumer check |
| 9 | Circuit breaker trips gracefully if `mes-traceability-service` is down mid-confirmation, operation remains in a resumable state (no partial/corrupt confirmation row) | Fault injection test: stop traceability service mid-flow, confirm execution-service returns a clear error and the WO-operation is retryable |

---

## 9. Process Reminder

Per `process/PROJECT_WORKLOAD_PROGRESS.md`, update that tracker's row for Step 4 to `Completed ✅` with a link to this step's implementation trace document immediately after finishing — do not batch progress updates.
