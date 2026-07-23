# ADDENDUM PROMPT — Phase 2, Step 2 Closure: Close 4 Gaps Before Marking Complete

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Trigger:** Implementation report for Phase 2 Step 2 (Two-Echelon Inventory) reviewed against the
original Definition of Done. The core business behavior — staging-first allocation, FEFO, shortage
handling, expiry exclusion — is verified with strong evidence and should **not** be touched again. Four
items remain open, one of which is a genuine architectural violation, not just a missing test.

**Do not update `PROJECT_WORKLOAD_PROGRESS.md` to `Completed ✅` for Step 2 until all four are closed.**

---

## 0. Do not re-architect

Nothing here changes the allocation algorithm, schema, or event contracts already built and verified.
Three of the four items are verification/observability gaps; one requires a real fix, scoped narrowly.

---

## PART A — Critical: fix the Schema Registry rejection, do not swallow it

The report states the dev Schema Registry rejected the additive fields on
`WMS.MasterData.LocationCreated.v1` under its compatibility mode, and the service was changed to treat
that specific 409 as an expected warning and continue. **This is not acceptable as a permanent state.**
The Schema Registry exists specifically to catch incompatible payload changes before they reach a
consumer at runtime (`stragegy.md` §7.3, Contract Testing) — silently downgrading a real rejection to a
"known warning" defeats that purpose for this subject going forward, for every future change to it.

### A.1 Diagnose the actual cause (do this before choosing a fix)

- Check the compatibility mode configured on the `WMS.MasterData.LocationCreated.v1-value` subject
  (`BACKWARD`, `FORWARD`, `FULL`, `NONE`, etc.) via the Schema Registry API.
- Check how the original Step 1 schema was declared — if it's a JSON Schema with
  `"additionalProperties": false` (or an Avro record with no default value on new fields), that is the
  root cause: the schema itself is written in a way that makes it structurally impossible to add a field
  compatibly, regardless of how harmless the addition is in practice.

### A.2 Fix it properly — pick the option that matches the actual cause

- **If the schema is declared as closed** (`additionalProperties: false` in JSON Schema, or Avro fields
  without defaults): correct the schema definition so new optional fields are structurally additive
  (`additionalProperties: true` with the two new fields declared optional, or Avro fields with an
  explicit default and `["null", "type"]` union) and re-register. This is the preferred fix since it
  matches Part A of the original prompt's reasoning: zero live consumers existed, so no version bump
  was needed — but the schema shape itself must still be technically backward-compatible for the
  registry to accept it, independent of whether anyone was consuming it yet.
- **If the compatibility mode itself is simply too strict for a subject with zero live consumers**
  (e.g. `FULL` when `BACKWARD` would suffice): this is a valid, narrow exception to make — document why
  in the schema registration script/config, so it isn't mistaken for a blanket "loosen everything" change.
- **Do not** leave the current "catch the 409 and continue" behavior in place as the permanent solution.
  If, after diagnosis, registering the corrected schema is genuinely not possible in this environment for
  a documented reason, the fallback is to bump this specific event to `.v2` (even with zero live
  consumers) rather than operate with a registry that no longer enforces the contract for this subject.

### A.3 Verify

- Re-run the WMS Master Data location creation flow with `location_purpose`/`staging_for_work_center_ref`
  populated and confirm **zero warnings, zero swallowed errors** in the service logs during schema
  registration.
- Separately confirm the two new events (`WMS.Outbound.MaterialStaged.v1`,
  `WMS.Outbound.MaterialShortageDeclared.v1`) and the additive `work_center_id` field on
  `MES.Execution.MaterialConsumed.v1` registered cleanly with no similar issue — do not assume they're
  fine because they weren't mentioned in the report; check explicitly.

---

## PART B — Close the 3 remaining verification gaps

### B.1 (DoD #7) Verify `stock_check_status` actually flips correctly

- Call `POST /api/mes/execution/work-orders/{id}/stage-materials` against a live WO where the staging
  request succeeds fully. Query `wo_material_requirement` afterward and confirm `stock_check_status =
  'Staged'` for the relevant lines.
- Repeat against a WO where the staging request hits `INSUFFICIENT_STOCK`. Confirm
  `stock_check_status = 'Shortage'` and that `stock_check_detail` contains the same breakdown numbers
  (`requested_qty`/`already_staged_qty`/`shortfall_qty`/`available_qty`) returned by
  `wms-outbound-service`, not a generic error message.
- Attach both results (raw query output) to the implementation report.

### B.2 (DoD #8) Circuit breaker fault injection

- Stop `wms-outbound-service`, then call `stage-materials` for a WO.
- Confirm: the call fails fast (circuit breaker, not a hanging timeout), `mes-execution-service` does
  not corrupt the WO's state (no half-written `wo_material_requirement` rows, no stuck status), and the
  WO remains in a state where `stage-materials` can be retried once `wms-outbound-service` is back.
- Restart `wms-outbound-service`, retry the same call, confirm it now succeeds and produces the correct
  `Staged`/`Shortage` result.

### B.3 (DoD #10) Full-flow Tempo trace

- Run the canonical scenario once more (receipt → stage 60 → consume 40 → second request reusing 20)
  end-to-end.
- Locate the trace(s) in Grafana Tempo and confirm spans exist across the boundary: Kong →
  `mes-execution-service` (`stage-materials`) → `wms-outbound-service` (`material-requests`) →
  `wms-inventory-service` (balance read/write) — and separately, the event-driven leg:
  `mes-execution-service` (publish `MaterialConsumed`) → `wms-inventory-service` (consume, decrement).
- Capture trace IDs and attach to the report. If spans are missing at any hop, identify which service's
  OTel instrumentation is incomplete and fix it — do not accept a partial trace as sufficient, since this
  is a multi-service financial-inventory-affecting flow where traceability matters for future debugging.

---

## 1. Definition of Done for This Addendum

| # | Item | Verification |
|---|---|---|
| 1 | Root cause of the Schema Registry rejection diagnosed and fixed at the source (schema shape or compatibility mode) — not caught-and-ignored | §A.1–A.2, documented |
| 2 | Zero warnings/swallowed errors on re-registering `WMS.MasterData.LocationCreated.v1` and confirmation the two new WMS.Outbound events plus the `MaterialConsumed` field addition registered cleanly | §A.3 |
| 3 | `stock_check_status`/`stock_check_detail` verified correct for both a successful staging case and a shortage case, with raw query evidence | §B.1 |
| 4 | Circuit breaker fault-injection test passed: graceful failure, no state corruption, successful retry after recovery | §B.2 |
| 5 | Full-flow Tempo trace captured across all 4 services involved (Kong, MES execution, WMS outbound, WMS inventory), trace IDs attached | §B.3 |

Only after all 5 rows close with evidence should `process/PROJECT_WORKLOAD_PROGRESS.md`'s Phase 2 Step 2
row be marked `Completed ✅`.

---

## 2. Process Reminder

1. Append this addendum's results to `implementation/phase-2-2-wms-inventory-stock.md` (do not create a
   disconnected report).
2. Update `AI_CONTEXT.md` §3 with a permanent rule drawn from Part A: *"A Schema Registry rejection is
   never treated as an expected/ignorable warning in application code. If a rejection occurs, either fix
   the schema's compatibility shape or bump the event version — the registry's enforcement is not
   optional even for events with zero current consumers."*
3. Only after this addendum passes: proceed to Phase 2 Step 3 (`wms-console`). Do not begin Step 3
   against an inventory/outbound integration whose event contract enforcement is currently bypassed —
   the Console will be a new, additional consumer of these same events and must not inherit an
   unenforced contract.