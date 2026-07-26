# Business Constants — Print-Marking Edge Station

> **AI RULE**: All code must use the string constants defined here. Never hardcode business values as magic strings. Import from `ND.UnifiedContracts.Constants.BusinessConstants`.

---

## AI Implementation Rule

Before implementing any feature related to production operations:

1. ✅ Read [PRODUCT_OVERVIEW.md](./PRODUCT_OVERVIEW.md) — understand the system
2. ✅ Read [MANUFACTURING_WORKFLOW.md](./MANUFACTURING_WORKFLOW.md) — understand the flow
3. ✅ Read [DEVICE_CATALOG.md](./DEVICE_CATALOG.md) — understand the devices
4. ✅ Read [EVENT_MODEL.md](./EVENT_MODEL.md) — understand the events
5. ✅ Read [MQTT_PAYLOAD_CONTRACT.md](./MQTT_PAYLOAD_CONTRACT.md) — understand the protocol
6. ✅ Read this file — understand the valid values

**Only after completing the above should code generation begin.**

**Business documentation has priority over implementation assumptions.**

---

## Marking Types

Used in `data[].tag = "marking.type"` within MQTT messages.

| Constant | Value | Meaning |
|---|---|---|
| `MarkingType.LaserEtching` | `LASER_ETCHING` | Standard laser engraving on surfaces |
| `MarkingType.LaserDotPeen` | `LASER_DOT_PEEN` | Dot impact mechanical marking |
| `MarkingType.LaserSerialization` | `LASER_SERIALIZATION` | Generate and mark unique serial numbers |
| `MarkingType.LaserQrMarking` | `LASER_QR_MARKING` | Laser-etch a QR code |
| `MarkingType.LaserBarcodeMarking` | `LASER_BARCODE_MARKING` | Laser-etch a barcode |

### Meanings in Detail

**`LASER_ETCHING`**
Standard laser engraving. Removes surface material to create a permanent mark. Used for lot numbers, date codes, and alphanumeric text on hard surfaces.

**`LASER_DOT_PEEN`**
Dot impact marking. A stylus creates a series of overlapping dots to form characters. Used on metal surfaces where high contrast is needed.

**`LASER_SERIALIZATION`**
Sequential serial number generation and marking. Each product receives a unique incremental serial. The system auto-generates the serial from the batch recipe.

**`LASER_QR_MARKING`**
Marks a QR code using laser. Used for traceability codes that need to be scannable long-term.

**`LASER_BARCODE_MARKING`**
Marks a barcode using laser. Supports 1D barcode symbologies (Code 39, Code 128, GS1).

---

## Print Types

Used in `data[].tag = "print.type"` within MQTT messages.

| Constant | Value | Meaning |
|---|---|---|
| `PrintType.LabelPrint` | `LABEL_PRINT` | Generic label print |
| `PrintType.QrLabel` | `QR_LABEL` | Label with QR code as primary element |
| `PrintType.BarcodeLabel` | `BARCODE_LABEL` | Label with barcode as primary element |
| `PrintType.PackagingLabel` | `PACKAGING_LABEL` | Outer packaging / carton label |
| `PrintType.ProductLabel` | `PRODUCT_LABEL` | Direct product label |

---

## Verification Status

Used in job records, vision service results, and sync events.

| Constant | Value | Meaning |
|---|---|---|
| `VerificationStatus.Pass` | `VERIFIED_PASS` | Verification successful — content matches expected |
| `VerificationStatus.Fail` | `VERIFIED_FAIL` | Verification failed — content mismatch or unreadable |
| `VerificationStatus.Retry` | `VERIFIED_RETRY` | Verification should be repeated — camera/lighting issue |
| `VerificationStatus.Bypass` | `VERIFIED_BYPASS` | Verification intentionally skipped by authorized operator |

### Meanings in Detail

**`VERIFIED_PASS`**
The vision system confirmed the printed/marked content exactly matches the expected content. The product may proceed.

**`VERIFIED_FAIL`**
The vision system detected a mismatch or could not read the content. The product must not proceed. Operator decision required.

**`VERIFIED_RETRY`**
The vision system was unable to complete verification due to a transient condition (poor lighting, camera not ready). Retry the scan automatically.

**`VERIFIED_BYPASS`**
An authorized operator explicitly approved skipping verification. Must be logged with operator ID, reason, and timestamp. Product may proceed but is flagged.

---

## Data Quality

Used in `data[].quality` field in MQTT messages.

| Constant | Value | Meaning |
|---|---|---|
| `DataQuality.Good` | `GOOD` | Reliable value from device |
| `DataQuality.Uncertain` | `UNCERTAIN` | Device confidence is low |
| `DataQuality.Bad` | `BAD` | Invalid value — device error |
| `DataQuality.Missing` | `MISSING` | No value available — tag not populated |

### Meanings in Detail

**`GOOD`**
The device returned the value with full confidence. This value should be trusted.

**`UNCERTAIN`**
The device returned a value but with low confidence. Log a warning. May still be used depending on context.

**`BAD`**
The device returned an invalid or error value. Do not use this value for business decisions. Log an error.

**`MISSING`**
The tag was expected but no value was provided. This is a configuration or communication error. Reject the message if this tag is required.

---

## Production Operations

Used in `data[].tag = "operation.type"` within MQTT messages.

| Constant | Value | Meaning |
|---|---|---|
| `ProductionOperation.PrintOnly` | `PRINT_ONLY` | Label printing only |
| `ProductionOperation.MarkOnly` | `MARK_ONLY` | Laser marking only |
| `ProductionOperation.PrintAndMark` | `PRINT_AND_MARK` | Both printer and laser required |
| `ProductionOperation.VerifyOnly` | `VERIFY_ONLY` | Inspection only — no printing/marking |
| `ProductionOperation.Rework` | `REWORK` | Reprocessing a previously failed product |

### Meanings in Detail

**`PRINT_ONLY`**
Only the label printer is used. No laser marking. Vision verification of label is still performed.

**`MARK_ONLY`**
Only the laser machine is used. No label printer. Vision verification of mark is still performed.

**`PRINT_AND_MARK`**
Both label printer and laser marking machine are required. Print is always performed first, then laser. Both must succeed before verification.

**`VERIFY_ONLY`**
No printing or marking. The station only runs the vision system to inspect a product that was already labeled/marked elsewhere.

**`REWORK`**
A product previously processed has failed and needs reprocessing. The rework type (REPRINT, RELASER, etc.) determines which devices are used. Operator approval required.

---

## Overwrite Types

Used in `OverwriteRequest` entity and `rework.type` tag.

| Constant | Value | Meaning |
|---|---|---|
| `OverwriteType.Reprint` | `REPRINT` | Reprint the label |
| `OverwriteType.Relaser` | `RELASER` | Redo the laser marking |
| `OverwriteType.ForcePass` | `FORCE_PASS` | Force verification to PASS status |
| `OverwriteType.ForceComplete` | `FORCE_COMPLETE` | Force the entire job to COMPLETE status |

---

## Trigger Types

Used in `JobAttempt` entity to identify how the attempt was started.

| Constant | Value | Meaning |
|---|---|---|
| `TriggerType.Auto` | `AUTO` | Triggered automatically by incoming MQTT event |
| `TriggerType.ManualRetry` | `MANUAL_RETRY` | Operator manually triggered retry |
| `TriggerType.Overwrite` | `OVERWRITE` | Triggered by approved overwrite request |

---

## Job Status

Used in `Job` entity to track overall job lifecycle.

| Constant | Value | Meaning |
|---|---|---|
| `JobStatus.Created` | `CREATED` | Job has been created, not yet queued |
| `JobStatus.Queued` | `QUEUED` | Job is in the execution queue |
| `JobStatus.Processing` | `PROCESSING` | Job is actively being executed |
| `JobStatus.WaitRework` | `WAIT_REWORK` | Job paused, waiting for operator overwrite decision |
| `JobStatus.Completed` | `COMPLETED` | Job successfully completed |
| `JobStatus.Failed` | `FAILED` | Job failed after all retries |
| `JobStatus.Cancelled` | `CANCELLED` | Job cancelled by operator |

---

## Event Types

Used in all events published internally and to Factory Gateway.

### Print Events
```
PRINT_REQUESTED, PRINT_STARTED, PRINT_COMPLETED, PRINT_FAILED, PRINT_RETRYING
```

### Mark Events
```
MARK_REQUESTED, MARK_STARTED, MARK_COMPLETED, MARK_FAILED, MARK_RETRYING
```

### Verification Events
```
VERIFY_STARTED, VERIFY_PASS, VERIFY_FAIL, VERIFY_RETRY, VERIFY_BYPASS
```

### Job Events
```
JOB_CREATED, JOB_STARTED, JOB_COMPLETED, JOB_FAILED, JOB_CANCELLED
```

### Overwrite Events
```
OVERWRITE_REQUESTED, OVERWRITE_APPROVED, OVERWRITE_REJECTED, OVERWRITE_EXECUTED
```

### Sync Events
```
SYNC_STARTED, SYNC_COMPLETED, SYNC_FAILED, SYNC_RETRYING
```

### PLC Events
```
PLC_LINE_STATE_CHANGED, PLC_TRIGGER_DETECTED, PLC_FAULT_DETECTED, PLC_FAULT_CLEARED
```

### Device Health Events
```
DEVICE_ONLINE, DEVICE_OFFLINE
```

---

## C# Reference

All constants above are implemented in:

```
shared/ND.UnifiedContracts/Constants/BusinessConstants.cs
```

Import pattern:

```csharp
using ND.UnifiedContracts.Constants;

// Use like:
var operation = ProductionOperation.PrintOnly;         // "PRINT_ONLY"
var marking = MarkingType.LaserEtching;               // "LASER_ETCHING"
var status = VerificationStatus.Pass;                  // "VERIFIED_PASS"
var quality = DataQuality.Good;                        // "GOOD"
```
