# Refactor Physical Zebra GK420t Device Monitoring & Kiosk UI Status System

## Objective

The current implementation of the Print Marking Station contains many mocked hardware states that are not actually supported by the physical Zebra GK420t printer.

This has created an inaccurate monitoring experience:

- The Kiosk UI displays states that can never be detected.
- Operators lose trust in the monitoring dashboard.
- Projection Service receives fake hardware events.
- SignalR broadcasts non-existent device conditions.

The goal of this task is to perform a full audit of the codebase, remove unsupported hardware states, redesign the monitoring architecture based on the real capabilities of the Zebra GK420t, and improve the Kiosk UI experience for factory operators.

This implementation must preserve the existing architecture:

- Database per Service
- CQRS
- Event-Driven Architecture
- Projection Service as the single source of truth
- Printer Adapter owns hardware communication
- SignalR for real-time synchronization

---

# Background

The station currently supports only one physical printer model:

- Zebra GK420t
- USB Connection
- CUPS
- Bidirectional ZPL Communication

The printer is capable of returning hardware information through ZPL commands (such as `~HS`) and USB communication.

It is **not** capable of measuring consumables as percentages.

The implementation must strictly follow the actual hardware capabilities instead of inventing software-only states.

---

# Phase 1 - Audit the Entire Codebase

Perform a complete audit of every printer-related module.

Search for:

- mocked printer states
- unsupported warning types
- fake health checks
- simulated hardware metrics
- fake consumable percentages
- duplicated printer state logic
- inconsistent device state mapping

Identify every place where printer status is inferred incorrectly.

Examples include

- Ink 72%
- Paper 45%
- Ribbon Remaining
- Remaining Roll Length
- Fake Temperature
- Fake Hardware Diagnostics

These values are impossible for a Zebra GK420t to provide.

They must be removed.

---

# Phase 2 - Remove Unsupported States

Remove every unsupported hardware capability.

Examples

❌ Ink Percentage

❌ Ribbon Percentage

❌ Remaining Paper %

❌ Remaining Roll Diameter

❌ Estimated Paper Remaining

❌ Fake Sensor Values

❌ Fake Maintenance Hours

❌ Fake Consumable Health

Do not replace them with guessed values.

If the hardware cannot determine the value, the system must not display it.

---

# Phase 3 - Implement Supported Hardware States

Implement only states that can be reliably detected.

Supported states include

## Device Connectivity

- Online
- Offline
- Reconnecting

---

## Printer Activity

- Idle
- Preparing
- Busy
- Printing

---

## Hardware Errors

- Paper Out
- Ribbon Out
- Head Open
- Buffer Full

---

## Maintenance

- Thermal Overheat
- Lifetime Print Counter
- Printer Serial Number

---

## Communication

- USB Connected
- USB Disconnected
- CUPS Queue Available
- CUPS Queue Error

Every state must originate from the Printer Adapter.

Projection Service must never infer hardware state.

---

# Phase 4 - Normalize Printer State Model

Create a standardized Device State model.

Example

Device Connectivity

- Online
- Offline
- Reconnecting

Device Runtime

- Idle
- Preparing
- Printing
- Busy

Device Fault

- Paper Out
- Ribbon Out
- Head Open
- Buffer Full
- Thermal Warning

Projection Service should receive only normalized states.

It must never interpret raw ZPL responses.

---

# Phase 5 - Event Priority Strategy

Not every event requires the same response speed.

Implement different priorities.

## Priority A

Immediate

Broadcast immediately.

Examples

- Offline
- Online
- Ribbon Out
- Paper Out
- Head Open
- Printer Recovered
- Job Failed

Latency target

< 300 ms

---

## Priority B

Retry First

Examples

Temporary communication failure

USB timeout

Queue unavailable

Retry

3 attempts

200 ms interval

Only after retry failure

↓

Offline

---

## Priority C

Delayed Updates

These values are informational.

Examples

Lifetime Print Counter

Thermal Temperature

Maintenance Counter

Refresh

Every

5–10 seconds

No need to broadcast continuously.

---

# Phase 6 - SignalR Idempotency

SignalR must never spam duplicate events.

Current issue

Paper Out

↓

Paper Out

↓

Paper Out

↓

Paper Out

Every poll creates another event.

This is incorrect.

Implement idempotent state transitions.

Example

Current

Paper Out

Incoming

Paper Out

↓

Ignore

Only publish when

Previous State != New State

Examples

Idle

↓

Printing

Broadcast

Printing

↓

Printing

Ignore

Printing

↓

Paper Out

Broadcast

Paper Out

↓

Paper Out

Ignore

Paper Out

↓

Printing

Broadcast

---

# Phase 7 - Alarm Strategy

Only fault states should generate alarms.

Examples

Paper Out

Ribbon Out

Head Open

Offline

Job Failed

Thermal Warning

No alarm

Idle

Printing

Busy

Preparing

Online

Projection Service should continue to own alarm creation.

---

# Phase 8 - Retry Strategy

Different hardware failures require different retry policies.

## Offline

Retry

Immediately

3 attempts

↓

Offline

↓

Next retry every

10 seconds

---

## Paper Out

Do NOT retry.

Operator intervention required.

---

## Ribbon Out

Do NOT retry.

Operator intervention required.

---

## Head Open

Do NOT retry.

Wait until the print head is closed.

---

## Buffer Full

Retry automatically.

Short interval

500 ms

---

## Thermal Warning

Delay new print jobs.

Allow current print job to finish if safe.

Resume automatically after temperature recovers.

---

# Phase 9 - Kiosk UI Redesign

Redesign the printer monitoring card.

The UI should prioritize operator readability.

Avoid technical details.

Display only meaningful information.

---

Recommended layout

Printer Name

Printer Type

Current State

Last Heartbeat

Current Job

Current Production Order

Fault Indicator

Retry Button (when applicable)

Maintenance Button

---

Fault Banner

If Paper Out

Show

🟠 Paper Roll Empty

Replace media to continue printing.

---

If Ribbon Out

🔴 Ribbon Empty

Replace ribbon roll.

---

If Head Open

🟠 Print Head Open

Close the printer head before continuing.

---

If Offline

🔴 Printer Offline

Automatic retry in

10

9

8

...

Retry Now

---

Busy

🟢 Printing

Order

PO-2026-00125

Label

25 / 100

---

Do not overload the UI with dozens of hardware indicators.

Operators need actionable information.

---

# Phase 10 - Maintenance Panel

Display

Printer Serial Number

Lifetime Print Length

Last Maintenance

Recommended Cleaning

Thermal Warning

These values refresh periodically.

No real-time SignalR required.

---

# Phase 11 - Device History

Store hardware state transitions.

Examples

09:00 Online

09:32 Printing

09:36 Paper Out

09:42 Paper Loaded

09:43 Printing

09:51 Completed

Useful for diagnostics.

---

# Phase 12 - Projection Service

Projection Service remains responsible for

- Device read models
- Alarm Center
- SignalR
- Historical events

Projection Service must never

- parse ZPL
- query USB
- communicate with CUPS

All hardware logic belongs exclusively to the Printer Adapter.

---

# Phase 13 - Documentation Updates

Update all engineering documentation.

Include

Product Documentation

- Supported hardware capabilities
- Unsupported hardware capabilities
- Operator workflows
- Alarm behavior

System Documentation

- Device state machine
- Retry strategy
- Event priority
- SignalR idempotency
- Health polling

AI Documentation

- Printer Adapter responsibilities
- Hardware abstraction
- State normalization
- Event deduplication
- Future hardware extension guidelines

---

# Verification Checklist

Before completing the implementation, verify all of the following:

- Every mocked printer state has been identified and removed.
- The system displays only hardware states that the Zebra GK420t can actually detect.
- Unsupported percentage-based consumable metrics are completely removed.
- The Printer Adapter aggregates real hardware information and exposes a normalized DeviceStatus.
- Projection Service receives only normalized device states and never communicates directly with CUPS or USB.
- SignalR broadcasts only on actual state transitions using idempotent logic.
- Duplicate hardware events are ignored.
- Immediate events (Offline, Paper Out, Ribbon Out, Head Open, Job Failed) are broadcast within the defined latency target.
- Retryable communication failures follow the 3-attempt, 200 ms retry policy before transitioning to Offline.
- Maintenance metrics refresh periodically without flooding SignalR.
- Alarm Center is triggered only for actionable fault conditions.
- The Kiosk UI has been redesigned to present concise, operator-friendly information with clear fault banners and contextual actions.
- Historical device state transitions are persisted and viewable.
- Product Documentation, System Documentation, and AI Documentation are fully updated to reflect the new monitoring architecture.

```

```
