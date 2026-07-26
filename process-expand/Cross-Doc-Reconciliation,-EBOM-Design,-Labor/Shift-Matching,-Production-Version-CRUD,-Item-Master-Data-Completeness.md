# Process Prompt: Cross-Doc Reconciliation, EBOM Design, Labor/Shift Matching, Production Version CRUD, Item Master Data Completeness

Target repository: `/home/neurosus/mes-system`
Prompt type: `process-fix/`. Write/update `implementation-fix/` (or `implementation-expand/` if that
convention is already in use for this class of work, per section 38's precedent) records following the
trace rule in `AI_CONTEXT.md` section 18. Read `AI_CONTEXT.md` in full, then `product-doc/II-PRODUCTS-&-MBOM-CATALOG.md`
and `product-doc/IV-RESOURCES & CAPABILITIES CATALOG.md`, before writing any code.

Apply the source-of-truth precedence in `AI_CONTEXT.md` section 0 throughout: running code > service
manifests > compose/infra > migrations/schema > tests > handlers/domain/UI > implementation records >
progress tracker > `AI_CONTEXT.md` itself > product-doc > historical process prompts. Classify every new
claim with the evidence-status vocabulary (`IMPLEMENTED_AND_VERIFIED`, `IMPLEMENTED_BUT_NOT_TESTED`,
`PARTIALLY_IMPLEMENTED`, `DOCUMENTED_INTENT_ONLY`, `PLANNED`, `MISSING`, `AMBIGUOUS`,
`CONFLICTING_SOURCES`, `DEPRECATED`, `DEMO_ONLY`). Do not invent implementation facts — audit first,
then build.

This prompt has six work items (0–5). Item 0 is a pure audit/reconciliation deliverable and must be
done first, since items 1–5 depend on its findings (do not guess table/column names — confirm them by
reading `services/mes-master-data-service` migrations and domain code before writing new migrations).

---

## 0. Reconcile `product-doc/II-PRODUCTS-&-MBOM-CATALOG.md` against runtime/AI_CONTEXT.md

Produce a short reconciliation report (as part of the implementation-fix trace) covering:

1. Confirm, with evidence, that `MD_ITEM`, `MD_ITEM_REVISION`, `MD_MBOM_HEADER`, `MD_MBOM_LINE`,
   `MD_COMPONENT_SUBSTITUTE`, `MD_PRODUCTION_VERSION` schemas in the running `mes-master-data-service`
   migrations match the product-doc field list. Record any drift found (field renamed, type changed,
   validation rule not enforced) as `CONFLICTING_SOURCES`, with code winning per the precedence rule.
2. Confirm the following three gaps exist in the running system (do not assume — verify against actual
   routes/screens/migrations) and record their evidence status:
   - **No dedicated Production Version create/edit UI screen exists** (only a read/navigation aggregator
     per `AI_CONTEXT.md` section 38), despite a generic backend resource route theoretically accepting
     `POST /api/mes/master-data/production-versions`.
   - **No EBOM tables/UI exist anywhere in the repository.**
   - **No labor/skill-matching runtime logic exists** in Compute & Check or Work Order creation, despite
     `MD_OPERATION_SKILL_REQUIREMENT` schema being defined in product-doc and `AI_CONTEXT.md` section 14
     explicitly flagging "Compute/check labor capacity remains follow-up."
3. Confirm or correct the assumption that Work Centers currently have a roster of employees with skill
   levels directly attached. Audit `md_employee`, `md_employee_skill`, `md_employee_shift_schedule`, and
   any Work Center–employee join table. Record the actual current relationship (expected finding, subject
   to correction by audit: `Employee.DefaultWorkCenterID` is a weak 1:1-ish attribute, and skill/level
   lives independently on `md_employee_skill`, with no formal Work-Center roster/assignment table yet).
4. Confirm whether `md_employee_shift_schedule` (or an adjacent table) carries a per-day status value
   (e.g. `Scheduled`, `OnLeave`) — `StatusBadge.tsx`'s existing `OnLeave` tone mapping (`AI_CONTEXT.md`
   section 20.3) is a hint this may already exist; verify with the actual schema rather than assuming.
   Confirm whether any real-time attendance/clock-in tracking exists (distinct from *scheduled* shift
   presence); if not found, record it as `MISSING` and note that all availability logic in this prompt
   must use "scheduled for the shift" as a proxy for availability, not true presence.
5. Confirm whether the Item & Revision create/edit form currently omits a `BaseUOMID` selector, and
   confirm whether Edit and Delete/Deactivate actions are absent from that screen (only Release exists
   per `AI_CONTEXT.md` section 20.4).

Write findings into `AI_CONTEXT.md` (new subsection, e.g. section 39) with evidence paths and status
labels before starting implementation. Do not proceed to sections 1–5 below until this audit is written
down; if any assumed gap turns out to already be implemented, skip the corresponding section and record
why.

---

## 1. EBOM design and integration

Design goal: introduce Engineering BOM as an "as-designed" structure, decoupled from MBOM's
"as-manufactured" structure, without changing Work Order execution behavior (WOs must continue to
explode only from MBOM).

1. **New tables**, owned by `mes-master-data-service` (same bounded context — no new service, per the
   section 6 invariant):
   - `md_ebom_header`: `EBOMID` (PK), `EBOMCode`, `ItemRevisionID` (FK to `md_item_revision` — the
     engineering revision being designed, not necessarily site-scoped the way MBOM is), `EBOMVersion`,
     localized `Name`/`Description` (JSONB LocalizedText, per the platform's i18n governance in section
     13), `Status` (`Draft`/`InReview`/`Released`/`Obsolete`), audit columns matching the pattern used by
     `md_mbom_header`.
   - `md_ebom_line`: `EBOMLineID` (PK), `EBOMID` (FK), `ParentLineID` (optional, multi-level tree like
     `md_mbom_line`), `SequenceNo`, `ComponentRevisionID` (FK to `md_item_revision`), `QuantityPer`,
     `UOMID`, optional `ReferenceDesignator`/`Note` text. Deliberately **no** `IssueOperationID`,
     `BackflushFlag`, or `PhantomFlag` — those are manufacturing-execution concepts that do not belong to
     an engineering design structure. Decide, and document explicitly, whether `PhantomFlag`-equivalent
     ("this sub-assembly is not separately stocked") is still meaningful at the design level; if so, add
     it as a distinct, clearly-named field rather than reusing MBOM semantics.
   - Add nullable `SourceEBOMLineID` to `md_mbom_line` (forward-only, additive migration) so MBOM lines
     created from an EBOM retain traceability back to the design source.
2. **Lifecycle**: `Draft → InReview → Released → Obsolete`, mirroring `MD_ITEM_REVISION`/`MD_MBOM_HEADER`
   guard rules (no editing a Released EBOM; new changes require a new EBOM version). Use the existing
   generic release-route pattern (`POST /:resource/:id/release`) if the table registry can accommodate it
   cleanly; otherwise add a dedicated route following the MBOM/Routing precedent in section 29.
3. **EBOM → MBOM conversion action**: `POST /api/mes/master-data/ebom-headers/:id/create-mbom-draft` (or
   equivalent) that copies the EBOM line tree into a new `Draft` MBOM header + lines, populating
   `SourceEBOMLineID` on each generated line, leaving `IssueOperationID`/`ScrapRate`/`BackflushFlag`/
   `PhantomFlag` empty/default for the manufacturing engineer to fill in before MBOM release. This does
   not bypass any existing MBOM release validation.
4. **UI**: new EBOM list/detail/create screens under `/master-data/eboms`, following the same
   `LocalizedTextFields` bordered-card pattern, no-placeholder rule, and business-code-preview pattern
   established for MBOM/Routing (per the earlier UX-fix prompt now recorded in section 38). Add a
   "Create MBOM from this EBOM" action on the EBOM detail screen.
5. **Explicitly preserve execution behavior**: `mes-execution-service` must not be modified to read EBOM
   data. Work Order creation/explosion continues to use `MD_PRODUCTION_VERSION → MD_MBOM_HEADER` only.
   Verify this with a code-level check (no new EBOM references in `mes-execution-service`) as part of
   the verification step.
6. Verification: master-data typecheck/build/tests pass; new migration applies cleanly; EBOM create →
   release → "create MBOM draft" → edit → release round-trip works end to end against a real Item
   Revision; confirm existing Work Order creation flow (production-ready-item-revisions selector,
   section 27) is unaffected by the new tables.

---

## 2. Labor/shift matching: Routing configuration + Work Order runtime

Split this into two distinct sub-features. Do not conflate design-time configuration with runtime
matching.

### 2.1 Routing Operation Flow: skill requirement configuration (design time)

Extend the existing capability-constrained Operation Flow builder (added per section 38: Work Center
owns operation capability + cycle time via `md_resource_capability`) so that, for each operation added to
a routing, the user can also specify one or more skill requirements using the existing
`MD_OPERATION_SKILL_REQUIREMENT` schema: `SkillID`, `MinimumLevel`, `RequiredPersons`, `MandatoryFlag`.
This is pure master-data configuration, no employee assignment happens here. If `MD_OPERATION_SKILL_REQUIREMENT`
already exists as a table but was never wired to any UI, wire it now; if it does not exist as a
runtime table (audit item 0 must confirm), add it as a forward-only migration matching the product-doc
schema exactly.

### 2.2 Work Order Compute & Check: runtime labor eligibility matching

This directly resolves the `AI_CONTEXT.md` section 14 known gap ("Compute/check labor capacity remains
follow-up").

1. Extend `POST /api/mes/execution/work-orders/:id/compute-check` (or add a clearly-separated new
   endpoint if mixing concerns into the existing handler is architecturally undesirable — decide and
   document) so that, for each routing operation snapshotted onto the Work Order, it:
   - Looks up `MD_OPERATION_SKILL_REQUIREMENT` for that routing operation.
   - Queries eligible employees: skill level (`md_employee_skill.Level`) `>=` `MinimumLevel` for the
     required `SkillID`, AND scheduled for the relevant shift/date via `md_employee_shift_schedule`
     joined to `md_shift` (using the shift's `StartTime`/`EndTime` against the WO's planned execution
     window), AND the schedule row's status (per audit item 0.4) is not an unavailable state (e.g.
     `OnLeave`).
   - Applies this explicit, documented scoring/ranking policy — **do not invent an ad hoc heuristic
     silently**; implement exactly this unless a documented product decision overrides it:
     1. Employees whose `DefaultWorkCenterID` matches the routing operation's Work Center rank first.
     2. Among those, prefer the employee whose skill level is the smallest level `>= MinimumLevel`
        (closest sufficient match, not the most overqualified) — the intent is to reserve
        highly-skilled workers for operations that need them.
     3. Among ties, prefer the employee with the fewest hours already assigned to other operations in
        the same shift/date (simple load balancing — count existing assignments for that date/shift).
     4. Final tiebreaker: employee code, ascending, for deterministic results.
     Register this as canonical business rule `BR-MES-LABOR-001` in `AI_CONTEXT.md` section 21.8's rule
     table, with its enforcement location and evidence status.
   - If `MandatoryFlag = true` for a requirement and fewer than `RequiredPersons` eligible employees are
     found, return a structured shortage result (mirroring the existing WMS shortage response shape,
     `409` with per-requirement detail) rather than silently succeeding or silently proceeding with zero
     matches.
   - If `MandatoryFlag = false`, proceed but surface the shortfall as a non-blocking warning in the
     Compute & Check response.
2. Persist the proposed employee assignment(s) somewhere queryable (new table, e.g.
   `wo_operation_labor_assignment`, owned by `mes-execution-service` since it's execution-scoped
   data, not master data) so the same assignment is visible on WO detail (feeds into the WO detail modal
   from the earlier UX prompt) and does not need to be recomputed non-deterministically on every view.
   Decide and document whether re-running Compute & Check recalculates and overwrites assignments, or
   whether assignments are locked after WO approval — do not leave this undefined.
3. Update the Work Order detail modal (from the earlier UX-fix prompt, section A.1 of the prior process
   prompt / now implemented per section 38) to show the matched/proposed labor per operation, using
   employee business identity (code/name), never raw UUIDs, per the existing internal-ID display policy
   (`AI_CONTEXT.md` section 28).
4. Verification: unit/integration test the scoring policy with a fixture set of employees (varying skill
   levels, shifts, default work centers, and a deliberate `OnLeave` case) against a routing with both
   mandatory and optional skill requirements; confirm shortage vs success responses match the documented
   rules; confirm execution service `go test ./...` (or equivalent for whichever service ends up owning
   this logic) passes; confirm the WO detail modal renders the assignment correctly for a real WO.

---

## 3. Employee shift/status data model audit and fix

Building on audit item 0.4:

1. If `md_employee_shift_schedule` (or equivalent) does **not** already carry a per-day status field
   distinguishing `Scheduled` from `OnLeave`/absence, add one via a forward-only migration, and update
   any existing seed/backfill data so historical rows default to `Scheduled` (no behavior change for
   already-correct data).
2. If it does already exist, document its exact column name, allowed values, and where it's currently
   set/read (owning screens) — do not re-add it.
3. Do not implement a real-time clock-in/attendance system as part of this work item unless audit item
   0.4 finds evidence one is expected/partially built; if none is found, explicitly record "real-time
   attendance/presence" as `MISSING` and out of scope here, and note the availability-matching logic in
   section 2.2 relies on scheduled presence, not verified physical presence, as an explicit product
   limitation.
4. Confirm the existing Employee/Shift/Work Calendar UI (`AI_CONTEXT.md` section 14, Phase 1 Step 7)
   correctly surfaces and allows setting the per-day status if newly added; extend that screen rather
   than creating a parallel one.
5. Verification: migration applies cleanly against the current populated database; a controlled test row
   set to `OnLeave` for a given date is correctly excluded by the section 2.2 matching logic; existing
   Work Calendar screen build/typecheck passes.

---

## 4. Production Version CRUD

1. Build dedicated `/master-data/production-versions/new` create and `/master-data/production-versions/:id/edit`
   screens, following the exact pattern already established for MBOM and Routing (section 29): bordered
   `LocalizedTextFields` where applicable, business-identity selectors (not raw codes) for Item Revision,
   MBOM, and Routing, no placeholders on any translation input, `*` for required fields only.
2. The MBOM and Routing selectors in this form must be constrained to `Released` records matching the
   selected Item Revision and Site (per the existing validation rule that MBOM/Routing must share site
   and product revision with the Production Version) — filter server-side, not just client-side.
3. **Explicitly decide and document the "no-assembly product" policy** raised in the request: for an
   Item Revision that legitimately never needs a Production Version (e.g. `ProcurementType = Buy`,
   simple resale/repackaged goods with no MBOM/Routing), Work Order creation's readiness check must not
   hard-require a PV to exist. Audit `CheckMasterDataReadiness` (referenced in section 25.1) to determine
   its current behavior for such items, and either:
   - confirm it already tolerates a missing PV for non-`Make` procurement types, or
   - add an explicit, documented branch (e.g. keyed off `ProcurementType` or a new
     `RequiresProductionVersion` flag on `MD_ITEM` if none of the existing fields cleanly express this)
     so WO creation for such items succeeds without a PV, while `Make`-type items still require one.
   Do not silently make PV optional for all items — that would weaken the existing readiness guarantees
   for assembled products.
4. Keep the existing read/navigation aggregator at `/master-data/production-versions` (section 38) as the
   list/detail view; the new create/edit screens are additive entry points reachable from it, not a
   replacement.
5. Verification: master-data and console typecheck/build pass; create a Production Version end to end for
   an assembled product and confirm it appears correctly in the aggregator and is selectable in Work
   Order creation's production-ready-item-revisions selector (section 27); confirm a non-assembly item
   (per the documented policy) still allows WO creation without a PV.

---

## 5. Item & Revision master data completeness

1. Add the required `BaseUOMID` selector (business-identity dropdown showing UOM code/name, not raw ID)
   to both the Item create form and the Item edit form (if no edit form currently exists, this work item
   requires adding one — see point 2). Confirm existing seeded Items have a valid `BaseUOMID` already
   persisted (per product-doc B1, it's a required field) or backfill it if audit finds null/placeholder
   values.
2. Add an **Edit** action to the Item & Revision screen, available only while the relevant record is in
   an editable lifecycle state (`Draft` for Items; for Item Revisions, editable only in `Draft`/`InReview`,
   never `Released`/`Obsolete`, per the immutability rule already enforced elsewhere in this codebase).
3. Add a **Deactivate** action (not a hard delete) following the existing platform pattern used for
   `MD_SITE`/`MD_UOM` ("do not delete after referenced; mark Inactive"): sets `Status = Inactive` on the
   Item, guarded against deactivating an Item with `Released` revisions currently in active use by an
   effective Production Version, unless explicitly confirmed by the user via a pessimistic confirmation
   dialog matching the existing mutation-confirmation pattern (section 6/QMS Console precedent).
4. Verification: master-data and console typecheck/build pass; create an Item with UOM set, confirm it
   round-trips correctly through the API; edit a Draft item; deactivate an unused item and confirm it no
   longer appears in the production-ready-item-revisions selector while still being visible (marked
   Inactive) in the Item list for audit purposes.

---

## Deliverables checklist

- [ ] Section 0 audit written into `AI_CONTEXT.md` (new section) with evidence-status labels for all 5
      sub-findings, before any implementation begins.
- [ ] EBOM tables, lifecycle, EBOM→MBOM conversion action, and UI implemented; execution service
      confirmed untouched/unaffected.
- [ ] Routing Operation Flow extended with skill-requirement configuration (2.1).
- [ ] Work Order Compute & Check extended with labor eligibility matching, scoring policy `BR-MES-LABOR-001`
      documented, shortage/warning behavior implemented, assignments persisted and shown on WO detail (2.2).
- [ ] Employee shift schedule status field confirmed or added; real-time attendance explicitly scoped out
      and documented as `MISSING` if not found.
- [ ] Production Version create/edit screens implemented; no-assembly-product WO readiness policy decided
      and documented explicitly.
- [ ] Item & Revision form: UOM selector added, Edit action added, Deactivate action added.
- [ ] All new claims classified with the evidence-status vocabulary; implementation-fix/implementation-expand
      trace file(s) written; `AI_CONTEXT.md` updated with new/changed sections and the new `BR-MES-LABOR-001`
      rule; `process/PROJECT_WORKLOAD_PROGRESS.md` updated only if milestone status genuinely changed; no
      unrelated changes reverted; `git status --short` checked before starting.