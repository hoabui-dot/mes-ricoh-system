# Implement Device Heartbeat and Factory Monitoring Architecture

## Context

Review the existing codebase and architecture before making changes.

Current architecture:

Factory Gateway
→ MQTT Adapter Service
→ Outbox Pattern
→ RabbitMQ
→ Job Engine Service
→ Device Simulator Service (future: Printer, Laser, PLC, Vision)
→ Projection Service
→ SignalR
→ Kiosk UI

Currently device status is not managed through a dedicated monitoring mechanism.

The system needs a scalable and event-driven solution for device health monitoring, connectivity tracking, and realtime UI updates.

---

## Objective

Implement a Device Heartbeat architecture and introduce a dedicated Factory Monitoring Service.

The goal is to eliminate direct polling from Projection Service and ensure all device health information is propagated through RabbitMQ events.

---

## Architecture Requirements

### Device Services

Applicable to:

* Printer Service
* Laser Service
* Vision Service
* PLC Adapter
* Factory Gateway Adapter
* Device Simulator Service

Each service becomes the owner of its own operational state.

Device services must publish:

### DeviceHeartbeat

Every 5 seconds.

Example:

```json
{
  "deviceId": "printer-01",
  "deviceType": "Printer",
  "stationId": "station-01",
  "heartbeatAt": "UTC timestamp",
  "currentState": "Printing"
}
```

Possible states:

* Ready
* Busy
* Printing
* Verifying
* Error
* Maintenance
* Reconnecting

Heartbeat should be lightweight and idempotent.

---

### DeviceStatusChanged

Publish whenever operational state changes.

Examples:

Ready → Printing

Printing → Ready

Ready → Error

Offline → Online

Example payload:

```json
{
  "deviceId": "printer-01",
  "deviceType": "Printer",
  "stationId": "station-01",
  "previousState": "Ready",
  "currentState": "Printing",
  "occurredAt": "UTC timestamp"
}
```

---

## Create Factory Monitoring Service

Introduce a new microservice:

Factory Monitoring Service

Responsibilities:

* Subscribe to DeviceHeartbeat events
* Maintain latest heartbeat per device
* Track connectivity status
* Detect offline devices
* Publish monitoring events

This service becomes the source of truth for connectivity.

---

## Offline Detection Logic

Store:

* DeviceId
* LastHeartbeatAt
* CurrentState

Detection rule:

If

CurrentTime - LastHeartbeatAt > 15 seconds

then mark device as Offline.

Publish:

DeviceOfflineDetected

Example:

```json
{
  "deviceId": "printer-01",
  "stationId": "station-01",
  "offlineAt": "UTC timestamp"
}
```

---

When heartbeat resumes:

Publish:

DeviceOnlineDetected

Example:

```json
{
  "deviceId": "printer-01",
  "stationId": "station-01",
  "onlineAt": "UTC timestamp"
}
```

---

## Factory Gateway Monitoring

Factory Gateway connectivity is the highest priority operational signal.

Implement heartbeat publishing from Gateway Adapter.

Example:

```json
{
  "gatewayId": "factory-gateway",
  "stationId": "station-01",
  "connected": true,
  "heartbeatAt": "UTC timestamp"
}
```

Monitoring Service must detect:

* Gateway Online
* Gateway Offline
* Gateway Reconnected

Publish corresponding events.

Kiosk UI must prominently display gateway status.

---

## Projection Service Changes

Projection Service must no longer perform health checks or device polling.

Projection Service responsibilities:

* Subscribe to monitoring events
* Update read model
* Push SignalR updates

Subscribe to:

* DeviceHeartbeat
* DeviceStatusChanged
* DeviceOfflineDetected
* DeviceOnlineDetected
* FactoryGatewayOnline
* FactoryGatewayOffline
* FactoryGatewayReconnected

Update projection database accordingly.

---

## Kiosk UI Integration

Create a dedicated tab:

System & Connectivity

Display:

Factory Gateway

RabbitMQ

MQTT

Printer

Laser

PLC

Vision Camera

Statuses:

Online

Offline

Busy

Printing

Verifying

Maintenance

Error

Reconnecting

Updates must arrive through SignalR only.

No frontend polling.

No direct service calls.

---

## CQRS Validation

Ensure strict separation:

Command Side:

* MQTT Adapter
* Job Engine
* Device Services

Read Side:

* Factory Monitoring Service
* Projection Service
* Kiosk UI

Kiosk UI must never query device services directly.

Projection Database must remain the single source of truth for UI reads.

---

## Technical Deliverables

Review current implementation and produce:

1. Architecture diagram
2. Sequence diagram
3. DeviceHeartbeat event contract
4. DeviceStatusChanged event contract
5. Offline detection implementation
6. Monitoring database schema
7. Projection schema updates
8. RabbitMQ topology
9. SignalR update flow
10. Migration strategy from current implementation

Implement production-ready code following existing project conventions and architecture standards.
