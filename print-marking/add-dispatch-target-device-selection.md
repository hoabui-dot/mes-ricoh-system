# Enhancement: Add Dispatch Target Selection Before Production Execution

Before dispatching Production Items to the Station Agent, the operator must explicitly choose the execution target.

This selection determines where all generated Print Jobs will be sent.

---

# Business Requirement

Currently, after entering the production quantity (PCS), the system immediately dispatches jobs to the Device Simulator.

This behavior must be changed.

Instead, before dispatching, the operator must choose the execution target.

Production Order

↓

Generate Production Items

↓

Generate Print Jobs

↓

Select Dispatch Target

↓

Dispatch

---

# Dispatch Target

Replace the current fixed behavior with a configurable execution target.

Supported targets:

- Device Simulator (Mock)
- Physical Zebra Printer (CUPS / IPP)
- Future TCP/IP Zebra Printer
- Future Print Server

The UI should not expose implementation details.

Instead of displaying:

"Mock"

"display"

"Real Printer"

use business-friendly names.

Example

Execution Target

○ Simulation Environment

○ Production Printer

---

# Production Order Form

When creating a Production Order, DO NOT ask the user to select the printer.

Printer selection belongs to the execution stage.

Production Planning should remain independent from equipment allocation.

---

# Work Orders Dispatch

When the operator selects Production Items and clicks Dispatch,

open a Dispatch dialog.

The dialog should contain:

Execution Target

Production Quantity

Target Station

Execution Team

Dispatch Notes

Estimated Duration

Dispatch Summary

---

# Execution Target Options

Option 1

Simulation Environment

Description

Send jobs to Device Simulator.

Used for testing.

No physical labels are printed.

---

Option 2

Production Printer

Description

Send jobs to the physical Zebra printer.

Communication uses IPP/CUPS over TCP.

Default Port

631

The Print Adapter Service is responsible for communicating with the printer.

---

# Connection Configuration

When Production Printer is selected,

display

Printer

Connection

Printer Queue

Printer Status

Connection Test

Example

Printer

Zebra GK420t

Protocol

IPP / CUPS

Host

localhost

Port

631

Queue

Zebra_GK420t

Status

Online

---

# Connection Validation

Before Dispatch,

the system must validate

Printer Reachable

Queue Exists

Printer Ready

No Paper Error

No Ribbon Error

If validation fails,

prevent dispatch

and display the error.

---

# Dispatch Flow

Simulation

Production Items

↓

RabbitMQ

↓

Device Simulator

↓

Mock Printer

↓

Projection

↓

Dashboard

Production Printer

Production Items

↓

RabbitMQ

↓

Print Adapter

↓

CUPS

↓

TCP Port 631

↓

Zebra Printer

↓

Projection

↓

Dashboard

Business logic remains identical.

Only the execution target changes.

---

# Configuration

Execution Target should be configurable.

Example

Default

Simulation

or

Production

The last selected target should be remembered per user.

---

# Future Compatibility

The implementation must support adding new execution targets without changing business logic.

Only new Driver implementations should be added.

The dispatch workflow must remain unchanged.
