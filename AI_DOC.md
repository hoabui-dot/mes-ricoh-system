# AI_DOC.md — AI Knowledge Base for MOM Platform

Last analyzed: 2026-07-21  
Repository: `/home/neurosus/mes-system`

This document is the working context for future AI agents. It is based on the current source code plus the `process/` documents. Do not treat planned Phase 1+ features as implemented unless the code exists.

## 1. Project overview

This repository is the foundation of the Won Seal Tech MOM Platform: MES, WMS, and QMS implemented as separate clusters on top of shared platform infrastructure.

Current implemented state:

- Phase 0 platform foundation exists and is fully verified.
- Phase 1 Step 1 `mes-master-data-service` is fully implemented and verified (26 Drizzle tables, Validation Engine, Outbox Relay, Schema Registry auto-registration, Kong routing).
- Phase 1 Step 2 `mes-traceability-service` is fully implemented and verified (Go 1.22, 9 Postgres tables, Atomic Numbering, Idempotent Parent-Child QR Split Engine, Outbox Relay, Lineage Genealogy Graph, Schema Registry auto-registration, Kong routing).
- Phase 1 Step 3 `mes-execution-service` (Stage A) is fully implemented and verified (Go 1.22, WO Header/Operations/Materials, DetermineDemand, CheckMasterDataReadiness, CreateWorkOrder, ComputeAndCheck, ApproveWorkOrder).
- `hello-world-service` exists as a scaffolding validator.
- Unified Portal exists as a React app using Keycloak SSO.
- Shared Kernel (`libs/shared-kernel` in TS, `libs/shared-kernel-go` in Go) exists for event envelopes, outbox publishing, audit SQL, and lifecycle SQL helpers.
- `implementation/` directory holds step-by-step trace records for Phase 0 and Phase 1.

Primary business domain:

- Manufacturing operations for Won Seal Tech.
- Target modules are MES production execution, WMS inventory/warehouse, and QMS inspection/nonconformance.
- `product-doc.md` and `process/phase-1.md` describe expected MES master-data domain work, which is now complete for `mes-master-data-service`.

Primary users from Keycloak seed data and portal configuration:

- `EXECUTIVE`: sees MES, WMS, QMS.
- `PLANT_MANAGER`: sees MES, WMS.
- `OPERATOR`: sees MES.
- `QC_TECHNICIAN`: sees MES, QMS.
- `WAREHOUSE_STAFF`: sees WMS.

Design philosophy:

- Platform-first architecture.
- One service owns one database.
- No shared database between services.
- Cross-service communication should use event contracts or explicit APIs.
- Shared Kernel must contain infrastructure primitives only, not domain logic.
- Services should trust user context forwarded by the gateway headers, not implement independent authentication logic.

Important current technologies:

- Node.js 20+, TypeScript, npm workspaces.
- React 18 + Vite for the portal.
- Express for service HTTP APIs.
- PostgreSQL per service.
- Kafka + Confluent Schema Registry.
- Kong Gateway.
- Keycloak.
- OpenTelemetry Collector, Tempo, Loki, Prometheus, Grafana.
- KafkaJS, `pg`, Vitest, tsup.

## 2. Architecture

Current runtime architecture:

```mermaid
flowchart TD
  User[Browser User] --> Portal[Unified Portal<br/>React + Keycloak JS]
  Portal --> Keycloak[Keycloak Realm<br/>wonsealtech]
  User --> Kong[Kong Gateway<br/>localhost:18000]
  Kong --> Hello[hello-world-service<br/>Express]
  Hello --> HelloDB[(hello_world_db<br/>Postgres)]
  Hello --> Outbox[(outbox_events table)]
  OutboxRelay[OutboxRelayWorker] --> Kafka[Kafka]
  Hello --> OTel[OpenTelemetry Collector]
  OTel --> Tempo[Tempo]
  OTel --> Prom[Prometheus]
  Grafana[Grafana] --> Tempo
  Grafana --> Prom
  KafkaUI[Kafka UI] --> Kafka
```

Planned architecture from `process/stragegy.md`:

```mermaid
flowchart TD
  Foundation[Platform Foundation<br/>IAM, Event Broker, Gateway, Observability, Shared Kernel]
  Foundation --> MES[MES Cluster]
  Foundation --> WMS[WMS Cluster]
  Foundation --> QMS[QMS Cluster]
  MES <--> WMS
  WMS <--> QMS
  MES <--> QMS
```

Implemented modules:

- `infra/`: Docker Compose platform infrastructure.
- `portal/`: Unified app launcher.
- `libs/shared-kernel/`: shared infrastructure package.
- `services/hello-world-service/`: service template validator.

Bounded contexts:

- Implemented: `Platform.Hello` test context only.
- Planned MES Phase 1:
  - `mes-master-data-service`
  - `mes-traceability-service`
  - `mes-execution-service`
  - `mes-kiosk-gateway-service`
- Planned WMS/QMS contexts are documented in `process/stragegy.md`, not implemented.

CQRS status:

- No implemented CQRS read/write split exists today.
- The strategy recommends local read models for services consuming events.

Event-driven components:

- `EventEnvelope<T>` defines the cross-service event shape.
- `writeToOutbox()` writes events into each service DB transaction.
- `OutboxRelayWorker` polls `outbox_events` and publishes to Kafka.
- `hello-world-service` publishes a hello event through the outbox.

Request lifecycle for `GET /api/hello`:

```mermaid
sequenceDiagram
  participant Client
  participant Kong
  participant Hello
  participant DB
  participant Relay as OutboxRelayWorker
  participant Kafka

  Client->>Kong: GET /api/hello
  Kong->>Hello: Forward request with X-User-ID, X-Role-Code, X-Trace-ID
  Hello->>DB: BEGIN
  Hello->>DB: set_config('app.current_user_id')
  Hello->>DB: INSERT greetings
  Hello->>DB: INSERT outbox_events
  Hello->>DB: COMMIT
  Hello-->>Client: JSON response + X-Trace-ID
  Relay->>DB: SELECT pending outbox events
  Relay->>Kafka: publish event
  Relay->>DB: mark PUBLISHED
```

Important mismatch to know:

- `process/phase-0.md` says Kong verifies JWT and extracts `UserID`/`RoleCode`.
- Current `infra/kong/kong.yml` does not actually verify Keycloak JWTs. It forwards existing `X-User-ID` / `X-Role-Code` if provided, otherwise defaults to `anonymous` / `OPERATOR`.
- The Kong file explicitly says real OIDC/JWKS handling is deferred to Phase 1.

## 3. Directory guide

`process/`

- Architecture and phase requirements.
- Read these before implementing any new service.
- `phase-1.md` is the main build prompt for `mes-master-data-service`.

`infra/`

- Local Docker Compose infrastructure.
- `docker-compose.platform.yml`: Kafka, Schema Registry, Kafka UI, Keycloak, Kong, OTel Collector, Tempo, Loki, Prometheus, Grafana.
- `docker-compose.yml`: includes platform compose and adds `hello-world-db`, `hello-world-service`, and `portal`.
- `kong/kong.yml`: DB-less Kong declarative config.
- `keycloak/realm-export.json`: Keycloak realm, clients, roles, seed users.
- `observability/`: OTel, Loki, Tempo, Prometheus, Grafana provisioning files.

`libs/shared-kernel/`

- Npm workspace package `@mom-platform/shared-kernel`.
- Allowed content: reusable infrastructure primitives.
- Forbidden content: MES/WMS/QMS business logic.
- Main source files:
  - `src/event-envelope.ts`
  - `src/outbox-publisher.ts`
  - `src/audit-trigger.sql`
  - `src/lifecycle-state-machine.sql`
  - `src/index.ts`

`services/hello-world-service/`

- Template/scaffolding validator.
- Shows expected service bootstrap, migration, HTTP route, outbox worker, OTel instrumentation, Dockerfile, and service manifest.
- Future services should follow its structure, but Phase 1 requires Drizzle for real domain services.

`portal/`

- React + Vite Unified Portal.
- Authenticates through Keycloak with PKCE.
- Reads realm roles from token and displays apps based on `portal/src/config/apps.ts`.

`product-doc.md`

- Business/product context for Won Seal Tech.
- Use as domain background only. Confirm implementation details against current code and process prompts.

`AI_DOC.md`

- This file. Keep it updated when architecture or implementation changes.

## 4. Domain model

Implemented domain models are minimal.

### EventEnvelope

Owner: `libs/shared-kernel`

Purpose:

- Standard wrapper for all cross-service events.

Fields:

- `event_id`: UUID v4 for uniqueness/idempotency.
- `event_type`: versioned event name.
- `occurred_at`: ISO timestamp.
- `source_service`: producer service name.
- `trace_id`: distributed trace ID.
- `payload`: domain-specific payload.

Invariant:

- Event type should follow `<Cluster>.<BoundedContext>.<EventName>.v<N>`.

### OutboxEvent

Owner: each service database; helper in `libs/shared-kernel`.

Purpose:

- Atomic event persistence before Kafka publish.

Statuses:

- `PENDING`
- `PUBLISHED`
- `FAILED`

Rules:

- Domain write and outbox insert must happen in the same DB transaction.
- Relay worker marks events as `PUBLISHED` only after Kafka send succeeds.
- Failed publish increments `retry_count`; after max retries status becomes `FAILED`.

### Greeting

Owner: `hello-world-service`.

Purpose:

- Test entity proving DB writes, audit context, outbox event publishing, and tracing.

Fields from migration:

- `id`
- `message`
- `user_id`
- `role_code`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

No production business meaning should be attached to this entity.

### Planned MES master-data domain

Not implemented yet. `process/phase-1.md` defines 26 target tables for `mes-master-data-service`:

- Foundation: `md_site`, `md_production_area`, `md_uom`, `md_uom_conversion`, `md_shift`, `md_reason_code`
- Product/MBOM: `md_item`, `md_item_revision`, `md_mbom_header`, `md_mbom_line`, `md_component_substitute`, `md_production_version`
- Process/Standards: `md_operation`, `md_routing_header`, `md_routing_operation`, `md_production_standard`, `md_work_instruction`
- Resource/Capability: `md_work_center`, `md_workstation`, `md_equipment`, `md_resource_assignment`, `md_resource_capability`, `md_resource_calendar`, `md_skill`, `md_operation_skill_requirement`
- Domain-scoped access: `md_role_permission`, `md_user_resource_scope`

Do not create traceability, kiosk, or execution tables inside `mes-master-data-service`.

## 5. Database

Implemented databases:

### `hello_world_db`

Container: `hello-world-db`  
Service owner: `hello-world-service`

Tables:

`greetings`

- Primary key: `id UUID`
- Stores a test greeting, user id, role code, timestamps, and audit columns.

`outbox_events`

- Created from `OUTBOX_TABLE_SQL`.
- Columns: `id`, `event_type`, `topic`, `payload`, `status`, `created_at`, `published_at`, `retry_count`, `error_message`.
- Index: `idx_outbox_events_status_created` on `(status, created_at)` where status is `PENDING`.

`schema_migrations`

- Tracks inline migrations by name.

Migration style today:

- `hello-world-service` uses a hand-written TypeScript migration runner with inline SQL.
- `process/phase-1.md` requires real MES services to use Drizzle ORM and `drizzle-kit`, with custom SQL only where Drizzle cannot express required trigger/function logic.

Audit handling:

- Shared Kernel provides `audit-trigger.sql`.
- `hello-world-service` currently duplicates an inline audit trigger function in `migrate.ts`.
- The `greetings` table defines audit columns, but the current migration does not attach the audit trigger to `greetings`.
- The route manually calls `set_config('app.current_user_id', userId, true)` before writing.

Optimistic locking:

- Not implemented in current code.
- Required for Phase 1 master-data tables via `row_version`.

Soft delete:

- Not implemented in current code.
- Phase 1 requires no hard deletes for MES master data.

Unknown / TODO investigation:

- No live DB schema verification was run as part of this document.
- Whether the current Docker stack is healthy must be checked with `npm run infra:ps` or Compose commands.

## 6. API reference

### `hello-world-service`

Base service port:

- Container/internal: `3010`
- Host direct: `http://localhost:13010`
- Gateway: `http://localhost:18000/api/hello`

`GET /health`

- Public direct service health endpoint.
- Response example:

```json
{ "status": "ok", "service": "hello-world-service", "uptime": 123.45 }
```

`GET /metrics`

- Returns minimal Prometheus text.
- Currently static placeholder metric output.

`GET /api/hello`

- Intended to be called through Kong.
- Reads:
  - `X-User-ID`
  - `X-Role-Code`
  - `X-Trace-ID`
- If headers are missing, service uses:
  - `user_id = anonymous`
  - `role_code = UNKNOWN`
  - `trace_id = current span trace ID`
- Writes a greeting row.
- Writes `Platform.Hello.HelloWorldCreated.v1` event to outbox topic `platform.hello.HelloWorldCreated.v1`.
- Returns:

```json
{
  "message": "Xin chào từ MOM Platform! User: ... | Role: ...",
  "greeting_id": "uuid",
  "user_id": "string",
  "role_code": "string",
  "trace_id": "string",
  "timestamp": "ISO-8601 string"
}
```

Common errors:

- Unhandled errors become `500` with `{ "error": "Internal Server Error", "message": "..." }`.
- Unknown routes return `404` with `{ "error": "Not Found" }`.

Authentication/authorization:

- Intended pattern: Kong validates token and forwards identity headers.
- Actual current Kong config does not enforce Keycloak JWT validation.

### Portal

The portal is a SPA, not a JSON API. It authenticates with Keycloak on load and displays role-filtered app cards.

## 7. Event flow

Implemented event:

- Event type in envelope: `Platform.Hello.HelloWorldCreated.v1`
- Kafka topic: `platform.hello.HelloWorldCreated.v1`
- Producer: `hello-world-service`
- Consumer: none implemented

Payload:

```json
{
  "greeting_id": "uuid",
  "message": "string",
  "requested_by_user_id": "string",
  "requested_by_role": "string"
}
```

Outbox lifecycle:

```mermaid
stateDiagram-v2
  [*] --> PENDING: writeToOutbox in DB transaction
  PENDING --> PUBLISHED: Kafka publish succeeds
  PENDING --> PENDING: publish fails and retry_count < maxRetries
  PENDING --> FAILED: publish fails and retry_count >= maxRetries
```

Retry policy:

- Default `OutboxRelayWorker.maxRetries = 3`.
- Default poll interval is `1000ms`.
- Default batch size is `50`.
- Kafka producer retry config uses `retries: 5`.

Dead-letter queue:

- Not implemented.
- Failed events remain in `outbox_events` with status `FAILED`.

Idempotency:

- `event_id` is globally unique and used as Kafka message key.
- Consumer idempotency is not implemented because there are no consumers yet.

Schema Registry:

- Infrastructure exists.
- Current hello event is not registered in Schema Registry by code.
- Phase 1 explicitly requires registering MES master-data event schemas.

## 8. Configuration

Root scripts in `package.json`:

- `npm run build:shared-kernel`
- `npm run dev:portal`
- `npm run dev:hello`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run infra:up`
- `npm run infra:down`
- `npm run infra:logs`
- `npm run infra:ps`

Important service environment variables:

`hello-world-service`

- `PORT`: defaults to `3010`.
- `DATABASE_URL`: defaults to local `postgresql://hello_user:hello_pass@localhost:5432/hello_world_db`.
- `KAFKA_BROKERS`: defaults to `localhost:9092`.
- `OTEL_EXPORTER_OTLP_ENDPOINT`: defaults to `http://localhost:4317`.
- `OTEL_SERVICE_NAME`: defaults to `hello-world-service`.
- `NODE_ENV`: defaults to `development` in instrumentation.

`portal`

- `VITE_KEYCLOAK_URL`: defaults to `http://localhost:18080`.
- Keycloak realm is hardcoded as `wonsealtech`.
- Client ID is hardcoded as `portal-client`.

Important ports:

- Portal: `13000`
- Grafana: `13001`
- Hello direct: `13010`
- Kong proxy: `18000`
- Kong admin: `18001`
- Keycloak: `18080`
- Schema Registry: `18081`
- Kafka UI: `18082`
- Kafka external: `19092`
- Prometheus: `19090`

Docker:

- Use `npm run infra:up` from repo root for current Phase 0 stack.
- Equivalent Compose command uses `infra/docker-compose.platform.yml` and `infra/docker-compose.yml`.
- Future MES should add `infra/docker-compose.mes.yml`; this file does not exist yet.

Secrets:

- Local development credentials are committed in `realm-export.json` and Compose files.
- Do not reuse these credentials in production.

## 9. Security

Authentication:

- Portal uses Keycloak JS with `onLoad: login-required` and PKCE S256.
- Keycloak realm: `wonsealtech`.
- OIDC clients: `portal-client`, `mes-client`, `wms-client`, `qms-client`.

Authorization:

- Portal authorization is role-based display filtering via `realm_access.roles`.
- Backend authorization is not fully implemented.
- Domain-scoped authorization tables are planned for `mes-master-data-service`, not implemented.

Roles:

- `EXECUTIVE`
- `PLANT_MANAGER`
- `OPERATOR`
- `QC_TECHNICIAN`
- `WAREHOUSE_STAFF`

JWT:

- Tokens are issued by Keycloak.
- Current Kong config does not parse/verify Keycloak JWTs.
- Current backend service trusts forwarded headers.

Session:

- Keycloak SSO session is configured.
- Front-channel logout URLs exist in realm export.
- Portal calls `keycloak.logout({ redirectUri: window.location.origin })`.

CORS/CSRF:

- CORS is not explicitly handled in `hello-world-service`.
- CSRF protection is not implemented.

Security risks found:

- Kong currently allows default anonymous user context for `/api/hello`.
- Kong JWT/OIDC verification is documented as deferred in config.
- Local development passwords are stored in repo.
- `hello-world-service` trusts incoming identity headers if someone bypasses Kong and calls the service directly.
- Kong admin API is exposed on host port `18001` for local development.

Recommended Phase 1 security fixes:

- Add real OIDC/JWKS validation or token introspection at Kong.
- Ensure business services are not exposed directly except for health checks.
- Reject missing identity headers in domain services once Gateway auth is active.
- Keep Keycloak global roles separate from domain-scoped permissions.

## 10. Coding patterns

Workspace:

- Root package is private ESM workspace.
- Workspaces: `libs/*`, `services/*`, `portal`.

TypeScript:

- ESM modules.
- Explicit `.js` suffix imports in compiled service/library TS where needed.
- Strict-ish service patterns should follow existing code style.

Service bootstrap pattern:

1. Import `instrumentation.ts` first.
2. Build DB pool.
3. Wait for DB readiness.
4. Run migrations.
5. Start outbox relay worker.
6. Start Express app.
7. Register health, metrics, business routes, 404, error handler.
8. Gracefully stop HTTP server, relay, and DB pool on `SIGTERM` / `SIGINT`.

HTTP pattern:

- Express `Router`.
- Handlers use `async` and `next(err)`.
- Gateway context is read from headers.
- `X-Trace-ID` should be forwarded in responses where useful.

Transaction pattern:

- Use `pool.connect()`.
- `BEGIN`.
- Set current user in DB session for audit.
- Write domain data.
- Write outbox event in same transaction.
- `COMMIT`.
- On error, `ROLLBACK`.
- Always release client.

Event pattern:

- Use `createEventEnvelope()`.
- Use event naming convention.
- Use `writeToOutbox()` inside the same transaction as the domain write.
- Start `OutboxRelayWorker` at service startup.

Testing:

- Current tests use Vitest.
- Existing test coverage only validates `EventEnvelope`.
- Future services should add unit, integration, and contract tests as required by `process/stragegy.md`.

Logging:

- Current code uses `console.info`, `console.warn`, `console.error`.
- No structured logger package is implemented yet.

Drizzle:

- Not used in current implemented code.
- Required by `process/phase-1.md` for `mes-master-data-service`.

Dependency injection:

- No framework DI container.
- Dependencies are passed manually, e.g. `helloRouter(pool)`.

## 11. Business rules

Implemented business rules:

- Portal app visibility is role-based:
  - MES: `EXECUTIVE`, `PLANT_MANAGER`, `OPERATOR`, `QC_TECHNICIAN`
  - WMS: `EXECUTIVE`, `PLANT_MANAGER`, `WAREHOUSE_STAFF`
  - QMS: `EXECUTIVE`, `PLANT_MANAGER`, `QC_TECHNICIAN`
- Apps marked `coming-soon` are displayed disabled and do not open.
- Hello route creates a greeting and publishes an outbox event in one DB transaction.

Planned Phase 1 MES master-data rules from `process/phase-1.md`:

- Every master-data table needs governance columns.
- No hard deletes.
- Optimistic locking via `row_version`.
- Release lifecycle transitions publish events.
- Structural immutability after `Released` for specified tables.
- Cycle checks for production area, MBOM line hierarchy, and routing predecessor graph.
- Validation Engine must return all failures, not fail fast.
- Traceability validation rule is delegated to `mes-traceability-service`.
- `RoleCode` and `UserID` in domain-scoped access tables reference Keycloak identities but are not local foreign keys.

Phase 1 events to publish when implemented:

- `MES.MasterData.ItemRevisionReleased.v1`
- `MES.MasterData.MBOMReleased.v1`
- `MES.MasterData.RoutingReleased.v1`
- `MES.MasterData.ProductionVersionReleased.v1`
- `MES.MasterData.ProductionStandardReleased.v1`
- `MES.MasterData.WorkCenterActivated.v1`
- `MES.MasterData.EquipmentActivated.v1`

## 12. How to build the next service correctly

For `mes-master-data-service`, follow this order:

1. Re-read `process/phase-1.md`.
2. Use current `hello-world-service` as the structural template.
3. Use Drizzle ORM as required by Phase 1, even though hello uses raw SQL.
4. Create only the 26 Phase 1 master-data tables.
5. Do not create terminal, traceability config, work-order, dispatch, execution, genealogy, or label runtime tables.
6. Trust `X-User-ID`, `X-Role-Code`, and `X-Trace-ID` only after Kong auth is made real.
7. Add `service.manifest.yaml` before implementing event flows.
8. Register event schemas in Schema Registry.
9. Add `infra/docker-compose.mes.yml`.
10. Add validation, release transitions, outbox writes, tests, and observability before marking done.

## 13. Unknowns and TODO investigations

- Whether the current containers are running and healthy was not verified during this doc update.
- Real Kong JWT/OIDC validation is not implemented despite Phase 0 process documentation claiming verification.
- `mes-master-data-service` does not exist yet.
- `infra/docker-compose.mes.yml` does not exist yet.
- Schema Registry integration exists as infrastructure but no application code registers schemas.
- There is no current event consumer.
- There is no real DLQ implementation.
- There is no production-grade secrets management.
- There is no structured logger.
- There is no contract test suite.
- Audit trigger SQL exists in shared-kernel, but hello migration duplicates a local version and does not attach it to `greetings`.
