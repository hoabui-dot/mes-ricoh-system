# Process Prompt: Universal Name-Primary Display Rule, WO Material Request Detail, and WMS Outbound Request Fulfillment Detail

Target repository: `/home/neurosus/mes-system`
Prompt type: `process-fix/`. Write/update `implementation-fix/` records per the trace rule in
`AI_CONTEXT.md` section 18. Read `AI_CONTEXT.md` section 12 (WMS two-echelon inventory rule), section
36 (MES-to-WMS material request contract), section 37 (WMS outbound request table display contract —
it already documents the known Work Center projection gap, do not re-diagnose it from scratch), section
20.1–20.3 (frontend architecture and shared UI state contract), and
`implementation-fix/mes-wms-material-request-flow-audit.md` plus `docs/adr/0003-mes-wms-material-demand-and-realtime.md`
(the just-completed realtime/idempotency work this prompt builds display correctness on top of).

Apply the source-of-truth precedence in section 0 throughout, and classify every claim with the
evidence-status vocabulary.

## Problem statement

Two screenshots from the now-realtime MES→WMS staging flow show the same governance gap recurring in a
new place, plus a data-correctness concern that must not be papered over with formatting:

1. **MES Console Work Order detail, "Kết quả yêu cầu vật tư" panel**: each row shows only a raw
   Material Request code (`MR-80213CB3`, `MR-43A7F702`, ...) and a status badge. There is no item name,
   no requested quantity, and no UOM. A planner looking at this panel cannot tell what material was
   requested or how much.
2. **Same Work Order detail, operation list table**: the Work Center column shows raw codes
   (`WC-DEFAULT`) with no localized name, while the operation name column correctly shows
   `Localized name (CODE)` — proving the correct pattern already exists elsewhere on the same screen and
   was simply not applied consistently.
3. **WMS Console `/outbound/requests`**: the Work Center column shows `Chưa xác định` (undetermined)
   for the newly generated realtime requests — this is the already-documented gap in section 37 ("the
   MES execution read model currently lacks the seeded Work Center projection ... pending event
   replay"); do not re-diagnose it, read section 37's existing explanation and close it. The quantity
   column shows values that are very likely wrong, not just unformatted: `7,875 item(s)`,
   `507,525 item(s)`, `520,2 item(s)` for a product whose seeded `BaseQuantity` is `100.000000` — these
   magnitudes and the generic `item(s)` UOM fallback (instead of a real UOM code like `KG` or `PCS`,
   which the older seeded rows in the same table correctly show) suggest either a quantity aggregation
   bug in the recently added `aggregateStageDemands` logic, a locale number-formatting bug (comma used
   ambiguously as both thousands and decimal separator), or a UOM-resolution gap for realtime-created
   (non-seeded) requests. There is also no indication of which warehouse location fulfilled a `Staged`
   request, or its address.

This prompt has three parts. **Part A** establishes a permanent, repository-wide governance rule so this
class of defect is designed against everywhere going forward, not re-discovered screen by screen. **Part
B** fixes the MES Work Order material request panel. **Part C** fixes the WMS outbound request list,
including the mandatory root-cause investigation of the suspicious quantities before any display change.
Do Part A first, since B and C are the first two enforced consumers of the rule it establishes.

---

## Part A — Add a permanent Name-Primary / Code-Secondary display rule to AI_CONTEXT.md

1. Add a new dedicated section to `AI_CONTEXT.md` (do not bury this as a one-line note) stating the
   rule explicitly:
   - Any business entity shown to a user (Item, Item Revision, Site, Work Center, Work Order, Material
     Request, Employee, Skill, Warehouse, Storage Location, or any other master-data or transactional
     entity) must render its **localized business name as the primary, normal-weight text**.
   - A business code (e.g. `WC-DEFAULT`, `MR-80213CB3`, `SITE-KZ3`) may be shown **only as secondary
     text** — smaller, muted/italic, positioned below or clearly subordinate to the name — never as the
     only visible identity, and never styled identically to the name.
   - Raw internal UUIDs must never be shown in a user-facing screen under any circumstance.
   - This rule applies uniformly across **MES Console and WMS Console** (and any future console); it is
     not scoped to one application.
2. State this rule as binding for all future implementation and process prompts touching UI — reference
   it the same way section 28 ("Internal Database ID Display Policy") is already referenced elsewhere in
   this document, since this new rule extends that existing policy from "don't show UUIDs" to "name is
   primary, code is secondary" specifically.
3. Cross-reference the already-correct example on the Work Order detail screen (operation name column:
   `Localized name (CODE)`) as the canonical pattern other screens must match, and note explicitly that
   the operation list's Work Center column on the same screen violates it — this is the concrete proof
   the rule is not consistently applied even within a single screen today.

## Part B — MES Work Order detail: material request panel data completeness

1. Read the actual API response shape for the Work Order detail endpoint
   (`GET /api/mes/execution/work-orders/:id`) and confirm which of the following fields are already
   returned per material requirement but not rendered, versus genuinely missing from the response:
   item revision code/name, required quantity, UOM code/name, Work Center code/name. Per section 36,
   the material requirement rows already carry WMS staging status/detail — confirm whether quantity/UOM/
   item identity are already present in that payload before assuming a backend change is needed.
2. Redesign the "Kết quả yêu cầu vật tư" panel so each row shows, per the Part A rule:
   - Item name (primary) with item/revision code (secondary).
   - Required quantity with its resolved UOM (e.g. `102.00 KG`), not a bare number.
   - Work Center name (primary) with code (secondary) — resolve the same way section 37 requires for
     WMS, and if the same underlying read-model gap from section 37 is the cause here too, fix it once
     at the source rather than twice in two frontends.
   - Status badge (existing behavior, unchanged).
   - The Material Request code remains visible but demoted to secondary/muted text, not the row's
     primary label.
3. Fix the operation list table's Work Center column on the same screen to match the already-correct
   operation-name column pattern (`Localized name (CODE)`).
4. Do not change any WMS staging call behavior, idempotency logic, or realtime notification behavior
   from the just-completed audit — this part is display/data-shape only.

## Part C — WMS outbound request list: data completeness and fulfillment detail

### C.1 — Root-cause the suspicious quantities before changing any display code

Do this investigation first and record the finding in the trace file before writing any fix:

1. Query the live `material_request` (and any related line/detail) rows for `MR-80213CB3`,
   `MR-43A7F702`, `MR-FD853EA0`, and `MR-724ED238` directly in the WMS database and compare the raw
   stored `required_qty` value against the expected value computed from the source MBOM
   (`QuantityPer × WO quantity`, adjusted for scrap rate) for the corresponding Work Order and
   component. State explicitly whether the stored value itself is wrong (a genuine aggregation/unit bug
   introduced by `aggregateStageDemands` or the WMS-side quantity canonicalization) or whether the
   stored value is correct and only the frontend's number formatting is misrepresenting it.
2. If the underlying value is wrong: fix the aggregation/canonicalization logic at its source (MES
   `aggregateStageDemands` or the WMS quantity-identity formatting described in
   `implementation-fix/mes-wms-material-request-flow-audit.md`), add/extend a unit test asserting the
   correct aggregated quantity for a known multi-line MBOM fixture, and only then proceed to the display
   fix below. Do not ship a nicer-looking rendering of an incorrect number.
3. If the underlying value is correct: fix the frontend's number formatting to avoid the ambiguous
   comma-as-thousands-and-decimal-separator pattern visible in the screenshot (`520,2` next to
   `507,525` in the same column is not self-consistent), using the existing locale formatting
   convention already established elsewhere in WMS Console (confirm what that convention is by reading
   an already-correct numeric column in the same console before picking a format).
4. Confirm why the newly generated (realtime) requests show `item(s)` as a generic UOM fallback while
   the older seeded rows in the same table show a real unit (`KG`). Fix the UOM resolution gap at its
   source (likely the same missing enrichment described in section 37 for Work Center, but confirm
   independently for UOM — do not assume it is the identical code path without checking).

### C.2 — Item identity and Work Center name completeness

1. Add the item name (primary) with item/revision code (secondary) to each request row — currently
   the table shows Work Order and Work Center but not which item/material the request is for.
2. Close the Work Center `Chưa xác định` gap per section 37's already-documented cause (missing
   execution read-model Work Center projection pending event replay) — implement the event
   replay/backfill or read-model fix section 37 describes as pending, then confirm live rows resolve to
   a real Work Center name/code instead of the fallback label.
3. Apply the Part A rule to every column in this table: Item, Work Center, and Work Order should each
   show name-primary/code-secondary; the Material Request code (`MÃ YÊU CẦU`) remains the row's
   necessary business key but should be visually secondary to the item name once the item name is added.

### C.3 — Fulfillment/warehouse detail for Staged requests

1. For a request in `Đã cấp phát` (Staged) status, resolve and display which inventory movement(s)
   actually satisfied it, sourced from the real `inv_stock_movement` ledger — do not fabricate or infer
   a source that the ledger does not confirm.
2. Two legitimate cases exist per the canonical staging-first flow in section 12; render each
   correctly and distinctly:
   - **New transfer occurred**: show the source Storage location's business code, localized name, and
     address, and the destination WorkCenter staging location's code/name.
   - **Fulfilled entirely from existing WorkCenter staging balance** (no new transfer needed): show this
     explicitly (e.g. "Fulfilled from existing staging stock at {WorkCenter}") rather than displaying an
     empty or misleading "source" field.
3. For a request in `Thiếu hàng` (Shortage) status, do not display a fabricated fulfillment source;
   show the shortage detail already available per section 36 (per-requirement shortage detail) instead.
4. This likely requires the WMS outbound request detail/list API to join against
   `wms-inventory-service`'s movement/location data (or against the outbound service's own persisted
   record of which transfer satisfied the request, if it already stores that link) — confirm which is
   the actual source of truth before implementing the join, per the no-cross-service-database-read rule
   in section 6/18.

## Verification

1. Before/after screenshots of the MES Work Order detail material request panel, the operation list
   Work Center column, and the WMS `/outbound/requests` list.
2. The trace file records the C.1 root-cause finding explicitly (data bug vs. display bug) with the
   raw DB values compared against the expected MBOM-derived quantity for at least one request.
3. Confirm the four requests visible in the screenshot (`MR-80213CB3`, `MR-43A7F702`, `MR-FD853EA0`,
   `MR-724ED238`) now show correct, plausible quantities with a real UOM, a resolved Work Center name,
   and an item name.
4. Confirm at least one `Staged` request and one `Thiếu hàng` (shortage) request render their
   fulfillment/shortage detail correctly and distinctly per C.3.
5. MES Console and WMS Console typecheck and production builds pass; relevant Go/Node test suites pass,
   including any new test added for the C.1 quantity fix.
6. `npm run i18n:scan` passes with zero new unexplained exemptions.

## Deliverables checklist

- [ ] Permanent Name-Primary/Code-Secondary display rule added to `AI_CONTEXT.md`, explicitly scoped to
      all consoles, cross-referenced against the existing UUID-display policy (section 28) and the
      already-correct operation-name pattern.
- [ ] MES Work Order detail material request panel shows item name, quantity + UOM, Work Center
      name, and demoted (secondary) MR code and item/Work Center codes.
- [ ] Operation list Work Center column fixed to match the operation-name column's existing correct
      pattern.
- [ ] WMS outbound request quantity root-caused (data bug vs. display bug) and fixed at the correct
      layer, with a test guarding the correct behavior.
- [ ] WMS outbound request UOM fallback (`item(s)`) root-caused and fixed.
- [ ] WMS outbound request Work Center `Chưa xác định` gap closed per the section 37 documented cause.
- [ ] WMS outbound request list shows item name (primary) with code (secondary) per row.
- [ ] Staged requests show real fulfillment detail (source Storage location + address, or existing-
      staging-stock fulfillment) sourced from the actual movement ledger; shortage requests show
      shortage detail instead of fabricated fulfillment data.
- [ ] All claims classified with the evidence-status vocabulary; `implementation-fix/` trace file
      written with the C.1 investigation evidence, before/after screenshots, and verification results;
      `AI_CONTEXT.md` updated with both the new governance section and the resolved section 37 status;
      `git status --short` checked before starting; no unrelated changes reverted.