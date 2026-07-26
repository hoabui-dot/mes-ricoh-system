# MES Platform (Manufacturing Execution System)

MES Platform is an enterprise factory management application built in Go 1.24+. It acts as the core orchestrator for personnel, shift schedules, production orders, suitability matching, and real-time operations telemetry.

---

## 1. System Overview & Architecture

The application is designed as a **Modular Monolith** to enable independent domain modeling, strict encapsulation, and eventual extraction of modules into microservices if required. 

- **Logical Schema Isolation**: No cross-module database foreign keys or JOIN queries are allowed. References use logical UUIDs.
- **Asynchronous Communication**: State changes publish domain events to an outbox queue within database transactions, dispatched asynchronously over **RabbitMQ** to downstream subscribers.
- **CQRS & Projections**: Real-time read-models aggregate floor metrics across write-side tables, pushing updates directly to clients via **Server-Sent Events (SSE)**.
- **Unified Change Auditing**: A database-level GORM callback plugin automatically intercepts and diffs entity changes (old vs new states), logging mutations with request-scoped trace parameters.

---

## 2. Implemented Modules

### 🔑 Identity Module (Phase 1)
- Handles user registration, credentials validation, and secure session management.
- Multi-device login support via JWT access tokens and Redis-backed refresh token rotation.
- Fine-grained Access Control (RBAC) managed through GORM-Casbin policy rules.

### 👥 Workforce Module (Phase 2)
- Models personnel assets including Departments, Workshops, Teams, and Workers.
- Tracks worker availability statuses (`available`, `on_leave`, `suspended`) and employment status invariants.
- Manages dynamic worker skill matrices (proficiency level scale 1-4) and professional certification catalogs.

### 📅 Planning Module (Phase 3)
- Sets up Shift Templates (enforcing HH:MM formats) and generates instantiated factory calendar shifts.
- Maps teams and workers to scheduled shifts with specific assignment roles (`operator`, `manager`, `supervisor`).
- Manages worker leave applications (validating overlapping spans) and overtime requests.

### ⚙️ Production Module (Phase 4)
- Tracks Production Orders through lifecycle states: `draft` -> `released` -> `in_progress` -> `completed`/`cancelled`.
- Defines production routings (templates) containing sequenced routing operations.
- Manages operator limits, minimum machine type constraints, and required skills matrices per operation step.
- Instantiates Work Orders referencing active production orders.

### 🧠 Assignment Engine (Phase 5)
- Computes suitability scores using a stateless scoring algorithm considering Skill Matching (40%), Availability (30%), Certifications (20%), and Order Priority (10%).
- Implements an aggregate root with **immutable history design**: overriding or changing worker assignments increments `revision` leaving past assignments unchanged.
- Interacts with write-side modules using logical query adapters to avoid circular imports.

### 📊 Projection & Dashboard Module (Phase 6)
- Materializes denormalized read-models (`projection_dashboard_snapshots`, `projection_order_stats`, `projection_worker_stats`) using optimized SQL queries.
- Streams live telemetry to factory dashboards via a Server-Sent Events (SSE) stream (`/dashboard/stream`) containing keep-alive heartbeats.
- Operates a background periodic builder rebuilding read-models every 60 seconds.

### 🔔 Notification Module (Phase 7)
- Manages transactional notifications dispatched via Email and In-App alert logs.
- Consumes RabbitMQ events: welcome alerts on `UserRegistered`, worker warning alerts on `WorkerCreated`, shift schedule notifications on `WorkerAssignedToShift`, and review prompts on `AssignmentProposed`.
- Exposes user Alert Center APIs under `/alerts` to list alerts, mark single alerts read, and read-all.

### 📝 Audit Logging Module (Phase 8)
- Auto-intercepts SQL inserts, updates, and deletes across all schemas using GORM lifecycle callbacks.
- Diff-maps fields to record state mutations (`old_values` vs `new_values`).
- Propagates transaction metadata headers (`X-Trace-ID`, `X-Correlation-ID`) and user session states into database transactions.

---

## 3. Getting Started

### Prerequisites
- Go 1.24+
- Docker & Docker Compose
- Make

### Running Locally (Docker Compose)
To spin up backing infrastructure (PostgreSQL, Redis, RabbitMQ) and apply database migrations automatically:
```bash
make docker-up
```

To stop infrastructure services:
```bash
make docker-down
```

### Running in Development (Hot Reload)
Start the Go application in watch mode using Air:
```bash
make dev
```

### Running Tests
To run the full unit and integration test suite:
```bash
make test
```

To generate a test coverage report:
```bash
make test-coverage
```

---

## 4. Documentation Index
Detailed specifications are located inside `/docs/` and module folders:
- **[Architecture Guide](docs/ARCHITECTURE.md)**: Layered design, transaction patterns, and modular Monolith guidelines.
- **[Database Registry](docs/DATABASE.md)**: Entity schemas, indices, and logical relationships catalog.
- **[Domain Events](docs/EVENTS.md)**: Registry of published events, schemas, and subscriber matrix.
- **[API Style Guide](docs/API_STYLE_GUIDE.md)**: REST endpoints design guidelines and envelope response formats.
- **[RabbitMQ Topology](docs/RABBITMQ.md)**: Exchange patterns, queue structures, and dead-letter queue bounds.
- **[Coding Standards](docs/CODING_STANDARD.md)**: Go modular guidelines, DI rules, and formatting standards.
