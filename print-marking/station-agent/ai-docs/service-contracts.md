# Realtime Kiosk Architecture — Service Contracts

This document contains contract details, serialization schemas, and topic configurations for events published to Apache Kafka.

---

## 1. Gateway Inbound Contract

### Event: `UnifiedEventReceived`
- **Topic**: `station.gateway-orders`
- **Partition Key**: `EventId` (String)

#### Schema Example (Value JSON)
```json
{
  "eventId": "evt_01j3m89xyz...",
  "timestamp": "2026-08-04T12:00:00Z",
  "site": "NMDDuongDuong",
  "area": "Assembly",
  "line": "Chuyen03",
  "machine": "GW-MES-01",
  "edge_id": "factory-gateway-main",
  "data": [
    {
      "tag": "operation.type",
      "value": "PRINT_AND_MARK",
      "quality": "GOOD"
    },
    {
      "tag": "product.id",
      "value": "SKU-9908",
      "quality": "GOOD"
    },
    {
      "tag": "marking.serial",
      "value": "SN-2026-0004",
      "quality": "GOOD"
    }
  ]
}
```

---

## 2. Job Engine Event Contracts

All Job Engine events share a base structure with common header properties.
- **Topic**: `station.job-events`
- **Partition Key**: `JobId` (String)

### Event: `JobCreatedEvent`

#### Schema Example (Value JSON)
```json
{
  "event_type": "JobCreated",
  "event_id": "evt-job-created-49abef87...",
  "job_id": "01J3M908...",
  "job_no": "evt_01j3m89xyz...",
  "job_type": "PRINT_AND_MARK",
  "product_code": "SKU-9908",
  "product_serial": "SN-2026-0004",
  "status": "CREATED",
  "source_system": "STATION_GATEWAY",
  "timestamp": "2026-08-04T12:00:02.145Z"
}
```

---

### Event: `JobProcessingEvent`

#### Schema Example (Value JSON)
```json
{
  "event_type": "JobProcessing",
  "event_id": "evt-job-processing-782adfe9...",
  "job_id": "01J3M908...",
  "job_no": "evt_01j3m89xyz...",
  "job_type": "PRINT_AND_MARK",
  "product_code": "SKU-9908",
  "product_serial": "SN-2026-0004",
  "status": "PROCESSING",
  "source_system": "STATION_GATEWAY",
  "timestamp": "2026-08-04T12:00:03.220Z",
  "attempt_no": 1
}
```

---

### Event: `JobCompletedEvent`

#### Schema Example (Value JSON)
```json
{
  "event_type": "JobCompleted",
  "event_id": "evt-job-completed-298daef4...",
  "job_id": "01J3M908...",
  "job_no": "evt_01j3m89xyz...",
  "job_type": "PRINT_AND_MARK",
  "product_code": "SKU-9908",
  "product_serial": "SN-2026-0004",
  "status": "COMPLETED",
  "source_system": "STATION_GATEWAY",
  "timestamp": "2026-08-04T12:00:09.112Z",
  "completed_at": "2026-08-04T12:00:09.112Z"
}
```

---

### Event: `JobFailedEvent`

#### Schema Example (Value JSON)
```json
{
  "event_type": "JobFailed",
  "event_id": "evt-job-failed-590faec2...",
  "job_id": "01J3M908...",
  "job_no": "evt_01j3m89xyz...",
  "job_type": "PRINT_AND_MARK",
  "product_code": "SKU-9908",
  "product_serial": "SN-2026-0004",
  "status": "FAILED",
  "source_system": "STATION_GATEWAY",
  "timestamp": "2026-08-04T12:00:05.412Z",
  "error_message": "Vision Check failed on camera-01 (OCR mismatch)."
}
```

---

## 3. Device Status Heartbeat Contracts

### Event: `DeviceStatusHeartbeat`
- **Topic**: `station.device-heartbeats`
- **Partition Key**: `DeviceId` (String)

#### Schema Example (Value JSON)
```json
{
  "DeviceId": "PRINTER01",
  "DeviceType": "Printer",
  "IsOnline": true,
  "LifecycleState": "Paper Out",
  "Timestamp": "2026-08-04T12:00:15.112Z",
  "SerialNumber": "SN-SIM-PRINTER01",
  "LifetimePrintCounter": 1024,
  "ThermalTemp": 27.5,
  "ConnectionDetails": "127.0.0.1:9100"
}
```
*Note: Diagnostic properties (`SerialNumber`, `LifetimePrintCounter`, `ThermalTemp`, `ConnectionDetails`) are optional and populated based on availability from driver capability.*
