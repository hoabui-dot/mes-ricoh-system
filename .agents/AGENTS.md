# Project Guidelines & Agent Rules

## 1. Progress & Workload Tracking Rule
- **Mandatory Update**: After completing or acting on ANY requirement (e.g. implementing a service step, fixing a major bug, adding a phase milestone), you MUST update [`process/PROJECT_WORKLOAD_PROGRESS.md`](file:///home/neurosus/mes-system/process/PROJECT_WORKLOAD_PROGRESS.md).
- Keep the overall progress count (e.g., `4 / 10`), completed steps status, and next step instructions fully accurate and synchronized with the codebase state.

## 2. Command Execution & Scripting Rules
- **Script Files Only**: For long scripts, python scripts, or multi-line shell commands, ALWAYS write a script file to `scripts/` directory before executing via `run_command`. Never pass multi-line inline commands (`python3 -c "..."` or inline shell blocks).
- **Server IP**: Dev server Tailscale IP is **`100.68.50.41`**. All URLs, API endpoints, Keycloak redirect URIs, and config must reference `100.68.50.41` instead of `localhost`.
- **Zsh History Expansion Shielding**: Passwords containing exclamation marks (e.g. `'Admin@123!'`, `'Manager@123!'`, `'Operator@123!'`) in terminal commands MUST be enclosed in single quotes `'...'` to prevent `zsh` history expansion dropping into `dquote>`.

## 3. Architecture & Domain Boundary Rules
- **1 Service = 1 DB = 1 Bounded Context**: Never connect a service to another service's database. Cross-service communication MUST go through Kong Gateway REST APIs or Kafka Event Contracts.
- **Shared Kernel Scope**: `libs/shared-kernel` (TypeScript) and `libs/shared-kernel-go` (Go) MUST contain ONLY infrastructure primitives (EventEnvelope, Outbox Relay, Audit SQL, State Machine helpers). DO NOT place domain business logic inside Shared Kernel packages.
- **Gateway Identity Trust**: Microservices trust gateway-forwarded HTTP headers (`X-User-ID`, `X-Role-Code`, `X-Trace-ID`) forwarded by Kong Gateway.

## 4. Event-Driven & Transactional Outbox Rules
- **Atomic Outbox Writes**: All domain writes and outbox inserts MUST occur inside the same DB transaction using `sharedkernel.WriteToOutbox`.
- **Event Envelope Standard**: All Kafka events MUST follow the standard `EventEnvelope[T]` shape with event type format `<Cluster>.<BoundedContext>.<EventName>.v<N>`.
- **Schema Registry**: Every event schema MUST be registered in Schema Registry before publishing events to Kafka topics.

## 5. Migration & Governance Rules
- **Auto-Migrations on Startup**: Service bootstrap MUST automatically run pending database migrations on startup before listening for HTTP requests.
- **No Hard Deletes**: Master data and core transactional domain entities must not be hard deleted. Use status transitions or governance flags.
