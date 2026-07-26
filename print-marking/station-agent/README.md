# ND Station Agent

Edge manufacturing platform for industrial print / laser marking / vision inspection / PLC control.

## Architecture

7 microservices in one monorepo — each with its own SQLite database, communicating via internal HTTP and real-time via SignalR. External integration via MQTT/mTLS with ND Factory Gateway.

| Service | Port | Database |
|---|---|---|
| MQTT Adapter | — (worker) | mqtt.db |
| Job Engine | 5002 | job_engine.db |
| Printer Adapter | 5003 | printer.db |
| Laser Adapter | 5004 | laser.db |
| Vision Service | 5005 | vision.db |
| PLC Adapter | 5006 | plc.db |
| Kiosk UI | 5007 | kiosk.db |

## Quick Start (Docker Compose)

```bash
cp .env.example .env
# Edit .env with your actual values

docker compose up --build
```

Kiosk UI: http://localhost:5007
Default credentials: admin / Admin@123

## Local Development

Requirements: .NET 9 SDK, Node 20, Redis running locally

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7.4-alpine

# Run job-engine
cd services/job-engine/src/ND.JobEngine.Api
dotnet run

# Run kiosk-ui API
cd services/kiosk-ui/src/ND.KioskUi.Api
dotnet run

# Run kiosk-ui frontend
cd services/kiosk-ui/frontend
npm install
npm run dev  # http://localhost:5222
```

## Service Ports

- Job Engine API: http://localhost:5002
- Printer Adapter: http://localhost:5003
- Laser Adapter: http://localhost:5004
- Vision Service: http://localhost:5005
- PLC Adapter: http://localhost:5006
- Kiosk UI: http://localhost:5007

## Key Concepts

- **Offline-first**: Jobs queue locally in SQLite, sync when network restored
- **Idempotency**: Redis-based deduplication prevents duplicate jobs/labels
- **Outbox pattern**: MQTT publish via outbox table, survives crashes
- **Full audit trail**: Every state change logged with actor/timestamp/reason
- **RBAC**: Roles ADMIN > SUPERVISOR > OPERATOR, QA

## Documentation

See `CLAUDE.md` for full architecture reference, database schema, and coding rules.
