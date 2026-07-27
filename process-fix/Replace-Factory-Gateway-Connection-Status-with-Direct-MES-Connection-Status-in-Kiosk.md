# Replace Factory Gateway Connection Status with Direct MES Connection Status in Kiosk

## Background

The current Kiosk “Device Network” page still displays:

```text
Factory Gateway Communication Port
MQTT secure connection — receiving commands from factory ERP

This is now outdated.

The Station Agent no longer depends on Factory Gateway as the production-order transport layer.

The new intended flow is:

MES
→ direct HTTP/API integration
→ Station Gateway / Print Station
→ Job Engine
→ RabbitMQ
→ Printer Adapter
→ Physical Printer

Therefore, the Kiosk must stop presenting Factory Gateway as the upstream connection.

The upstream connection card must represent the actual direct MES-to-Print-Station integration.

The required replacement is conceptually:

MES Connection
or
MES Communication Gateway
or
MES Production Connection

Use the naming that best matches the existing product language and source-code conventions.

Objective

Investigate the real direct MES integration path and replace the outdated Factory Gateway connection block in Kiosk with an accurate MES connection status.

The final Kiosk should display the health and activity of:

MES
→ Station Gateway / Print Station

instead of:

Factory Gateway
→ MQTT

The implementation must be based on actual runtime evidence.

Do not only rename text in the frontend.

The new card must reflect the real MES connection and recent communication state.

Mandatory Investigation Before Coding

Before changing code, inspect the full repository and running services.

Inspect at minimum:

MES integration endpoints
Station Gateway controllers
incoming production-order APIs
authentication middleware
Print Station registration or binding APIs
Kiosk device-network API
Projection Service connection projections
SignalR events
health endpoints
heartbeat or last-request tracking
Docker Compose configuration
environment variables
tests

Determine the exact current runtime path used by MES.

Answer these questions from source code and runtime evidence:

Which service receives direct requests from MES?
Which HTTP endpoint does MES call?
Is the receiver still named station-gateway, or has another integration service replaced it?
Is communication HTTP, HTTPS, gRPC, Kafka, or another protocol?
How is MES authenticated?
Does MES send periodic heartbeats?
If no heartbeat exists, how can recent MES communication be inferred safely?
Which service currently produces the Factory Gateway card data?
Is the Factory Gateway card based on:
hardcoded data
MQTT broker health
Projection Service state
SignalR
Station Gateway status
last received order
Which events or database records prove that MES recently communicated with the station?

Do not assume the old documentation is still correct.

Use this evidence priority:

Running source code
Runtime configuration
API responses and logs
Database state
Tests
Documentation
Current and Target Architecture
Outdated view
ERP / Factory Gateway
→ MQTT
→ Station Agent
Target view
MES
→ direct authenticated request
→ Station Gateway / Print Station
→ internal RabbitMQ workflow

The Kiosk upstream connection card must describe only the external MES-to-station link.

RabbitMQ is an internal station dependency and should remain visible in diagnostics or Printer Adapter Monitoring, not be presented as the MES connection itself.

Phase 1 — Audit the Current Factory Gateway Card

Find the frontend component that renders:

Factory Gateway Communication Port
MQTT secure connection
receiving commands from factory ERP

Find all related:

translation keys
labels
icons
DTOs
API endpoints
Zustand or React state
SignalR handlers
status calculation logic
timestamps
online/offline counters

Document:

Frontend component:
Backend endpoint:
Projection query:
Source table or event:
Status calculation:
Last-connected calculation:

Determine whether the card is truly backed by MQTT status or is only static UI text.

Remove obsolete logic only after confirming it is no longer used elsewhere.

Phase 2 — Audit Direct MES Request Flow

Locate the direct MES production-order endpoint.

Possible route examples:

POST /api/gateway/orders
POST /api/station/orders
POST /api/integration/mes/orders
POST /api/v1/print-stations/{id}/orders

Use the actual route from source code.

Inspect:

request controller
authentication
validation
idempotency
request persistence
outbox publishing
response
error handling
request timestamps
source-system field

Confirm that a valid MES request can be distinguished from:

Device Simulator
manual test
internal retry
Kiosk request
legacy Factory Gateway request

The connection card must not become ONLINE merely because Device Simulator sent a test order.

Phase 3 — Define MES Connection Semantics

HTTP is not a permanent connection like MQTT.

Therefore, do not model MES as continuously connected unless there is a real persistent connection or heartbeat.

Use accurate status semantics.

Recommended states:

CONNECTED
RECENTLY_ACTIVE
IDLE
DEGRADED
OFFLINE
UNKNOWN

Adapt to existing UI status terminology where necessary.

Option A — MES heartbeat exists

If MES sends a dedicated heartbeat:

CONNECTED:
last successful heartbeat within threshold

DEGRADED:
heartbeat delayed but endpoint is healthy

OFFLINE:
heartbeat missing beyond timeout
Option B — No MES heartbeat exists

If MES only sends production orders:

AVAILABLE:
Station Gateway endpoint is healthy and ready

RECENTLY_ACTIVE:
a valid MES request was received recently

IDLE:
endpoint is healthy but no recent MES request

DEGRADED:
endpoint is running but a required dependency is failing

OFFLINE:
Station Gateway is unreachable or not ready

UNKNOWN:
no evidence has been collected yet

Do not call an idle HTTP integration “Offline” only because no order was sent recently.

Separate:

Service availability
from
Recent MES activity
Phase 4 — Add MES Integration Health Model

Create or reuse a canonical read model for MES integration health.

Suggested model:

interface MesConnectionStatus {
  status:
    | "AVAILABLE"
    | "RECENTLY_ACTIVE"
    | "IDLE"
    | "DEGRADED"
    | "OFFLINE"
    | "UNKNOWN";

  stationGatewayStatus:
    | "HEALTHY"
    | "DEGRADED"
    | "UNHEALTHY"
    | "UNKNOWN";

  endpoint?: string;
  protocol: "HTTP" | "HTTPS" | "GRPC" | "KAFKA";

  authenticationMode?: string;

  lastMesRequestAt?: string;
  lastSuccessfulRequestAt?: string;
  lastFailedRequestAt?: string;

  lastRequestType?: string;
  lastSourceSystem?: string;

  successfulRequestsLastHour: number;
  failedRequestsLastHour: number;

  responseTimeMs?: number;
  latestError?: string;

  updatedAt: string;
}

Do not expose:

tokens
passwords
API keys
complete request payloads
internal stack traces
Phase 5 — Determine the Source of Truth

Prefer existing persisted runtime evidence.

Possible sources:

gateway_requests
integration_request_logs
station_gateway_requests
inbound_messages
outbox records
audit logs
Projection Service connection state

If the Station Gateway already stores incoming request metadata, reuse it.

Do not create another duplicate request log.

If no suitable source exists, add minimal telemetry to the direct MES entry point.

Record only:

request ID
source system
request type
received timestamp
success/failure
response time
HTTP status
sanitised error

Do not store duplicate production payloads solely for connection monitoring.

Phase 6 — Projection Service Changes

Projection Service should remain the source of truth for Kiosk read models.

Implement or correct a MES integration projection.

Possible events:

mes.request.received
mes.request.accepted
mes.request.rejected
mes.connection.heartbeat
station.gateway.health.changed

Do not create events if the project already has suitable existing ones.

If the direct entry point already writes request state to a database but does not publish runtime events, either:

project from existing events, or
expose a safe internal API that Projection Service polls at a conservative interval.

Prefer event-driven updates when they fit the architecture.

The projection must not depend on the old MQTT connection state.

Phase 7 — Backend API for Kiosk

Create or update a Projection Service endpoint.

Suggested route:

GET /api/projection/integrations/mes

Example response:

{
  "integrationCode": "MES",
  "displayName": "MES Production Connection",
  "status": "RECENTLY_ACTIVE",
  "protocol": "HTTPS",
  "stationGateway": {
    "status": "HEALTHY",
    "responseTimeMs": 18
  },
  "lastMesRequestAt": "2026-07-27T05:14:22Z",
  "lastSuccessfulRequestAt": "2026-07-27T05:14:22Z",
  "successfulRequestsLastHour": 6,
  "failedRequestsLastHour": 0,
  "latestError": null,
  "updatedAt": "2026-07-27T05:15:45Z"
}

If no recent MES request exists but the station endpoint is ready:

{
  "status": "IDLE",
  "stationGateway": {
    "status": "HEALTHY"
  },
  "lastMesRequestAt": null
}

The endpoint must clearly distinguish endpoint health from recent upstream activity.

Phase 8 — SignalR Updates

Add or reuse a real-time SignalR event for MES integration state.

Suggested event:

OnMesConnectionStatusChanged

Alternative:

OnIntegrationStatusChanged

Use the generic event only if the platform already models multiple external integrations.

The event should be emitted when:

Station Gateway becomes healthy or unhealthy
a valid MES request is accepted
a MES request fails
a heartbeat is received
status changes between AVAILABLE, IDLE, DEGRADED, and OFFLINE

Do not push an event every few seconds when nothing changed.

Phase 9 — Kiosk UI Replacement

Replace the current Factory Gateway card.

Remove outdated text

Remove:

Factory Gateway Communication Port
MQTT secure connection — receiving commands from factory ERP

Also remove or deprecate related translation keys if unused.

New title

Recommended Vietnamese display:

Kết nối MES

or:

Cổng kết nối MES

Recommended English display:

MES Connection
New description

Example:

Nhận trực tiếp lệnh sản xuất từ hệ thống MES

English:

Receives production orders directly from MES

Do not mention MQTT unless MES actually uses MQTT.

Data shown

The card should display:

MES integration status
Station Gateway readiness
protocol
last successful MES request
recent success/failure count
latest error, when present

Example:

MES Connection                 Recently Active
Direct HTTPS production integration
Station Gateway: Healthy
Last MES request: 1 minute ago

When no recent order exists:

MES Connection                 Idle
Station Gateway is ready
Waiting for the next MES production order
Phase 10 — Correct Counters

The existing top-level counters currently show device-network totals.

Confirm whether the upstream integration card contributes to:

Online
Offline
Total

Do not count MES integration as a physical endpoint device unless current business rules intentionally do so.

Recommended separation:

Integration status:
MES connection card

Device totals:
Camera
Laser
PLC
Printer

For the screenshot state:

Camera: Online
Laser: Offline
PLC: Online
Printer: Online

the device totals should remain:

Online: 3
Offline: 1
Total: 4

The MES connection card should not change these device counts.

Phase 11 — Remove Legacy Factory Gateway Dependencies Safely

Search for:

FactoryGateway
Factory Gateway
factory-gateway
MQTT connection
MQTT secure
ERP gateway
gateway online
last mqtt heartbeat

Classify every occurrence:

ACTIVE
LEGACY_BUT_REQUIRED
UI_ONLY_OBSOLETE
SAFE_TO_REMOVE
DOCUMENTATION_ONLY

Do not remove internal MQTT support if it is still used by another workflow.

Only remove the legacy Factory Gateway connection model from the direct MES production-order path and Kiosk display.

Preserve backward compatibility only when there is a real active consumer.

Phase 12 — Health Check Verification

Verify the actual Station Gateway health endpoint.

Possible:

GET /health
GET /api/health
GET /health/ready

Use the real endpoint.

The MES card should report DEGRADED when the Station Gateway process is alive but required dependencies for accepting orders are unavailable, such as:

RabbitMQ
Redis idempotency
local database
outbox persistence

Do not show AVAILABLE if the HTTP process responds but cannot safely accept an MES order.

Phase 13 — Runtime Test Script

Create:

scripts/verify-mes-station-connection.sh

The script must:

Check Station Gateway health.
Check readiness.
Check required dependencies.
Query the Projection MES integration endpoint.
Verify the old Factory Gateway/MQTT state is not returned.
Send a safe test MES request only when supported.
Confirm the request is recorded as source MES.
Confirm Projection updates.
Confirm SignalR notification is emitted where testable.
Confirm Kiosk API returns the new MES connection model.

Output:

[PASS] Station Gateway healthy
[PASS] Station Gateway ready
[PASS] MES integration endpoint available
[PASS] Test MES request accepted
[PASS] Last MES request timestamp updated
[PASS] Kiosk receives MES connection state
[PASS] Legacy Factory Gateway label removed

Use:

PASS
FAIL
WARN
SKIPPED

Do not trigger a physical print unless explicitly requested.

Phase 14 — Automated Tests

Add tests for:

Backend
Station Gateway healthy
Station Gateway degraded
Station Gateway offline
valid direct MES request updates activity
invalid request updates failure count
Device Simulator request does not count as MES activity
manual request does not count as MES activity
no recent request results in IDLE, not OFFLINE
dependency failure results in DEGRADED
secrets are not exposed
Projection Service
MES request event creates projection
later request updates same projection
failed request updates error state
no duplicate integration rows
SignalR event emitted only on meaningful changes
Kiosk UI
Factory Gateway text is removed
MQTT description is removed
MES Connection card renders
healthy and recently active states render
idle state renders correctly
degraded state renders correctly
last request timestamp updates
device counters remain independent
SignalR update refreshes the card without page reload
Phase 15 — Runtime Verification

After implementation:

Build Station Gateway.
Build Projection Service.
Build Kiosk backend and frontend.
Run unit tests.
Run integration tests.
Start the affected services.
Verify Station Gateway health.
Open Kiosk Device Network page.
Confirm the old Factory Gateway card is gone.
Confirm the MES Connection card is visible.
Confirm protocol text is accurate.
Confirm Station Gateway readiness is visible.
Send one safe direct MES request.
Confirm last MES request time updates.
Confirm SignalR updates the UI without refresh.
Confirm device counts remain 3 online, 1 offline, 4 total for the shown device state.
Stop or degrade Station Gateway safely.
Confirm MES card becomes degraded/offline.
Restore it.
Confirm automatic recovery.

Do not claim success based only on changing labels.

Documentation

Create or update:

print-marking/implementation/direct-mes-kiosk-connection-status.md
print-marking/AI_CONTEXT.md
services/station-gateway/README.md
services/projection-service/README.md
services/kiosk-ui/README.md

Document:

old architecture
current direct MES architecture
direct MES endpoint
authentication
status semantics
source of truth
Projection API
SignalR event
Kiosk display
test script
known limitations

Mark old Factory Gateway/MQTT display documentation as deprecated where appropriate.

Important Architectural Boundary

Correct:

MES
→ Station Gateway
→ internal RabbitMQ
→ Job Engine and device adapters

Incorrect Kiosk representation:

MES
→ Factory Gateway
→ MQTT
→ Station Agent

The Kiosk connection card represents:

External MES → Station Gateway

It does not represent:

Printer Adapter → RabbitMQ

That dependency belongs in Printer Adapter Monitoring and system diagnostics.

Stop Conditions

Stop and report findings instead of implementing blindly if:

direct MES transport cannot be identified
MES and Device Simulator requests cannot be distinguished
the old Factory Gateway is still actively required
there is no reliable way to determine MES activity
the UI would need to fake a persistent connection for HTTP
the change would break current order intake
Station Gateway readiness does not reflect required dependencies

Otherwise, implement the correction immediately.

Final Acceptance Criteria

The task is complete only when:

The old Factory Gateway card is removed from Kiosk.
MQTT-specific wording is removed from this integration card.
A MES Connection card is displayed.
The card uses actual direct MES integration data.
Station Gateway health is shown.
Recent MES request activity is shown.
HTTP idle state is not incorrectly shown as offline.
Device Simulator traffic is not counted as MES traffic.
Failed MES requests affect status appropriately.
Projection Service is the Kiosk source of truth.
SignalR updates work.
Device counters remain correct and independent.
Existing printer, camera, PLC, and laser cards remain unaffected.
Existing production-order intake still works.
Automated tests pass.
Runtime verification passes.
Documentation is updated.
Final Report

Report:

Root Cause

Why Factory Gateway was still displayed.

Current MES Flow
receiver service
endpoint
protocol
authentication
dependency chain
Status Semantics

Explain:

AVAILABLE
RECENTLY_ACTIVE
IDLE
DEGRADED
OFFLINE
UNKNOWN
Code Changes

List every modified file.

Projection Changes
model
data source
API
SignalR event
Kiosk Changes
removed text
new card
state handling
counters
Runtime Evidence
Station Gateway health
test MES request
updated last request
SignalR update
Kiosk screenshot/API response

Do not report “implemented and verified” unless a real direct MES request updated the new Kiosk card successfully.


Điểm quan trọng nhất là HTTP từ MES xuống không giống MQTT persistent connection. Vì vậy card mới nên tách rõ:

- **Station Gateway available/ready**
- **MES recently active / idle**
- **last MES request**

Không nên hiển thị `Offline` chỉ vì 5 phút chưa có lệnh sản xuất.