# MES Platform — AI Guide

> **This document is the authoritative reference for AI coding assistants (Antigravity, Claude, Cursor, Codex) working on this codebase. Read this FIRST before touching any file.**

---

## 1. System Identity

**MES Platform** is an enterprise Manufacturing Execution System built in **Go 1.24+**.

It is completely separate from the **Station Agent** (edge .NET system at `../station-agent/`).

- **Station Agent** = Edge Computing. Runs on factory floor. Controls physical devices.
- **MES Platform** = Enterprise Application. Runs in the cloud/data center. Manages people, plans, and production.

They communicate only via REST APIs and RabbitMQ async events. **Never modify `station-agent/`.**

---

## 2. Architecture

**Modular Monolith** — designed to split into microservices later.

```
mes-platform/
├── cmd/mes/          ← Entry point
├── internal/
│   ├── bootstrap/    ← Dependency injection / composition root
│   └── server/       ← Gin HTTP server, middleware wiring
├── modules/          ← Business modules (DDD layers inside each)
│   ├── identity/     ← Auth, users, roles, RBAC
│   ├── workforce/    ← Workers, skills, departments
│   ├── planning/     ← Shifts, calendar, leave
│   ├── production/   ← Orders, work orders, routing
│   ├── assignment/   ← Auto + human-in-the-loop assignment engine
│   ├── projection/   ← Read models, dashboard, WebSocket/SSE
│   ├── notification/ ← Email, in-app, alerts
│   └── audit/        ← Full audit trail
├── shared/           ← Cross-cutting: config, domain base, outbox, middleware
└── pkg/              ← Pure infrastructure: logger, postgres, redis, rabbitmq, jwt
```

Each module has **4 DDD layers**:
```
modules/<name>/
├── domain/           ← Entities, value objects, domain events, repo interfaces
├── application/      ← Use cases (services), DTOs, commands, queries
├── infrastructure/   ← GORM models, repository impls, external integrations
└── presentation/     ← Gin handlers, route registration
```

---

## 3. Golden Rules

1. **No global variables.** Everything is injected.
2. **No business logic in handlers.** Handlers parse input → call service → format response.
3. **No business logic in infrastructure.** Repositories only do data access.
4. **Outbox Pattern always.** Never publish to RabbitMQ directly inside a business transaction.
5. **Domain events on state change.** Every aggregate mutation records a domain event.
6. **No database sharing between modules.** Each module owns its own tables.
7. **Casbin RBAC only.** Never hardcode role checks like `if user.Role == "admin"`.
8. **Errors are typed.** Return `service.ErrNotFound`, `service.ErrConflict`, etc. — not raw strings.
9. **No reflection.** Avoid `interface{}` typed maps; use typed structs.

---

## 4. Module Responsibilities

| Module | Owns | Does NOT own |
|---|---|---|
| identity | users, roles, permissions, auth tokens | workforce data, production data |
| workforce | workers, skills, departments, teams | shift schedules, production orders |
| planning | shifts, calendars, leave, overtime | production order creation |
| production | production orders, work orders, routing | worker skills, shift data |
| assignment | assignments, revisions, overrides | production order creation |
| projection | read models, dashboard views | business state mutation |
| notification | notifications, alerts | business rules |
| audit | audit log entries | business state |

---

## 5. Naming Conventions

### Go Packages
- Package name = lowercase single word: `entity`, `service`, `persistence`, `handler`, `route`
- Module package paths: `modules/<name>/<layer>/<subpackage>`

### Files
- One primary type per file: `user.go`, `role.go`, `identity_service.go`
- Test files: `<filename>_test.go` in the same package with `_test` suffix for external tests

### Types
- Entities: `User`, `Worker`, `ProductionOrder` (PascalCase nouns)
- Services: `IdentityService`, `WorkforceService` (PascalCase + Service suffix)
- Handlers: `AuthHandler`, `UserHandler` (PascalCase + Handler suffix)
- DTOs: `RegisterUserRequest`, `UserDTO`, `AuthResponse`
- Events: `UserRegisteredEvent`, `WorkOrderCreatedEvent` (PascalCase + Event suffix)
- Repositories: `UserRepository` (interface), `GormUserRepository` (impl)

### Database Tables
- Prefix: `<module>_<table>` — e.g. `identity_users`, `workforce_workers`, `planning_shifts`
- Outbox: `<module>_outbox_events` — e.g. `identity_outbox_events`

### API Routes
- Version prefix: `/api/v1/`
- Plural nouns: `/api/v1/users`, `/api/v1/workers`
- Nested resources: `/api/v1/users/{id}/roles`
- Actions (non-CRUD): `/api/v1/auth/login`, `/api/v1/auth/refresh`

### RabbitMQ Routing Keys
- Convention: `mes.<module>.<EventName>`
- Examples: `mes.identity.UserRegistered`, `mes.production.WorkOrderCreated`
- Exchange: `mes.events` (Topic, durable)

---

## 6. Event Naming

All domain events must:
1. Embed `domain.BaseDomainEvent`
2. Implement `domain.DomainEvent` interface
3. Use routing key format: `mes.<module>.<EventName>`
4. Be raised via `aggregate.RecordEvent(event)`
5. Be written to the outbox table (never published directly)

---

## 7. Database Ownership

- Each module has its own tables prefixed with the module name
- **Never use JOIN across module tables** — use application-level aggregation
- Migration files: `migrations/<NNNNN>_<description>.<up|down>.sql`
- All migrations are run by `golang-migrate` at startup

---

## 8. Outbox Pattern

Every state-changing operation follows this flow:

```
Handler → Service → Repository.Save(entity) + OutboxRepo.Save(event)  [single transaction]
                    ↓
                OutboxWorker polls → RabbitMQ.Publish → mark published
```

**Never** call `rabbitmq.Publisher.Publish()` inside a service method.

---

## 9. RBAC (Casbin)

Permission format: `<resource>.<action>` — e.g. `worker.create`, `planning.publish`

Casbin policy: `(role, resource, action)` — e.g. `(manager, worker, view)`

To check permission in a handler:
```go
allowed, _ := enforcer.EnforcePermission(roleName, "worker.create")
if !allowed {
    response.Forbidden(c, "insufficient permissions")
    return
}
```

Never do: `if user.Role == "admin" { ... }`

---

## 10. Testing Strategy

| Test Type | Location | Tools | Scope |
|---|---|---|---|
| Unit | `*_test.go` in same package | `testify` | Domain entities, pure logic |
| Integration | `*_integration_test.go` | `testcontainers-go` | Repository + DB |
| API | `*_api_test.go` | `httptest` + testcontainers | Full handler stack |
| RBAC | `rbac_test.go` in identity | Casbin in-memory | Permission enforcement |

Run: `go test ./... -v -timeout 120s`

---

## 11. Error Handling

- Application services return typed sentinel errors: `service.ErrNotFound`, `service.ErrConflict`, `service.ErrUnauthorized`
- Handlers check errors with `errors.Is()` and map to HTTP codes via `response.*` helpers
- Never expose internal error details in HTTP responses (log them instead)
- Always log errors with `logger.Err(err)` field

---

## 12. Adding a New Module

1. Create `modules/<name>/domain/entity/`, `application/service/`, `infrastructure/persistence/`, `presentation/handler/`, `presentation/route/`
2. Add migration: `migrations/<NNNNN>_create_<name>_tables.up.sql`
3. Register routes in `internal/bootstrap/app.go`
4. Wire repositories and service in `internal/bootstrap/app.go`
5. Add outbox worker in `internal/bootstrap/app.go`
6. Write unit + integration tests
7. Add `modules/<name>/README.md`
8. Update `docs/DATABASE.md`, `docs/EVENTS.md`, `docs/RABBITMQ.md`
