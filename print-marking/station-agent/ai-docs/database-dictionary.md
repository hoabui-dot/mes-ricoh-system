# Database Dictionary — Print-Marking Edge Station

This document catalog details the database schemas across the services in the Database-Per-Service configuration. The system deploys isolated SQLite databases on the edge industrial IPC.

---

## 1. Edge Databases Overview

| Database | Service Owner | Primary Role | Tables |
|---|---|---|:---:|
| **`gateway.db`** | `station-gateway` | Idempotency requests logs & Kafka outbox buffer | 2 |
| **`job_engine.db`** | `job-engine` | Workflow state machine & execution tracking | 3+ |
| **`kiosk.db`** | `kiosk-ui` | Authentication, RBAC configuration, audits | 4+ |
| **`printer.db`** | `printer-adapter` | Printer hardware config, templates, history | 3+ |
| **`laser.db`** | `laser-adapter` | Laser engraving parameters & run logs | 2 |
| **`vision.db`** | `vision-service` | Cameras metadata & scanning inspection results | 2 |
| **`plc.db`** | `plc-adapter` | PLC controllers & robot pick history | 2 |
| **`projection.db`** | `projection-service` | Read-model projection cache for Kiosk UI | 4 |

---

## 2. Service Schemas Detail

### 2.1. Gateway Database (`gateway.db`)

Coordinates HTTP request auditing, deduplication, and transactional outbox publishes to Kafka.

#### Table: `gateway_requests`
Goal: Maintain a persistent audit trail and deduplication log of all JSON production orders submitted by the Factory Gateway.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY, NOT NULL | Unique database record ID |
| `request_id` | TEXT | UNIQUE, NOT NULL | Canonical event/order ID used as the idempotency key |
| `source` | TEXT | NOT NULL | Trigger system ID (e.g. Factory Gateway edge_id) |
| `payload_json` | TEXT | NOT NULL | Raw JSON payload of the request |
| `status` | TEXT | NOT NULL | Processing state: `RECEIVED`, `PROCESSED`, `FAILED` |
| `received_at` | TEXT | NOT NULL | Timestamp when message arrived |
| `processed_at` | TEXT | NULL | Timestamp when successfully processed |
| `error_message` | TEXT | NULL | Parsing/validation error details in case of failures |
| `created_at` | TEXT | NOT NULL | Record creation timestamp |
| `updated_at` | TEXT | NOT NULL | Last modified timestamp |

#### Table: `gateway_outbox_events`
Goal: Implements the Transactional Outbox pattern to guarantee event publishing to Apache Kafka.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY, NOT NULL | Unique outbox event ID |
| `aggregate_type` | TEXT | NOT NULL | Source domain entity class name |
| `aggregate_id` | TEXT | NOT NULL | Key identifier of the related entity |
| `event_type` | TEXT | NOT NULL | Event name (e.g., `MqttMessageReceived`) |
| `payload_json` | TEXT | NOT NULL | Serialized event contents |
| `routing_key_hint` | TEXT | NOT NULL | Topic/Routing key metadata (e.g. `mqtt.MqttMessage.MqttMessageReceived`) |
| `status` | TEXT | NOT NULL | Outbox status: `PENDING`, `PUBLISHED`, `FAILED` |
| `retry_count` | INTEGER | NOT NULL | Number of retry attempts |
| `next_retry_at` | TEXT | NULL | Delay timestamp before next retry |
| `published_at` | TEXT | NULL | Timestamp when published to Kafka |
| `created_at` | TEXT | NOT NULL | Record creation timestamp |
| `updated_at` | TEXT | NOT NULL | Last modified timestamp |

---

### 2.2. Job Engine Database (`job_engine.db`)

Coordinates orchestrating manufacturing run attempts, steps, and statuses.

#### Table: `job_engine_jobs`
Goal: Coordinates the primary workflow lifecycle.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY, NOT NULL | Unique Job ID |
| `job_no` | TEXT | UNIQUE, NOT NULL | Human-readable Work Order identifier |
| `source_system` | TEXT | NOT NULL | System that generated the trigger (`STATION_GATEWAY`) |
| `job_type` | TEXT | NOT NULL | Sequence mode (`PRINT_ONLY`, `MARK_ONLY`, `PRINT_AND_MARK`) |
| `current_status` | TEXT | NOT NULL | Status: `CREATED`, `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `product_code` | TEXT | NOT NULL | Target product SKU |
| `product_serial` | TEXT | NULL | Assigned serial number |
| `payload_json` | TEXT | NOT NULL | Serialized recipe recipe options and print variables |
| `priority` | INTEGER | NOT NULL | Higher priority is processed first |
| `created_at` | TEXT | NOT NULL | Creation timestamp |
| `updated_at` | TEXT | NOT NULL | Update timestamp |

---

### 2.3. Projection Database (`projection.db`)

Provides the CQRS read model, maintaining flat tables of the current active states for Kiosk UI consumption.

#### Table: `production_views`
Goal: Materialized view of the active job at the edge station.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `station_id` | TEXT | PRIMARY KEY, NOT NULL | Active Station ID |
| `job_id` | TEXT | NOT NULL | Current active Job ID |
| `work_order_no` | TEXT | NOT NULL | Active Work Order |
| `product_code` | TEXT | NOT NULL | Target SKU |
| `product_serial` | TEXT | NULL | Serial number currently in process |
| `job_status` | TEXT | NOT NULL | Current running status |
| `updated_at` | TEXT | NOT NULL | View update timestamp |

#### Table: `activity_logs`
Goal: Materialized timeline logs of the last 10 production events.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY, NOT NULL | Log record ID |
| `event_type` | TEXT | NOT NULL | Action category |
| `job_id` | TEXT | NOT NULL | Linked Job ID |
| `job_no` | TEXT | NOT NULL | Linked Work Order |
| `product_code` | TEXT | NOT NULL | Linked SKU |
| `status` | TEXT | NOT NULL | Event status |
| `message` | TEXT | NOT NULL | Vietnamese localization logging text |
| `occurred_at` | TEXT | NOT NULL | Occurred timestamp |
