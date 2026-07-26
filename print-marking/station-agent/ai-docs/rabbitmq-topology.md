# Realtime Kiosk Architecture — RabbitMQ Topology

This document details the exchanges, queues, and routing key bindings configured within the station-agent broker.

## Exchange Layout

The broker maps all station-level events onto a single **Topic Exchange** to support flexible, multi-consumer event routing.

- **Name**: `station.events`
- **Type**: `Topic`
- **Durable**: `true`

---

## Routing Keys & Event Registry

| Routing Key | Event Type | Publisher | Description |
| :--- | :--- | :--- | :--- |
| `mqtt.MqttMessage.MqttMessageReceived` | `MqttMessageReceived` | `mqtt-adapter` | Published when a raw command is successfully recorded from the factory gateway. |
| `job.created` | `JobCreated` | `job-engine` | Published when a new production job is queued in the system. |
| `job.processing` | `JobProcessing` | `job-engine` | Published when job execution starts (attempt begins). |
| `job.completed` | `JobCompleted` | `job-engine` | Published when all execution steps succeed. |
| `job.failed` | `JobFailed` | `job-engine` | Published on permanent job failure or unrecoverable step failure. |

---

## Queue Configuration & Bindings

Every subscriber service declares its own **Durable Queues** and binds them to the `station.events` exchange using specific routing key patterns.

### 1. Job Engine Queues
- **Queue Name**: `job-engine.mqtt-messages`
- **Durable**: `true`
- **Binding Pattern**: `mqtt.MqttMessage.MqttMessageReceived`
- **Prefetch Count**: `1` (manual acknowledgment)
- **Role**: Triggers job creation and execution command pipeline upon receiving incoming MQTT requests.

### 2. Projection Service Queues
- **Queue Name**: `projection-service.job-events`
- **Durable**: `true`
- **Binding Pattern**: `job.*`
- **Role**: Maintains the materialized station production state and activity feeds based on job transitions.

- **Queue Name**: `projection-service.mqtt-events`
- **Durable**: `true`
- **Binding Pattern**: `mqtt.MqttMessage.*`
- **Role**: Records raw inbound gateway messages into the user activity stream.
