# Realtime Kiosk Architecture — Service Contracts

This document contains contract details and serialized JSON payload schemas for events published to RabbitMQ.

## 1. MQTT Inbound Contract

### Event: `MqttMessageReceived`
- **Routing Key**: `mqtt.MqttMessage.MqttMessageReceived`

#### Schema Example
```json
{
  "eventId": "evt_01j3m89xyz...",
  "timestamp": "2026-06-21T13:50:58Z",
  "data": [
    {
      "tag": "OperationType",
      "value": "PRINT_AND_MARK"
    },
    {
      "tag": "ProductId",
      "value": "SKU-9908"
    },
    {
      "tag": "MarkingSerial",
      "value": "SN-2026-0004"
    }
  ]
}
```

---

## 2. Job Engine Event Contracts

All Job Engine events share a base structure with common header properties.

### Event: `JobCreatedEvent`
- **Routing Key**: `job.created`

#### Schema Example
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
  "source_system": "MQTT_ADAPTER",
  "timestamp": "2026-06-21T13:51:02.145Z"
}
```

---

### Event: `JobProcessingEvent`
- **Routing Key**: `job.processing`

#### Schema Example
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
  "source_system": "MQTT_ADAPTER",
  "timestamp": "2026-06-21T13:51:03.220Z",
  "attempt_no": 1
}
```

---

### Event: `JobCompletedEvent`
- **Routing Key**: `job.completed`

#### Schema Example
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
  "source_system": "MQTT_ADAPTER",
  "timestamp": "2026-06-21T13:51:09.112Z",
  "completed_at": "2026-06-21T13:51:09.112Z"
}
```

---

### Event: `JobFailedEvent`
- **Routing Key**: `job.failed`

#### Schema Example
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
  "source_system": "MQTT_ADAPTER",
  "timestamp": "2026-06-21T13:51:05.412Z",
  "error_message": "Vision Check failed on camera-01 (OCR mismatch)."
}
```

---

## 3. Device Status Heartbeat Contracts

### Event: `DeviceStatusHeartbeat`
- **Routing Key**: `device.heartbeat.{device_id}`

#### Schema Example
```json
{
  "DeviceId": "PRINTER01",
  "DeviceType": "Printer",
  "IsOnline": true,
  "LifecycleState": "Paper Out",
  "Timestamp": "2026-07-12T05:30:15.112Z",
  "SerialNumber": "SN-SIM-PRINTER01",
  "LifetimePrintCounter": 1024,
  "ThermalTemp": 27.5,
  "ConnectionDetails": "127.0.0.1:9100"
}
```
*Note: Diagnostic properties (`SerialNumber`, `LifetimePrintCounter`, `ThermalTemp`, `ConnectionDetails`) are optional and populated based on availability from driver capability.*
