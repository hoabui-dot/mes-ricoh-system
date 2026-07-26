# Claude AI Document — ND Station Agent System

> This document is the authoritative reference for Claude when working on this codebase.
> Read this FIRST before editing any file. All architectural decisions here are final unless
> explicitly changed by the user.

---

## 1. System Overview

**Station Agent** is an edge manufacturing platform running at factory floor level.
It receives jobs from **ND Factory Gateway** via MQTT/mTLS, executes print / laser marking /
vision inspection / PLC control jobs, stores history locally in SQLite, uses Redis for
caching and idempotency, and exposes a real-time Kiosk UI for operators.

Key traits:
- **Offline-first**: must queue jobs locally and sync when network is restored
- **No duplicate labels**: idempotency enforced at every layer
- **Full audit trail**: every action logged with who/when/what/result
- **Edge IPC**: runs on industrial PC, not a cloud server

---

## 2. Architecture Principles (NEVER violate these)

1. **Database per service** — each service has its own SQLite file; no physical FK across services.
2. **Logical references only** — cross-service references use `job_id`, `attempt_id`, `user_id`, `device_id` as string identifiers, never foreign keys.
3. **No business logic in controllers/endpoints** — all logic in Application layer.
4. **Domain layer has zero infrastructure dependencies** — Domain never touches EF Core, Redis, MQTT, or file system.
5. **Outbox pattern** — all MQTT publish goes through outbox table to survive crashes.
6. **Idempotency everywhere** — use Redis idempotency keys; duplicate job/message must be silently ignored.
7. **Audit everything** — manual overwrite, reprint, relaser, force-complete must be logged.
8. **Offline-first** — job must survive MQTT disconnect; local queue drains when reconnected.

---

## 3. Tech Stack

| Concern | Technology |
|---|---|
| Language | C# (.NET 9) |
| Backend framework | ASP.NET Core 9 (Web API + Background Worker) |
| Kiosk UI | React + Vite (TypeScript) |
| Database | SQLite via EF Core 9 |
| Cache / Lock / Idempotency | Redis (StackExchange.Redis) |
| MQTT client | MQTTnet 4.x |
| Real-time push | SignalR (ASP.NET Core) |
| Container | Docker + Docker Compose |
| Validation | FluentValidation |
| Logging | Serilog (structured) |
| Testing | xUnit + Moq + FluentAssertions |

---

## 4. Repository Structure

```
station-agent/
├── CLAUDE.md                        <- THIS FILE
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── global.json                      <- pins .NET SDK version
├── Directory.Build.props            <- global MSBuild settings
├── Directory.Packages.props         <- centralized NuGet versions
├── station-agent.sln
├── docs/
│   ├── architecture/
│   │   ├── system-overview.md
│   │   ├── service-contracts.md
│   │   ├── database-dictionary.md
│   │   ├── sequence-flow.md
│   │   └── adr/
│   │       ├── 0001-database-per-service.md
│   │       ├── 0002-offline-first.md
│   │       └── 0003-outbox-pattern.md
│   ├── coding-guidelines/
│   └── runbooks/
├── shared/
│   ├── ND.SharedKernel/             <- primitives, abstractions, exceptions
│   ├── ND.Contracts/                <- MQTT message contracts, DTOs
│   ├── ND.Infrastructure/           <- shared SQLite/Redis/Messaging helpers
│   └── ND.Testing/                  <- test fixtures and helpers
├── services/
│   ├── mqtt-adapter/
│   ├── job-engine/
│   ├── printer-adapter/
│   ├── laser-adapter/
│   ├── vision-service/
│   ├── plc-adapter/
│   └── kiosk-ui/
└── deploy/
    ├── docker/
    ├── compose/
    └── nginx/
```

---

## 5. Services — Purpose and Responsibilities

### 5.1 MQTT Adapter Service
- Subscribes to MQTT topics from ND Factory Gateway
- Validates and deduplicates incoming messages (idempotency key in Redis)
- Writes to `mqtt_messages` table
- Publishes outbound events via `mqtt_outbox_events` (outbox pattern)
- Database: `mqtt.db`

### 5.2 Job Engine Service
- Core orchestrator — owns the full job lifecycle
- Creates and manages: Job -> Attempt -> Steps -> History -> State transitions
- Handles state machine: CREATED -> QUEUED -> PROCESSING -> COMPLETED/FAILED/WAIT_REWORK
- Coordinates Printer / Laser / Vision / PLC adapters
- Handles manual overwrite requests (REPRINT, RELASER, FORCE_PASS, FORCE_COMPLETE)
- Database: `job_engine.db`

### 5.3 Printer Adapter Service
- Manages printer registry (Zebra, Honeywell via TCP port 9100)
- Renders label templates to ZPL/TSPL/EPL
- Health-checks printers on interval; supports failover printer pool
- Database: `printer.db`

### 5.4 Laser Adapter Service
- Manages laser device registry
- Calls laser SDK / TCP / REST depending on vendor
- Renders marking templates
- Database: `laser.db`

### 5.5 Vision Service
- Controls cameras for barcode/OCR/AI inspection
- Returns PASS / FAIL + defect code (QR_MISSING, SERIAL_BLUR, OCR_ERROR, etc.)
- Saves inspection images to local storage path
- Database: `vision.db`

### 5.6 PLC Adapter Service
- Communicates with PLCs via Modbus TCP or OPC-UA
- Triggers robot reject / conveyor control
- Publishes PLC events
- Database: `plc.db`

### 5.7 Kiosk UI Service
- ASP.NET Core API with SignalR hub + React/Vite frontend
- RBAC: roles ADMIN, SUPERVISOR, OPERATOR, QA
- Session management, access log, audit trail
- Manual override actions: retry, reprint, relaser, force-pass, force-complete
- Database: `kiosk.db`

---

## 6. Service Folder Structure (Clean Architecture)

Each .NET service follows this layout:

```
services/<service-name>/
├── README.md
├── src/
│   ├── ND.<Name>.Api/             (or .Worker for background-only services)
│   │   ├── Program.cs
│   │   ├── appsettings.json
│   │   ├── Endpoints/
│   │   ├── Middleware/
│   │   ├── Extensions/
│   │   └── Hubs/                  (SignalR, if needed)
│   ├── ND.<Name>.Application/
│   │   ├── Commands/
│   │   ├── Queries/
│   │   ├── Dtos/
│   │   ├── Interfaces/
│   │   ├── Validators/
│   │   ├── Behaviors/
│   │   └── Services/
│   ├── ND.<Name>.Domain/
│   │   ├── Entities/
│   │   ├── ValueObjects/
│   │   ├── Events/
│   │   ├── Enums/
│   │   ├── Rules/
│   │   └── Exceptions/
│   └── ND.<Name>.Infrastructure/
│       ├── Persistence/
│       ├── Repositories/
│       ├── Migrations/
│       ├── Redis/
│       ├── Messaging/
│       ├── DeviceAdapters/
│       ├── Options/
│       └── DependencyInjection/
├── tests/
│   ├── ND.<Name>.UnitTests/
│   └── ND.<Name>.IntegrationTests/
└── docker/
    └── Dockerfile
```

Dependency rule (strict):
- `Domain` <- no dependencies (pure C#)
- `Application` <- depends on `Domain` only
- `Infrastructure` <- depends on `Application` + `Domain`
- `Api/Worker` <- composition root only; wires DI

---

## 7. Database Schema — All 7 Databases

### 7.1 mqtt.db (2 tables)

#### `mqtt_messages`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID/UUID |
| message_id | TEXT UNIQUE | idempotency key from sender |
| topic | TEXT | MQTT topic |
| payload_json | TEXT | raw payload |
| direction | TEXT | INBOUND / OUTBOUND |
| status | TEXT | RECEIVED / PROCESSED / FAILED |
| received_at | TEXT | ISO 8601 |
| processed_at | TEXT | nullable |
| error_message | TEXT | nullable |
| created_at | TEXT | |

#### `mqtt_outbox_events`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| aggregate_type | TEXT | e.g. "Job" |
| aggregate_id | TEXT | job_id / device_id |
| event_type | TEXT | e.g. "JobCreated" |
| payload_json | TEXT | event payload |
| topic | TEXT | target MQTT topic |
| status | TEXT | PENDING / PUBLISHED / FAILED |
| retry_count | INTEGER | default 0 |
| next_retry_at | TEXT | nullable |
| published_at | TEXT | nullable |
| created_at | TEXT | |

---

### 7.2 job_engine.db (6 tables)

#### `job_engine_jobs`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| job_no | TEXT UNIQUE | e.g. JOB-000001 |
| source_system | TEXT | MES / ERP / MANUAL |
| job_type | TEXT | PRINT_LABEL / LASER_MARK / FULL_PROCESS |
| current_status | TEXT | CREATED/QUEUED/PROCESSING/WAIT_REWORK/COMPLETED/FAILED/CANCELLED |
| product_code | TEXT | |
| product_serial | TEXT | nullable |
| payload_json | TEXT | full job payload |
| priority | INTEGER | default 0 |
| idempotency_key | TEXT UNIQUE | prevents duplicate creation |
| created_at | TEXT | |
| updated_at | TEXT | |
| completed_at | TEXT | nullable |

#### `job_engine_job_attempts`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| job_id | TEXT | logical ref to job_engine_jobs.id |
| attempt_no | INTEGER | 1, 2, 3... |
| trigger_type | TEXT | AUTO / MANUAL_RETRY / OVERWRITE |
| triggered_by_user_id | TEXT | nullable; logical ref to kiosk_users |
| result_status | TEXT | SUCCESS / FAILED / CANCELLED |
| started_at | TEXT | |
| finished_at | TEXT | nullable |
| error_message | TEXT | nullable |
| created_at | TEXT | |

#### `job_engine_job_steps`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| attempt_id | TEXT | logical ref to job_engine_job_attempts.id |
| step_name | TEXT | PRINT_LABEL / LASER_MARK / VISION_CHECK / PLC_REJECT |
| step_order | INTEGER | execution order |
| status | TEXT | PENDING / RUNNING / COMPLETED / FAILED / SKIPPED |
| started_at | TEXT | nullable |
| finished_at | TEXT | nullable |
| result_json | TEXT | nullable |
| error_message | TEXT | nullable |
| created_at | TEXT | |

#### `job_engine_job_history`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| job_id | TEXT | |
| attempt_id | TEXT | nullable |
| old_status | TEXT | |
| new_status | TEXT | |
| action_name | TEXT | e.g. START_JOB, LASER_FAILED, FORCE_PASS |
| performed_by | TEXT | system / user_id |
| note | TEXT | nullable |
| created_at | TEXT | |

#### `job_engine_state_transitions`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| job_id | TEXT | |
| from_state | TEXT | |
| to_state | TEXT | |
| trigger | TEXT | what caused the transition |
| created_at | TEXT | |

#### `job_engine_overwrite_requests`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| job_id | TEXT | |
| overwrite_type | TEXT | FORCE_PASS / REPRINT / RELASER / FORCE_COMPLETE |
| reason | TEXT | |
| requested_by | TEXT | user_id (logical ref) |
| approved_by | TEXT | nullable user_id |
| status | TEXT | PENDING / APPROVED / REJECTED |
| requested_at | TEXT | |
| resolved_at | TEXT | nullable |
| created_at | TEXT | |

---

### 7.3 printer.db (3 tables)

#### `printer_printers`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| printer_code | TEXT UNIQUE | e.g. PRINTER-01 |
| display_name | TEXT | |
| ip_address | TEXT | |
| port | INTEGER | default 9100 |
| protocol | TEXT | ZPL / TSPL / EPL |
| vendor | TEXT | ZEBRA / HONEYWELL / OTHER |
| status | TEXT | ONLINE / OFFLINE / ERROR |
| group_id | TEXT | nullable; for failover pool |
| last_heartbeat_at | TEXT | |
| created_at | TEXT | |

#### `printer_jobs`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| job_id | TEXT | logical ref (job_engine_jobs.id) |
| attempt_id | TEXT | logical ref (job_engine_job_attempts.id) |
| printer_id | TEXT | logical ref (printer_printers.id) |
| label_template | TEXT | template name |
| rendered_content | TEXT | final ZPL/TSPL output |
| print_status | TEXT | PENDING / SENT / SUCCESS / FAILED |
| copies | INTEGER | default 1 |
| sent_at | TEXT | nullable |
| finished_at | TEXT | nullable |
| error_message | TEXT | nullable |
| created_at | TEXT | |

#### `printer_events`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| printer_id | TEXT | |
| event_type | TEXT | PAPER_EMPTY / COVER_OPEN / PRINT_STARTED / PRINT_FINISHED / ERROR |
| event_data | TEXT | nullable JSON |
| occurred_at | TEXT | |
| created_at | TEXT | |

---

### 7.4 laser.db (3 tables)

#### `laser_lasers`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| laser_code | TEXT UNIQUE | e.g. LASER-01 |
| display_name | TEXT | |
| connection_type | TEXT | SDK / TCP / REST |
| endpoint | TEXT | IP:port or URL |
| vendor | TEXT | |
| status | TEXT | ONLINE / OFFLINE / ERROR |
| last_heartbeat_at | TEXT | |
| created_at | TEXT | |

#### `laser_jobs`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| job_id | TEXT | logical ref |
| attempt_id | TEXT | logical ref |
| laser_id | TEXT | logical ref |
| template_name | TEXT | |
| mark_content | TEXT | rendered content sent to laser |
| mark_status | TEXT | PENDING / SENT / SUCCESS / FAILED |
| sent_at | TEXT | nullable |
| finished_at | TEXT | nullable |
| error_message | TEXT | nullable |
| created_at | TEXT | |

#### `laser_events`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| laser_id | TEXT | |
| event_type | TEXT | LASER_READY / LASER_ERROR / MARK_START / MARK_FINISH |
| event_data | TEXT | nullable JSON |
| occurred_at | TEXT | |
| created_at | TEXT | |

---

### 7.5 vision.db (2 tables)

#### `vision_cameras`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| camera_code | TEXT UNIQUE | e.g. CAM-01 |
| display_name | TEXT | |
| connection_type | TEXT | USB / GigE / RTSP |
| endpoint | TEXT | nullable |
| status | TEXT | ONLINE / OFFLINE / ERROR |
| last_heartbeat_at | TEXT | |
| created_at | TEXT | |

#### `vision_results`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| job_id | TEXT | logical ref |
| attempt_id | TEXT | logical ref |
| camera_id | TEXT | logical ref |
| inspection_result | TEXT | PASS / FAIL |
| defect_code | TEXT | nullable; QR_MISSING / SERIAL_BLUR / OCR_ERROR |
| confidence_score | REAL | nullable 0.0-1.0 |
| ocr_text | TEXT | nullable; extracted text |
| barcode_value | TEXT | nullable |
| image_path | TEXT | e.g. /storage/2026/06/job001.jpg |
| inspected_at | TEXT | |
| created_at | TEXT | |

---

### 7.6 plc.db (4 tables)

#### `plc_devices`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| plc_code | TEXT UNIQUE | e.g. PLC-01 |
| display_name | TEXT | |
| protocol | TEXT | MODBUS_TCP / OPC_UA |
| ip_address | TEXT | |
| port | INTEGER | |
| status | TEXT | ONLINE / OFFLINE / ERROR |
| last_heartbeat_at | TEXT | |
| created_at | TEXT | |

#### `plc_commands`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| job_id | TEXT | logical ref |
| attempt_id | TEXT | logical ref |
| plc_id | TEXT | logical ref |
| command_name | TEXT | e.g. START_PICK / REJECT_PRODUCT |
| command_payload | TEXT | JSON |
| execution_status | TEXT | PENDING / SENT / SUCCESS / FAILED |
| sent_at | TEXT | nullable |
| finished_at | TEXT | nullable |
| error_message | TEXT | nullable |
| created_at | TEXT | |

#### `plc_events`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| plc_id | TEXT | |
| event_type | TEXT | PICK_START / PICK_FINISH / CONVEYOR_RUNNING / CONVEYOR_STOP |
| event_data | TEXT | nullable JSON |
| occurred_at | TEXT | |
| created_at | TEXT | |

#### `plc_robot_pick_events`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| job_id | TEXT | logical ref |
| attempt_id | TEXT | logical ref |
| plc_id | TEXT | |
| pick_result | TEXT | SUCCESS / FAIL |
| pick_position | TEXT | nullable |
| error_code | TEXT | nullable |
| occurred_at | TEXT | |
| created_at | TEXT | |

---

### 7.7 kiosk.db (7 tables)

#### `kiosk_users`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| username | TEXT UNIQUE | |
| full_name | TEXT | |
| password_hash | TEXT | bcrypt |
| is_active | INTEGER | 0/1 |
| created_at | TEXT | |
| updated_at | TEXT | |

#### `kiosk_roles`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| role_code | TEXT UNIQUE | ADMIN / SUPERVISOR / OPERATOR / QA |
| display_name | TEXT | |
| created_at | TEXT | |

#### `kiosk_permissions`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| permission_code | TEXT UNIQUE | JOB_VIEW / JOB_RETRY / JOB_FORCE_PASS / USER_MANAGE / etc. |
| description | TEXT | |
| created_at | TEXT | |

#### `kiosk_user_roles`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| user_id | TEXT | |
| role_id | TEXT | |
| assigned_at | TEXT | |
| assigned_by | TEXT | |

#### `kiosk_role_permissions`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| role_id | TEXT | |
| permission_id | TEXT | |
| created_at | TEXT | |

#### `kiosk_sessions`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| user_id | TEXT | |
| token | TEXT UNIQUE | JWT token |
| ip_address | TEXT | |
| user_agent | TEXT | |
| login_at | TEXT | |
| expires_at | TEXT | |
| logout_at | TEXT | nullable |
| is_active | INTEGER | 0/1 |

#### `kiosk_access_logs`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | ULID |
| user_id | TEXT | |
| session_id | TEXT | |
| action_name | TEXT | LOGIN / LOGOUT / RETRY_JOB / FORCE_PASS / REPRINT / RELASER / FORCE_COMPLETE |
| target_type | TEXT | JOB / USER / PRINTER / LASER |
| target_id | TEXT | |
| result | TEXT | SUCCESS / DENIED / FAILED |
| detail_json | TEXT | nullable |
| performed_at | TEXT | |

---

## 8. Redis Key Conventions

```
idempotency:job:{jobId}         TTL 24h  -- prevents duplicate job creation
idempotency:msg:{messageId}     TTL 24h  -- prevents duplicate MQTT processing
lock:job:{jobId}                TTL 30s  -- distributed lock during processing
printer:status:{printerId}      TTL 60s  -- heartbeat cache
laser:status:{laserId}          TTL 60s  -- heartbeat cache
plc:status:{plcId}              TTL 60s  -- heartbeat cache
session:{token}                 TTL = session expiry
dashboard:summary               TTL 5s   -- real-time snapshot
active:job:{jobId}              TTL 5m   -- active job state cache
```

---

## 9. MQTT Topic Conventions

```
station/{stationId}/job/create          <- inbound: create job
station/{stationId}/job/status          -> outbound: job status update
station/{stationId}/printer/status      -> outbound: printer health
station/{stationId}/laser/status        -> outbound: laser health
station/{stationId}/vision/result       -> outbound: inspection result
station/{stationId}/plc/event           -> outbound: PLC event
```

---

## 10. Job Lifecycle State Machine

```
CREATED -> QUEUED -> PROCESSING -> COMPLETED
                        |
                      FAILED -> WAIT_REWORK -> PROCESSING (retry)
                        |
                    CANCELLED
```

Overwrite types:
- `REPRINT` — reprint label (creates new attempt)
- `RELASER` — redo laser marking (creates new attempt)
- `FORCE_PASS` — skip failed vision check
- `FORCE_COMPLETE` — mark job complete despite errors

---

## 11. Manual Override Flow

```
Job FAILED
  -> status = WAIT_REWORK
  -> Operator logs in (kiosk_sessions)
  -> Action logged (kiosk_access_logs)
  -> Creates job_engine_overwrite_requests
  -> Supervisor APPROVES
  -> New job_engine_job_attempts (attempt_no++)
  -> Steps re-executed on Printer / Laser / Vision / PLC
```

---

## 12. C# Coding Rules (ALWAYS follow)

### Naming
- Classes, Methods, Properties: `PascalCase`
- Interfaces: `I` prefix — `IPrinterAdapter`, `IJobRepository`
- Private fields: `_camelCase`
- Local variables, parameters: `camelCase`
- Constants: `PascalCase`

### Async
- All I/O must be `async/await`
- Method names end with `Async` suffix
- Never use `.Result` or `.Wait()` — deadlock risk
- Never swallow exceptions silently

### Dependency Injection
- Constructor injection only
- Never `new` a service inside business code
- Never use static service locator

### Error Handling
- Use domain-specific exceptions (e.g., `JobNotFoundException`, `PrinterOfflineException`)
- Map errors to result types where appropriate
- Always include `correlationId`, `jobId`, `stationId` in log context

### Logging (Serilog structured)
- Log at entry/exit of significant operations
- Use structured properties, not string interpolation
- Always include correlation ID

### Validation
- Validate in Application layer using FluentValidation
- Never let dirty input reach Domain
- Return validation errors as structured result, not exception

### Forbidden patterns
- No God classes
- No `Utils/`, `Helpers/`, `Common/` folders without clear purpose
- No business logic in `Infrastructure` layer
- No physical FK across service databases
- No hardcoded IPs, ports, or credentials in source code

---

## 13. Package Versions (centrally managed)

All packages declared in `Directory.Packages.props`. Do not add package references
with version numbers in individual `.csproj` files — use `<PackageReference Include="..." />` only.

Key packages:
- `Microsoft.EntityFrameworkCore.Sqlite` — SQLite persistence
- `StackExchange.Redis` — Redis client
- `MQTTnet` — MQTT client
- `Serilog.AspNetCore` — structured logging
- `FluentValidation.AspNetCore` — input validation
- `Microsoft.AspNetCore.SignalR` — real-time hub
- `xunit` — unit testing
- `Moq` — mocking
- `FluentAssertions` — test assertions
- `BCrypt.Net-Next` — password hashing

---

## 14. Docker Strategy

- Each service has its own `Dockerfile` using multi-stage build
- `docker-compose.yml` at root wires all 7 services + Redis
- SQLite files mounted as named volumes (one per service)
- Redis with `appendonly yes` for durability
- Services communicate via Docker bridge network `station-net`
- Kiosk UI served via nginx reverse proxy

---

## 15. Backup Priority (most critical data)

1. `job_engine_jobs`
2. `job_engine_job_attempts`
3. `job_engine_job_history`
4. `job_engine_overwrite_requests`
5. `vision_results`
6. `printer_jobs`
7. `laser_jobs`
8. `plc_robot_pick_events`

These 8 tables contain the full production history, audit trail, QA traceability,
and root cause analysis data for the factory.

---

## 16. Things Claude Must NEVER Do

1. Create physical foreign keys that span service databases
2. Put business logic in controllers or infrastructure
3. Add a new service when a module inside an existing service is sufficient
4. Add NuGet packages not in `Directory.Packages.props` without noting it explicitly
5. Create generic `Utils/` or `Helpers/` folders without a specific purpose
6. Skip idempotency checks for job creation or MQTT message processing
7. Skip audit logging for any manual override action
8. Use `.Result` or `.Wait()` on async methods
9. Hardcode any IP, port, credential, or path
10. Change table names without an explicit migration and documented reason
