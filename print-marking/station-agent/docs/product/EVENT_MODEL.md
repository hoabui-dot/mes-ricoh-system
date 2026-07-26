# Event Model — Print-Marking Edge Station

> **AI RULE**: All business events must use the exact event types defined here. Do not create new event type strings without adding them to this document and to `BusinessConstants.cs`.

---

## Event Envelope Schema

Every event published by this system — whether internal or sent to Factory Gateway — must conform to this envelope:

```json
{
  "event_id": "evt-print-20260616-0001",
  "timestamp": "2026-06-16T15:30:00+07:00",
  "event_type": "PRINT_COMPLETED",
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Printer-01",
  "edge_id": "edge-ipc-l3-marking",
  "job_id": "job-20260616-9921",
  "payload": {}
}
```

### Field Definitions

| Field | Type | Required | Description |
|---|---|---|---|
| `event_id` | string | ✅ | Globally unique event identifier |
| `timestamp` | ISO 8601 | ✅ | Time of event in local timezone |
| `event_type` | string | ✅ | One of the values defined below |
| `site` | string | ✅ | Factory site identifier |
| `area` | string | ✅ | Production area |
| `line` | string | ✅ | Production line identifier |
| `machine` | string | ✅ | Machine that generated the event |
| `edge_id` | string | ✅ | Edge station hardware identifier |
| `job_id` | string | ✅ | Associated job (if applicable) |
| `payload` | object | ✅ | Event-specific data (see below) |

---

## Full Event Catalog

### Print Events

| Event Type | Trigger | Payload |
|---|---|---|
| `PRINT_REQUESTED` | Job Engine receives print command | `{ print_type, content_summary, printer_id }` |
| `PRINT_STARTED` | Printer adapter begins sending | `{ printer_id, zpl_size_bytes }` |
| `PRINT_COMPLETED` | Print acknowledged by printer | `{ printer_id, duration_ms }` |
| `PRINT_FAILED` | Printer returned error or timeout | `{ printer_id, error_code, error_message }` |
| `PRINT_RETRYING` | Retry attempt initiated | `{ attempt_no, reason }` |

### Mark Events

| Event Type | Trigger | Payload |
|---|---|---|
| `MARK_REQUESTED` | Job Engine receives mark command | `{ marking_type, content_summary, laser_id }` |
| `MARK_STARTED` | Laser adapter sends command | `{ laser_id, marking_type }` |
| `MARK_COMPLETED` | Laser reports execution success | `{ laser_id, duration_ms }` |
| `MARK_FAILED` | Laser returned error or timeout | `{ laser_id, error_code, error_message }` |
| `MARK_RETRYING` | Retry attempt initiated | `{ attempt_no, reason }` |

### Verification Events

| Event Type | Trigger | Payload |
|---|---|---|
| `VERIFY_STARTED` | Vision system triggered | `{ camera_id, expected_content }` |
| `VERIFY_PASS` | Vision confirmed content matches | `{ camera_id, decoded_content, confidence }` |
| `VERIFY_FAIL` | Vision content mismatch or unreadable | `{ camera_id, decoded_content, expected_content, error }` |
| `VERIFY_RETRY` | Vision retrying scan | `{ attempt_no, reason }` |
| `VERIFY_BYPASS` | Operator bypassed verification | `{ operator_id, reason, approval_id }` |

### Job Events

| Event Type | Trigger | Payload |
|---|---|---|
| `JOB_CREATED` | New job created from gateway event | `{ job_id, operation_type, trigger_type }` |
| `JOB_STARTED` | Job execution began | `{ job_id, attempt_no }` |
| `JOB_COMPLETED` | All job steps succeeded | `{ job_id, total_duration_ms }` |
| `JOB_FAILED` | Job could not complete after retries | `{ job_id, failed_step, error_message }` |
| `JOB_CANCELLED` | Operator cancelled the job | `{ job_id, operator_id, reason }` |

### Overwrite Events

| Event Type | Trigger | Payload |
|---|---|---|
| `OVERWRITE_REQUESTED` | Operator requested overwrite | `{ job_id, overwrite_type, reason, requested_by }` |
| `OVERWRITE_APPROVED` | Supervisor approved overwrite | `{ job_id, overwrite_type, approved_by }` |
| `OVERWRITE_REJECTED` | Supervisor rejected overwrite | `{ job_id, overwrite_type, rejected_by, reason }` |
| `OVERWRITE_EXECUTED` | Overwrite action executed | `{ job_id, overwrite_type, executed_at }` |

### Sync Events

| Event Type | Trigger | Payload |
|---|---|---|
| `SYNC_STARTED` | Outbox processor begins sync | `{ outbox_id, target_topic }` |
| `SYNC_COMPLETED` | Gateway acknowledged | `{ outbox_id, gateway_ack_id }` |
| `SYNC_FAILED` | Gateway did not acknowledge | `{ outbox_id, attempt_no, error }` |
| `SYNC_RETRYING` | Outbox retrying publish | `{ outbox_id, attempt_no, next_retry_at }` |

### PLC Events

| Event Type | Trigger | Payload |
|---|---|---|
| `PLC_LINE_STATE_CHANGED` | PLC line state register changed | `{ plc_id, old_state, new_state }` |
| `PLC_TRIGGER_DETECTED` | Product sensor activated | `{ plc_id, sensor_id, trigger_type }` |
| `PLC_FAULT_DETECTED` | Machine fault register set | `{ plc_id, fault_code, description }` |
| `PLC_FAULT_CLEARED` | Machine fault resolved | `{ plc_id, fault_code }` |

### Device Health Events

| Event Type | Trigger | Payload |
|---|---|---|
| `DEVICE_ONLINE` | Health check passed | `{ device_id, device_type }` |
| `DEVICE_OFFLINE` | Health check failed | `{ device_id, device_type, error }` |

---

## Event Flow by Workflow

### Print Only Flow

```
JOB_CREATED
    └─► JOB_STARTED
            └─► PRINT_REQUESTED
                    └─► PRINT_STARTED
                            ├─► PRINT_COMPLETED
                            │       └─► VERIFY_STARTED
                            │               ├─► VERIFY_PASS
                            │               │       └─► JOB_COMPLETED → SYNC_STARTED → SYNC_COMPLETED
                            │               └─► VERIFY_FAIL
                            │                       └─► (retry or) JOB_FAILED → SYNC_STARTED
                            └─► PRINT_FAILED
                                    └─► PRINT_RETRYING (x3)
                                            └─► JOB_FAILED → SYNC_STARTED
```

### Mark Only Flow

```
JOB_CREATED → JOB_STARTED
    └─► MARK_REQUESTED → MARK_STARTED
            ├─► MARK_COMPLETED → VERIFY_STARTED → VERIFY_PASS → JOB_COMPLETED
            └─► MARK_FAILED → MARK_RETRYING → JOB_FAILED
```

### Combined Flow

```
JOB_CREATED → JOB_STARTED
    └─► PRINT_REQUESTED → PRINT_STARTED → PRINT_COMPLETED
            └─► MARK_REQUESTED → MARK_STARTED → MARK_COMPLETED
                    └─► VERIFY_STARTED → VERIFY_PASS → JOB_COMPLETED
```

---

## Event ID Format

Event IDs must be unique and contain enough context for debugging:

```
evt-{event_category}-{YYYYMMDD}-{sequence}

Examples:
  evt-print-20260616-0001
  evt-mark-20260616-0042
  evt-verify-20260616-0099
  evt-sync-20260616-0200
```

---

## Event Storage

Events are stored in two places:

1. **Local SQLite** — `JobStateTransitions` table — for operational history and retry logic
2. **MQTT Outbox** — `MqttOutboxEvents` table — for reliable delivery to Factory Gateway

Events in the outbox are retried until the Gateway acknowledges receipt.

---

## Important Rules

1. **No event may be silently dropped.** Every event must be persisted locally before any action is taken.
2. **Timestamps must include timezone offset.** ISO 8601 with `+07:00` for Vietnam timezone.
3. **Job ID must be included in all events** so the Gateway can correlate all events for a single product.
4. **All overwrite events must identify the operator** for audit trail.
