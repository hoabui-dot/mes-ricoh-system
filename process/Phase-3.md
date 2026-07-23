# PROMPT — Phase 3: QMS Cluster (Inspection Service → Nonconformance Service → QMS Console)

**Target audience:** an AI coding agent working directly in this repository. This document contains three
sequential steps. Execute **Step 1 only** unless explicitly told to continue — the repository's own working
rule is "build the next step when requested," don't jump ahead to Step 2/3 in the same pass unless asked.
Read Step 2 and Step 3 anyway before starting Step 1, so your Step 1 design doesn't paint you into a corner
(event names, table shapes) that Step 2 will need to consume.

**Repository:** `/home/neurosus/mes-system`

**Read first, in this order, before writing any code:**
1. `AI_CONTEXT.md` (root) — source-of-truth precedence rules. Note: implementation records and source code
   outrank this file; this file outranks `process/` prompts.
2. `process/PROJECT_WORKLOAD_PROGRESS.md`
3. `services/wms-master-data-service/` (entire source tree) — this is your **structural pattern
   reference** for a Node/TypeScript/Express/Drizzle service in this repo: migrations, outbox, LocalizedText
   fields, service.manifest.yaml shape, Dockerfile, circuit-breaker usage via `opossum`. Copy its
   conventions, don't reinvent them.
4. `services/mes-master-data-service/` — reference for the generic `:resource` REST router pattern, release
   validation flow, and event publishing shape.
5. `libs/shared-kernel/` and `libs/i18n-ui-shared/` — reuse both, do not fork.
6. `product-doc/III-ROUTING-&-STANDARDS-CATALOG.md` (`MD_OPERATION`, especially `OperationType: Inspection`)
   and `product-doc/VII-ERD-MATRIX-&-DEV-VALIDATION.md` — QC domain context already defined for `OP-QC`.
7. `implementation/phase-1-4-mes-execution-service-b.md` — confirms exactly how `OP-QC` currently behaves in
   MES today (PASS issues label, FAIL requires reason code, no PASS label) — QMS must not duplicate or
   fight this existing MES behavior, it observes and extends it.
8. `implementation-fix/circuit-breaker-hardening.md` — the breaker baseline you must reuse for any new
   synchronous call this cluster introduces.

---

## 0. Non-negotiable ground rules for the whole Phase

- **Stack is Node.js/TypeScript/Express/Drizzle/PostgreSQL/KafkaJS for both QMS services.** This is not a
  new decision — `process/TECH-STACK-DECISION.md`'s decision matrix already classifies both
  `qms-inspection-service` and `qms-nonconformance-service` as Node.js workloads ("CRUD/business-rule...
  case management... no reason to use Go"). Do not deviate without writing an ADR justifying it, the same
  discipline `mes-execution-service`'s Go decision was held to.
- **One service = one database.** `qms-inspection-service` owns `qms_inspection_db`,
  `qms-nonconformance-service` owns `qms_nonconformance_db`. Neither reads the other's tables directly, and
  neither reads MES/WMS databases directly. Cross-cluster data comes from consumed events + local read
  models, or explicit circuit-breaker-guarded API calls — exactly the rule already enforced everywhere else
  in this repo.
- **Bounded Context Canvas required before code**, per `process/stragegy.md` §7 governance rule ("Bounded
  Context Canvas before implementing a new service" / "Definition of Ready: canvas, event contract,
  ownership, dependencies known"). Before writing any migration or route, create
  `docs/adr/bounded-context-canvas-qms-inspection-service.md` (and later
  `...qms-nonconformance-service.md`) with: Responsibility / Not-my-responsibility / Publishes / Consumes /
  Ubiquitous language. This is cheap and the repo's own rules require it — don't skip it.
- **Auth pattern follows WMS, not MES.** Use native Kong JWT plugin verification + pre-function role
  extraction, identical to the WMS auth closure rules in `AI_CONTEXT.md` §10: no anonymous identity, missing
  token returns `401` at the gateway, Kong forwards `X-User-ID`, `X-Role-Code`, `X-Trace-ID`. Do not use
  MES's older forwarded-header-with-default pattern — QMS is a new cluster with no legacy reason to repeat
  that choice.
- **Role usage:** `QC_TECHNICIAN` (already a realm role, currently unused elsewhere in the system — this is
  its first real consumer) executes inspections and records results. `PLANT_MANAGER`/`EXECUTIVE` release
  Inspection Plans and approve/close CAPA. Don't invent new realm roles; if a gap is found, note it in your
  implementation trace rather than silently creating a role in Keycloak from a backend-service task.
- **Event envelope and naming**: reuse the shared envelope
  (`event_id`, `event_type`, `occurred_at`, `source_service`, `trace_id`, `payload`) and the
  `<Cluster>.<BoundedContext>.<EventName>.v<N>` naming convention exactly as used everywhere else. New
  events introduced by this phase are specified per-step below — do not invent additional ones without
  updating the canvas doc first.
- **LocalizedText from day one** for every translatable field (characteristic names, defect names, plan
  descriptions, NCR descriptions) — this cluster has zero excuse to introduce scalar-text debt, since the
  i18n retrofit pain already happened once in MES (`implementation/phase-1-8a-...md`) specifically so future
  clusters wouldn't repeat it.
- **Outbox pattern mandatory** for every event-producing write, same as every other service.
- **Circuit breaker via `opossum`** (Node baseline) for any new synchronous cross-service call this phase
  introduces, using the exact configuration already standardized in
  `implementation-fix/circuit-breaker-hardening.md`: `volumeThreshold: 4`, `errorThresholdPercentage: 50`,
  `resetTimeout: 30_000`, `timeout: 10_000`, 4xx treated as business errors (not breaker failures), OTel
  span + metric on state transitions.
- **Implementation trace rule**: this work originates from `process/Phase-3-...` (create that prompt file
  yourself if it doesn't exist yet, mirroring the shape of `process/Phase-2-Step-1-Patch-&-Step-2.md`, so
  the repo's own "roadmap prompts live in `process/`" convention stays intact) and writes/updates
  `implementation/phase-3-1-qms-inspection-service.md` (Step 1),
  `implementation/phase-3-2-qms-nonconformance-service.md` (Step 2), and
  `implementation/phase-3-3-qms-console.md` (Step 3) respectively. Update
  `process/PROJECT_WORKLOAD_PROGRESS.md` milestone #12 only when the status genuinely changes — since it's
  currently one combined row ("Phase 3 QMS Inspection / NCR / QMS Console"), split it into three sub-rows
  (`12a`, `12b`, `12c`) the same way MES's Step 8/8a distinction was handled, so partial completion is
  visible rather than hidden inside one row.
- **Update `AI_CONTEXT.md`** after each step: ports table (§15), services & ownership (§11), tech stack
  table (§7), and executive summary (§1) — the same upkeep every prior phase performed.

---

## STEP 1 — `qms-inspection-service`

### 1.1 Purpose

Owns Inspection Plans (what to check, and against what criteria) and Inspection Results (what was actually
found), scoped primarily around `OP-QC` from the MES route table, but written generically enough to cover
any `MD_OPERATION` with `OperationType: Inspection` in the future — don't hardcode `OP-QC` as a literal
string deep in business logic; treat it as *a* qualifying operation, not *the only* one, even though it's
the only one that exists in the current seed data.

### 1.2 Service identity

| Property | Value |
|---|---|
| Service name | `qms-inspection-service` |
| Location | `services/qms-inspection-service/` |
| Stack | Node.js, TypeScript, Express, Drizzle ORM, PostgreSQL, KafkaJS, OTel — copy `wms-master-data-service`'s exact project layout |
| Direct port | Host `13110` → internal `3110` |
| Kong route | `/api/qms/inspection` → `qms-inspection-service:3110`, native JWT plugin (see §0) |
| Database | `qms_inspection_db`, container `qms-inspection-db`, host port `15442` |
| Compose file | New `infra/docker-compose.qms.yml` (doesn't exist yet — create it, following `infra/docker-compose.wms.yml`'s shape exactly: service + its own Postgres container). Add it to the root `infra/docker-compose.yml` include list alongside platform/mes/wms. |

### 1.3 Data model

#### `qms_defect_code` (master list, simple, standalone)
| Field | Meaning |
|---|---|
| `DefectCodeID` | PK |
| `DefectCode` | Unique short code, e.g. `SURF-CRACK` |
| `DefectName` | LocalizedText |
| `DefectCategory` | `Critical`, `Major`, `Minor` |
| `Status` | `Active`, `Inactive` |

Validation: `DefectCode` unique globally. No delete (mark `Inactive`), consistent with every other master
table in this repo.

#### `qms_inspection_plan` (header)
| Field | Meaning |
|---|---|
| `PlanID` | PK |
| `PlanCode` | Unique plan code |
| `PlanName` | LocalizedText |
| `ItemRevisionID` | Reference to MES `MD_ITEM_REVISION` (local read model — see §1.4) |
| `OperationID` | Reference to MES `MD_OPERATION` (local read model), must be an operation with
  `OperationType: Inspection` |
| `SiteID` | Reference to MES `MD_SITE` (local read model) |
| `PlanVersion` | Version number |
| `SamplingMethod` | `Full` (100%), `AQL`, `Fixed` — keep it a simple enum for MVP, don't build a full AQL
  table lookup engine unless a later prompt asks for it |
| `SampleSize` | Nullable, used when `SamplingMethod = Fixed` |
| `Status` | `Draft`, `InReview`, `Released`, `Obsolete` |
| `EffectiveFrom` / `EffectiveTo` | Effective dating |

Validation: only one effective `Released` plan per `[ItemRevisionID + OperationID + SiteID]` at a time —
same "one effective default at a time" pattern used for `MD_PRODUCTION_VERSION`. Released plan must have at
least one characteristic line (see release checklist below).

#### `qms_inspection_characteristic` (plan lines)
| Field | Meaning |
|---|---|
| `CharacteristicID` | PK |
| `PlanID` | Parent plan |
| `SequenceNo` | Display order |
| `CharacteristicCode` | Short code |
| `CharacteristicName` | LocalizedText |
| `MeasurementType` | `Attribute` (pass/fail judgment) or `Variable` (numeric measurement) |
| `SpecMin` / `SpecMax` / `TargetValue` | Nullable numerics, only meaningful for `Variable` type |
| `UOMID` | Reference to MES `MD_UOM` (local read model), nullable for `Attribute` type |
| `DefaultDefectCodeID` | Nullable FK to `qms_defect_code`, pre-fills the defect code when this
  characteristic fails |
| `MandatoryFlag` | Blocks overall PASS if this specific characteristic fails and flag is true |

Validation: `SequenceNo` unique within plan. `Variable` type requires `UOMID`. `SpecMin <= SpecMax` when
both present.

#### `qms_inspection_result` (result header)
| Field | Meaning |
|---|---|
| `ResultID` | PK |
| `PlanID` | Plan used |
| `WorkOrderID` | MES WO reference (string/UUID as MES uses, not a local FK — cross-cluster reference by ID
  only, per anti-corruption-layer rule) |
| `WorkCenterID` | MES WorkCenter reference, from the triggering `OperationFinished` event |
| `ItemRevisionID` | Item revision inspected |
| `LotOrLabelRef` | Nullable — MES traceability label/lot reference if the item is tracked (`ParentChild`/`Lot`) |
| `InspectedQty` / `PassedQty` / `FailedQty` | Quantities |
| `OverallResult` | `Pass`, `Fail` — computed server-side from characteristic results + mandatory-flag rule,
  never trust a client-submitted overall result blindly; recompute and validate against submitted details |
| `InspectorUserID` | From `X-User-ID` header at submission time |
| `InspectedAt` | Timestamp |
| `SourceEventID` | The `event_id` of the triggering `MES.Execution.OperationFinished.v1` event, for
  traceability/idempotency (see §1.5) |

#### `qms_inspection_result_detail` (result lines)
| Field | Meaning |
|---|---|
| `DetailID` | PK |
| `ResultID` | Parent result |
| `CharacteristicID` | Which characteristic this measures |
| `MeasuredValue` | Nullable numeric, for `Variable` type |
| `ResultFlag` | `Pass`, `Fail` |
| `DefectCodeID` | Nullable, required when `ResultFlag = Fail` |
| `Comment` | Free text |

Validation: `DefectCodeID` required when `ResultFlag = Fail`. Every `MandatoryFlag = true` characteristic on
the plan must have a corresponding detail row before a result can be finalized.

### 1.4 Local read models (from MES, one-way, never written back)

Consume and locally cache, read-model style (same as `wms-master-data-service`'s local `rm_item_revision`
model):
- `MES.MasterData.ItemRevisionReleased.v2` → local `qms_rm_item_revision`
- `MES.MasterData.RoutingReleased.v1` and/or a direct read of `MD_OPERATION` — **verify how
  `wms-master-data-service` or `mes-execution-service` currently obtain the Operation catalog locally; if no
  existing event carries Operation/Site/UOM data, you may need a synchronous, circuit-breaker-guarded call
  to `mes-master-data-service`'s generic `GET /api/mes/master-data/:resource` endpoint at Plan-creation time
  instead of a local read model.** Do not silently skip this validation — Inspection Plans referencing a
  nonexistent Operation/Site/UOM is a data-integrity gap this repo does not tolerate elsewhere (see
  MES/WMS's uniform "must be active and in correct site" validation pattern). Document whichever approach
  you land on in the Bounded Context Canvas.

### 1.5 Event consumption — closing the loop with `OP-QC`

- Consume `MES.Execution.OperationFinished.v1`.
- Filter: only act when the finished operation's `OperationID` matches an operation with
  `OperationType: Inspection` (resolve via the local/synchronous Operation lookup from §1.4) — **do not
  hardcode the string `OP-QC`.**
- On a qualifying event, create (or find, if already created — see idempotency below) a **draft**
  `qms_inspection_result` header pre-filled with `WorkOrderID`, `WorkCenterID`, `ItemRevisionID`,
  `InspectedQty` (from the event payload's finished quantity), and the resolved `PlanID` (the currently
  effective Released plan for that `[ItemRevisionID + OperationID + SiteID]` — if none exists, still create
  the draft but flag it, e.g. `PlanID = null` and a `MissingPlanFlag`, so the console can surface "no
  inspection plan configured" rather than silently dropping the event).
- **Idempotency:** store `SourceEventID` and treat `(SourceEventID)` as a uniqueness constraint — a
  redelivered Kafka message must not create a duplicate draft result. This mirrors the idempotency
  discipline already established for `wms-outbound-service`'s staging requests
  (`pg_advisory_xact_lock(hashtext(idempotencyKey))` — reuse that exact pattern here, keyed on the event ID).
- This draft-result creation is what makes the console's inbound work queue meaningful in Step 3 — an
  inspector opens the console, sees "pending inspections" (drafts with `OverallResult` not yet finalized),
  and records the actual measured results against them. The event does not, by itself, know pass/fail —
  that's a human decision recorded through the API in §1.6.

### 1.6 HTTP API

Follow the same generic-resource-router shape already used by `mes-master-data-service` where it fits, plus
a couple of purpose-built endpoints for the result workflow:

- `GET /api/qms/inspection/defect-codes`, `POST`, `PATCH /:id`
- `GET /api/qms/inspection/plans`, `GET /:id`, `POST`, `PATCH /:id`, `POST /:id/release`
- `GET /api/qms/inspection/plans/:id/characteristics`, `POST`, `PATCH /:characteristicId`
- `GET /api/qms/inspection/results` (filterable: `status=pending|finalized`, `work_order_id`,
  `item_revision_id`, `work_center_id`, date range)
- `GET /api/qms/inspection/results/:id`
- `POST /api/qms/inspection/results/:id/record` — submits the characteristic-level details, server
  recomputes `OverallResult`, transitions the result from draft to finalized. This is the endpoint
  `QC_TECHNICIAN` calls from the console.

Release validation checklist for `POST /:id/release` on a Plan (mirrors the style of every other release
checklist in this repo — return **all** errors, not just the first):
1. Plan has at least one characteristic line.
2. Every `Variable` characteristic has a UOM and, if both bounds given, `SpecMin <= SpecMax`.
3. Referenced Item Revision is released/effective (per §1.4's lookup).
4. Referenced Operation exists, is active, and is `OperationType: Inspection`.
5. No other `Released` plan currently effective for the same `[ItemRevisionID + OperationID + SiteID]`.

### 1.7 Events published

- `QMS.Inspection.InspectionPlanReleased.v1`
- `QMS.Inspection.InspectionResultRecorded.v1` — published on every finalized result (pass or fail)
- `QMS.Inspection.InspectionFailed.v1` — published additionally, only when `OverallResult = Fail`; payload
  must carry enough context (`WorkOrderID`, `WorkCenterID`, `ItemRevisionID`, `LotOrLabelRef`, `ResultID`,
  failed characteristic/defect summary) for `qms-nonconformance-service` (Step 2) to raise an NCR without a
  synchronous callback. Design this payload carefully now — Step 2 will consume it as-is, and reshaping it
  later is exactly the kind of avoidable rework this repo's governance model exists to prevent.

No consumer for these events exists yet in MES (that wiring is Phase 4 cross-cluster work, explicitly
deferred per `AI_CONTEXT.md` §19) — publish them anyway, correctly, now.

### 1.8 Definition of Done — Step 1

- [ ] Bounded Context Canvas written before code.
- [ ] Migrations, outbox, LocalizedText fields, service manifest match `wms-master-data-service` conventions.
- [ ] Plan release checklist enforced, returns all errors at once.
- [ ] `OperationFinished` consumption creates idempotent draft results only for Inspection-type operations,
      never hardcoding `OP-QC`.
- [ ] `POST /:id/record` recomputes `OverallResult` server-side and enforces the mandatory-characteristic
      rule.
- [ ] `InspectionFailed` payload shape is finalized and documented in the canvas/implementation trace, since
      Step 2 depends on it verbatim.
- [ ] Kong route added with native JWT verification, `401` on missing token verified.
- [ ] `docker-compose.qms.yml` created and wired into the root compose include.
- [ ] `AI_CONTEXT.md` updated (ports, services, tech stack, executive summary, PROJECT_WORKLOAD_PROGRESS
      split into 12a/12b/12c).
- [ ] `implementation/phase-3-1-qms-inspection-service.md` written.

---

## STEP 2 — `qms-nonconformance-service` (build only when Step 1 is done and this step is requested)

### 2.1 Purpose
Owns NCR (Nonconformance Report) and CAPA (Corrective and Preventive Action) case management, primarily
triggered by `QMS.Inspection.InspectionFailed.v1`, with support for manually-raised NCRs (e.g. a warehouse
staff member finding a defect outside a formal inspection point — don't force every NCR to require an
upstream inspection failure).

### 2.2 Service identity
| Property | Value |
|---|---|
| Service name | `qms-nonconformance-service` |
| Stack | Node.js/TypeScript/Express/Drizzle/PostgreSQL/KafkaJS — same as Step 1 |
| Direct port | Host `13120` → internal `3120` |
| Kong route | `/api/qms/nonconformance` |
| Database | `qms_nonconformance_db`, host port `15443` |

### 2.3 Data model (design at build time, but scope is fixed here)
- `qms_ncr` (header): NCR code/number (via a numbering rule — reuse the same atomic-sequence pattern MES
  traceability uses for lot/label numbering, don't invent a second numbering mechanism), source
  (`InspectionFailure` | `Manual`), linked `ResultID` (nullable), item/lot/WO references, severity, status
  (`Open`, `UnderReview`, `CAPARequired`, `Closed`), raised-by, raised-at.
- `qms_ncr_disposition`: containment/disposition decision (`UseAsIs`, `Rework`, `Scrap`, `ReturnToSupplier`),
  approver, decided-at — this is what eventually needs to feed back into MES/WMS hold decisions in Phase 4.
- `qms_capa`: corrective/preventive action case, linked to one or more NCRs, root cause, action plan, owner,
  due date, status (`Open`, `InProgress`, `Verified`, `Closed`).

### 2.4 Event consumption
- Consume `QMS.Inspection.InspectionFailed.v1` → auto-create a `Draft`/`Open` NCR, idempotent on the
  upstream `ResultID` (same idempotency discipline as §1.5).

### 2.5 Events published
- `QMS.Nonconformance.NCRRaised.v1`
- `QMS.Nonconformance.NCRDispositioned.v1`
- `QMS.Nonconformance.CAPAClosed.v1`

These are the events Phase 4 will eventually wire MES/WMS to consume for hold/release decisions — get the
payload shape right the first time, same discipline as §1.7.

### 2.6 Definition of Done — Step 2
Same shape as §1.8, adapted to this service: canvas written first, auto-NCR-from-failed-inspection is
idempotent, numbering rule reused/consistent with the traceability service's atomic-sequence pattern, Kong
route + compose wiring + `AI_CONTEXT.md` update + implementation trace written.

---

## STEP 3 — `qms-console` (build only when Steps 1 and 2 are done and this step is requested)

### 3.1 Ground rule
**Do not re-derive the entire console specification from scratch.** A fully detailed UI specification
already exists for this exact class of problem in this repository at
`PHASE-2-STEP-3-WMS-CONSOLE-PROMPT.md` (the WMS Console prompt) — read it in full and reuse, verbatim where
applicable: the stack decision (React + Vite, not Remix — same reasoning applies here, and
`process/TECH-STACK-DECISION.md` §5 already prescribes the same Console pattern for QMS), the exact package
list (§2 of that document), the theme tokens (§3), the modal-vs-drawer-vs-page rules, loading/empty/error
state conventions, data-fetching pattern, and Definition-of-Done shape. Copying `services/wms-console/`'s
actual resulting source structure is the fastest, most consistent way to build this — treat it as the
reference implementation the same way `mes-console` was the reference for `wms-console`.

### 3.2 Service identity
| Property | Value |
|---|---|
| Service name | `qms-console` |
| Direct port | Host `13130` → internal `80` |
| Auth | Keycloak `qms-client`. **Before building, fix the client's redirect URL in Keycloak/realm-export from
  the current placeholder `http://100.68.50.41:4002` to `http://100.68.50.41:13130`** — this is a
  pre-existing inconsistency in `AI_CONTEXT.md` §9's OIDC client table (the same class of drift the
  `wms-client` row likely also has, given it still lists `http://100.68.50.41:4001` despite `wms-console`
  actually running on `13091` — flag that WMS discrepancy in your implementation trace too, even though
  fixing it is optional/out-of-scope for this QMS task; don't silently ignore a bug you noticed just because
  it's in someone else's service). |

### 3.3 QMS-specific screens (everything else — app shell, command palette, i18n, RBAC gating, pessimistic
UX, 503/breaker handling, table/dialog/drawer conventions — follow §3–§14 of the WMS Console prompt exactly,
substituting domain nouns):

- `/dashboard` — open NCRs by severity, pending inspections count, overdue CAPAs, recent
  `InspectionFailed` feed.
- `/inspection/plans`, `/inspection/plans/:id` — plan CRUD + characteristic line management (Dialog for
  simple fields, nested table for characteristics under the detail Tabs, same pattern as
  Warehouse→Zone→Location nesting in the WMS console).
- `/inspection/defect-codes` — flat list + Dialog CRUD.
- `/inspection/results` — **this is the QC_TECHNICIAN's primary work queue**: filter by `status=pending`
  by default, click a pending result → a focused recording view (full page, not a modal — this is a
  meaningful multi-characteristic data-entry task, same class of complexity as the WMS Create Receipt
  wizard) where the inspector enters `MeasuredValue`/`ResultFlag`/`DefectCode` per characteristic and
  submits via `POST /:id/record`, pessimistic per the established rule.
- `/nonconformance/ncr`, `/nonconformance/ncr/:id` — list + detail with disposition action (Dialog with
  `AlertDialog` confirmation, since dispositioning has real consequences).
- `/nonconformance/capa`, `/nonconformance/capa/:id` — list + detail with status progression actions.

### 3.4 Definition of Done — Step 3
Reuse the WMS Console prompt's Definition of Done checklist (§15 there) verbatim, substituted for QMS
screens/routes, plus: a `QC_TECHNICIAN` test user can, through the UI alone, open a pending inspection
result created from a real `OperationFinished` event, record characteristic results, submit, see the
correct `OverallResult`, and — if it fails — see the resulting NCR appear in `/nonconformance/ncr` without
any manual API call. This is the Phase-3 equivalent of the three-flow acceptance bar the WMS Console prompt
set for itself, and the same "Console/UI Readiness Check" governance rule applies: don't mark Phase 3
Completed in `PROJECT_WORKLOAD_PROGRESS.md` until this flow works end-to-end through the UI.

---

## Phase 4 preview (do not build yet — context only, so Phase 3 design choices don't foreclose it)

Per `AI_CONTEXT.md` §19, Phase 4 is cross-cluster saga integration, load/security/chaos hardening. The
concrete first saga this unlocks: MES `WOCompleted`/`OperationFinished` at `OP-QC` → QMS inspection → on
`InspectionFailed`, MES/WMS should be able to **hold** the affected lot/WO rather than letting it proceed
automatically. Building Steps 1–2 above with correct, complete event payloads now (§1.7, §2.5) is what makes
that Phase 4 work a matter of adding new consumers, not redesigning QMS's events after the fact — keep that
in mind as the reason several "get this right the first time" notes appear above.