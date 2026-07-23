# PROMPT — Phase 2 Step 3: Build `wms-console` (WMS Console UI)

**Target audience:** an AI coding agent working directly in this repository. Everything needed to execute
is in this document. Do not ask clarifying questions — where information is genuinely missing from the
codebase, inspect the source and follow the fallback rules stated below.

**Repository:** `/home/neurosus/mes-system`
**Read first, in this order, before writing any code:**
1. `AI_CONTEXT.md` (root) — source-of-truth precedence rules.
2. `process/PROJECT_WORKLOAD_PROGRESS.md`
3. `services/mes-console/` (entire source tree) — this is your **pattern reference**, not `TECH-STACK-DECISION.md`'s Remix recommendation, which was superseded by actual implementation. Copy its conventions: AuthContext/Keycloak init, ErrorBoundary, i18n wiring, shadcn-style primitives, industrial theme tokens, Dockerfile build-arg pattern.
4. `services/wms-master-data-service/`, `services/wms-inventory-service/`, `services/wms-inbound-service/`, `services/wms-outbound-service/` — read actual routers/controllers to get **real, current** endpoint paths and request/response shapes. Do not trust any endpoint list in prose docs as complete; verify against source.
5. `libs/i18n-ui-shared/` — reuse this package, do not fork it.
6. `implementation/phase-2-2-wms-inventory-stock.md` and `implementation-fix/circuit-breaker-hardening.md` — domain rules and 503/retry contract your UI must respect.
7. `infra/docker-compose.wms.yml`, `infra/kong/kong.yml` — wiring pattern to extend.

---

## 0. Non-negotiable ground rules

- **Stack is React + Vite, not Remix.** `TECH-STACK-DECISION.md` §5 recommends Remix for all business consoles, but `AI_CONTEXT.md` §7 explicitly documents that the actual, implemented stack for `mes-console` is "React/Vite/Tailwind/shadcn-style UI served by Docker/nginx," and states this supersedes the earlier strategy note. Build `wms-console` the same way, for consistency with what is actually running. Do not introduce Remix.
- **No DELETE anywhere in the UI.** Per `wms-master-data-service` rules, the runtime DB user has no DELETE grants on owned tables. Every "remove" affordance in this console must be a status transition (`Active` → `Inactive`/deactivate), never a destructive delete action. Do not build delete buttons, delete confirmations, or delete API calls.
- **Never query or fabricate data.** If an endpoint, field, or table doesn't exist in the actual service source, do not invent it. Either find the real one by reading source, or mark the feature as `TODO: backend endpoint not found — verify with owning service` in a visible code comment and stub the screen with an empty-state explaining what's missing, rather than faking data.
- **Respect the WMS two-echelon staging model everywhere it's displayed.** `Storage` locations (central warehouse) and `WorkCenterStaging` locations (per-WorkCenter, referencing `staging_for_work_center_ref`) are structurally different concepts and must look visually distinct in every screen that lists or maps locations — never render them as interchangeable rows.
- **Pessimistic UI for consequential actions**, matching the pattern already proven in `kiosk-operator-ui` and `mes-console`: confirming a receipt, creating a material request, or triggering a staging transfer must disable the trigger control and show a loading state until the backend responds with success — never show optimistic success before the API call resolves.
- **i18n from the first commit.** Default locale Vietnamese (`vi`), plus `en`, `ja`, `ko`, using `libs/i18n-ui-shared`. Zero hardcoded UI strings — run the existing `npm run i18n:scan` against this new workspace before considering any screen done.
- **Circuit-breaker awareness.** Backend dependencies (`wms-outbound-service` → `wms-inventory-service`, `wms-inbound-service` → `wms-inventory-service`) can return `503` when the breaker is open. The UI must show a distinguishable "service temporarily unavailable, retrying" state with a manual retry action — reuse the 503 retry UI pattern already implemented in `mes-console`, don't design a new one from scratch.
- **When this is done**, write `implementation/phase-2-3-wms-console.md` following the exact structure of prior implementation records in that folder, and update the status row for milestone #11 in `process/PROJECT_WORKLOAD_PROGRESS.md` from `Pending` to `Completed`, with a trace link. Apply the "Console/UI Readiness Check" from `process/strategy-addendum-console-ui.md`: do not mark this Completed unless a real user, through the UI alone (no curl/API calls), can browse the warehouse map, create and confirm a receipt, and create a material request end-to-end.

---

## 1. Service identity

| Property | Value |
|---|---|
| Service name | `wms-console` |
| Location | `services/wms-console/` |
| Stack | React 18 + Vite + TypeScript + Tailwind CSS + shadcn-style components (Radix primitives) |
| Serve | Docker multi-stage build → static files served by nginx, same pattern as `mes-console` |
| Direct port | Host `13091` → container `80` |
| Kong route | None needed for the console itself (static SPA, same as `mes-console`); it calls existing Kong routes `/api/wms/master-data`, `/api/wms/inventory`, `/api/wms/inbound`, `/api/wms/outbound` directly from the browser |
| Auth | Keycloak Authorization Code + PKCE, realm `wonsealtech`, client `wms-client` (already registered per `AI_CONTEXT.md` §9) |
| Compose file | Add service block to `infra/docker-compose.wms.yml`, following the exact shape used for `mes-console` in `infra/docker-compose.mes.yml` |
| Vite env | `VITE_KEYCLOAK_URL` must be passed as a Docker **build arg** (Vite apps served by nginx cannot read runtime env vars) — copy the exact pattern from `mes-console`'s Dockerfile |

Update the ports table in `AI_CONTEXT.md` §15 to add:
```
| WMS Console | http://100.68.50.41:13091 |
```

---

## 2. Package list (exact)

Install and use these; do not substitute without a documented reason in your implementation trace.

**Core**
- `react`, `react-dom`, `typescript`, `vite`, `@vitejs/plugin-react`
- `react-router-dom` (v6) — client-side routing, SPA
- `tailwindcss`, `postcss`, `autoprefixer`

**Headless UI / component primitives**
- `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`,
  `@radix-ui/react-tooltip`, `@radix-ui/react-tabs`, `@radix-ui/react-select`,
  `@radix-ui/react-navigation-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-scroll-area`,
  `@radix-ui/react-separator`, `@radix-ui/react-switch`, `@radix-ui/react-checkbox`,
  `@radix-ui/react-radio-group`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-slot`,
  `@radix-ui/react-toast` (or `sonner` — pick one, `mes-console` already established a choice, reuse it)
- Build shadcn-style wrapper components (`Button`, `Input`, `Select`, `Dialog`, `Sheet`, `Tabs`, `Badge`,
  `Card`, `Table`, `DropdownMenu`, `Tooltip`, `AlertDialog`) on top of the Radix primitives above, matching
  the exact component API shape already used in `services/mes-console/src/components/ui/` — do not
  reinvent the API, copy the pattern so both consoles stay visually and behaviorally consistent.

**Data & forms**
- `@tanstack/react-query` (v5) — all server state, caching, polling, retries
- `@tanstack/react-table` (v8) — every dense data grid in this app
- `react-hook-form`, `zod`, `@hookform/resolvers` — every form
- `date-fns` — date/relative-time formatting (lot expiry, receipt age)

**Visualization / UX**
- `recharts` — dashboard KPI charts
- `lucide-react` — icons (same icon set as `mes-console`, for visual consistency)
- `cmdk` — command palette (`Cmd+K` / `Ctrl+K`)
- Warehouse map is a **custom-built SVG component** — do not pull in a generic diagramming library
  (react-flow, d3-hierarchy, etc. are overkill and fight you on the specific schematic layout needed
  here). Build it directly with SVG + React as specified in §5.

**i18n**
- `libs/i18n-ui-shared` (internal workspace package, already exists — import it, do not fork)

---

## 3. Design system — theme tokens

Brief given by the business owner (verbatim intent, now made concrete):

> Deep industrial navy blue primary, dark slate charcoal structure, vibrant safety amber / rubber orange
> accent, high-contrast, optimized for dense data on tablets and workstations, Tailwind + shadcn/ui.

Reuse `mes-console`'s existing `tailwind.config.ts` theme extension as the base — **do not create a second,
divergent palette**. If `mes-console` already defines these tokens, import/extend the same config; if it
doesn't yet define all of them, add the missing ones to both consoles' shared token set (propose putting
them in a shared `tailwind-preset` if one doesn't exist, so future QMS console reuses it too — flag this
decision in your implementation trace either way).

Concrete token values (CSS variables, HSL or hex — match whatever format `mes-console` already uses):

```css
/* Brand */
--navy-950: #061421;
--navy-900: #0A1F33;
--navy-800: #0F2A47;   /* primary brand, sidebar background */
--navy-700: #15395C;
--navy-600: #1D4E7A;

/* Structure (charcoal) */
--slate-900: #111827;  /* headers, high-emphasis text on light surfaces */
--slate-800: #1E293B;
--slate-700: #334155;
--slate-400: #94A3B8;  /* muted text, secondary labels */
--slate-200: #E2E8F0;  /* borders, dividers */
--slate-100: #F1F5F9;  /* card surfaces */
--slate-50:  #F8FAFC;  /* app background — light, high-density surface, NOT dark mode */

/* Accent — safety amber / rubber orange, for primary actions and key highlights */
--accent-600: #EA6B2C; /* rubber orange — primary buttons, active nav item, key metric highlight */
--accent-500: #F2803F;
--accent-100: #FCE7D9; /* accent-tinted background for badges/callouts */

/* Semantic status (distinct from brand accent, do not reuse accent-600 for these) */
--status-success: #16A34A;  /* Active / OK / sufficient stock */
--status-warning: #F59E0B;  /* near-expiry, low stock, pending review */
--status-danger:  #DC2626;  /* expired, shortage, 409/insufficient stock, breaker open */
--status-info:    #2563EB;  /* informational badges, in-transit */
--status-neutral: #64748B;  /* Inactive / Draft */
```

Typography: reuse whatever type stack `mes-console` already ships (do not introduce a third font family
across the platform). If none is deliberately chosen yet, use a clean grotesk (e.g. Inter) for UI text and
a tabular-figure-capable font for numeric columns in data grids (Inter's tabular-nums works fine — enable
`font-variant-numeric: tabular-nums` on every numeric table column so quantities align).

Density: this is a **data-dense industrial tool**, not a marketing page. Default to compact table row
height (36–40px), 13–14px base font size in grids, generous use of monospace/tabular numerals for
quantities, lot codes, and location codes so operators can scan columns fast.

---

## 4. Information architecture & routing

```
/                                   → redirect to /dashboard
/dashboard                          → KPI overview
/warehouse-map                      → interactive schematic (centerpiece screen, see §5)
/master-data/warehouses             → list
/master-data/warehouses/:id         → detail (tabs: Overview, Zones)
/master-data/zones                  → list (filterable by warehouse)
/master-data/zones/:id              → detail (tabs: Overview, Locations)
/master-data/locations              → list (filterable by warehouse/zone/purpose)
/master-data/locations/:id          → detail (tabs: Overview, Bins)
/master-data/bins                   → list (filterable by location)
/master-data/item-uom-mapping       → list + inline create/edit
/inventory/balances                 → list (filterable by item, warehouse, location, lot, expiry status)
/inventory/lots/:lotId               → lot detail (genealogy-adjacent info, expiry, balance by location)
/inventory/movements                 → append-only ledger, read-only, heavily filterable
/inventory/discrepancies             → discrepancy log (see §8.4 fallback rule if endpoint doesn't exist)
/inbound/receipts                    → list
/inbound/receipts/new                → multi-step create wizard
/inbound/receipts/:id                → detail + confirm action
/outbound/requests                   → list
/outbound/requests/new               → create form
/outbound/requests/:id               → detail (shows staging-first allocation result, shortage if any)
*                                    → 404 (reuse mes-console's 404 page pattern)
```

All list screens must keep filters/pagination/sort state in the URL query string (`?warehouse=...&status=...&page=2`)
so views are shareable/bookmarkable and survive a refresh — this is standard practice in every serious
WMS console and is cheap to get right with `react-router`'s `useSearchParams`.

**App shell** (persists across all routes):
- Left sidebar (navy `--navy-800` background, matching `mes-console`): logo/app name, nav sections
  (Dashboard, Warehouse Map, Master Data ▾, Inventory ▾, Inbound ▾, Outbound ▾), collapsible on narrow
  viewports, active item highlighted with `--accent-600` left-border + tinted background.
- Top bar: current warehouse selector (global filter, persisted to URL/local state, affects Dashboard and
  Warehouse Map by default), global search / `Cmd+K` command palette trigger (jump to item code, lot code,
  location code, receipt #, request #), locale switcher (vi/en/ja/ko, default vi), user menu (Keycloak
  profile + logout), a small breaker-health indicator icon that turns amber/red when any known dependency
  has recently returned 503 (poll or derive from React Query's error state on relevant queries).
- `ErrorBoundary` wrapping the route outlet + dedicated 404 route — copy `mes-console`'s implementation
  exactly, including its idempotent Keycloak init guard (`services/mes-console/src/context/AuthContext.tsx`)
  to avoid the `"A 'Keycloak' instance can only be initialized once."` bug already fixed once in this repo.

---

## 5. The centerpiece: Warehouse Map (schematic visualizer)

### 5.1 What this is, and what it deliberately is not

There is **no x/y coordinate data** in the current `wms_storage_location` / `wms_storage_bin` schema. This
is not a GPS-accurate floor plan and must not pretend to be one. Build it as a **logical schematic
diagram**: an auto-laid-out grid that faithfully represents the containment hierarchy
`Warehouse → Zone → Location → Bin` and each unit's live occupancy/status — the same category of view used
in real WMS products (Manhattan Active WM's slotting view, Körber's location heat maps, SAP EWM's bin
status monitor): a rectangle-packed, color-coded, drill-down diagram, not a pixel-perfect map.

If you find optional layout metadata already exists on `wms_storage_location`/`wms_storage_bin` in source
(e.g. `layout_x`, `layout_y`, `layout_w`, `layout_h`), use it to position elements precisely and skip the
auto-layout algorithm below for those records. Otherwise, use auto-layout for everything. Do not add new
columns to WMS-owned tables as part of this console task — if you believe layout coordinates should be
added, note it as a follow-up in your implementation trace, don't silently extend another service's schema
from a frontend task.

### 5.2 Layout algorithm (auto mode)

1. Fetch all zones for the selected warehouse, all locations for those zones, all bins for those locations.
2. Render one **Zone panel** per zone, arranged left-to-right / wrapped in rows, each panel sized
   proportionally to its bin count (more bins → visually larger panel), with the zone code/name as a header
   and an `AreaType`-style tag if available.
3. Inside each zone panel, lay out Locations as a packed grid (CSS grid or manual SVG grid math — SVG is
   required for the eventual heat/occupancy fill and crisp print/export, so do the whole thing in SVG, not
   DOM+CSS grid). Order locations deterministically (by `LocationCode` alphabetical, or by `SequenceNo` if
   such a field exists) so the layout is stable across reloads — operators build spatial muscle memory
   around fixed layout ordering, don't let element positions shuffle between sessions.
4. Inside each Location cell, if it has multiple Bins, subdivide the cell into a mini-grid of bin swatches;
   if it has one bin (or no bin, direct-location tracking), render it as a single swatch.
5. Compute an approximate column/row count per zone as `ceil(sqrt(bin_count))` and adjust to the panel's
   aspect ratio so the layout stays roughly square/readable rather than one long strip.

### 5.3 Visual encoding (this is the core UX value of the screen)

- **Location purpose** is the primary visual distinction, always visible without interaction:
  - `Storage` locations: neutral slate cell background, standard border.
  - `WorkCenterStaging` locations: distinct treatment — e.g. a diagonal-hatch pattern fill or a colored
    top-bar in `--navy-600`, plus a small factory/gear icon badge, and the linked
    `staging_for_work_center_ref` code rendered as a caption under the cell code. This is a domain
    invariant (two-echelon rule) — it must be impossible to mistake a staging cell for a storage cell at a
    glance.
- **Occupancy/status fill** (within the purpose-based base style), computed per bin from live balance data:
  - Empty (no balance): very light fill, low visual weight.
  - Occupied, healthy: `--status-success`-tinted fill, intensity scaled by relative quantity vs. the max
    seen in that same zone (relative heat, since there's no absolute capacity field to normalize against —
    if a capacity/max-qty field does exist in source, use it for an absolute percentage instead and say so
    in your trace).
  - Occupied, contains a lot nearing expiry (define "near-expiry" as within a configurable N days, default
    7): overlay `--status-warning` treatment (e.g. amber corner ribbon) regardless of quantity fill.
  - Occupied, contains an already-expired lot: `--status-danger` outline/ribbon — these must be visually
    unmissable since expired lots are excluded from allocation but still physically occupy space and need
    operator attention.
  - Discrepancy flagged (if a discrepancy log entry references this location and is unresolved): small
    warning-triangle badge, distinct from the expiry ribbon.
- Always render a compact legend (collapsible) explaining the encoding above — don't make operators
  memorize it.

### 5.4 Interaction model

- **Hover** a bin/location swatch → lightweight tooltip (Radix Tooltip): code, purpose, item count, total
  qty, earliest-expiring lot date if any. No network request on hover — derive from already-fetched data.
- **Click** a bin/location swatch → open a right-side **Sheet/Drawer** (does not navigate away, map stays
  mounted and scrolled position preserved) with tabs:
  - **Overview**: location code, purpose, warehouse/zone breadcrumb, staging work-center link if
    applicable, status.
  - **Balances**: table of item + lot + qty + UOM currently at this bin (this is effectively a filtered
    view of `/inventory/balances`) with a "View full balance" link that navigates to
    `/inventory/balances?location=...` for full filtering/sorting power.
  - **Recent movements**: last N ledger entries touching this location, with a link to
    `/inventory/movements?location=...`.
- **Search-to-highlight**: a search box above the map (item code, lot code, or location code) that dims
  non-matching cells and highlights matches with a pulsing `--accent-600` outline, auto-scrolling the first
  match into view. This is a standard, high-value pattern in real warehouse visualizers — implement it,
  don't skip it.
- **Breadcrumb** above the map: `Warehouse ▾ / Zone (optional focus) `. Selecting a zone from the breadcrumb
  or clicking a zone panel's "expand" affordance can zoom that single zone to fill the viewport for detail
  work on dense zones; a "back to full warehouse" control returns to the overview.
- Map must re-render live occupancy on a polling interval (e.g. every 15–30s via React Query
  `refetchInterval`) since this is meant to reflect near-real-time state — but do not poll so aggressively
  it strains `wms-inventory-service`; make the interval a named constant, easy to tune.

---

## 6. Screen specs — Master Data (Warehouses, Zones, Locations, Bins, Item-UOM Mapping)

Pattern for all four hierarchy levels (Warehouse/Zone/Location/Bin) — keep them structurally identical so
users transfer knowledge between them instantly:

- **List view**: `@tanstack/react-table` grid, server-paginated if the API supports it (verify — else
  client-paginate), column sort, a filter bar (text search + relevant scoped filters, e.g. Zones filtered
  by Warehouse). Status column rendered as a `Badge` (`Active` = success tint, `Inactive` = neutral tint).
  Row click → navigate to detail route (Warehouse/Zone/Location) — **except Bins**, which have no
  standalone detail page; edit Bins via a Dialog launched from the parent Location's "Bins" tab, since bins
  are a low-cardinality child concept, not worth a full route.
- **Create**: launched via a `Dialog` (not a full page — these are simple, single-entity forms with a
  handful of fields per the catalog schemas in `AI_CONTEXT.md` §5). Use `react-hook-form` + `zod` schema
  matching the field validation rules already documented (e.g. unique codes, parent-site consistency).
  Submit is pessimistic: disable submit button, show spinner, close dialog + toast "Created" only after
  the API confirms; on validation error, surface field-level errors inline, not just a toast.
- **Edit**: same Dialog pattern, pre-filled, `PATCH` semantics.
- **Deactivate** (never delete): an `AlertDialog` confirmation ("Deactivate this location? It will no
  longer be selectable for new operations.") before calling whatever status-change endpoint the service
  actually exposes.
- **Item ↔ UOM Mapping** is a flatter, higher-volume table (likely one row per item+UOM pair) — give it its
  own list+inline-edit screen rather than a hierarchy; support bulk-ish filtering by item code.

Detail pages (Warehouse/Zone/Location) use a `Tabs` layout: `Overview` (read-only summary + an "Edit" button
that opens the same Dialog used from the list) and a tab listing the child collection (Zones under a
Warehouse, Locations under a Zone, Bins under a Location) as a nested, smaller data table with its own
"Add" button opening the same create Dialog pattern, pre-scoped to the parent.

---

## 7. Screen specs — Inventory

### 7.1 Balances (`/inventory/balances`)
Dense, heavily-filterable table: Item code/name, Item Revision, Lot code, Warehouse, Location (with a
purpose badge — Storage/Staging, per §5.3's visual language reused in table form), Quantity, UOM, Expiry
date (color-coded per §5.3's expiry thresholds), Status. Filters: warehouse, location purpose, item, expiry
window (e.g. "expiring in 7 days"), "show expired" toggle (default off, since expired lots are excluded from
allocation but auditors still need to find them). Row click → navigate to `/inventory/lots/:lotId`.

### 7.2 Lot detail (`/inventory/lots/:lotId`)
Header: lot code, item, expiry date with a prominent status badge. Body: table of this lot's balance
across every location it currently occupies (a lot can be split across Storage and multiple
WorkCenterStaging locations), plus a "Movements for this lot" table (filtered ledger).

### 7.3 Movements (`/inventory/movements`)
Read-only, append-only ledger view — this table must **never** offer edit/delete affordances, matching the
backend's own no-UPDATE/no-DELETE grant on this table. Columns: timestamp, movement type (receipt /
transfer-to-staging / consumption / adjustment — confirm actual type enum from source), item, lot,
from-location, to-location, quantity, UOM, reference (WO id / receipt id / request id if present), source
event/trace id (useful for support debugging, show it but keep it visually de-emphasized — small
monospace, muted color). Heavy filtering: date range, item, location, movement type, work center (for
consumption events, since `MES.Execution.MaterialConsumed.v1` additively carries `work_center_id` per
`AI_CONTEXT.md` §11). Default sort: most recent first.

### 7.4 Discrepancies (`/inventory/discrepancies`)
Reads from `inv_discrepancy_log`. **Before building this screen, verify a read HTTP endpoint actually
exists on `wms-inventory-service` for this table.** If it does, build a filterable list (item, location,
date range, resolved/unresolved) matching the same table conventions as Movements. If no endpoint exists
yet, do not fabricate one client-side — render the route with a clear "Not yet available — no backend
endpoint exposed for discrepancy log reads" empty state, keep the nav link visible but flag this explicitly
in `implementation/phase-2-3-wms-console.md` as a known gap for a follow-up backend task. This is the
correct behavior per this repo's own governance rule against silently faking incomplete features.

---

## 8. Screen specs — Inbound

### 8.1 Receipt list (`/inbound/receipts`)
Table: receipt #, warehouse, status (`Draft`/whatever the real enum is — verify from source), line count,
created date, confirmed date. Filter by status/warehouse/date range. Primary action button top-right:
"New Receipt" → `/inbound/receipts/new`.

### 8.2 Create receipt (`/inbound/receipts/new`)
Full-page **multi-step form**, not a modal (this is exactly the "complex multi-step flow" case that earns a
dedicated route per this document's modal-vs-page rule): Step 1 — header (warehouse, reference info); Step
2 — lines (item, quantity, UOM, target location — must only allow selecting `Storage`-purpose locations,
since inbound direct-to-staging is explicitly rejected by the backend business rule in `AI_CONTEXT.md`
§11: filter the location picker accordingly and show an inline explanation if a user tries to pick a
staging location, don't just let the API reject it with a raw error); Step 3 — review & submit. Use a
stepper UI (Tabs-based or a simple numbered progress indicator — keep it simple, this doesn't need a
dependency, build it with existing primitives).

### 8.3 Receipt detail (`/inbound/receipts/:id`)
Header info + line table. If status is not yet confirmed, show a prominent "Confirm Receipt" primary
action (pessimistic: disabled + spinner while the confirm call is in flight, success toast + status badge
update on success, clear error surfaced on failure — including a specific, human-readable message for the
503/breaker-open case, distinct from a generic validation failure).

---

## 9. Screen specs — Outbound

### 9.1 Material request list (`/outbound/requests`)
Table: request #, work center (target staging location's linked WorkCenter), item, requested qty, status
(including a clearly distinguishable **Shortage** status state — `--status-danger` badge, not just text),
created date. Filter by work center, status, item, date range.

### 9.2 Create request (`/outbound/requests/new`)
Form (Dialog is acceptable here if the real payload is a small flat shape — verify against source; if it's
genuinely multi-line/multi-step like receipts, use a full page instead, following the same rule as §8.2).
Fields: work center (maps to a `WorkCenterStaging` location), item revision, required quantity, UOM.

### 9.3 Request detail (`/outbound/requests/:id`)
This is where the staging-first allocation result should be made legible to a human, since it's a genuinely
non-trivial business rule (already-staged balance checked first, only shortfall transferred from Warehouse,
FEFO lot selection, all-or-nothing shortage). Render a small breakdown panel:
`Already staged: X → Transferred from Warehouse: Y → Total available at WorkCenter: Z`, and if shortage
occurred, show which lots/quantities were insufficient rather than just a bare "insufficient stock" message
— this is directly traceable from the acceptance scenarios already validated in
`implementation/phase-2-2-wms-inventory-stock.md` §12, reuse that scenario language as your model for what
data needs to be visible here.

---

## 10. Dashboard (`/dashboard`)

KPI cards (use `recharts` where a chart genuinely adds value, plain stat cards where it doesn't — don't
force a chart onto a single number):
- Total balance qty by warehouse (bar chart, filterable by selected warehouse from the top bar).
- Lots expiring within 7 days (count + list link into `/inventory/balances?expiry=7d`).
- Open shortages (count + link into `/outbound/requests?status=shortage`).
- Pending (unconfirmed) receipts (count + link into `/inbound/receipts?status=draft`).
- WorkCenter staging occupancy summary (small table or bar chart: work center → staged qty by item group,
  if derivable — otherwise a simpler "staging locations with stock" count).
- Recent activity feed: last N movements across the warehouse, reusing the Movements table's row renderer
  in a condensed form, with a "View all" link into `/inventory/movements`.

This page's job is triage: "what needs my attention right now" — every card should link into a pre-filtered
list view, not just display a static number.

---

## 11. Cross-cutting UX rules

- **Modal vs Drawer vs Page — decision rule, apply consistently everywhere:**
  - **Dialog (centered modal):** single-entity CRUD forms with few fields (Warehouse/Zone/Location/Bin
    create/edit, Item-UOM mapping edit, request creation if flat). Also used for `AlertDialog`
    confirmations (deactivate, confirm receipt).
  - **Sheet/Drawer (slide from right):** contextual detail that shouldn't lose the underlying list/map
    context — Warehouse Map bin click, Balances row quick-peek, Movements row detail.
  - **Full page/route:** anything genuinely multi-step (Create Receipt), or a primary object with its own
    identity worth deep-linking to (Warehouse/Zone/Location detail, Lot detail, Receipt detail, Request
    detail).
- **Loading states:** skeleton placeholders matching the final layout's shape (skeleton table rows, skeleton
  map cells) — never a bare spinner for list/table content, since layout-shift on data arrival is jarring in
  a dense data tool. A centered spinner is acceptable only for full-page transitions and action-in-flight
  buttons.
- **Empty states:** every list/table must have a designed empty state (icon + one sentence explaining why
  it's empty + the relevant primary action if applicable, e.g. "No receipts yet — Create your first
  receipt"), not a blank table.
- **Toasts:** success ("Receipt confirmed", "Location created") and business-rule errors (409 insufficient
  stock, validation failures) both surface via toast, worded in plain operator language, not raw
  API/status-code text. Circuit-breaker/503 errors get a distinct, longer-lived toast/banner treatment with
  a retry action, not a generic error toast that disappears in 3 seconds — the user needs a chance to act on
  it.
- **Command palette (`Cmd+K`):** jump-to search across item codes, lot codes, location codes, receipt
  numbers, request numbers — built with `cmdk`, queries a lightweight combined search if the backend
  supports it, or fans out to the relevant list endpoints with a short query and merges results client-side
  if it doesn't. Also include static command entries for "Go to Dashboard / Warehouse Map / Balances /
  Receipts / Requests" for keyboard-first navigation.
- **Responsiveness:** primary target is desktop workstation and tablet in landscape (this is a
  planner/manager tool per the platform's own UI-layer split — `AI_CONTEXT.md` §7 draws this line clearly
  between Kiosk/Edge UI and Console UI). Don't over-invest in phone-width layouts, but the app shell,
  tables, and dialogs must not visibly break down to a 1024px-wide tablet viewport.
- **Accessibility floor:** visible keyboard focus rings on every interactive element (Radix primitives give
  you this for free — don't strip it with `outline-none` without replacing it), full keyboard operability of
  Dialogs/Sheets/command palette (Radix handles this, don't fight it), sufficient color contrast for status
  badges against their backgrounds (verify the semantic status colors in §3 pass WCAG AA against the
  surfaces you place them on).

---

## 12. Data fetching pattern

- One `QueryClient`, one `@tanstack/react-query` provider at the app root.
- Query keys namespaced by resource and filters, e.g. `['balances', { warehouse, location, expiry }]`,
  `['locations', warehouseId]`, `['receipts', { status, page }]` — consistent enough that cache
  invalidation after a mutation (e.g. confirming a receipt invalidates `['receipts']` and
  `['balances']`/`['movements']` since confirming affects inventory) is predictable and centralized, not ad
  hoc per component.
- Mutations (`useMutation`) always invalidate the relevant query keys on success; never manually patch the
  cache with guessed server state for anything inventory-related (this is exactly the kind of place
  optimistic-update bugs would silently corrupt what an operator believes is in a bin — re-fetch real data
  instead).
- Wrap dependency-call queries (things hitting `wms-outbound-service`, `wms-inbound-service` insofar as they
  proxy to `wms-inventory-service`) with retry logic tuned to **not** hammer an already-open circuit
  breaker — a short number of retries with backoff, then surface the 503 state described in §11 rather than
  retrying indefinitely.

---

## 13. Auth & RBAC

- Reuse `mes-console`'s Keycloak/AuthContext pattern exactly, pointed at `wms-client` instead of
  `mes-client`.
- Realm roles available per `AI_CONTEXT.md` §9: `EXECUTIVE`, `PLANT_MANAGER`, `OPERATOR`, `QC_TECHNICIAN`,
  `WAREHOUSE_STAFF`. This console is primarily for `WAREHOUSE_STAFF`, `PLANT_MANAGER`, `EXECUTIVE`. Gate
  mutating actions (create/edit/deactivate/confirm) behind a role check (`WAREHOUSE_STAFF` or above); allow
  read-only browsing for any authenticated role that reaches this app, rather than building a granular
  per-domain permission table like MES has (`MD_ROLE_PERMISSION`) — WMS master data does not currently
  define an equivalent fine-grained permission model, so don't invent one client-side; keep it to simple
  realm-role gating and note this as a deliberate scoping decision in your implementation trace.

---

## 14. File structure (mirror `mes-console`'s conventions)

```
services/wms-console/
├── src/
│   ├── components/
│   │   ├── ui/                # shadcn-style primitives (Button, Dialog, Sheet, Table, Badge, ...)
│   │   ├── layout/             # AppShell, Sidebar, Topbar, CommandPalette
│   │   ├── warehouse-map/       # SVG map: ZonePanel, LocationCell, BinSwatch, MapLegend, MapSearchBar
│   │   └── shared/               # StatusBadge, ExpiryBadge, DataTable wrapper, EmptyState, ErrorState
│   ├── features/
│   │   ├── dashboard/
│   │   ├── warehouse-map/
│   │   ├── master-data/          # warehouses/ zones/ locations/ bins/ item-uom-mapping/
│   │   ├── inventory/            # balances/ lots/ movements/ discrepancies/
│   │   ├── inbound/
│   │   └── outbound/
│   ├── context/                  # AuthContext (Keycloak), WarehouseFilterContext
│   ├── lib/
│   │   ├── api/                  # typed API clients per backend service, built from verified endpoints
│   │   ├── queryKeys.ts
│   │   └── utils.ts
│   ├── i18n/                     # locale resources, wired through libs/i18n-ui-shared
│   ├── routes.tsx
│   ├── App.tsx
│   └── main.tsx
├── Dockerfile                    # copy mes-console's build-arg pattern (VITE_KEYCLOAK_URL)
├── nginx.conf                    # copy mes-console's
├── package.json
├── tailwind.config.ts            # extend/import shared tokens per §3
└── vite.config.ts
```

---

## 15. Definition of Done (self-verify before declaring this complete)

- [ ] Real endpoints verified from source for every screen; no fabricated endpoints anywhere in `lib/api/`.
- [ ] No delete affordance exists anywhere in the app; all removal is a status/deactivate transition.
- [ ] Warehouse Map renders live occupancy, distinguishes Storage vs WorkCenterStaging visually without
      interaction, supports hover tooltip, click-to-drawer, and search-to-highlight.
- [ ] A user can, through the UI alone: create a Warehouse → Zone → Location → Bin, create and confirm an
      Inbound Receipt into a Storage location, create an Outbound Material Request and see its
      staging-first allocation result (including a forced shortage scenario rendering correctly).
- [ ] 503/circuit-breaker states are visually distinct from validation errors and offer a retry action.
- [ ] `npm run i18n:scan` run against this workspace reports zero unexplained hardcoded strings; vi/en/ja/ko
      resources exist for every user-facing string.
- [ ] `ErrorBoundary` + 404 route present and match `mes-console`'s behavior.
- [ ] Keyboard focus is visible everywhere; `Cmd+K` command palette works end-to-end.
- [ ] `infra/docker-compose.wms.yml` updated with the `wms-console` service block; container builds and
      serves on host port `13091`.
- [ ] `AI_CONTEXT.md` §15 ports table updated with the new entry.
- [ ] `implementation/phase-2-3-wms-console.md` written, following the structure of prior implementation
      records, explicitly listing: what was delivered, any backend gaps found (e.g. missing discrepancy-log
      endpoint, missing list endpoints if any), and verification evidence (build passes, manual UI walk of
      the three end-to-end flows above).
- [ ] `process/PROJECT_WORKLOAD_PROGRESS.md` milestone #11 updated to `Completed` with the trace link, per
      the "Console/UI Readiness Check" rule — do not mark this complete if any of the three end-to-end flows
      above cannot actually be completed through the UI alone.