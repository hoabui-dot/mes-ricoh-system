# MQTT Payload Contract — Print-Marking Edge Station

> ⚠️ **THIS DOCUMENT IS MANDATORY**
>
> All MQTT communication between Factory Gateway and MQTT Adapter **must strictly follow this contract**.
>
> **AI must never invent alternative payload structures.**
>
> JSON schema validation must be enforced on every inbound message.

---

## Canonical MQTT Message Schema

This is the **one and only** accepted MQTT message format. No variations are permitted.

```json
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
```

---

## Field Specifications

| Field | Type | Required | Constraints |
|---|---|---|---|
| `site` | string | ✅ | Non-empty, max 100 chars |
| `area` | string | ✅ | Non-empty, max 100 chars |
| `line` | string | ✅ | Non-empty, max 100 chars |
| `machine` | string | ✅ | Non-empty, max 100 chars |
| `edge_id` | string | ✅ | Non-empty, must match local edge station ID |
| `timestamp` | ISO 8601 string | ✅ | Must include timezone offset |
| `event_id` | string | ✅ | Globally unique, format: `evt-{type}-{YYYYMMDD}-{seq}` |
| `data` | array | ✅ | At least 1 item required |
| `data[].tag` | string | ✅ | Dot-separated tag path (e.g., `operation.type`) |
| `data[].value` | string | ✅ | Business value (see constants) |
| `data[].quality` | string | ✅ | One of: `GOOD`, `UNCERTAIN`, `BAD`, `MISSING` |

---

## JSON Schema Definition

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "UnifiedEvent",
  "type": "object",
  "required": ["site", "area", "line", "machine", "edge_id", "timestamp", "event_id", "data"],
  "properties": {
    "site":      { "type": "string", "minLength": 1, "maxLength": 100 },
    "area":      { "type": "string", "minLength": 1, "maxLength": 100 },
    "line":      { "type": "string", "minLength": 1, "maxLength": 100 },
    "machine":   { "type": "string", "minLength": 1, "maxLength": 100 },
    "edge_id":   { "type": "string", "minLength": 1, "maxLength": 100 },
    "timestamp": { "type": "string", "format": "date-time" },
    "event_id":  { "type": "string", "minLength": 1, "maxLength": 200 },
    "data": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["tag", "value", "quality"],
        "properties": {
          "tag":     { "type": "string", "minLength": 1 },
          "value":   { "type": "string" },
          "quality": { "type": "string", "enum": ["GOOD", "UNCERTAIN", "BAD", "MISSING"] }
        }
      }
    }
  },
  "additionalProperties": false
}
```

---

## MQTT Topic Structure

### Inbound (Gateway → Edge Station)

```
nd/{site}/{edge_id}/command
```

Example:
```
nd/NMDDuongDuong/edge-ipc-l3-marking/command
```

### Outbound (Edge Station → Gateway)

```
nd/{site}/{edge_id}/result
nd/{site}/{edge_id}/event
nd/{site}/{edge_id}/heartbeat
```

---

## Complete Operation Payloads

### Print Only (`PRINT_ONLY`)

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Printer-01",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:30:00+07:00",
  "event_id": "evt-print-20260616-0001",
  "data": [
    {
      "tag": "operation.type",
      "value": "PRINT_ONLY",
      "quality": "GOOD"
    },
    {
      "tag": "print.type",
      "value": "LABEL_PRINT",
      "quality": "GOOD"
    },
    {
      "tag": "product.id",
      "value": "FC-WP-RO100G-B-998822",
      "quality": "GOOD"
    },
    {
      "tag": "product.lot",
      "value": "LOT-2026-06-A-001",
      "quality": "GOOD"
    },
    {
      "tag": "product.mfg_date",
      "value": "2026-06-16",
      "quality": "GOOD"
    },
    {
      "tag": "product.exp_date",
      "value": "2028-06-16",
      "quality": "GOOD"
    }
  ]
}
```

---

### Mark Only (`MARK_ONLY`)

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Laser-Marking-03",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:31:00+07:00",
  "event_id": "evt-mark-20260616-0042",
  "data": [
    {
      "tag": "operation.type",
      "value": "MARK_ONLY",
      "quality": "GOOD"
    },
    {
      "tag": "marking.type",
      "value": "LASER_ETCHING",
      "quality": "GOOD"
    },
    {
      "tag": "marking.serial",
      "value": "SN-0001234",
      "quality": "GOOD"
    },
    {
      "tag": "marking.lot",
      "value": "2026-BATCH-A",
      "quality": "GOOD"
    },
    {
      "tag": "marking.date_code",
      "value": "260616",
      "quality": "GOOD"
    }
  ]
}
```

---

### Print and Mark (`PRINT_AND_MARK`)

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Station-Combined-01",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:32:00+07:00",
  "event_id": "evt-combined-20260616-0099",
  "data": [
    {
      "tag": "operation.type",
      "value": "PRINT_AND_MARK",
      "quality": "GOOD"
    },
    {
      "tag": "print.type",
      "value": "PRODUCT_LABEL",
      "quality": "GOOD"
    },
    {
      "tag": "marking.type",
      "value": "LASER_SERIALIZATION",
      "quality": "GOOD"
    },
    {
      "tag": "product.id",
      "value": "FC-WP-RO100G-B-998822",
      "quality": "GOOD"
    },
    {
      "tag": "product.lot",
      "value": "LOT-2026-06-A-001",
      "quality": "GOOD"
    },
    {
      "tag": "marking.serial",
      "value": "SN-0001234",
      "quality": "GOOD"
    }
  ]
}
```

---

### Verify Only (`VERIFY_ONLY`)

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Camera-QC-01",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:33:00+07:00",
  "event_id": "evt-verify-20260616-0150",
  "data": [
    {
      "tag": "operation.type",
      "value": "VERIFY_ONLY",
      "quality": "GOOD"
    },
    {
      "tag": "verify.expected_content",
      "value": "FC-WP-RO100G-B-998822",
      "quality": "GOOD"
    },
    {
      "tag": "verify.camera_id",
      "value": "CAM-01",
      "quality": "GOOD"
    }
  ]
}
```

---

### Rework (`REWORK`)

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Station-Combined-01",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:35:00+07:00",
  "event_id": "evt-rework-20260616-0200",
  "data": [
    {
      "tag": "operation.type",
      "value": "REWORK",
      "quality": "GOOD"
    },
    {
      "tag": "rework.original_job_id",
      "value": "job-20260616-9921",
      "quality": "GOOD"
    },
    {
      "tag": "rework.type",
      "value": "REPRINT",
      "quality": "GOOD"
    },
    {
      "tag": "rework.operator_id",
      "value": "OP-007",
      "quality": "GOOD"
    }
  ]
}
```

---

## Well-Known Data Tags

These are the only recognized tags in the `data` array. AI must not invent new tags without updating this list.

| Tag | Meaning | Valid Values |
|---|---|---|
| `operation.type` | Type of production operation | `PRINT_ONLY`, `MARK_ONLY`, `PRINT_AND_MARK`, `VERIFY_ONLY`, `REWORK` |
| `print.type` | Type of label to print | `LABEL_PRINT`, `QR_LABEL`, `BARCODE_LABEL`, `PACKAGING_LABEL`, `PRODUCT_LABEL` |
| `marking.type` | Type of laser marking | `LASER_ETCHING`, `LASER_DOT_PEEN`, `LASER_SERIALIZATION`, `LASER_QR_MARKING`, `LASER_BARCODE_MARKING` |
| `product.id` | Product identifier | Free text (max 200 chars) |
| `product.lot` | Lot number | Free text (max 100 chars) |
| `product.mfg_date` | Manufacturing date | `YYYY-MM-DD` |
| `product.exp_date` | Expiry date | `YYYY-MM-DD` |
| `marking.serial` | Serial number to mark | Free text |
| `marking.lot` | Lot to mark | Free text |
| `marking.date_code` | Date code to mark | Free text |
| `verify.expected_content` | Content to verify against | Free text |
| `verify.camera_id` | Camera identifier | Device ID |
| `rework.original_job_id` | Job being reworked | Job ID format |
| `rework.type` | Type of rework | `REPRINT`, `RELASER`, `FORCE_PASS`, `FORCE_COMPLETE` |
| `rework.operator_id` | Operator performing rework | Operator ID |

---

## Validation Rules

### MQTT Adapter MUST:

1. **Validate JSON schema** on every inbound message — reject malformed messages
2. **Check `edge_id`** matches local station identifier — ignore messages for other stations
3. **Check `event_id` uniqueness** using Redis idempotency — discard duplicate events
4. **Validate `quality`** — log a warning if any tag has quality `BAD` or `MISSING`
5. **Parse `operation.type`** — must be one of the defined operations
6. **Emit exactly one internal event** per valid inbound message

### MQTT Adapter MUST NOT:

- Accept partial payloads missing required fields
- Accept unknown `operation.type` values
- Silently ignore validation failures without logging
- Modify the `event_id` of inbound messages

---

## Outbound Result Format

When publishing results back to Gateway, use this format:

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Printer-01",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:30:05+07:00",
  "event_id": "evt-result-20260616-0001",
  "source_event_id": "evt-print-20260616-0001",
  "event_type": "PRINT_COMPLETED",
  "job_id": "job-20260616-9921",
  "result": "PASS",
  "data": [
    {
      "tag": "result.duration_ms",
      "value": "4850",
      "quality": "GOOD"
    }
  ]
}
```
