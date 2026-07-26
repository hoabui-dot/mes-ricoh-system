# Improve Alarm Center Architecture & Kiosk UI Behavior

## Objective

Refactor the current Alarm Center implementation to better match real factory operations.

The current implementation raises alarms whenever any device heartbeat is lost or a job fails. This creates unnecessary noise and duplicate alarms, making it difficult for operators to identify real production issues.

The new design must only report actionable alarms, reduce duplication, preserve alarm history, and provide a much better operator experience.

---

# Current Architecture

Current flow:

Device / Workflow Event
↓

Projection Service
↓

projection_alarms (SQLite)

↓

SignalR

↓

Kiosk UI

Projection Service remains the **single source of truth**.

Kiosk UI must remain read-only except for acknowledge operations.

Do NOT move alarm business logic into the UI.

---

# 1. Only Monitor Active Production Devices

## Current Problem

Projection Service raises heartbeat alarms for every registered device.

This is incorrect.

Many devices are online but are not participating in the current production order.

Operators should only care about devices that are actively producing.

---

## New Rule

Heartbeat alarms should only be generated for devices currently assigned to an active Production Order.

Examples

### Should generate alarm

Printer-01

Status:
Running Production Order PO-2026-0001

Heartbeat lost

→ Raise Critical Alarm

---

### Should NOT generate alarm

Printer-03

Status:
Online

Idle

Not assigned to any Production Order

Heartbeat lost

→ Ignore

No alarm

---

Projection Service should determine active production devices from the current production assignment/read model instead of monitoring every online device.

---

# 2. Aggregate Device Alarms

## Current Problem

Every heartbeat timeout creates another database row.

Example

09:00 Lost

09:03 Lost

09:06 Lost

09:09 Lost

...

This floods the database and UI.

---

## New Rule

There should only be one active alarm per device.

Example

Printer-01

Latest Alarm

Status:
Unacknowledged

History

09:00 Lost

09:03 Lost

09:06 Lost

09:09 Lost

These should NOT create four visible rows.

Instead

Current Alarm Table

Printer-01

Critical

Disconnected

Unacknowledged

Click row

↓

History Modal

09:00 Created

09:03 Heartbeat still missing

09:06 Heartbeat still missing

09:09 Heartbeat still missing

or simply display the latest occurrence time if repeated events are collapsed.

---

Database should represent one active alarm while preserving meaningful history.

---

# 3. Deduplicate Daily Device Alarms

## Factory Rule

If a device is already disconnected and the operator has not acknowledged the alarm, Projection Service must NOT create additional alarm records.

Example

09:00

Heartbeat Lost

Alarm created

---

09:30

Still offline

Ignore

---

10:00

Still offline

Ignore

---

11:00

Still offline

Ignore

---

14:00

Operator acknowledges

Alarm becomes acknowledged

---

15:00

Device disconnects again

New alarm may be created

---

Implementation Rule

For the same device:

IF

Latest alarm exists

AND

Not acknowledged

THEN

Do not insert another alarm.

Only update metadata such as:

- last_seen_offline_at
- repeat_count (optional)
- updated_at

Never create duplicate alarm rows.

---

# 4. Separate Alarm Categories in Kiosk UI

Current Alarm Center mixes every alarm together.

This makes production difficult to monitor.

---

Create two independent tabs.

## Tab 1

Device Connection

Contains

Printer disconnected

Laser disconnected

PLC disconnected

Camera disconnected

Gateway disconnected

Heartbeat timeout

Network issues

---

## Tab 2

Production Errors

Contains

Job Failed

Dispatch Failed

Retry Exhausted

Workflow Exception

Print Error

Business Logic Failure

RabbitMQ Processing Failure

Validation Failure

No device heartbeat alarms here.

---

# 5. Alarm History Modal

Instead of showing duplicated rows in the table,

clicking an alarm should open a reusable Detail Modal.

Reuse the existing Detail Modal design pattern already used elsewhere in the Kiosk UI.

The modal should display

Alarm Information

Device

Severity

Current Status

Acknowledged By

Acknowledged Time

Created Time

Last Updated

Timeline

09:00 Alarm Created

09:03 Heartbeat Timeout

09:06 Heartbeat Timeout

09:10 Heartbeat Timeout

14:00 Operator Acknowledged

This should be a reusable component.

Do not create a second modal implementation.

---

# 6. Add Pagination

Current alarm list grows indefinitely.

Implement server-side pagination.

Recommended

20 rows per page

Sorting

Newest first

---

# 7. Add Filters

Support filtering by

## Date Range

Today

Yesterday

Last 7 Days

Last 30 Days

Custom Range

---

## Status

Active

Acknowledged

All

---

## Severity

Critical

Error

Warning

---

## Device

Printer

Laser

PLC

Camera

Gateway

All

---

## Search

Device Name

Alarm Message

Device ID

Production Order

---

# 8. Dashboard Alarm Banner

The dashboard currently displays

"There are X unacknowledged alarms"

Improve the logic.

Only count

Active

Unacknowledged

Visible alarms

Do NOT count

Acknowledged history

Duplicate heartbeat events

Collapsed events

---

# 9. Projection Service Responsibilities

Projection Service remains responsible for

- Alarm creation
- Alarm aggregation
- Deduplication
- Acknowledge state
- History persistence
- SignalR push
- Pagination APIs
- Filtering APIs

Kiosk UI must NEVER implement business rules for alarms.

The UI only displays Projection Service data.

---

# 10. Suggested Database Improvements

Consider extending the alarm schema with fields such as

- first_occurred_at
- last_occurred_at
- repeat_count
- current_state
- resolved_at
- alarm_group_key
- alarm_type
- device_name
- production_order_id (optional)
- work_order_id (optional)

These fields improve aggregation while preserving history.

Do not delete existing historical records.

---

# 11. Performance Requirements

Avoid unnecessary SignalR broadcasts.

Broadcast only when

- New alarm created
- Alarm acknowledged
- Alarm resolved
- Alarm state changes

Do not broadcast every heartbeat timeout if it is merely updating an existing active alarm.

---

# 12. Reusable UI Components

Reuse existing table and modal components whenever possible.

Create reusable components for

- Alarm Table
- Alarm Detail Modal
- Alarm Timeline
- Alarm Badge
- Alarm Filter Toolbar
- Pagination Footer

Avoid duplicate implementations.

---

# 13. Verification Checklist

Before completing the implementation, verify all of the following:

- Only devices participating in active production can generate heartbeat alarms.
- Idle online devices never trigger heartbeat alarms.
- Only one active unacknowledged alarm exists per device.
- Duplicate heartbeat timeouts are aggregated instead of inserted repeatedly.
- A new alarm is created only after the previous one has been acknowledged (or resolved).
- Device Connection and Production Errors are displayed in separate tabs.
- Alarm history is available through a reusable detail modal.
- Pagination is implemented server-side.
- Filters for date, status, severity, device, and search work correctly.
- Dashboard banner counts only active unacknowledged alarms.
- Projection Service remains the single source of truth.
- Kiosk UI contains no duplicated alarm business logic.
- SignalR pushes occur only when alarm state actually changes.
- Existing historical alarm data is preserved after migration.
