# Process Prompt: WMS Material Request Fulfillment Detail — Location Traceability and Navigation Redesign

Target repository: `/home/neurosus/mes-system`
Prompt type: `process-fix/`. Write/update `implementation-fix/` records per the trace rule in
`AI_CONTEXT.md` section 18. Read `AI_CONTEXT.md` section 12 (WMS two-echelon inventory rule), the WMS
master-data ownership entry in section 11/21.1 (`wms_warehouse`, `wms_zone`, `wms_storage_location`,
`wms_storage_bin`), section 38 and `implementation/wms-warehouse-map-movement-ledger.md` /
`implementation/wms-warehouse-map-description-i18n.md` (the already-implemented warehouse map and
movement ledger — reuse it, do not rebuild it), and the just-completed
`implementation-fix/Universal-Name-Primary-Display-Rule.md` plus the new `AI_CONTEXT.md` section 50
(the governance rule this prompt continues to enforce) before starting.

Apply the source-of-truth precedence in section 0 throughout, and classify every claim with the
evidence-status vocabulary.

## Problem statement

The material request fulfillment detail page ("Chi tiết cấp phát") now shows correct aggregate numbers,
but a user still cannot answer the basic traceability question this screen exists for: **which physical
location was this quantity deducted from or is currently sitting in, and can I go look at it?**

1. **The "no new movement" case resolves to zero location identity.** For `MR-724ED238`, the panel
   shows four summary numbers (`Đã có tại staging`, `Chuyển từ kho`, `Khả dụng ở kho`, `Thiếu cần bù`)
   and one sentence of prose ("Số lượng đã có sẵn tại khu vực staging; không phát sinh movement mới").
   There is no staging location code, name, zone, or warehouse shown — even though the stock physically
   exists at a specific `wms_storage_location` row with `location_purpose = WorkCenterStaging`. A
   sentence is not a substitute for a resolvable, clickable location.
2. **No navigation.** Nothing on this page links to the Kho / Khu vực / Vị trí / Ô chứa screens (visible
   in the sidebar) or to the existing warehouse map. A user who wants to physically locate the stock has
   to leave this page and search manually.
3. **Aggregate numbers hide multi-location/multi-lot reality.** Per the FEFO example already documented
   in section 12 (a shortfall transferred 30 units from one lot and 10 from another), a single request
   can legitimately be fulfilled from more than one lot and more than one location. Collapsing this into
   one "Chuyển từ kho" number is not wrong, but it is not traceable — there is no per-movement,
   per-lot, per-location breakdown underneath it.
4. **Two regressions of already-established rules are visible in the same screenshots and must be fixed
   in the same pass**, since they are direct evidence the underlying enforcement is still incomplete:
   - The outbound request list (`/outbound/requests`) shows `common.notAvailable` rendered literally in
     the Vật tư (item) column for the older `WO-DEMO-*` seeded rows — the exact same class of raw-i18n-
     key leak as `common.site`/`common.level` from the prior pass. The scanner extension requested in
     that prior prompt to catch this defect class automatically was evidently not implemented, or does
     not cover this key — confirm which, and this time actually implement the automated check.
   - Quantities still render with an ambiguous comma (`12,25`, `88,75`) that is not distinguishable as
     thousands separator vs. decimal separator without external context — the same number-formatting
     concern flagged in the prior prompt. Confirm whether it was addressed for the list view but missed
     on this detail view, or not addressed at all, and fix it consistently in both places.

## Part A — Resolve and display full location hierarchy, always, for both fulfillment cases

1. For **any** fulfillment case (existing staging stock, or a new transfer), resolve the actual
   `wms_storage_location` row(s) involved — do not special-case "no movement" into a prose-only state.
   Even when no new transfer occurred, the destination WorkCenter staging location itself is a real row
   with a code, localized name, and a parent zone/warehouse; resolve and show it.
2. For every location referenced on this page (staging destination, and any source Storage location for
   a transfer), render the **full hierarchy as a breadcrumb**: Warehouse (code + localized name) ›
   Zone (code + localized name) › Storage Location (code + localized name) › Storage Bin (code + name,
   if the location is bin-managed). Do not show an isolated location code with no parent context.
3. Every level of that breadcrumb must be a real navigation link to the corresponding existing screen
   (Kho, Khu vực, Vị trí, Ô chứa) — landing on that specific record's detail, not just the list page
   filtered by nothing. If a dedicated detail view does not yet exist for a given level, add the
   minimum needed (e.g. a filtered/pre-selected list state) rather than leaving the breadcrumb
   non-clickable.
4. Add a deep link from this page into the existing warehouse map feature
   (`implementation/wms-warehouse-map-movement-ledger.md`), scoped/filtered to the resolved location(s)
   for this request, so a user can visually locate the stock on the map without leaving the fulfillment
   context. Reuse the existing map and movement ledger implementation — do not build a second map.

## Part B — Replace the single aggregate sentence with a per-movement/per-lot breakdown table

1. Under the existing summary stat cards (keep them — they remain a useful at-a-glance total), add a
   table listing every individual `inv_stock_movement` row (and its lot, per `inv_lot`) that
   contributed to fulfilling this request. Each row shows: lot code (and expiry/effective date if the
   lot carries one, since FEFO ordering depends on it), source location (breadcrumb + link, or "Existing
   staging stock" label if this row represents pre-existing staging balance rather than a transfer),
   destination location (breadcrumb + link), quantity with resolved UOM, movement timestamp, and
   movement type.
2. For the "no new movement, fulfilled from existing staging" case, this table still has at least one
   row: the existing staging balance itself, attributed to its resolved location from Part A, not an
   empty table with only the prose sentence above it.
3. If a request was fulfilled from more than one lot/location (the FEFO multi-transfer case), every
   contributing row must appear — do not collapse them back into a single total in this table, since the
   whole point of this part is to make the multi-source case traceable instead of hidden.
4. Source this table from the real `wms-inventory-service` movement ledger — the same source of truth
   already used for the warehouse map's movement ledger — via an explicit API call, not a cross-service
   database read (per the ownership rule in section 6/18).

## Part C — Number formatting consistency

1. Confirm the current locale number-formatting convention actually in use elsewhere in WMS Console
   (read an already-correct numeric display, e.g. the outbound list's quantity column after the prior
   fix) and apply that exact same formatting function to every quantity shown on this detail page,
   including the four summary stat cards and the new breakdown table — there must be one number-
   formatting utility used everywhere in WMS Console, not one convention on the list page and a
   different, ambiguous one on the detail page.
2. Verify the fix by rendering a known decimal value (e.g. `12.25`) and a known larger value (e.g.
   `88750.5`) side by side and confirming both are unambiguous at a glance.

## Part D — Close the recurring raw-i18n-key leak with an automated, permanent check

1. Fix the immediate visible defect: locate why `common.notAvailable` renders literally for the older
   `WO-DEMO-*` seeded outbound requests' item name and resolve it (missing translation resource entry,
   or a resolution call receiving an item reference the read model cannot join — confirm the exact cause
   per section 21's evidence-status discipline before fixing).
2. This is the second occurrence of this exact defect class after it was explicitly flagged for
   automated prevention in the prior prompt. This time, actually implement the check, not just note the
   intent: extend `npm run i18n:scan` (or add an equivalent lightweight CI-runnable script if the
   existing scanner's architecture does not support this pattern) to detect any rendered/rendered-looking
   string matching a dotted-key pattern (e.g. `/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/`) appearing in a
   built page's text content or in a component's default/fallback prop value, and fail the check when
   found. Run it against the current codebase and confirm it actually flags this real instance before
   the fix, and passes clean after the fix.
3. Record in the trace file specifically why the previous request to add this check did not result in an
   enforced, running check — this is a process gap worth naming explicitly so it does not recur a third
   time.

## Verification

1. Before/after screenshots of the `MR-724ED238` fulfillment detail page (the "no movement" case) and
   at least one fulfillment detail page for a request that involved an actual multi-lot transfer.
2. Confirm every location breadcrumb segment on both pages is a working link that navigates to the
   correct corresponding record.
3. Confirm the warehouse map deep link opens the map correctly scoped/filtered to the request's
   resolved location(s).
4. Confirm the breakdown table shows at least one row for the "no movement" case and multiple correctly
   attributed rows for a genuine multi-lot case.
5. Confirm consistent, unambiguous number formatting across the summary cards, the breakdown table, and
   the outbound list page.
6. Run the extended `npm run i18n:scan` (or new script) and confirm it fails against the pre-fix
   `common.notAvailable` instance (reproduced via git stash / a controlled test) and passes after the
   fix.
7. WMS Console and WMS inventory/outbound service typecheck, build, and test suites pass.

## Deliverables checklist

- [ ] Every fulfillment case (existing-staging and new-transfer) resolves and displays a real, non-prose
      location identity with full Warehouse › Zone › Storage Location › Storage Bin breadcrumb.
- [ ] Every breadcrumb segment is a working navigation link to the corresponding existing screen.
- [ ] A deep link to the existing warehouse map, scoped to the resolved location(s), is present on the
      fulfillment detail page.
- [ ] Aggregate stat cards are retained and supplemented (not replaced) by a per-movement/per-lot
      breakdown table sourced from the real inventory movement ledger.
- [ ] Multi-lot/multi-location fulfillment (FEFO case) renders every contributing row, not a collapsed
      total.
- [ ] One consistent number-formatting utility is used across the fulfillment detail page and the
      outbound list page; ambiguous comma formatting is eliminated.
- [ ] `common.notAvailable` leak fixed at its root cause, and an automated, CI-runnable check now exists
      and actually catches this defect class, with evidence it was run against the real pre-fix instance.
- [ ] Trace file records why the previously requested automated check was not enforced after the last
      pass, so the process gap itself is documented, not just the symptom.
- [ ] All claims classified with the evidence-status vocabulary; `implementation-fix/` trace file
      written with before/after evidence and verification results; `AI_CONTEXT.md` updated;
      `git status --short` checked before starting; no unrelated changes reverted.