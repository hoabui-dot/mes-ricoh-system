# BUILD PROMPT — Phase 1, Step 6: `mes-console` (Master Data & WO Planning Console UI)

**Project:** MOM Platform (MES / WMS / QMS) — Won Seal Tech
**Phase:** Phase 1, Step 6 — inserted before Phase 2 begins
**Status before this prompt:** Steps 0–5 completed and verified. `mes-master-data-service`
(26 tables + Validation Engine) and `mes-execution-service` Stage A (WO planning/creation/approval)
are both live behind Kong at `/api/mes/master-data/*` and `/api/mes/execution/*`, but have no
UI — only the Kiosk Operator UI (shop-floor execution, Step 5) and the Unified Portal (launcher,
Phase 0) exist. This step closes that gap.

---

## 0. Why this step exists (read before coding)

`TECH-STACK-DECISION.md` §5 already named this UI ("MES Console") and its stack (Remix) as a
planned deliverable. Step 5's prompt explicitly flagged it as **out of scope for Kiosk** and
"not-yet-scheduled" — this prompt is that scheduling. Do not treat this as a variant of the Kiosk
UI; it is a **different app, different users, different device class**:

| | Kiosk Operator UI (Step 5) | MES Console (this step) |
|---|---|---|
| User | Shop-floor operator | Kỹ sư công nghệ, Planner, PLANT_MANAGER, EXECUTIVE |
| Device | Shared tablet, Direct Grant login (employee ID + PIN) | Desktop browser, standard OIDC redirect login via `mes-client` |
| Data | One WO-operation at a time, real-time confirmation | Master Data CRUD (Item/MBOM/Routing/...), WO planning across many WOs |
| Network assumption | Flaky shop-floor Wi-Fi | Office network, stable |

Do not reuse the Kiosk app's routes, auth flow, or `KioskSocketProvider`. This is a standalone
Remix app: `apps/mes-console/`.

---

## 1. Fixed Technology Decisions (same family as Kiosk UI — do not introduce new libraries)

| Concern | Decision | Reasoning |
|---|---|---|
| Framework | **Remix** | Per `TECH-STACK-DECISION.md` §5 — nested routing (Item→Revision→MBOM→Routing) maps to Remix nested routes; `loader`/`action` maps to CRUD |
| UI components | **shadcn/ui** | Consistency with Kiosk UI |
| Styling | Tailwind CSS | Same as Kiosk UI |
| Auth | **Standard OIDC Authorization Code + PKCE** against `mes-client` (reuse the flow already built for Unified Portal's `portal-client`, adapted to `mes-client`) — **not** Direct Grant | This is a desktop office app, not a shared kiosk; full redirect login is the correct trade-off here, opposite of Step 5's reasoning |
| Form validation | `zod`, shared schema between `action` and form component | Same rule as Kiosk UI — never trust client-only validation |
| Toast notifications | `sonner` | Consistency |
| Data mutations | Remix `loader`/`action` only — no client-fetch library | Same reasoning as Kiosk UI: forms must work with SSR before JS finishes loading |
| Table/list UI for master data grids | shadcn/ui `Table` + Tailwind, **no third-party datagrid library** | Keep dependency surface small, consistent with the project's stated bias against a "weak coding AI" needing extra surface area |

---

## 2. Scope — two functional areas, both required for this step

### Area A — Master Data Admin (against `mes-master-data-service`)

CRUD screens for the entities planners actually need to operate day-to-day. **Do not attempt all
26 tables in one pass** — build in this priority order, stop at the end of tier 2 if time-constrained
and report the remaining tier as a flagged follow-up (do not silently skip without saying so):

- **Tier 1 (must build):** Item, ItemRevision (with Release action), MBOM Header/Line (with Release
  action), Routing Header/Operation (with Release action), ProductionVersion (with Release action).
  These are the entities on the critical path to creating a WO.
- **Tier 2 (must build):** WorkCenter, Equipment, ProductionStandard, ReasonCode, Skill.
- **Tier 3 (flag as follow-up, do not build now):** Site/Area/UOM/Shift and the Domain-Scoped
  Access tables (`md_role_permission`/`md_user_resource_scope`) — these change rarely enough that
  seed data / direct DB access remains acceptable for now; building admin UI for them here would
  expand scope beyond what this step needs.

Each Tier 1/2 entity screen: list view (paginated, filterable by Site where applicable), detail/edit
view, create view. "Release" actions (ItemRevision, MBOM, Routing, ProductionVersion) go through
the existing Validation Engine on `mes-master-data-service` — **do not duplicate validation logic in
the UI**; call the existing release endpoint and render whatever errors it returns, same pattern as
Kiosk UI's Layer 1 field-level error handling (§B.3/B.4 of the Step 5 prompt — reuse that pattern
here verbatim, it's not Kiosk-specific).

### Area B — WO Planning & Approval (against `mes-execution-service` Stage A)

Implements diagram steps 1–6 from `product-doc.md`/`TECH-STACK-DECISION.md` as an actual UI, on top
of the 6 already-built API endpoints (`POST /work-orders`, `POST /work-orders/:id/compute-check`,
`POST /work-orders/:id/approve`, `POST /work-orders/:id/reject`, `GET /work-orders/:id`,
`GET /work-orders`):

1. **WO List** (`/console/mes/work-orders`) — filterable by status, Site, Item. Distinct visual
   status badges per `wo_status` enum.
2. **WO Create** (`/console/mes/work-orders/new`) — form for `DetermineDemand` input (Item, quantity,
   target date) → calls `POST /work-orders`, which internally runs `CheckMasterDataReadiness` +
   `CreateWorkOrder`. If `CheckMasterDataReadiness` fails, render **every** missing prerequisite
   returned by the API (it's already designed to return a complete list, not just the first error —
   the UI must not truncate this to one message).
3. **WO Detail** (`/console/mes/work-orders/:id`) — shows header, exploded `wo_operation` list,
   `wo_material_requirement` list, `wo_approval_log`. A "Compute & Check" button triggers
   `POST /work-orders/:id/compute-check` and renders the time-calculation + capacity-check result
   inline (not a toast — this is a substantial result set the planner needs to review before
   approving).
4. **Approve / Reject** — only rendered for users whose `X-Role-Code` (forwarded by Kong, read the
   same way `mes-execution-service` already reads it) is `EXECUTIVE` or `PLANT_MANAGER`. This is a
   **UI-level convenience only** — the real authorization check already happens server-side in
   `ApproveWorkOrder` (§2 of the Step 3 prompt); do not treat the UI-level role check as the security
   boundary. Reject requires a comment (per `wo_approval_log.comment`), enforced via zod, and uses
   shadcn's `AlertDialog` before firing (same destructive-action pattern as Kiosk UI §B.3.7).

---

## 3. Error Handling — reuse the Kiosk UI's 3-layer model exactly

Port the same structure from Step 5 §B.4 (Layer 1 field-level, Layer 2 route-level `ErrorBoundary`,
Layer 3 root-level `ErrorBoundary`) unchanged in principle. Differences for this app only:

- No `connectionStatus` banner / WebSocket layer — this app has no realtime channel. Layer 3 is a
  plain root `ErrorBoundary`, nothing else.
- 401/403 → redirect to the standard Keycloak login redirect (not a kiosk PIN screen).
- 503 (circuit breaker open on `mes-master-data-service`'s two synchronous calls during
  `ApproveWorkOrder`) → same specific "system busy, retry" card pattern as Kiosk UI.

Do not invent a new error-handling scheme for this app — the whole point of building this after
Kiosk UI is to have one proven pattern reused, not two different ones across the two frontends.

---

## 4. Non-Goals for This Step

- Do not build screens for Tier 3 master-data entities (§2, Area A) — flag as follow-up.
- Do not build a role/permission management UI (`md_role_permission`) — out of scope, remains
  direct-DB/seed-data managed for now.
- Do not touch `mes-traceability-service` — no label/genealogy admin UI in this step.
- Do not build WMS or QMS Console — those are separate, later steps (Phase 2/3), which will reuse
  this app's patterns but are not part of this deliverable.
- Do not add realtime/WebSocket updates to WO list or Master Data list — this is a planner tool,
  not a shop-floor screen; manual refresh / Remix revalidation on navigation is sufficient.

---

## 5. Infrastructure

- Add Kong route: this app is served as a static/SSR frontend, not proxied under `/api/*` — follow
  the same hosting pattern already used for Unified Portal and Kiosk UI (confirm which one and
  reuse it, do not introduce a third hosting pattern).
- Register `mes-console` as a new confidential/public client consideration: reuse `mes-client`
  (already exists, already used by Kiosk UI's Direct Grant) for the redirect-based flow too — do
  **not** create a new Keycloak client unless `mes-client`'s configuration genuinely cannot support
  both Direct Grant and Authorization Code + PKCE simultaneously (it can, these are independent
  grant types on the same client) — verify this before creating a new client.

---

## 6. Definition of Done

| # | Item | Verification |
|---|---|---|
| 1 | Planner can log in via standard Keycloak redirect and reach both Master Data and WO Planning sections | Manual test with `PLANT_MANAGER` user |
| 2 | Item → ItemRevision → MBOM → Routing → ProductionVersion can be created and Released end-to-end through the UI, matching the `FG-WS-CM01` scenario already used in `mes-master-data-service`'s own DoD | Manual walkthrough |
| 3 | `CheckMasterDataReadiness` failure renders the **complete** list of missing prerequisites, not just the first | Test against an Item with no Released Production Version |
| 4 | Full WO flow: Create → Compute & Check → Approve, for `FG-WS-CM01` × 500 PCS, succeeds through the UI and produces the same Kafka events already verified in Step 3's DoD | Manual walkthrough + Kafka consumer check |
| 5 | Approve/Reject buttons only render for `EXECUTIVE`/`PLANT_MANAGER`, and server-side rejection of an unauthorized approval attempt (bypassing the UI) still works | Manual test with `OPERATOR` role token via curl, bypassing UI |
| 6 | 503 from `mes-execution-service`'s circuit breaker during approval renders the specific retry card, not a generic crash | Fault injection: stop `mes-master-data-service` mid-approval |
| 7 | Reject requires a comment and a confirmation dialog before firing | Manual test |

---

## 7. Process Reminder

Update `process/PROJECT_WORKLOAD_PROGRESS.md`: insert this step as **Phase 1, Step 6**, mark
Phase 1 as fully `Completed ✅` only after this step's DoD passes, then proceed to Phase 2
(renumber the former Step 6 `wms-master-data-service` to Step 7).