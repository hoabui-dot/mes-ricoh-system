# Antigravity AI Document — ND Station Agent System

> **This document is the authoritative reference for Antigravity when working on this codebase. Read this first before starting any action or editing any file.**

---

## 1. System Overview & Architecture
The **Station Agent** is an edge manufacturing system that handles local orchestration for industrial printing, laser marking, vision inspection, and PLC communications. It interfaces with the central **ND Factory Gateway** via the **Station Gateway** HTTP service (port 5001).

### Core Principles
1. **Database per Service**: No physical database joins or foreign keys across databases. Use logical IDs (`job_id`, `attempt_id`, `user_id`, `device_id`) for references.
2. **Offline-First Resilience**: Jobs queue locally in SQLite and synchronize to the cloud when network is available.
3. **Idempotency**: Enforced at all entry points (MQTT payloads and API endpoints) using Redis keys to prevent duplicate actions.
4. **Outbox Pattern**: Outbound messages are stored in an outbox table and dispatched asynchronously to guarantee delivery even after app crashes.
5. **No Business Logic in Presentation**: All controllers and API endpoints must delegate business operations to the Application layer.
6. **Graceful SQLite Path Checking**: Always verify write permissions to the SQLite DB target path. If not writable (e.g. `/data` directory on local Windows/macOS), catch the error and fallback to a local directory like `data/` within `ContentRootPath`.
7. **ProductionRecord Lifecycle Ownership (Projection Service)**: `ProductionRecord` rows are owned exclusively by `job.created` events — one record per real Job, carrying a unique `JobId` and `ProductSerial`. The `HandleMqttEventAsync` handler in `ProjectionEventConsumer` **must NOT** create `ProductionRecord` rows for batch production orders (`plannedQty > 1`). For single-item jobs (`plannedQty == 1`) it may create a temporary record using `EventId` as the `JobId` which is promoted to the real `JobId` when `job.created` arrives. Violating this rule causes ghost "Đã nhận yêu cầu" rows (duplicate phantom records) that are never resolved, making `N` items appear as `2N` in the Kiosk UI.



---

## 2. Technology Stack
- **Backend**: .NET 9 / C#
- **ORM / Persistence**: Entity Framework Core 9 (SQLite provider)
- **Caching & Lock Manager**: Redis (via `StackExchange.Redis`)
- **Messaging Protocol**: MQTT (internal device events only; external Factory Gateway integration uses HTTP)
- **External HTTP Entry Point**: Station Gateway (`ND.StationGateway.Api`) on port 5001 — accepts `POST /api/gateway/orders` (UnifiedEvent JSON)
- **Real-Time UI Push**: SignalR Hubs
- **Frontend Kiosks**: React + Vite (TypeScript / CSS)
- **Logging**: Serilog (structured logs to Console and File)
- **Vulnerability Audit**: Pinned `SQLitePCLRaw.bundle_e_sqlite3` and set `NuGetAuditMode=direct`

---

## 3. Directory Layout & Layering
All backend services follow Clean Architecture layers:
- **`ND.<Service>.Domain`**: Entities, Value Objects, Domain Events, Enums, and Rules. Zero dependencies.
- **`ND.<Service>.Application`**: Use cases, commands, queries, DTOs, interfaces, and FluentValidation rules. Depends only on `Domain`.
- **`ND.<Service>.Infrastructure`**: DB contexts, migrations, repositories, device drivers, and third-party integrations. Depends on `Application` and `Domain`.
- **`ND.<Service>.Api` or `ND.<Service>.Worker`**: Composition root, startup configurations, controllers, middleware, and dependency wireup.

---

## 4. Database Dictionary per Service

### 4.1. `gateway.db` (Station Gateway — formerly mqtt-adapter)
- `gateway_requests`: Deduplication and audit log for inbound HTTP production orders from Factory Gateway.
- `gateway_outbox_events`: Outbox events waiting to be dispatched to the RabbitMQ `station.events` exchange.
  - Routing key: `mqtt.MqttMessage.MqttMessageReceived` (kept for Job Engine backward-compat).

### 4.2. `job_engine.db` (Job Engine)
- `job_engine_jobs`: Core records containing job status, source, type, and payload.
- `job_engine_job_attempts`: Track execution attempts for retry or manual overwrite.
- `job_engine_job_steps`: Detailed step-by-step state (Print, Laser, Vision, PLC).
- `job_engine_job_history`: Status changes and actions audited over time.
- `job_engine_state_transitions`: Analytical history of state transitions.
- `job_engine_overwrite_requests`: Approval records for manual supervisor overrides.

### 4.3. `printer.db` (Printer Adapter)
- `printer_printers`: List of print devices, IPs, vendor protocols (ZPL/TSPL), and health status.
- `printer_jobs`: Log of rendered label contents and print job status.
- `printer_events`: Incidents (out of paper, cover open, disconnects).
- `label_templates`: List of design label templates in JSON format.
- `label_template_versions`: Immutable snapshots of historical label template versions.
- `print_history`: Detailed audit log of print executions including ZPL, hex TCP dumps, trace/correlation IDs, duration, retries, and errors.

### 4.4. `laser.db` (Laser Adapter)
- `laser_lasers`: Registered laser marking machines and connection settings (TCP/SDK).
- `laser_jobs`: Mark commands, templates, and execution details.
- `laser_events`: Diagnostic events from laser devices.

### 4.5. `vision.db` (Vision Service)
- `vision_cameras`: Registry of inspection cameras (USB, GigE, RTSP).
- `vision_results`: Barcode scan and OCR validation outcomes, defect codes, and image paths.

### 4.6. `plc.db` (PLC Adapter)
- `plc_devices`: Connected PLC configurations (Modbus TCP, OPC UA).
- `plc_commands`: Conveyor and robot arm control commands issued from the job engine.
- `plc_events`: Signals and sensors captured from the hardware.
- `plc_robot_pick_events`: Product pick validation and positioning data.

### 4.7. `kiosk.db` (Kiosk UI)
- `kiosk_users` & `kiosk_roles`: User registry and RBAC assignments.
- `kiosk_permissions` & `kiosk_role_permissions`: Granular capability controls.
- `kiosk_sessions`: Authentication tokens (JWT) and login tracking.
- `kiosk_access_logs`: Auditing of security events and manual overrides.

---

## 5. Development Command Reference

### Build & Restore
To restore packages and build the solution:
```bash
cd station-agent
dotnet restore
dotnet build
```

### Local Dev Startup (Properties/launchSettings.json profiles)
Services use `Properties/launchSettings.json` to configure ports and environment profiles.
To run a service locally in `Development` mode:
```bash
cd station-agent/services/<service-name>/src/ND.<Service>.Api
dotnet run
```

### Central Package Management (CPM)
- All packages are configured in `Directory.Packages.props` at the root of `station-agent`.
- **Never** add package versions inside individual `.csproj` files. Use `<PackageReference Include="PackageName" />` only.
- In case of transitive native library vulnerability warnings (e.g. `SQLitePCLRaw`), use `NuGetAuditMode=direct` in `Directory.Build.props` to restrict auditing to direct dependencies.

---

## 6. Current Deployment Configuration
- **Server IP Address**:
  - Private LAN IP: `192.168.1.87`
  - Tailscale VPN IP: `100.68.50.41`
- **Cloudflare Tunnel Routing**:
  - Systemd Service: [simulator-frontend.service](file:///etc/systemd/system/simulator-frontend.service) runs `cloudflared tunnel --url http://localhost:5008`.
  - Exposes the visual Device Simulator dashboard at: `https://renaissance-inform-ensemble-wiley.trycloudflare.com`
- **Proxy/Gateway Routing**:
  - The `device-simulator` backend (port `5008`) acts as a reverse-proxy forwarding `/api/label-templates/{*path}` and `/api/print-history/{*path}` to the `printer-adapter` service (port `5003`). This ensures that the frontend running behind a Cloudflare tunnel URL can access printer templates and print histories without CORS or 405 Method Not Allowed issues.
