# Process Prompt: MES UX Fixes, Product-Recipe Model Decision, Global Rebrand, and Data Cleanup Migration

Target repository: `/home/neurosus/mes-system`
Prompt type: `process-fix/` (regression/UX/data-hygiene work touching multiple existing implemented
features). Write/update `implementation-fix/` records per the trace rule in `AI_CONTEXT.md` section 18.
Read `AI_CONTEXT.md` in full before starting, then follow the source-of-truth precedence order in
section 0 (running code > manifests > compose/infra > migrations/schema > tests > handlers/domain/UI >
implementation records > progress tracker > this file itself > product-doc > historical process prompts).

Classify every claim you add to `AI_CONTEXT.md` or any implementation-fix record using the existing
evidence-status vocabulary (`IMPLEMENTED_AND_VERIFIED`, `IMPLEMENTED_BUT_NOT_TESTED`,
`PARTIALLY_IMPLEMENTED`, `DOCUMENTED_INTENT_ONLY`, `PLANNED`, `MISSING`, `AMBIGUOUS`,
`CONFLICTING_SOURCES`, `DEPRECATED`, `DEMO_ONLY`). Do not claim a task is done without a verification
command/result. Do not silently revert unrelated user or previous-agent changes; run
`git status --short` first.

This prompt bundles two kinds of work: (A) MES Console UX/data-model fixes, and (B) a single
platform-wide data-hygiene and rebrand migration. Treat them as separate work items with separate
verification, but land them in the same review pass since (B) partially depends on the schema changes
that (A.5) and (A.6) may introduce (product-recipe model, work-center operation catalog with cycle
time). Sequence: finish schema-impacting UX work first (A.5, A.6), then write the consolidated
migration/seed script (B) against the final schema.

---

## A. MES Console UX and Domain-Model Fixes

### A.1 Work Order list -> full detail modal

Currently `AI_CONTEXT.md` section 36 describes `WODetailScreen` as a route (`/master-data...` or a
dedicated WO detail path), not a modal opened from the list row.

Requirement:
- On the Work Orders list page (the `work-orders` router / list screen), clicking any row (and
  activating it via keyboard, matching the accessibility pattern already used for the Routing detail
  modal in section 35) must open a **detail modal** — not a route navigation — displaying the complete
  Work Order information: header (code, product/revision business name, quantity, UOM, site, planned
  dates, status), full operation list (localized operation name + code, per section 34's
  `operation_name` contract), material requirements with WMS staging status/detail (per section 36),
  and approval log history.
- Reuse the existing normalization pattern from `WODetailScreen` (`data.data || data`, safe array
  fallbacks, no UUID-as-business-identity per section 28) inside the modal instead of duplicating logic;
  extract shared rendering into a component both the modal and any remaining detail route can use if a
  standalone route is still needed for deep-linking.
- Do not regress existing WO action affordances (approve/reject/stage-materials) — decide explicitly
  whether those actions live inside the modal or remain on a separate page, and document the decision.
- Verification: MES Console typecheck + production build pass; manual/automated check that clicking a
  row opens the modal with all four data groups populated for a real WO (e.g. `WO-1004`), and that the
  existing route-aware `PageDetailButton` "how to use" guide (section 27) is not confused with this new
  business-data modal — they are different surfaces and must not be merged.

### A.2 Remove "Create Work Order" from the navigation menu

- The MES Console main navigation currently exposes a "Create Work Order" entry in addition to the
  create button already present on the Work Orders list page. Remove the navigation-menu entry (sidebar
  or top-nav item, per `Sidebar.tsx` / `Navbar.tsx`) that links directly to the create flow.
- Keep the create entry point that already lives on the Work Orders list page (the button feeding
  `WOCreateScreen`, section 27) as the single source of entry.
- Verification: build passes; sidebar/nav config no longer contains a Work Order creation link; the
  create button on the list page still opens `WOCreateScreen` unchanged.

### A.3 Item Type display: code-suffixed labels, tooltip, and detail modal

In the Item Management (Item & Revision) screen and its "Add New Item" form:

- Wherever `ItemType` is displayed as text (list column, form select option, detail view), show the
  **full localized description followed by the short code in parentheses**, e.g.
  `Finished Good (FG)`, `Semi-Finished Good (SFG)`, `Raw Material (RM)` — apply this pattern
  consistently to every enum value, in every locale (VI/EN/JA/KO), not just the English example given.
- Next to the `Item Type` field label, there is currently an icon; convert it into a hover/focus
  **tooltip trigger**. Move the long descriptive text (e.g. "A finished product delivered to customers
  or stored as finished stock") out of inline UI and into that tooltip's content, localized for all four
  languages, matching the tooltip pattern already used elsewhere if one exists, or establishing a
  reusable `InfoTooltip` primitive under `src/components/ui/` if none exists yet (shared token/style
  usage per section 20.2/20.3, no ad hoc colors).
- Clicking a row in the Item list must open a **detail modal** showing the full information of that
  Item **and** its Revision (not just the Item row), consistent with the row-click-opens-modal pattern
  used elsewhere (Routing detail, section 35; new WO detail, A.1 above).
- Verification: build/typecheck pass; tooltip renders translated content in all four locales; list and
  select-option labels show the `Description (CODE)` pattern; row click opens a modal with combined
  Item + Revision data.

### A.4 Remove redundant right-side header breadcrumb text

- `RouteHeader.tsx` (section 26) currently shows page-context text on the right side of the page header
  (e.g. literal app name + path string like "MES Console / master-data/items"). Since the browser URL
  already conveys the route unambiguously, remove this redundant right-side text from the shared header
  across **all** pages (canonical routes, legacy `/console/mes/*` aliases, and the 404 route), while
  preserving the parts of `RouteHeader` that provide real navigational value (home link,
  section/current-route breadcrumb hierarchy used for in-app navigation, responsive stacking).
- Do not remove functional breadcrumb navigation (clickable hierarchy) — only the non-interactive
  "app name / path" label that duplicates the URL bar.
- Verification: production build passes; visually confirm (or via component test) that the redundant
  label is gone from at least one representative page in each top-level MES section while breadcrumb
  links still function.

### A.5 Product "Recipe" model decision — Item Management scope, MBOM/EBOM/Routing relationship

This is the most consequential item in this prompt. Treat it as a **design decision task first, then
an implementation task**, because it may require schema migration and a UI information-architecture
change.

**Problem statement (from the requester):** When creating a Work Order, the operator needs to select
"what product" the WO is for. Today the only selector context is the "Items & Revisions" tab. The
requester suspects this tab, in practice, mostly manages raw materials/equipment master data rather
than being a true product-configuration workspace, and wants a dedicated page to CRUD a product's full
**recipe**: its MBOM, its EBOM (Engineering BOM — currently absent from the implemented schema/UI; treat
as `MISSING` unless proven otherwise during your audit), and its Routing, as a single cohesive entity.

**Required steps, in order:**

1. **Audit before deciding.** Inspect `services/mes-master-data-service` table registry, migrations, and
   `ItemsScreen.tsx` / MBOM screens to determine, with evidence, what the current "Items & Revisions"
   page actually manages: does it include finished goods (`FG_*`) alongside raw materials
   (`RM_*`)/semi-finished goods (`SFG_*`), or is it in practice dominated by raw-material/equipment
   master data? Record findings with the evidence-status vocabulary before proposing a UI rename.
2. **Decide the target information architecture.** Two options were suggested by the requester; choose
   one explicitly and document the rationale in the implementation-fix record:
   - **Option 1 (recommended default if audit shows Items & Revisions already covers all item types
     including FG):** Introduce a new top-level "Product Recipe" (Công thức sản phẩm) workspace that
     composes, for a given Item Revision: its released/draft MBOM, its EBOM (new concept — define
     whether this is a new entity or an alias/subset of MBOM with `PhantomFlag`/engineering-only scope;
     do not silently conflate it with MBOM without documenting the distinction), and its Routing, in one
     screen with tabs/sections per sub-entity. The existing MBOM screen becomes a child view reachable
     from this new Recipe workspace rather than a standalone top-level nav item.
   - **Option 2:** Keep MBOM/Routing as-is but add a "Recipe" landing/detail page that is purely a
     read/navigation aggregator (no new CRUD ownership change), linking out to the existing MBOM and
     Routing screens for a selected Item Revision.
   - Either option must preserve the existing ownership rule in section 6/21.1: `mes-master-data-service`
     remains the single owner of item/MBOM/routing/production-version tables; do not introduce a second
     writer or a cross-service database read.
3. **If Item & Revision is confirmed to be primarily a raw-material/equipment management surface**,
   rename it in the UI (menu label, page title, breadcrumb) to something unambiguous, e.g. "Raw Material
   & Component Master Data" or equivalent localized term — do **not** rename the underlying API resource
   names (`items`, `item-revisions`) without a full contract-compatibility review; this is a display-name
   change unless the audit in step 1 also finds a genuine ownership/data-model problem.
4. **If the audit or the chosen option requires a schema change** (e.g. a new `md_ebom_header`/
   `md_ebom_line` set of tables, or a "Recipe" aggregate view/materialized concept), write it as a
   forward-only migration in `mes-master-data-service`, following the same pattern as section 29's MBOM/
   Routing enrichment migration: preserve existing IDs/FKs, preserve released-row protection except
   during a documented controlled backfill window, and do not break existing `MES.MasterData.*` event
   consumers (additive fields only, no removed/renamed fields on existing event schemas without a version
   bump per the event-versioning rule in section 6).
5. Update the relevant service manifest(s), `AI_CONTEXT.md` sections 5.2/11/21, and
   `implementation-fix/` with the final decision, evidence, and any new resource/table names.

**Explicitly out of scope for this step unless the audit proves otherwise:** do not invent a new
top-level "Recipe" microservice or new bounded context. Prefer extending the existing
`mes-master-data-service` ownership boundary per section 6's invariant (one service = one DB = one
bounded context) unless you find concrete evidence the recipe aggregate needs independent scaling/
deployment, which is unlikely at this stage.

Verification: master-data and console typecheck/build pass; if a migration was added, confirm it
applies cleanly to a fresh and to the current populated database; confirm existing MBOM/Routing
release/readiness flows (Work Order creation dependency in section 27) still resolve production-ready
configurations correctly after the change.

### A.6 Routing creation form overhaul

Apply the following to the Create Routing form, and to the **general localized-field pattern across all
of MES** where noted:

1. **Product Revision selector** must display the localized product/revision **name**, not the internal
   code, as its primary visible label (consistent with the display-identity policy already applied to
   Work Order creation in section 30 and the internal-ID policy in section 28). If Item Revision data
   needed for this display is missing or incomplete for existing rows, this requires a data migration/
   backfill (reuse the backfill approach from section 29: evidence-based values where provable, code
   fallback plus a translation-review flag otherwise) and a corresponding adjustment to the Item/Revision
   CRUD form so future rows are never created without the required localized name.
2. **Routing Type** select options must be translated (localized labels for `Standard`/`Alternate`/
   `Rework`) instead of showing raw enum values, in all four supported locales.
3. **Group localized multi-language fields visually.** The set of per-locale inputs for "Routing Name"
   (and any other `LocalizedTextFields` usage, e.g. Description, per sections 29/31) must be wrapped in a
   **bordered card** so the user perceives it as one cohesive field block rather than a loose list of
   inputs. Apply this same bordered-card treatment to every `LocalizedTextFields` usage across MES
   Console (Item Name, MBOM Name/Description, Routing Name/Description, etc.), not just this one form —
   this is a shared-component change to `LocalizedTextFields` (or its wrapper), not a per-form patch.
4. **No placeholders on translation inputs, anywhere in MES.** Per-locale text inputs must never use
   placeholder text. Required vs. optional status is communicated only via an asterisk (`*`) on the
   field label, consistent with how the rest of the form already indicates required fields. Audit and
   fix every existing `LocalizedTextFields` usage found during A.6.3, not just Routing.
5. **Remove the "Change Reason" (Lý do thay đổi) field** from the Routing creation form. Confirm whether
   this field is required by any backend validation or event payload (section 29 mentions
   `change_reason` as an enriched MBOM/Routing header field) before removing it from the UI — if the
   backend still requires or stores it, either make it optional in both API and UI or explicitly decide
   and document that Routing no longer collects it while MBOM still does (do not assume symmetry without
   checking each resource's validation rules).
6. **Add the missing "Operation Flow" (Luồng công đoạn) step to Routing creation**, built on a new
   Work-Center-owned operation catalog:
   - **Work Center creation must be extended** so that, at Work Center creation/edit time, the user
     defines the set of operations that can be performed at that Work Center, and for each one, a
     **required** `CycleTimeSec`-equivalent estimate (time to complete that operation at that Work
     Center). This is effectively a Work-Center-scoped subset/extension of the existing
     `MD_PRODUCTION_STANDARD` concept (section 5.3) — reuse `MD_PRODUCTION_STANDARD`
     (`WorkCenterID` + operation + `CycleTimeSec`) if it already fits, rather than inventing a duplicate
     table; only add a new join table if `MD_PRODUCTION_STANDARD` cannot cleanly represent
     "operations this Work Center is capable of, with a required cycle time," in which case document why.
   - **In Routing creation**, add an explicit step where the user (a) selects which Work Center(s)
     participate in this routing, (b) for each selected Work Center, is offered **only the operations
     already defined as capable for that Work Center** (from the step above) — this is a hard filter,
     not a free-text/any-operation picker — and (c) arranges the selected operations into the routing's
     ordered operation flow (sequence numbers, predecessor relationships per `MD_ROUTING_OPERATION`,
     section 5.3), matching the existing flow-visualization pattern used in the Routing detail modal
     (section 35, "vertical process flow").
   - This changes the Routing creation contract: routing operations are no longer entered as free
     `OperationID` + `DefaultWorkCenterID` pairs typed independently, but constrained by Work Center
     capability. Update the `md_routing_operation` creation validation accordingly, and update the
     Work Center create/edit API and UI to collect capability + cycle time.
   - Verification: create a Work Center with 2+ capable operations and per-operation cycle times; create
     a Routing selecting that Work Center; confirm the operation picker only offers the capable
     operations; confirm cycle time is persisted and surfaced in the Routing/Work Center detail views.

Verification for A.6 overall: master-data and console typecheck/build pass; any new/changed migration
applies cleanly; live create-flow smoke test for both Work Center (with operations+cycle time) and
Routing (using the new Operation Flow step) succeeds end to end; existing production-readiness/Work
Order creation dependency (section 27) still resolves correctly against routings created this way.

---

## B. Platform-Wide Changes

### B.1 Company rebrand: "Won Seal Tech" -> "S-Factory"

- Replace every user-facing occurrence of the company name "Won Seal Tech" with "S-Factory" across all
  consoles (Portal, MES Console, WMS Console, QMS Console, Kiosk UI), all locales (VI/EN/JA/KO), seed
  data, document/report templates, and any static config that renders the name in the UI (e.g. login
  screens, headers, footers, About/Info pages, email/notification templates if any).
- Do **not** rename technical identifiers that happen to reference the old name unless they are also
  user-facing strings (e.g. leave `SiteCode`/DB names/service names untouched; those are infrastructure
  identifiers, not the display brand). If any technical identifier literally embeds "wonsealtech" in a
  way that is also shown to users (e.g. Keycloak realm name `wonsealtech` — check whether this is ever
  displayed in UI), evaluate case by case and document the decision; renaming the Keycloak realm itself
  is high-risk (breaks existing tokens/clients) and should be avoided unless explicitly required — prefer
  a display-name-only rebrand at the UI/i18n-resource layer over renaming the realm.
- Update representative seed data business names/descriptions that literally reference "Won Seal Tech"
  in Vietnamese or English text.
- Verification: run the existing i18n static-string scanner (`npm run i18n:scan`) plus a repository-wide
  text search for the old name to confirm no residual user-facing occurrence remains outside of
  historical/archival documentation (this `AI_CONTEXT.md` file's own historical business-context section
  may keep the old name as company history if you decide that's desired — state this explicitly rather
  than silently leaving it inconsistent).

### B.2 Consolidated data-cleanup and reseed migration script

Goal: because the dataset has been mutated repeatedly across many implementation passes and is now
partially outdated, produce **one single, sequential, idempotent-where-possible migration/seed script**
that:

1. **Deletes transactional/demo-run data that is not meant to be permanent sample data**, specifically
   (confirm exact table ownership per service before deleting — never cross-service-delete):
   - MES Work Orders and all dependent rows: `wo_header`, `wo_operation`, `wo_material_requirement`,
     `wo_approval_log`, `execution_session`, `operation_confirmation`, `material_consumption`,
     `wo_creation_workflow` / `wo_creation_workflow_event` (section 25), and numbering-sequence rows tied
     to those WOs (`wo_creation_workflow`-adjacent counters, but **not** the counter tables' structural
     definitions).
   - WMS outbound material requests generated from those Work Orders (`wms-outbound-service` request
     tables), and any WMS inventory movements/balances that only exist because of those now-deleted WOs'
     staging/consumption activity — this requires deleting in dependency order: WO-driven WMS movements
     before WMS balances are recalculated/reset, then material requests, then MES execution rows.
   - QMS inspection results and NCR/CAPA records that were generated from now-deleted Work Order
     operations (`OperationFinished` events tied to deleted WOs), while preserving QMS demo seed data
     that was generated by `npm run seed:qms:demo` independently of real WO activity, unless that too is
     considered stale — decide and document which QMS rows are "real transactional run data" (delete) vs.
     "intentional demo seed" (keep or re-seed).
   - Any other transactional run data you find during the audit that is clearly a byproduct of manual
     testing/demo runs rather than reusable master data (e.g. traceability label instances/genealogy
     events tied to deleted WOs).
2. **Does NOT delete durable master data structures or their released catalog rows** — Sites, Areas,
   UOM, Shifts, Reason Codes, Work Centers/Workstations/Equipment, Skills, Terminals, Role/Permission/
   User-Scope data, Warehouses/Zones/Locations/Bins — these are recreated/refreshed, not wiped, unless a
   specific row is proven obsolete/wrong.
3. **Recreates/refreshes product-related master data** (Items, Item Revisions, MBOM, Routing, Production
   Versions, and — if A.5 introduced it — the Recipe/EBOM structures) **based on the current schema**
   (i.e., after A.5's and A.6's migrations have landed), using the localized-field, business-code-preview,
   and no-placeholder conventions established above, so the demo dataset is representative of the final
   UI/UX rather than of an earlier schema version. Reuse the existing representative product
   (`FG-WS-CM01-R1` family, section 2/4) as the baseline shape, but rename any literal "Won Seal Tech"
   text per B.1.
4. Is written as **one script, run sequentially, split into clearly commented phases**, e.g.:
   ```
   -- =========================================================================
   -- Phase 0: Pre-flight checks (row counts, guard against running on prod)
   -- Phase 1: Delete MES transactional/demo-run data (WO + execution + workflow)
   -- Phase 2: Delete dependent WMS transactional data (outbound requests, movements)
   -- Phase 3: Delete dependent QMS transactional data (results/NCR/CAPA tied to deleted WOs)
   -- Phase 4: Delete/refresh product master data (Items/Revisions/MBOM/EBOM/Routing/PV)
   --          rebuilt against the current (post A.5/A.6) schema
   -- Phase 5: Reseed representative product master data with S-Factory branding
   -- Phase 6: Reseed Work Center operation-capability + cycle time data (per A.6)
   -- Phase 7: Post-run verification counts / sanity assertions
   -- =========================================================================
   ```
   Do not worry about the script's length — a single long, clearly phased, heavily commented script is
   explicitly preferred over several ad hoc scripts, because it is the one artifact future agents must
   find and re-run.
5. Length is not a concern; clarity, correct dependency ordering across service boundaries, and
   idempotent guards (e.g. `IF EXISTS`, upsert-by-natural-key where reseeding) are.
6. Each service's own database must only be touched by that service's own migration/seed tooling — if
   MES, WMS, and QMS databases each need statements, this may in practice be **one orchestrating shell/
   npm script that sequentially invokes each service's own seed/migration entrypoint in the correct
   cross-service order** (MES product/master data first, then WMS, then QMS), rather than one literal SQL
   file spanning multiple databases, since section 6's "no cross-service DB reads/writes" invariant
   still applies to tooling, not just runtime code. Document the final file location(s) (e.g. under
   `scripts/` alongside the existing `test-mes-wms-material-request-flow.sh` pattern) in
   `AI_CONTEXT.md` section 16 (Common Verification Commands).
7. Verification: run the full script against the current running stack; confirm WO/execution/WMS-request/
   related QMS tables are empty of stale rows; confirm product master data queries return the refreshed,
   S-Factory-branded, schema-current dataset; confirm dependent read models (WMS local `rm_item_revision`
   projection, execution service local Master Data projections) are consistent after the reseed — replay
   events or re-run the relevant consumer bootstrap if projections do not update automatically; confirm
   the Work Order creation flow (production-ready-item-revisions selector, section 27) and the new
   Operation Flow builder (A.6.6) both work end to end against the freshly seeded data.

### B.3 New governance rule for `AI_CONTEXT.md`

Add the following rule to `AI_CONTEXT.md` section 18 ("Working Rules For Future AI Agents") and/or a new
subsection near section 16 (Common Verification Commands):

> **Migration/reseed script maintenance rule:** Whenever a future change modifies the data structure of
> any table touched by the consolidated cleanup/reseed script from `implementation-fix/<this-work's-
> trace-file>.md` (Items, Item Revisions, MBOM/EBOM, Routing, Routing Operations, Production Versions,
> Work Center operation-capability/cycle-time data, or any table the script deletes/reseeds), the agent
> making that change MUST re-open that script, update it to match the new schema, and re-run it against
> the current environment before considering the change complete. Do not let the consolidated script go
> stale relative to the live schema — treat it as a living fixture, not a one-time artifact. Record each
> re-run (date, reason, verification result) in the same implementation-fix trace file.

---

## Deliverables checklist

- [ ] A.1 Work Order row-click detail modal implemented, built, verified.
- [ ] A.2 "Create Work Order" removed from nav menu; list-page create button remains sole entry point.
- [ ] A.3 Item Type `Description (CODE)` pattern + tooltip + Item/Revision row-click detail modal.
- [ ] A.4 Redundant right-side header text removed from `RouteHeader` across all routes.
- [ ] A.5 Recipe/MBOM/EBOM/Routing architecture decision documented with evidence, implemented, and
      `AI_CONTEXT.md` sections 5.2/11/21 updated accordingly (including a rename of "Item & Revision" if
      the audit supports it).
- [ ] A.6 Routing creation form: localized product-revision name display, translated Routing Type,
      bordered-card grouping for all `LocalizedTextFields` usages MES-wide, no placeholders anywhere,
      "Change Reason" field removed/resolved, Work Center operation-capability + cycle time data model
      added, Routing "Operation Flow" step added and constrained to each selected Work Center's
      capable operations.
- [ ] B.1 "Won Seal Tech" -> "S-Factory" rebrand complete across all consoles/locales/seed data.
- [ ] B.2 Single consolidated, phased, heavily commented cleanup + reseed script written and run
      successfully; documented in `AI_CONTEXT.md` section 16.
- [ ] B.3 Migration-maintenance governance rule added to `AI_CONTEXT.md`.
- [ ] All new/changed claims classified with the evidence-status vocabulary; implementation-fix trace
      file(s) written; `process/PROJECT_WORKLOAD_PROGRESS.md` updated only if milestone status genuinely
      changed; no unrelated changes reverted.