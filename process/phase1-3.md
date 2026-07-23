# PROMPT — Phase 1, Step 3 (Stage A): Build `mes-execution-service` — WO Planning & Creation — [Completed ✅]

> Current-state note added by documentation audit on 2026-07-22: this is a historical Stage A prompt.
> Its "stock_check_status is inert" language was correct before WMS existed. Phase 2 Step 2 now
> implements WMS material staging through `POST /api/mes/execution/work-orders/{id}/stage-materials`;
> `stock_check_status` is now `NotChecked | Staged | Shortage` and `stock_check_detail` stores the WMS
> result. See `implementation/phase-2-2-wms-inventory-stock.md`.

### (v3 — Go implementation. Supersedes the Node/TypeScript v2 prompt entirely, following the
###  Node-vs-Go tech stack decision: this service owns both low-frequency WO approval (Stage A)
###  and high-throughput, CPU-bound real-time execution (Stage B) in the same bounded context,
###  so the language is chosen for the heaviest workload the service will ever carry, not for
###  the first feature built. See `TECH_STACK_DECISION.md` §3 for the full reasoning.)

---

## 0. READ THIS FIRST — How to work through this prompt (reasoning guardrails)

You are building one microservice inside an already-running platform. `mes-master-data-service`
(Node/TypeScript) and the Phase 0 platform already exist. **This is the first Go service in the
system** — there is no existing Go service to copy code from, only patterns to copy at the right level
of abstraction. Follow these rules strictly:

1. **Work in the exact section order below (1 → 8). Do not reorder, do not start a later section before
   finishing and verifying the previous one.**
2. **Copy patterns at the right level.** Two different things are being copied from `mes-master-data-service`,
   and confusing them causes rework:
   - **Language-agnostic patterns — copy exactly as-is**: DB schema conventions (`row_version`, audit
     trigger, no `DELETE` grant), event envelope shape, event naming convention, Kong route mounting
     style, `service.manifest.yaml` format, the outbox-table-plus-relay-worker *concept*.
   - **Node-specific implementation details — do NOT copy, re-implement idiomatically in Go per §2.5**:
     Express routing style, Drizzle query syntax, `kafkajs` usage, `instrumentation.ts` internals.
   If you find yourself translating TypeScript code line-by-line into Go, stop — write idiomatic Go
   instead.
3. **Do not over-abstract.** Go idiom is "accept interfaces, return structs" — define an interface only
   at a genuine seam (e.g. a repository interface so a use case can be unit-tested against a fake), never
   as a reflex for every struct. If you're defining an interface with exactly one implementation and no
   test double planned for it, that's over-engineering — use the concrete type.
4. **Build only what is in scope.** If functionality belongs to a service that doesn't exist yet (see §6
   "Explicitly Out of Scope"), do not create an interface, port, adapter, mock, stub, or placeholder for
   it — not even a "temporary" one.
5. **When something is ambiguous, pick the simplest option consistent with the existing Node services'
   business logic (not their Node-specific code) and the Go conventions in §2.5, note the assumption in
   one line, and continue.** Do not enumerate edge cases outside §4's checklist.
6. **Verify before moving on.** After each of §4's use cases and after §5 (API), run
   `go build ./... && go vet ./... && go test ./...` before continuing. Do not accumulate unverified code
   across multiple use cases.
7. If you reach a point where the correct action seems to require touching `mes_master_data_db` directly,
   bypassing the read-model, or calling another service synchronously outside the two explicitly allowed
   call sites in §2 — **stop and flag it**. That is a hard architectural boundary, not a convenience
   trade-off, and it applies identically regardless of language.

---

## 1. Context and blocking prerequisite (read first, verify before writing any service code)

- Phase 0 platform (Kafka KRaft + Schema Registry, Keycloak SSO, Kong Gateway, Observability stack,
  `hello-world-service` scaffold) is complete. Reuse exactly as-is — none of it changes for a Go service.
- `mes-master-data-service` is complete and verified (Node/TypeScript): 26 `md_*` tables, Release-time
  Validation Engine, 7 event types published to Kafka with schemas registered, Kong route
  `/api/mes/master-data/*` live. Treat it as the source of the **business/data patterns**, not the
  **code patterns** (see §0.2).
- **Blocking prerequisite — check this before writing any application code:**
  `libs/shared-kernel-go` must exist, providing a Go equivalent of the Node `libs/shared-kernel` package:
  - An `EventEnvelope[T]` generic struct (or an equivalent typed envelope) matching the same JSON shape
    already used by Node services: `event_id`, `event_type`, `occurred_at`, `source_service`, `trace_id`,
    `payload`.
  - An `OutboxRelayWorker` equivalent: polls an `outbox_events` table with `SELECT ... FOR UPDATE SKIP
    LOCKED`, publishes to Kafka via `confluent-kafka-go`, marks rows published — same mechanism as the
    Node `OutboxRelayWorker`, re-implemented in Go.
  - `audit-trigger.sql` and `lifecycle-state-machine.sql` are **reused unmodified** — they run at the
    Postgres level and are already language-agnostic. Do not rewrite them.
  If `libs/shared-kernel-go` does not exist yet, **stop and build it first** as a separate, small task
  before continuing with this service. Do not inline a one-off outbox implementation inside
  `mes-execution-service` "for now" — that violates the same "no copy-paste between services" principle
  the Node side already follows.
- Sequencing note: this service is Phase 1 Step 3, built after `mes-traceability-service` (Step 2, also
  a Go service per the same tech-stack decision — see the Go conventions in §2.5, which apply to it too).
- Scope of this task: **Stage A only** — WO (Production Order) planning, creation, and approval. Matches
  the 6-step business diagram: Xác định nhu cầu sản xuất → Kiểm tra Master Data → Tạo Lệnh sản xuất →
  Hệ thống tính toán và kiểm tra → Duyệt Lệnh sản xuất → Lệnh sản xuất đã tạo.
- **Stage B (a separate, later prompt, not this one)**: kiosk Start/Finish execution, backflush material
  consumption, QR mother-child scanning at `OP-CUT`. This is the workload that justified choosing Go for
  this service in the first place — Stage A does not need to implement any of it, but the Go foundation
  built now must not need a rewrite when Stage B arrives.

---

## 2. Architectural rule this service must follow strictly (language-agnostic, unchanged from v2)

`mes-execution-service` **must never query `mes_master_data_db` directly.** It maintains its own local
read-model, kept eventually consistent by consuming the 7 events `mes-master-data-service` already
publishes:

```
MES.MasterData.ItemRevisionReleased.v1
MES.MasterData.MBOMReleased.v1
MES.MasterData.RoutingReleased.v1
MES.MasterData.ProductionVersionReleased.v1
MES.MasterData.ProductionStandardReleased.v1
MES.MasterData.WorkCenterActivated.v1
MES.MasterData.EquipmentActivated.v1
```

Build a Kafka consumer (`internal/infrastructure/events/masterdata_consumer.go`) that upserts into local
`rm_*` tables (owned only by this service, rebuildable from the event stream, never written by any other
path): `rm_item_revision`, `rm_mbom_header`, `rm_mbom_line`, `rm_routing_header`, `rm_routing_operation`,
`rm_production_version`, `rm_production_standard`, `rm_work_center`, `rm_equipment`,
`rm_resource_capability`, `rm_resource_calendar`.

Project only the fields this service actually needs (deliberate minimal projection — Anti-Corruption
Layer). Do not mirror every source column "just in case."

**The only two allowed synchronous cross-service calls**, both circuit-breaker-guarded (use `sony/gobreaker`
or equivalent — pick one, do not write a custom circuit breaker), both happening at the Approval gate
(diagram step 5) and nowhere else:
1. `GET /api/mes/master-data/production-versions/:id` — re-confirm the Production Version is still
   `Released` and effective, immediately before approval.
2. A role/permission check against `mes-master-data-service`'s permission model
   (`md_role_permission`/`md_user_resource_scope`).

These may be one combined call or two — developer's choice — but no other synchronous cross-service call
is permitted anywhere else in this service.

### 2.5 Go stack and project layout for this service (new — applies to this service and to `mes-traceability-service`)

| Concern | Choice | Notes |
|---|---|---|
| HTTP router | **`go-chi/chi`** | Idiomatic `net/http`-based, middleware chain reads Kong-forwarded headers (`X-User-ID`, `X-Role-Code`, `X-Trace-ID`) directly off `*http.Request` |
| DB access | **`sqlc`** generating typed Go from raw SQL, on top of **`pgx`/`pgxpool`** | Write real SQL in `internal/infrastructure/db/queries/*.sql`, `sqlc generate` produces typed Go functions. Do not introduce an ORM (no GORM/ent) — keep the same "SQL-first, type-safe" philosophy the Node side has with Drizzle |
| Connection pooling | **`pgxpool`** (built into pgx) | Sufficient at this stage; do not add PgBouncer unless load testing later shows pool exhaustion across multiple app instances |
| Migrations | **Plain `.sql` files**, run via `golang-migrate` | Same migration file format/convention as the Node services use (plain SQL) — only the runner tool differs. This keeps migrations portable and reviewable regardless of which language owns the service |
| Kafka client | **`confluentinc/confluent-kafka-go`** | Matches the Confluent Schema Registry already in use; do not use `segmentio/kafka-go` for this service |
| OpenTelemetry | **`go.opentelemetry.io/otel`** official SDK, exporting to the same OTel Collector | `internal/instrumentation/instrumentation.go` is the Go equivalent of `instrumentation.ts` — same collector endpoint, same trace/metric conventions |
| Circuit breaker | **`sony/gobreaker`** (or equivalent single well-known library) | Used only at the two Approval-gate calls in §2 |

Project layout (Go-idiomatic equivalent of the Node scaffolding template — same layered responsibilities,
Go conventions for folder names):

```
mes-execution-service/
├── cmd/server/main.go
├── internal/
│   ├── domain/              # entities, value objects, domain events — no framework deps
│   ├── application/
│   │   └── usecase/         # one file per use case, per §4
│   ├── infrastructure/
│   │   ├── db/               # sqlc-generated code + repository implementations
│   │   ├── outbox/            # uses libs/shared-kernel-go's OutboxRelayWorker
│   │   ├── events/             # masterdata_consumer.go
│   │   └── http/                # chi handlers/routes
│   └── instrumentation/instrumentation.go
├── migrations/                # plain .sql files, golang-migrate
├── test/
│   ├── unit/
│   ├── integration/
│   └── contract/               # contract tests for published/consumed events
├── Dockerfile                  # multi-stage build → static binary, minimal final image
├── docker-compose.override.yml
├── go.mod / go.sum
└── service.manifest.yaml
```
`internal/` is used deliberately (Go compiler-enforced package privacy) in place of `src/` — this is the
idiomatic Go equivalent of "don't let other services import your internals," not a deviation from the
scaffolding principle.

---

## 3. Data model — new tables owned by `mes-execution-service` (schema unchanged from v2 — SQL is language-agnostic)

Standard cross-cutting treatment on every table (same as `mes-master-data-service`): `row_version`, audit
trigger via `audit-trigger.sql`, no `DELETE` grant. Written as plain SQL migration files per §2.5.

WO Status enum: `Draft | PendingApproval | Approved | Released | InProgress | Completed | Closed | Cancelled`

### `wo_header`
- `wo_id uuid pk`, `wo_code varchar(50) unique not null` (simple per-Site local sequence — do not reuse
  `mes-traceability-service`'s numbering rule engine, that's a different bounded context)
- `production_version_id uuid not null` — snapshot reference, not a live FK (cross-service)
- `item_revision_id uuid not null`, `item_code varchar(50) not null`, `item_name varchar(200) not null`
- `quantity decimal(18,3) not null check (quantity > 0)`, `uom_id uuid not null`
- `site_id uuid not null`, `shift_id uuid`
- `planned_start_at timestamptz not null`, `planned_end_at timestamptz not null` (computed, see §4)
- `status wo_status not null default 'Draft'`
- `attached_document_refs jsonb`
- `created_by uuid not null`, `created_at timestamptz not null default now()`
- `approved_by uuid`, `approved_at timestamptz`
- `row_version integer not null default 1`

### `wo_operation` (exploded from Routing at creation time — immutable snapshot)
- `wo_operation_id uuid pk`, `wo_id uuid fk → wo_header`
- `sequence_no integer not null`, `operation_id uuid not null`, `operation_code varchar(30) not null`
- `work_center_id uuid not null`, `equipment_id uuid` (nullable)
- `predecessor_seq varchar(100)`
- `standard_setup_time_min decimal(12,3)`, `standard_cycle_time_sec decimal(12,3)`,
  `standard_efficiency_factor decimal(7,4)` — snapshot from `rm_production_standard` at creation time
- `planned_start_at timestamptz`, `planned_end_at timestamptz` (computed per operation)
- `status varchar(20) not null default 'Pending'` (`Pending | Ready | InProgress | Completed | Skipped`
  — Stage A only ever creates rows as `Pending`)
- `row_version integer not null default 1`

### `wo_material_requirement` (MBOM explosion result)
- `requirement_id uuid pk`, `wo_id uuid fk → wo_header`
- `component_item_revision_id uuid not null`, `component_item_code varchar(50) not null`
- `required_qty decimal(18,6) not null` = `wo.quantity × mbom_line.quantity_per × (1 + mbom_line.scrap_rate)`
- `uom_id uuid not null`
- `issue_operation_id uuid`
- `backflush_flag boolean not null`
- `phantom_flag boolean not null`
- `stock_check_status varchar(20) not null default 'NotChecked'` — **inert placeholder column only.**
  See §6.

### `wo_approval_log`
- `log_id uuid pk`, `wo_id uuid fk`, `action varchar(20)` (`Submitted | Approved | Rejected`),
  `actor_user_id uuid`, `actor_role_code varchar(50)`, `comment text`,
  `occurred_at timestamptz not null default now()`

---

## 4. Domain logic — implement exactly these 6 use cases, in this order

Location: `internal/application/usecase/`. One file per use case, exported as a plain Go function or a
small struct with a single method — whichever is simpler for that use case; do not force every use case
into a `XxxUseCase` interface (see §0.3).

1. **`DetermineDemand`** (diagram step 1) — thin. Accepts Item, target quantity, target completion date.
   No computation — captures intent as a draft.

2. **`CheckMasterDataReadiness`** (diagram step 2) — validates against the local read-model only: does an
   effective, Released `rm_production_version` exist for the chosen Item at this Site, resolving to a
   Released MBOM and Routing? If any prerequisite is missing, **return a complete list of every missing
   prerequisite in one error/result value** (never just the first failure). Model this as a typed result
   (e.g. `type ReadinessResult struct { Ready bool; MissingPrerequisites []string }`), not a bare error.

3. **`CreateWorkOrder`** (diagram step 3) — single DB transaction (`pgx.Tx`). Creates `wo_header`
   (`Draft`), explodes `rm_mbom_line` into `wo_material_requirement` (scrap-rate formula, phantom lines'
   children explode through them, no separate WO line for the phantom node itself), explodes
   `rm_routing_operation` into `wo_operation` with snapshot standard values, attaches
   `md_work_instruction` references found in the read-model.

4. **`ComputeAndCheck`** (diagram step 4) — four independent, individually-testable checks, aggregated
   into **one** result struct:
   - **Time calculation**: sum `(setup_time_min + cycle_time_sec/60 × quantity/efficiency_factor)`
     across `wo_operation` rows in Routing sequence order, honoring `predecessor_seq` for parallel
     branches, producing `planned_start_at`/`planned_end_at` per operation and for the overall header.
     *(This is the CPU-bound part that motivated choosing Go for this service — implement it as a plain,
     testable function over an in-memory slice of operations, not as N+1 DB round trips.)*
   - **Capacity check**: query `rm_resource_capability`/`rm_resource_calendar` to flag if requested
     quantity/date falls outside `MinLotSize`/`MaxLotSize` or available calendar minutes. **Advisory
     only — warn, never hard-block.**
   - **Stock check: not part of this use case.** See §6 — do nothing here, populate nothing, call
     nothing.
   - **Validation summary**: aggregate time + capacity results into the one result struct returned to
     the caller before approval.

5. **`ApproveWorkOrder`** (diagram step 5) — requires the two synchronous calls to
   `mes-master-data-service` described in §2 (freshness re-check + permission check), both through
   `gobreaker`. On approval success: `status → Approved` then immediately `→ Released`, write
   `wo_approval_log`, publish `MES.Execution.WOCreated.v1` and `MES.Execution.WOApproved.v1` via the
   outbox in the same transaction as the status update. On rejection: `status → Cancelled` or back to
   `Draft` (explicit `action` parameter selects which), log the rejection with comment.

6. **Diagram step 6** — no new logic. Expose the persisted `wo_header` via
   `GET /api/mes/execution/work-orders/:id`, returning header + operations + material requirements +
   approval log in one response (one struct, one JSON encode — do not compose it from multiple partial
   handlers).

---

## 5. REST API

Mount under Kong's existing `/api/mes/*` route, sub-path `/api/mes/execution/*` — add the route to
`infra/kong/kong.yml`, matching the `/api/mes/master-data/*` convention exactly. Implement with `chi`
routes calling into the use cases from §4.

| Endpoint | Purpose |
|---|---|
| `POST /work-orders` | steps 1–3 combined → returns Draft WO |
| `POST /work-orders/:id/compute-check` | step 4 |
| `POST /work-orders/:id/approve` | step 5 (approve path) |
| `POST /work-orders/:id/reject` | step 5 (reject path) |
| `GET /work-orders/:id` | step 6 |
| `GET /work-orders` | list/filter |

Read `X-User-ID` / `X-Role-Code` / `X-Trace-ID` from Kong-forwarded headers via a small `chi` middleware.
No local JWT verification — identical pattern to `mes-master-data-service`.

---

## 6. Explicitly Out of Scope (unchanged — language-independent decision)

Stock availability checking (diagram step 4's "Kiểm tra tồn kho nguyên liệu") is **entirely out of scope**
for this task, with no exception:

- `wms-inventory-service` does not exist yet (Phase 2).
- **Do not build a Port/Adapter abstraction, interface, mock, stub, or NoOp implementation for it.** That
  is speculative design against a contract that doesn't exist yet.
- `ComputeAndCheck`'s result struct simply does not include a stock field.
- `wo_material_requirement.stock_check_status` stays a dormant column, always `'NotChecked'`, written
  once at row creation and never updated by this service.
- When `wms-inventory-service` is built in Phase 2 (also a Go service, per the tech-stack decision, since
  it owns the append-only inventory ledger), real stock checking will be added as a dedicated follow-up
  task against the real contract — not designed now.

**Acceptance check for `ComputeAndCheck`**: the result struct contains time-calculation and
capacity-check fields only, and contains no stock-related field of any kind.

---

## 7. Event Publishing, OTel, Docker, service.manifest.yaml

Events:
```
MES.Execution.WOCreated.v1   — published when wo_header first persisted (Draft)
MES.Execution.WOApproved.v1  — published when approval gate passes and status → Released
```
Register both schemas in Schema Registry on startup, same pattern as `mes-master-data-service`.
`WOApproved` payload: `wo_id`, `wo_code`, `item_revision_id`, `quantity`, `planned_start_at`,
`planned_end_at`, `material_requirements` (array of `{component_item_revision_id, required_qty, uom_id}`)
— shaped for future consumers (`wms-outbound-service`, `mes-traceability-service`,
`mes-kiosk-gateway-service`) even though they don't exist yet. Do not build those consumers now.

Use `internal/instrumentation/instrumentation.go` (Go OTel SDK, same collector endpoint as Node
services). Own Postgres DB: `mes_execution_db`. Add to `docker-compose.mes.yml` alongside
`mes-master-data-db`/`mes-master-data-service`. `Dockerfile` should be a multi-stage build producing a
small static binary — no need to ship a Go toolchain or `node_modules`-equivalent in the final image.

```yaml
service: mes-execution-service
cluster: MES
language: go
owns_database: mes_execution_db
publishes_events:
  - MES.Execution.WOCreated.v1
  - MES.Execution.WOApproved.v1
consumes_events:
  - MES.MasterData.ItemRevisionReleased.v1
  - MES.MasterData.MBOMReleased.v1
  - MES.MasterData.RoutingReleased.v1
  - MES.MasterData.ProductionVersionReleased.v1
  - MES.MasterData.ProductionStandardReleased.v1
  - MES.MasterData.WorkCenterActivated.v1
  - MES.MasterData.EquipmentActivated.v1
notes:
  - "Stage A scope only: WO planning/creation/approval. Kiosk Start/Finish, backflush, and QR
     mother-child scanning at OP-CUT are Stage B, deferred until mes-traceability-service exists."
  - "Built in Go per the Node-vs-Go tech stack decision: this service owns both low-frequency Stage A
     approval flows and high-throughput, CPU-bound Stage B real-time execution in the same bounded
     context, so the language was chosen for the heaviest workload up front rather than migrated later."
  - "Stock availability checking is fully excluded from Stage A — wms-inventory-service does not exist
     yet (Phase 2). No port/adapter/mock/NoOp was built for it. wo_material_requirement.stock_check_status
     stays 'NotChecked' until Phase 2 delivers a real WMS integration."
  - "Two deliberate synchronous calls to mes-master-data-service exist at the Approval gate (version
     freshness re-check + role/permission check), both circuit-breaker guarded via gobreaker. This is an
     intentional exception to the default event-driven/local-read-model pattern, not a precedent."
  - "Depends on libs/shared-kernel-go for EventEnvelope and OutboxRelayWorker. audit-trigger.sql and
     lifecycle-state-machine.sql are reused unmodified from the Node shared-kernel (DB-level, language
     agnostic)."
```

---

## 8. Seed / Test Scenario & Definition of Done

Reuse the `FG-WS-CM01` Production Version already seeded in `mes-master-data-service`. After the
master-data event consumer syncs the local read-model, create a WO for `FG-WS-CM01`, quantity `500 PCS`.
Verify:
- `wo_material_requirement` explodes all 5 MBOM lines correctly, including the phantom
  `SFG-ROLL-EPDM-R1` line contributing to `SFG-RUB-CM01-R1`'s cut requirement.
- `wo_operation` rows created for all 6 routing operations (`OP-MIX` through `OP-QC`) with snapshot
  standard times.
- `ComputeAndCheck` returns a complete result containing time-calculation and capacity-check output
  only — no stock-related field of any kind.
- Approval by a user with `EXECUTIVE` or `PLANT_MANAGER` role succeeds, publishing both events,
  verifiable via `kafka-console-consumer`.

**Definition of Done:**
- `docker compose -f docker-compose.platform.yml -f docker-compose.mes.yml up` brings up
  `mes-execution-service` healthy alongside the two already-running MES services.
- `go build ./... && go vet ./... && go test ./...` passes with zero errors before this task is
  considered complete.
- Local read-model tables populate correctly after `mes-master-data-service` publishes Release events.
- Full WO creation → compute/check → approve flow for `FG-WS-CM01` × 500 PCS succeeds end-to-end via the
  REST API.
- Both `MES.Execution.WOCreated.v1` and `MES.Execution.WOApproved.v1` observed in Kafka with schemas
  registered.
- A WO creation attempt against an Item with no Released Production Version fails with a complete list
  of every missing prerequisite.
- Trace for the full create→compute→approve round trip visible end-to-end in Grafana Tempo, including
  the two synchronous cross-service calls at the approval gate as child spans.
- **No file, interface, or table references WMS, stock, or inventory beyond the single inert
  `stock_check_status` column.** Grep for `wms|inventory|stock` (case-insensitive) outside that one
  column name and this document should turn up nothing.
- No package in the codebase imports a Node/TypeScript pattern verbatim (e.g. no Express-style
  middleware signatures ported into Go, no Drizzle query builder chains translated line-by-line) — the
  implementation should read as idiomatic Go throughout.
