CLAUDE CODE IMPLEMENTATION PROMPT

You are a Senior .NET Architect and Industrial IoT Engineer.

You are working on an existing ND Marking Station codebase.

Current system already contains:

mqtt-adapter-service
job-engine-service
printer-adapter-service
laser-adapter-service
vision-service
plc-adapter-service
kiosk-ui-service

The system follows:

Database per service
SQLite per service
Redis shared cache
MQTT communication with Factory Gateway
Offline-first architecture
Store & Forward pattern
Outbox Pattern
Clean Architecture
DDD-lite
CQRS-lite
.NET 9
NEW REQUIREMENT

Create a new service:

device-simulator-service

Purpose:

Simulate all factory devices for local development and demo environments.

The simulator must emulate:

Label Printer
Zebra
Honeywell
Laser Marker
Fiber Laser
UV Laser
Vision Camera
OCR
Barcode Scanner
PLC / I/O Line
Conveyor
Reject Gate
Robot Pick

The simulator must allow developers to run the entire factory flow without real hardware.

HIGH LEVEL ARCHITECTURE
Factory Gateway
        │
        │ MQTT
        ▼
mqtt-adapter-service
        │
        ▼
job-engine-service
        │
 ┌──────┼────────┐
 ▼      ▼        ▼
Printer Laser   PLC
Adapter Adapter Adapter
 │       │       │
 └──► Device Simulator

Device Simulator acts as virtual hardware.

DEVICE SIMULATOR FEATURES

Create:

src/services/device-simulator-service

Technology:

ASP.NET Core 9
SignalR
Minimal API
SQLite
React + Vite
Tailwind
SIMULATED DEVICES

The service must simulate:

Printer

State:

ONLINE
OFFLINE
BUSY
ERROR

Receive:

{
  "jobId":"xxx",
  "printerId":"zebra-01",
  "template":"label-template",
  "fc":"FC-998822"
}

Response:

{
  "success":true,
  "status":"PRINTED"
}

Configurable delay:

500ms
1000ms
3000ms

Configurable failure rate:

0%
5%
10%
20%
Laser

State:

ONLINE
OFFLINE
BUSY
ERROR

Receive:

{
  "jobId":"xxx",
  "template":"laser-template",
  "fc":"FC-998822"
}

Return:

{
  "success":true,
  "status":"MARKED"
}
Vision

Receive image inspection request.

Simulate:

PASS
FAIL
DUPLICATE_CODE
LOW_CONTRAST
UNREADABLE

Configurable pass rate.

PLC

Support:

START_CONVEYOR
STOP_CONVEYOR
REJECT_PRODUCT
ROBOT_PICK

Return:

{
  "success":true,
  "executionTime":120
}
REALTIME DASHBOARD

Create React UI.

Route:

/simulator

Dashboard contains:

Device List

Cards:

Printer
Laser
Vision
PLC

Each card shows:

Device Name
Status
Last Request
Last Response
Heartbeat

Realtime update via SignalR.

Live Logs

Show:

Timestamp
Device
Direction
Payload
Response
Duration

Auto refresh.

Keep last:

1000 logs
Connection Panel

Show:

MQTT Broker
Redis
SQLite
Internet
Factory Gateway

Indicators:

GREEN
YELLOW
RED
Environment Panel

Render all config values loaded from .env.

Example:

MQTT_HOST
MQTT_PORT
MQTT_USERNAME
MQTT_PASSWORD

REDIS_HOST

FACTORY_GATEWAY_TOPIC

PRINTER_FAILURE_RATE

VISION_PASS_RATE

Editable in UI.

Changes should update configuration dynamically.

MQTT ADAPTER UPGRADE

Review mqtt-adapter-service.

Enforce strict ND Unified Event Protocol.

Every outbound event MUST follow exactly:

{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Laser-Marking-03",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:30:00+07:00",
  "event_id": "evt-mark-20260616-9921",
  "data": [
    {
      "tag": "marking.type",
      "value": "LASER_ETCHING",
      "quality": "GOOD"
    }
  ]
}
CREATE CONTRACT PACKAGE

Create shared package:

src/shared/nd-unified-contracts

Containing:

UnifiedEvent
UnifiedTag
EventQuality
TagNames

Validation rules:

event_id mandatory
timestamp mandatory
site mandatory
area mandatory
line mandatory
machine mandatory
edge_id mandatory

Reject invalid payloads.

MQTT TOPICS

Define constants.

Inbound:

factory/commands/#

Outbound:

factory/events/#

Ack:

factory/ack/#

Heartbeat:

factory/heartbeat/#
DEVICE SIMULATION API

Create endpoints:

POST /api/printer/print
POST /api/laser/mark
POST /api/vision/verify
POST /api/plc/execute

Health:

GET /health

Realtime:

/ws/signalr
HEARTBEAT

Each simulated device emits:

{
  "deviceId":"printer-01",
  "status":"ONLINE",
  "timestamp":"..."
}

Every:

5 seconds

Store heartbeat history.

DATABASE

Create SQLite database:

device_simulator.db

Tables:

simulated_devices
device_requests
device_responses
device_logs
device_heartbeats
system_connections
configuration_values

Include migration scripts.

OBSERVABILITY

Implement:

Serilog
OpenTelemetry
CorrelationId
RequestId
JobId

Every device request must be traceable.

CLAUDE CODE DOCUMENTATION UPDATE

Update:

/ai-docs

Create:

device-simulator-service.md
mqtt-unified-protocol.md
factory-gateway-contract.md

Document:

architecture
API
MQTT topics
payload examples
sequence diagrams
failure scenarios
retry policy
offline mode
heartbeat flow
DELIVERABLE

Generate:

Complete source code
SQLite migrations
React dashboard
SignalR realtime updates
MQTT strict contract validation
Dockerfile
docker-compose integration
Documentation
Unit tests
Integration tests

Follow existing project conventions and keep architecture consistent with all existing services.