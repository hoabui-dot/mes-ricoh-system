# Alarm Center Implementation Map

## Repository services

| Capability | Actual path | Current responsibility |
|---|---|---|
| Station Gateway | `station-agent/services/mqtt-adapter` | Gateway HTTP ingestion and transactional RabbitMQ outbox |
| Job Engine | `station-agent/services/job-engine` | Production lifecycle and job outbox |
| Projection / alarm owner | `station-agent/services/projection-service` | Production/device projections, current alarm persistence, RabbitMQ consumption, REST and SignalR |
| Printer | `station-agent/services/printer-adapter` | Printer state, execution and heartbeat events |
| Laser | `station-agent/services/laser-adapter` | Laser state, execution and heartbeat events |
| Vision | `station-agent/services/vision-service` | Camera and inspection persistence |
| PLC | `station-agent/services/plc-adapter` | PLC state and commands |
| Kiosk API / RBAC | `station-agent/services/kiosk-ui/src` | JWT authentication, users, roles, permissions and reverse proxy |
| Kiosk frontend | `station-agent/services/kiosk-ui/frontend` | Alarm banner and Alarm Center UX |
| Shared event contracts | `station-agent/shared/ND.UnifiedContracts` | Job, device and manual action event contracts |
| Shared infrastructure | `station-agent/shared/ND.Infrastructure` | RabbitMQ, Redis, SQLite path handling and logging |
| Shared tests | `station-agent/shared/ND.Testing` | Relational SQLite fixture and deterministic test clock |

## Ownership decision

The Projection Service remains the single alarm domain owner for this implementation. A new service would conflict with the authoritative repository rule to avoid a new service when an existing module is sufficient and would require a risky broker/API deployment split. Alarm lifecycle, persistence, commands, audit, inbox, outbox, and publication will be isolated as a cohesive module in this service. The Kiosk never owns lifecycle logic. Existing `projection_alarms` and routes remain backward compatible while richer versioned fields and commands are added.

## Existing sources and contract gaps

| Source condition | Existing signal | Gap to close |
|---|---|---|
| Printer/laser/PLC/camera/gateway offline | `DeviceStatusHeartbeat` via RabbitMQ | Stable alarm code, deterministic dedupe key, persistent inbox |
| Printer lifecycle (paper out, cover/error) | heartbeat `LifecycleState` | Normalize condition codes and recovery |
| Job failed | `JobFailedEvent` | Persist event ID/inbox, job/work-order/product links |
| Vision OCR/retry exhaustion | job failure/error text only | Explicit alarm-condition mapping |
| Adapter execution failure | adapter/job events | Explicit normalized condition event |
| RabbitMQ/outbox delay | outbox retry state | Monitoring source and threshold alarm |
| Projection lag | no durable lag alarm | Add monitored infrastructure condition |
| SignalR disconnect | frontend connection state only | UI stale/offline indicator; it is not a server-owned domain alarm |
| SQLite/disk failure | logs/startup failure | Health/log observability; safe write-probe fallback |

Current shared events generally have `event_id`, job/device identifiers and timestamps, but station/work-order/correlation/error-code coverage is inconsistent. Evolution will use optional fields and tolerant parsers.

## Reliability baseline

- Transactional outboxes exist in Gateway and Job Engine; alarm writes do not yet have one.
- RabbitMQ consumers acknowledge after handlers, but no persistent `consumer_name + event_id` inbox protects mutations.
- Retry exists in publishers/consumers but dead-letter behavior is incomplete.
- `SqlitePathHelper` lacks the mandatory write-probe and fallback.
- Structured logging and health routes exist, with inconsistent alarm identifiers.
- Service Dockerfiles generally create `/data` and `/logs`; non-root verification remains a release gate.

## Compatibility boundaries

- Keep RabbitMQ exchange/routing keys currently used by deployed services; do not perform an unrequested Kafka migration. New alarm events use the same broker abstraction and can later be bridged to Kafka.
- Preserve existing job/device JSON fields; additions are optional.
- Preserve `/api/projection/alarms`, `/api/projection/alarms/count`, and the SignalR hub/message names.
- Preserve Kiosk token storage/interceptors and existing role codes. Add permissions without renaming old ones.
- Preserve `projection_alarms`; evolve it additively and retain adapters for legacy state names.
- Preserve Compose service names and `push-images.sh` as the only publishing entry point.

## Phase sequence

1. Harden alarm domain, relational persistence, lifecycle, audit, inbox and outbox.
2. Normalize event ingestion, deduplication and recovery.
3. Complete query/API/SignalR projections while maintaining legacy routes.
4. Complete Vietnamese kiosk UX, offline/reconnect behavior and accessibility.
5. Enforce RBAC and resilient, idempotent commands.
6. Add guarded deterministic seed data, E2E coverage and production/Docker verification.

## Migration order

1. Add new nullable/defaulted alarm columns and lifecycle/timeline/inbox/outbox tables.
2. Backfill deterministic legacy values.
3. Create indexes after backfill.
4. Deploy tolerant consumers and APIs.
5. Deploy the Kiosk UI against backward-compatible DTOs.

## Test projects and commands

- Existing: `services/device-simulator/tests/ND.DeviceSimulator.UnitTests` and `ND.DeviceSimulator.IntegrationTests`.
- Alarm tests will be added beside Projection Service and included in the solution.
- Backend: `dotnet test station-agent.sln` when SDK exists, otherwise Docker build/test stages.
- Frontend: `npm run typecheck`, `npm run lint`, `npm run build`.
- Compose: `docker compose config --quiet`.
- Image verification: `./push-images.sh --build-only --arch amd64 --service projection-service` (and arm64 at release gate).

