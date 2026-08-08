# Realtime Kiosk Architecture — Kafka Topology

This document details the Kafka topics, partition keys, serialization conventions, and consumer groups configured within the station-agent event streaming environment.

---

## 1. Topic Layout & Configuration

The broker uses a centralized set of **Kafka Topics** to route station-level production and diagnostics events. All topics are configured with:
- **Cleanup Policy**: `delete`
- **Replication Factor**: `1` (for local edge stations) or `3` (for cluster production environments)
- **Retention**: `86400000 ms` (24 hours) to preserve storage on edge IPCs.

---

## 2. Topic Registry

| Topic Name | Key Schema | Payload Type | Publisher | Description |
| :--- | :--- | :--- | :--- | :--- |
| `station.gateway-orders` | `EventId` (String) | `UnifiedEvent` (JSON) | `Station Gateway` | Emitted when a production order is received via HTTP and persisted in the outbox. |
| `station.job-events` | `JobId` (String) | `JobEvent` (JSON) | `Job Engine` | Tracks lifecycle updates: `JobCreated`, `JobProcessing`, `JobCompleted`, and `JobFailed`. |
| `station.device-heartbeats` | `DeviceId` (String) | `DeviceHeartbeat` (JSON) | `Virtual Devices / Drivers` | Emitted by printer/laser/PLC adapters to broadcast diagnostic metrics. |
| `station.manual-overrides` | `JobId` (String) | `ManualRequest` (JSON) | `Kiosk UI / API` | Relays operator overrides: manual reprints, manual reprocessing, or status corrections. |

---

## 3. Partitioning & Sequencing Strategy

To maintain strict event order processing (e.g., ensuring `JobCreated` is processed before `JobProcessing` and `JobCompleted`), the following partitioning strategy is used:

- **Topic Key**:
  - `station.gateway-orders` uses **`EventId`** as the partition key.
  - `station.job-events` uses **`JobId`** as the partition key.
  - `station.device-heartbeats` uses **`DeviceId`** as the partition key.
  - `station.manual-overrides` uses **`JobId`** as the partition key.
- **Outcome**: All events sharing the same key are dispatched to the same partition, guaranteeing in-order execution within that partition.

---

## 4. Consumer Groups

Multiple independent components subscribe to the topics. Each component uses a distinct **Consumer Group** to enable scaling and failover.

### 1. Job Engine Group (`job-engine-group`)
- **Subscribed Topic**: `station.gateway-orders`
- **Deserializer**: `JsonSerializer<UnifiedEvent>`
- **Offsets Commit**: Manual, after the incoming gateway order is successfully queued and written to the database unit-of-work.
- **Role**: Dispatches jobs into the orchestration pipeline for print/laser/inspection executions.

### 2. Projection Service Group (`projection-service-group`)
- **Subscribed Topics**: `station.job-events`, `station.device-heartbeats`, `station.gateway-orders`, `station.manual-overrides`
- **Deserializer**: Dynamic JSON message parsing based on headers.
- **Offsets Commit**: Automatic.
- **Role**: Maintains the materialized view in `projection.db` (read model) and pushes updates to the Kiosk UI over SignalR.
