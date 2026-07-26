# Task: Create Product Documentation for Print-Marking Edge Station Platform

## Background

The current codebase already contains technical documentation, architecture documentation, infrastructure documentation, service documentation, and coding standards.

However, there is a major missing piece:

**AI does not fully understand the business product.**

As a result, generated code is often technically correct but operationally incorrect because it lacks understanding of:

* Factory workflow
* Manufacturing process
* Product lifecycle
* Print/Marking business rules
* Device responsibilities
* Gateway responsibilities
* Production line behavior
* Event semantics

We need a dedicated Product Documentation section inside Antigravity documentation.

---

# Goal

Create a new documentation section:

```text
/docs/product
```

Containing comprehensive business and operational documentation that allows Claude Code / Codex / AI Agents to understand the product before implementing code.

---

# Required Documents

## PRODUCT_OVERVIEW.md

Explain:

### What is this system?

This platform is an Industrial Edge Station for production lines.

It is deployed near production machines and communicates with:

* Factory Gateway
* PLC
* Label Printers
* Laser Marking Machines
* Vision/OCR Systems

The station receives manufacturing instructions from Factory Gateway and executes printing and/or marking operations on products.

---

### Main Purpose

The station performs:

1. Receive production events
2. Create print/mark jobs
3. Generate content
4. Execute printing
5. Execute laser marking
6. Verify result
7. Save local result
8. Synchronize back to Factory Gateway

---

### Core Business Domains

#### Product Identification

Generate product identifiers.

Examples:

```text
FC-WP-RO100G-B-998822
FC-SHAMPOO-250ML-000112
FC-LOTION-500ML-883722
```

---

#### Label Printing

Print product labels.

Examples:

```text
QR Code
Barcode
Text
Lot Number
Manufacturing Date
Expiry Date
```

---

#### Laser Marking

Mark information directly on product packaging.

Examples:

```text
Lot Number
Date Code
Serial Number
Traceability Code
```

---

#### Verification

Verify printed or marked content.

Methods:

```text
OCR
Barcode Scan
QR Scan
Vision Inspection
```

---

#### Traceability

Track all product operations.

Every operation must be auditable.

---

# MANUFACTURING_WORKFLOW.md

Document complete production flow.

## Print Workflow

Gateway
→ MQTT Adapter
→ Line Logic
→ Printer
→ Verify
→ Local Database
→ Sync Agent
→ Factory Gateway

---

## Laser Workflow

Gateway
→ MQTT Adapter
→ Line Logic
→ Laser
→ Verify
→ Local Database
→ Sync Agent
→ Factory Gateway

---

## Combined Workflow

Gateway
→ MQTT Adapter
→ Line Logic

→ Printer

→ Laser

→ Vision Verify

→ Local Database

→ Sync Agent

→ Gateway

---

# DEVICE_CATALOG.md

Document every device type.

---

## Label Printer

Protocols:

```text
TCP 9100
ZPL
EPL
```

Responsibilities:

```text
Print labels
Return print status
Report printer errors
```

---

## Laser Marker

Protocols:

```text
TCP
Vendor SDK
```

Responsibilities:

```text
Execute marking
Return execution result
Report machine status
```

---

## Vision System

Protocols:

```text
TCP
REST
SDK
USB
```

Responsibilities:

```text
OCR
Barcode scan
Verification
```

---

## PLC

Protocols:

```text
Modbus TCP
Digital I/O
```

Responsibilities:

```text
Trigger sensors
Machine state
Line state
```

---

# EVENT_MODEL.md

Document all business events.

Examples:

```text
PRINT_REQUESTED
PRINT_STARTED
PRINT_COMPLETED
PRINT_FAILED

MARK_REQUESTED
MARK_STARTED
MARK_COMPLETED
MARK_FAILED

VERIFY_STARTED
VERIFY_PASS
VERIFY_FAIL

SYNC_STARTED
SYNC_COMPLETED
SYNC_FAILED
```

Each event must include:

```json
{
  "event_id": "",
  "timestamp": "",
  "event_type": "",
  "line": "",
  "machine": "",
  "payload": {}
}
```

---

# MQTT_PAYLOAD_CONTRACT.md

This document is mandatory.

All MQTT communication between Factory Gateway and MQTT Adapter must strictly follow the contract below.

No custom formats are allowed.

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

AI must never invent alternative payload structures.

JSON schema validation must be enforced.

---

# BUSINESS_CONSTANTS.md

Create shared constants for all valid business values.

## Marking Types

```csharp
LASER_ETCHING
LASER_DOT_PEEN
LASER_SERIALIZATION
LASER_QR_MARKING
LASER_BARCODE_MARKING
```

Meaning:

```text
LASER_ETCHING
Standard laser engraving.

LASER_DOT_PEEN
Dot impact marking.

LASER_SERIALIZATION
Generate unique serial numbers.

LASER_QR_MARKING
Mark QR code.

LASER_BARCODE_MARKING
Mark barcode.
```

---

## Print Types

```csharp
LABEL_PRINT
QR_LABEL
BARCODE_LABEL
PACKAGING_LABEL
PRODUCT_LABEL
```

---

## Verification Status

```csharp
VERIFIED_PASS
VERIFIED_FAIL
VERIFIED_RETRY
VERIFIED_BYPASS
```

Meaning:

```text
VERIFIED_PASS
Verification successful.

VERIFIED_FAIL
Verification failed.

VERIFIED_RETRY
Verification should be repeated.

VERIFIED_BYPASS
Verification intentionally skipped.
```

---

## Data Quality

```csharp
GOOD
UNCERTAIN
BAD
MISSING
```

Meaning:

```text
GOOD
Reliable value.

UNCERTAIN
Device confidence is low.

BAD
Invalid value.

MISSING
No value available.
```

---

## Production Operations

```csharp
PRINT_ONLY
MARK_ONLY
PRINT_AND_MARK
VERIFY_ONLY
REWORK
```

Meaning:

```text
PRINT_ONLY
Label printing only.

MARK_ONLY
Laser marking only.

PRINT_AND_MARK
Both printer and laser required.

VERIFY_ONLY
Inspection only.

REWORK
Reprocessing failed product.
```

---

# DEVICE_SIMULATOR_REQUIREMENTS.md

Current Device Simulator implementation is incomplete.

Simulator must behave as a complete virtual factory environment.

---

## Required Virtual Devices

Automatically start:

```text
Printer Simulator
Laser Simulator
Vision Simulator
PLC Simulator
Factory Gateway Simulator
```

No manual creation required.

---

## MQTT Factory Gateway Simulator

Add dedicated UI controls:

```text
[Send Print Job]
[Send Mark Job]
[Send Print + Mark Job]
[Send Verify Job]
```

When clicked:

Publish MQTT messages to MQTT Adapter.

---

## Print Only Example

Operation:

```text
PRINT_ONLY
```

MQTT:

```json
{
  "tag": "operation.type",
  "value": "PRINT_ONLY"
}
```

---

## Mark Only Example

Operation:

```text
MARK_ONLY
```

MQTT:

```json
{
  "tag": "operation.type",
  "value": "MARK_ONLY"
}
```

---

## Combined Example

Operation:

```text
PRINT_AND_MARK
```

MQTT:

```json
{
  "tag": "operation.type",
  "value": "PRINT_AND_MARK"
}
```

---

## Simulator Dashboard

Realtime dashboard must display:

* MQTT outbound messages
* MQTT inbound acknowledgements
* Printer jobs
* Laser jobs
* Vision verification
* PLC state changes

All updates must stream through SignalR.

---

# AI IMPLEMENTATION RULE

Before implementing any feature:

1. Read PRODUCT_OVERVIEW.md
2. Read MANUFACTURING_WORKFLOW.md
3. Read DEVICE_CATALOG.md
4. Read EVENT_MODEL.md
5. Read MQTT_PAYLOAD_CONTRACT.md
6. Read BUSINESS_CONSTANTS.md

Only after understanding business requirements should code generation begin.

Business documentation has priority over implementation assumptions.
