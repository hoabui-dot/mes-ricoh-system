# Process Prompt: Close Prior-Work Gaps + Item Revision Effective-Dated Engineering Change Control

Target repository: `/home/neurosus/mes-system`
Prompt type: `process-fix/`. Write/update `implementation-fix/` records per the trace rule in
`AI_CONTEXT.md` section 18. Read `AI_CONTEXT.md` sections 39–43 in full before starting — they
describe the prior pass this prompt is auditing and extending. Also read `product-doc/II-PRODUCTS-&-MBOM-CATALOG.md`
sections B1 and B2 — they define the target Item / Item Revision contract this prompt closes the gap
against.

Apply the source-of-truth precedence in section 0 of `AI_CONTEXT.md` throughout, and classify every
claim with the evidence-status vocabulary. Do not upgrade a status without the evidence that
vocabulary requires.

This prompt has two parts. **Part A** closes four specific gaps in the previous "Cross-Doc
Reconciliation" pass that were reported as done but are not fully proven or fully correct. **Part B**
is new work: redesigning Item / Item Revision as a proper effective-dated engineering change control
model, with two architectural decisions already made below — do not re-open them, implement them.

Do Part A first. It is smaller, and step A.4 (script governance) and step A.2 (verification standard)
directly inform how Part B's own migration and verification work must be done.

---

## Part A — Close gaps in the prior "Cross-Doc Reconciliation" pass

### A.1 Labor matching is not actually wired end to end

`AI_CONTEXT.md` section 40 admits current master-data event projection does not populate the new
employee/skill/schedule read models, so live labor matching is `PARTIALLY_IMPLEMENTED`. Section 11's
`mes-execution-service` "Consumes" list does not include `MES.MasterData.EmployeeCreated.v1`,
`MES.MasterData.ShiftCreated.v1`, or `MES.MasterData.EmployeeScheduleAssigned.v1`. The section 41
labor seed only populates `mes-master-data-service`'s own database — it does not close this gap.

1. Add Kafka consumers in `mes-execution-service` for the three events above, and for whatever event
   projects `md_employee_skill` (confirm the exact event name/existence by reading
   `mes-master-data-service` publishers first; add the event if it does not exist, following the
   existing `.v1`/`.v2` LocalizedText event conventions in section 13).
2. Project into the local read-model tables already added by migration
   `000009_labor_assignments_and_read_models` (confirm table names by reading the migration file; do
   not assume names not present in it).
3. Re-run the section 41 labor seed (`npm run seed:mes:labor:demo`), then verify via a live API check
   (not just build) that Compute & Check for a Work Order routed through operations with
   `MD_OPERATION_SKILL_REQUIREMENT` rows now returns non-empty, correctly-scored assignments (using
   `BR-MES-LABOR-001`) instead of an empty result. Use a fixture that deliberately includes the
   `EMP-008` OnLeave row from section 41 and confirm that employee is excluded from any assignment.
4. Update section 40's status line for labor matching from `PARTIALLY_IMPLEMENTED` to
   `IMPLEMENTED_AND_VERIFIED` only once step 3's live check passes. Do not upgrade the status without
   that evidence.

### A.2 Add live-API verification matching the repo's established evidence standard

Sections 20.4, 27, 29, and 35 all include a direct API probe (`docker compose exec ... node -e
"fetch(...)"` or an equivalent curl) proving a route is actually reached, not just that the code
compiles. The EBOM, Production Version CRUD, and Item UOM/edit/deactivate work from the prior pass has
no such evidence — only typecheck/build. Add it now:

1. **EBOM**: create a Draft EBOM header + line via API, release it, call the "create MBOM draft"
   conversion endpoint, and confirm the resulting MBOM header has `source_ebom_line_id` populated on
   its lines.
2. **Production Version**: create a PV via the create screen's underlying API for a real Item
   Revision + Released MBOM + Released Routing sharing the same site, and confirm server-side
   filtering rejects a mismatched-site MBOM/Routing pair (expect a validation error, not silent
   acceptance).
3. **Item**: create an Item with a UOM (both the "reuse existing sign" and "create new UOM" paths),
   edit a Draft item, deactivate an unused item, and confirm it disappears from the
   production-ready-item-revisions selector while remaining visible (marked Inactive) in the Item
   list.
4. Record each probe's command and observed result in the `implementation-fix/` trace file, in the
   same format as the section 20.4 precedent.

### A.3 Concurrency risk in dynamic UOM creation (section 42)

The "create UOM on the fly, reuse if sign already exists" flow described in section 42 is a
check-then-create pattern vulnerable to a race condition if two concurrent Item creations introduce the
same new UOM sign simultaneously.

1. Confirm `md_uom` (or the relevant sign/code column) has a database-level unique constraint. If it
   does not, add one via a forward-only migration.
2. Confirm the UOM-creation code path handles a unique-violation response (Postgres `23505` / the
   ORM's mapped conflict error) by re-fetching the existing row and proceeding, rather than surfacing
   a raw 500 to the user. Add this handling if absent.
3. Add a concurrency test (two near-simultaneous requests creating an Item with the same new UOM
   sign) and confirm exactly one UOM row results and both Item creations succeed.

### A.4 Consolidated cleanup/reseed script governance rule was not followed

Section 38's maintenance rule requires re-opening `scripts/consolidated-demo-cleanup-reseed.sh`
whenever a change modifies the data structure of any table it touches. Migration
`0010_ebom_and_mbom_traceability` added `md_ebom_header`/`md_ebom_line` (master data — should be
preserved, not truncated, consistent with how MBOM/Routing master data is preserved), and migration
`000009_labor_assignments_and_read_models` added `wo_operation_labor_assignment` (execution-scoped
transactional data tied to Work Orders — belongs in the truncation set alongside other MES execution
transaction tables, since it has no meaning once its parent WO's transactional data is cleared).

1. Reopen the script. Add `wo_operation_labor_assignment` to the MES execution truncation phase.
   Confirm `md_ebom_header`/`md_ebom_line` are correctly left untouched (master data preserved,
   matching the MBOM/Routing precedent), or add them to the "recreate representative master data"
   phase if the section 38 reseed step needs a representative EBOM example — decide and document
   which.
2. Re-run the guarded script (`APPLY=1 APP_ENV=development|demo CONFIRM_DEMO_CLEANUP=YES`), record
   pre/post counts including the new table, and update section 38's evidence numbers.
3. Update section 38 (or add a dated addendum section) recording this re-run per its own governance
   rule.

---

## Part B — Item / Item Revision: effective-dated engineering change control

### B.0 Problem framing (do not skip)

Business need: an Item used in past production must keep referencing the exact specification it was
built against (immutable historical truth), while new production picks up the latest released
specification going forward. `product-doc` `MD_ITEM_REVISION` (section B2) already defines the fields
for this (`EffectiveFrom`, `EffectiveTo`, `ChangeReason`, `ReleasedBy`), but section 39.1's own audit
confirms the **running** `md_item_revision` table lacks all four. This part closes that gap properly —
not just by adding columns, but by fixing a deeper architectural issue below.

### B.1 Architectural decision (already made — implement, do not re-litigate): move spec-level fields from MD_ITEM to MD_ITEM_REVISION

**Confirmed finding**: `md_item` currently owns `ItemGroup`, `BaseUOMID`, `PlanningStrategy`,
`TrackingLevel`, `DefaultScrapRate` (per `product-doc` B1 and the running schema per section 39.1).
These are specification-level attributes that can legitimately change between engineering revisions
(e.g. `TrackingLevel` changing from Lot to Serial, or `BaseUOMID` changing). Because they currently
live on the **mutable** `MD_ITEM` row rather than the **immutable-once-Released** `MD_ITEM_REVISION`
row, editing them today would silently change history for every revision of that item, including
revisions already referenced by completed Work Orders — this defeats the exact traceability guarantee
the business need requires.

**Decision**: move `ItemGroup`, `BaseUOMID`, localized `ItemName`, `PlanningStrategy`,
`TrackingLevel`, `DefaultScrapRate`, and `SpecificationRef` onto `MD_ITEM_REVISION`. `MD_ITEM` retains
only genuinely identity-invariant fields: `ItemCode` (already immutable after Active per existing
rule), `ItemType`, `ProcurementType`, and `Status` (item-level lifecycle, distinct from
revision-level Draft/InReview/Released/Obsolete).

Migrate safely, forward-only, matching the discipline already used in migrations 0007/0009 (additive
columns, backfill from existing data, no destructive drop of old columns in the same migration). Follow
this exact staged sequence — do not collapse steps, and run a build/test/verification pass **after
each step**, not only at the end, before proceeding to the next:

1. **Step 1 — Additive + backfill.** Add the new nullable columns to `md_item_revision`. Backfill each
   existing revision row from its parent `md_item`'s current values (this is the only safe backfill
   source since the fields didn't previously vary per revision). Verify row counts before/after match
   and no existing revision row is left with null values it should have received from backfill.
2. **Step 2 — Read-path migration.** Update every read path (production-ready-item-revisions
   selector, MBOM/Routing/PV screens, Work Order detail, EBOM screens) to read these fields from Item
   Revision, not Item. Audit and list every call site before changing it — do not assume a global
   find/replace is safe given LocalizedText JSONB shapes may differ. After this step, run a repo-wide
   search confirming these fields are read from `md_item_revision` in every active code path, and
   re-run full typecheck/build/tests before proceeding.
3. **Step 3 — Constrain.** Only after step 2's repo-wide search shows zero remaining reads of the old
   `md_item` columns for these fields, add `NOT NULL` (where the product doc marks the field required)
   to the new `md_item_revision` columns in a separate migration. Verify no insert/update path breaks.
4. **Step 4 — Deprecate old columns.** As a **separate, later migration**, drop the old columns from
   `md_item`. Do this only after step 3 is verified stable — the codebase's existing MBOM/Routing
   enrichment precedent (section 29) never drops columns in the same pass it adds new ones.

Do not skip the verification pass between steps. A step that "looks done" but has not been
independently confirmed by build/test/API-check must be classified `IMPLEMENTED_BUT_NOT_TESTED`, not
`IMPLEMENTED_AND_VERIFIED`.

### B.2 Item creation becomes a compound transaction (Item + Revision R1)

The generic `POST /:resource` table-registry pattern is not suitable here — this needs a dedicated use
case, matching how Work Order creation, EBOM→MBOM conversion, and Routing code allocation already
deviate from generic CRUD for the same reason (multi-table transaction + server-derived fields).

1. Keep the existing `POST /api/mes/master-data/items` route contract for the frontend, but change its
   underlying use case to, in one database transaction:
   - Insert the `md_item` row (identity fields only, per B.1).
   - Insert the first `md_item_revision` row (`RevisionNo = 1`, `RevisionStatus = Draft`,
     `PreviousRevisionID = NULL`, `ChangeReason = NULL`, all spec fields from the create payload,
     `EffectiveFrom` required from the request, `EffectiveTo = NULL`, `CreatedBy` taken from the
     server-side authenticated identity — never from the request body).
2. Generate the revision code as `{ItemCode}-R{n}` using an atomic per-item counter, following the
   exact `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` idiom already used for `RT-YYYYMMDD-####`
   (migration 0008) and `WO-YYYYMMDD-####` (migration 0007), but keyed by `ItemID` instead of by date.
   Add a dedicated table named `md_item_revision_numbering` for this counter — do not reuse or repurpose
   the routing or Work Order numbering tables. This matches the existing seed data convention
   (`FG-WS-CM01-R1`) — do not introduce a disconnected generic prefix scheme instead.
3. Confirm the Item create form never exposes a free-text "created by" input; if one exists, remove
   it — creator identity is always server-derived from the forwarded auth header.
4. Verification: create an Item through the console, confirm exactly one Item row and one Revision row
   (R1, Draft) are created in the same transaction; confirm the revision code matches the
   `{ItemCode}-R1` pattern; confirm `CreatedBy` matches the authenticated user, not any client-supplied
   value.

### B.3 Editing a Released Item spawns a new revision instead of an in-place PATCH

Mirror the existing MBOM/Routing immutability discipline ("do not directly edit a routing used by
production orders") rather than inventing new UX conventions.

1. If the Item's current revision is Draft or InReview, allow in-place editing (nothing has consumed
   it yet).
2. If the current revision is Released, block direct PATCH of spec-level fields (server-side guard,
   not just UI) and instead provide a "Create New Revision" action:
   - Opens a form pre-filled with the current revision's values.
   - Requires `ChangeReason` (non-empty) and `EffectiveFrom`.
   - **Backdating policy (decided — implement, do not leave ambiguous)**: `EffectiveFrom` must be
     `>= now` (server clock, at submission time). Backdating a new revision's effective date is not
     permitted in this scope, because it would retroactively change which spec applied to Work Orders
     created between the backdated `EffectiveFrom` and the actual release moment. Enforce this as a
     server-side validation error, not a UI-only restriction.
   - Sets `PreviousRevisionID` to the current revision's ID.
   - Creates the new revision as Draft, `RevisionNo` incremented via the same atomic per-item counter
     from B.2.
3. `ChangeReason` remains not-allowed-to-be-null for any revision with a non-null `PreviousRevisionID`;
   enforce this in the application validation layer (not a blanket `NOT NULL` column constraint, which
   would break the R1 case where `ChangeReason` is legitimately null).
4. When the new revision is **released** (not merely created as Draft — a Draft successor must not
   retroactively affect the currently active revision, since it might be rejected or abandoned), as a
   transactional side effect of the release action:
   - Set the previous revision's `EffectiveTo` to the new revision's `EffectiveFrom`.
   - Enforce the existing invariant "only one effective default released revision per SKU/site at a
     time" mechanically as part of this same transaction, not just as a documented rule.
5. Verification: attempt a direct PATCH of a spec field on a Released item's current revision and
   confirm it is rejected; create a new revision via the proper flow, confirm `ChangeReason` is
   required and `PreviousRevisionID` is set correctly; confirm a submitted past `EffectiveFrom` is
   rejected; release it and confirm the prior revision's `EffectiveTo` is set automatically and exactly
   one revision per item now shows as the effective default.

### B.4 MBOM/Routing/Production Version do not auto-carry-forward — but the UI must always show current revision + status wherever it is used (decided — implement)

A new Item Revision does **not** automatically inherit the previous revision's MBOM/Routing/Production
Version bindings (they are separate FK'd resources). No carry-forward action is required in this scope.
Instead, every screen that references an Item Revision must render its identity and effective status
inline, so a user is never left guessing which revision they are looking at or whether it has a valid
production configuration. This applies to, at minimum, the following screens — do not treat this list
as optional or partial:

- MBOM line component selector and MBOM line detail.
- Production Version selector (in Work Order creation) and Production Version detail screen.
- Work Order creation's product/revision summary and Work Order detail screen.
- EBOM design tree (Item Revision and Component Revision nodes).
- Item detail screen's revision history list.

At each of these points, render: `{RevisionCode} [{RevisionStatus badge}] • {EffectiveFrom} → {EffectiveTo or "ongoing"}`.
If the revision has no Released Production Version / MBOM / Routing available, render an explicit
warning inline (e.g. "No production configuration released for this revision yet") rather than leaving
an empty or silently-filtered selector. Do not fabricate a fallback revision or silently substitute a
different one — the point of this UI requirement is to make the current revision and its readiness
state visible, not to route around a missing configuration.

Verification: for an Item with two revisions (R1 Released with a Production Version, R2 Draft with
none), confirm every screen in the list above correctly labels R1 as active/ready and, wherever R2 is
reachable (e.g. Item detail revision history), correctly shows R2 as Draft with the missing-configuration
warning rather than presenting it as selectable for Work Order creation.

### B.5 Verification and rollout

1. Master-data typecheck/build/tests pass; new migrations apply cleanly against both a fresh database
   and the current populated database (via the backfill step in B.1).
2. Confirm zero regressions in existing Work Order material requirement explosion — a WO created
   against an old Item Revision (before this migration) must continue to resolve correctly through the
   FK chain, completely unaffected by later revisions of the same item.
3. Confirm the production-ready-item-revisions selector (section 27) only ever returns the currently
   effective (`EffectiveFrom <= now`, `EffectiveTo` null or in the future) Released revision per item,
   not stale or superseded ones.
4. Update `AI_CONTEXT.md` with a new dated section documenting this change, its evidence status per
   sub-item, and explicitly note which migration drops the deprecated `md_item` columns (if that step
   has been reached) versus which are still pending per the staged rollout in B.1.

---

## Deliverables checklist

- [ ] A.1 Labor read-model event consumers added in `mes-execution-service`; live Compute & Check labor
      matching verified end to end with a real scored/excluded fixture.
- [ ] A.2 Live-API verification evidence added for EBOM, Production Version, and Item flows, matching
      the repo's established verification standard.
- [ ] A.3 UOM creation race condition confirmed guarded by a unique constraint + conflict-safe
      handling, with a concurrency test.
- [ ] A.4 Consolidated cleanup/reseed script reopened, updated for new tables, re-run, and its
      governance section updated per section 38's own rule.
- [ ] B.1 Spec-level fields migrated from `MD_ITEM` to `MD_ITEM_REVISION` via the exact 4-step staged,
      additive, backfilled, forward-only migration, with verification between every step; old columns
      deprecated only in a later, separate migration once zero references remain.
- [ ] B.2 Item creation is a single transaction producing Item + first Revision (R1, Draft), with an
      atomic per-item revision code (`{ItemCode}-R{n}` via `md_item_revision_numbering`) and
      server-derived `CreatedBy`.
- [ ] B.3 Editing a Released item's current revision is blocked from direct PATCH and instead requires
      the "Create New Revision" flow with mandatory `ChangeReason`, `PreviousRevisionID`, a
      no-backdating `EffectiveFrom` guard, and automatic `EffectiveTo` closure of the prior revision on
      release.
- [ ] B.4 No auto carry-forward of MBOM/Routing/Production Version to a new revision; every listed
      screen renders revision code + status + effective window, with an explicit warning where no
      released production configuration exists.
- [ ] All new claims classified with the evidence-status vocabulary; `implementation-fix/` trace
      file(s) written; `AI_CONTEXT.md` updated; `git status --short` checked before starting; no
      unrelated changes reverted.