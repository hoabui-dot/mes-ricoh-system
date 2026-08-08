# Best AI Coding Practices & System Rules — Print-Marking Edge Station

This guide outlines the critical architectural patterns, development rules, and coding boundaries established across the **Print-Marking Edge Station** platform. All AI agents working on this codebase must adhere strictly to these constraints.

---

## 1. Core Architecture Patterns

### 1.1. Database-per-Service Isolation
- **Rule**: Each microservice owns its private SQLite database. Direct cross-database joins or referencing tables from foreign contexts is strictly prohibited.
- **Data Sharing**: Share data strictly via domain events over Apache Kafka or SignalR websocket pushes. 
- **ID References**: Refer to entities in other domains using logical strings (`job_id`, `product_serial`, `site_id`).

### 1.2. Transactional Outbox Pattern
- **Rule**: Never publish events directly to Kafka during an HTTP request.
- **Workflow**:
  1. Write the target entity changes and the corresponding event payload inside the same database transaction (atomic write).
  2. A dedicated `BackgroundService` worker (`OutboxProcessorWorker`) polls the outbox table sequentially.
  3. The worker publishes the event to Kafka, then marks it as completed or schedules retries.
- **Result**: Guarantees at-least-once event delivery even if the message broker goes offline.

### 1.3. Idempotency & Deduplication
- **Rule**: Every inbound request from the Factory Gateway is deduplicated at the entry point.
- **Mechanism**: The Station Gateway writes the request's unique `EventId` into a Redis cache with a 24-hour TTL (`SET NX`). If the key exists, the request returns `409 Conflict`.
- **Fallbacks**: If Redis is offline, the service falls back to a database unique index check on the `gateway_requests` table.

---

## 2. Platform Constraints & Guidelines

### 2.1. SQLite Write-Probe & Fallback (ANTIGRAVITY Principle 6)
- **Rule**: To prevent container startup crashes due to permission mismatches on host-mounted directories, the database initialization must probe write access.
- **Implementation**: Call `ResolveWritableDbPath(path)` in DI config. It attempts to write a test file (`.write_probe`) in the directory. If it fails (throwing `UnauthorizedAccessException`), it automatically falls back to `Path.GetTempPath()` to avoid crash loops.

### 2.2. Vietnamese Localization Constraints for Kiosk UI
- **Rule**: The Kiosk UI is operated by factory staff on the shop floor. All user-facing strings (labels, tables, placeholders, errors) **must be in Vietnamese**.
- **Code Language**: All variable names, API endpoints, code files, and comments must be in **English**.
- **Translators**: Localize backend enums using the centralized translators in `@/lib/utils.ts`.
- **UI Components**: Use shadcn/ui components (`@/components/ui/*`) to ensure standard aesthetics. Do not use standard browser alerts — use `<ConfirmDialog>`.

---

## 3. Deployment & Scripting Rules

### 3.1. Container Privileges & Volumes
- **Rule**: The runtime containers run as a non-privileged `app` user (UID `1654`, GID `1654`).
- **Dockerfile**: Build stages must pre-create the volumes directories (`/data` and `/logs`) and change their ownership using `chown -R app:app` BEFORE switching the `USER` context.

### 3.2. Script Builds & Packaging
- **Rule**: All packaging and builds are done using Docker Buildx to cross-compile for both `linux/amd64` and `linux/arm64`.
- **Scripts**: Always maintain `./push-images.sh` as the single registry publisher. Use `--build-only` and `--service` flags during local verification to test builds before pushing.
