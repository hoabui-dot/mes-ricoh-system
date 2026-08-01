# Backend Architecture

## Project Structure

Backend services use language-specific layouts:

- Go MES services: `cmd/server`, `internal/application/usecase`, `internal/domain`, `internal/infrastructure/http`, `internal/infrastructure/events`, `internal/infrastructure/client`.
- TypeScript services: `src/infrastructure`, routers, DB schema/migrations, service-specific modules.
- .NET print-station services: domain/application/infrastructure/API projects.

## Layer Responsibilities

- HTTP/router layer: decode/validate request shape, extract headers, call use cases, map errors.
- Application/use case layer: business transaction orchestration.
- Domain layer: domain entities, status rules, invariants.
- Infrastructure layer: database repositories, clients, event consumers/producers, schema registry, background services.

## Domain Model

MES execution domain is transaction-heavy: Work Orders, operations, material requirements, execution sessions, confirmations, resource allocations, reservations, print jobs.

MES master data domain is lifecycle/effectivity-heavy: items, revisions, MBOM, routing, resources, assignments, calendars, standards, labor, UOMs, print-station master data.

## Repository Pattern

Repository abstraction varies by service. Go services use direct SQL/pgx in use cases and infrastructure. TypeScript master data uses router and query code around PostgreSQL/Drizzle schema definitions. Do not introduce a new repository abstraction unless it matches local style.

## Transaction Boundaries

Important boundaries:

- Create Work Order: snapshot all required production data and outbox event.
- Approve Work Order: revalidate allocation/readiness and state transition.
- Commit resource allocation: serializable/revalidated allocation plus reservation plus audit/idempotency.
- MBOM replace: complete desired line structure with expected structure version.
- Release master data: validate lifecycle and write release event.

## Validation Flow

Validation normally runs:

1. parse request.
2. check user/role where route implements it.
3. load current authoritative rows.
4. validate lifecycle/effectivity/ownership.
5. validate business invariants.
6. write changes in one transaction.
7. write outbox/audit when needed.

## Authorization Flow

Keycloak/Kong provide browser identity. Services receive forwarded headers such as `X-User-ID`, `X-Role-Code`, `X-Trace-ID`. Some service routes implement additional role gates. Resource allocation mutation explicitly allows only `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, and `EXECUTIVE`.

Security gap: MES legacy Kong bearer enforcement is not fully documented as equivalent to WMS/QMS.

## Dependency Injection

Go services wire dependencies in `cmd/server/main.go` and pass clients/pools into routers/use cases. TypeScript services typically compose Express routers with shared DB and clients. .NET services use standard dependency injection in service collection extensions.

## Background Jobs

Implemented background patterns include outbox relay workers, Kafka consumers, schema registry registration, kiosk execution consumers, WMS material result consumer, printer result consumer, and print-station pollers/projection services.

## Migration Strategy

Migrations are forward-only. Do not rewrite applied migrations. Prefer additive columns/tables, compatibility, backfill only when unambiguous, and removal only after consumer migration is proven.
