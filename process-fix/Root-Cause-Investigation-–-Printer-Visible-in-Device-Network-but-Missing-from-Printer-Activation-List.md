# Root Cause Investigation – Printer Visible in Device Network but Missing from Printer Activation List

## Background

The remote Printer Adapter is now deployed successfully.

Current runtime evidence:

- Printer Adapter Monitoring UI reports:
  - Printer Adapter ONLINE
  - RabbitMQ CONNECTED
  - CUPS CONNECTED
  - Zebra printer ONLINE
  - Heartbeats updating correctly
  - Printer queue healthy

- Device Network page inside Kiosk UI also displays:

  Zebra-GK420t-CUPS
  Status: ONLINE

Therefore:

Projection Service is already receiving printer runtime information.

However:

The Printer Management page ("Thiết bị in") shows:

- Active Printers = 0
- Available Printers = 0

meaning no printer can be activated for production.

This is logically inconsistent.

If Projection Service knows an ONLINE printer exists, Printer Management should also be able to display it as an available printer.

The bug is almost certainly inside the Projection Service read model, Printer query API, Printer activation logic, or Kiosk UI filtering logic.

Do NOT patch the UI blindly.

Investigate the entire workflow first.

---

# Objective

Perform a complete end-to-end investigation.

Find the exact root cause.

Implement the correct architectural fix.

Do not add fake fallback logic.

Do not hardcode printer data.

---

# Phase 1 — Understand Printer Flow

Trace the complete lifecycle of a printer.

Document every step.

Expected flow:

Printer Adapter

↓

RabbitMQ

↓

Projection Service

↓

Projection Database

↓

Projection REST API

↓

Kiosk UI

↓

Printer Activation Page

For every stage verify:

- input
- output
- mapping
- filtering
- persistence
- DTO conversion

---

# Phase 2 — Verify Runtime Events

Locate every RabbitMQ event related to printers.

Examples:

printer.heartbeat

printer.status.changed

printer.registered

printer.connected

printer.disconnected

printer.error

printer.configuration.changed

Determine:

Which events actually exist.

Which are consumed.

Which are ignored.

Which update Projection.

Which update Kiosk.

Do NOT assume documentation is correct.

Source code is the source of truth.

---

# Phase 3 — Audit Projection Service

Inspect:

ProjectionEventConsumer

PrinterProjection

PrinterReadModel

DeviceProjection

PrinterRepository

PrinterQueries

PrinterController

DeviceController

SignalR notifications

Determine:

How printer entities are created.

How printer entities are updated.

Which events create records.

Which events only update status.

Whether printer activation information is stored.

Whether Production flags are stored.

Whether printer capability is stored.

Whether DriverType is stored.

Whether IsActiveForWork exists.

Whether printers are accidentally filtered out.

---

# Phase 4 — Inspect Projection Database

Inspect current projection.db.

Verify:

How many printer records exist.

For every printer record inspect:

PrinterCode

DisplayName

DriverType

Status

Heartbeat

Template

IsActiveForWork

ProductionEnabled

Deleted

Disabled

Hidden

LastSeen

ConnectionType

Capability

WorkstationBinding

StationAgent

Everything related to printer visibility.

Document findings.

---

# Phase 5 — Audit Kiosk UI

Locate every API used by:

Printer Management page

Network page

Printer activation

Printer list

Available printers

Activated printers

Determine:

Which endpoint each page calls.

Example:

GET /api/printers

GET /api/printers/active

GET /api/network

GET /api/device-network

GET /api/printer-management

etc.

Verify whether:

Network page

and

Printer Management page

are using different APIs.

If yes,

determine why.

---

# Phase 6 — Compare Returned DTOs

Compare:

Network page DTO

Printer Management DTO

Find differences.

Especially:

Status

DriverType

Capability

ProductionEnabled

CanActivate

IsVisible

IsActive

TemplateAssigned

CurrentAssignment

StationAgentId

WorkstationId

Determine why one page displays the printer while the other does not.

---

# Phase 7 — Check Filtering Logic

Inspect every LINQ query.

Look for filters like:

Status == Online

IsActive

ProductionEnabled

TemplateAssigned

CurrentTemplate != null

CanPrint

CanActivate

AssignedTemplate != null

IsAssigned

Capability == Printer

DeviceType == Printer

Hidden == false

Deleted == false

StationBound

WorkstationBound

Role == Production

Find every filter that removes printers.

Document them.

---

# Phase 8 — Verify Activation Workflow

Investigate:

How a printer becomes:

"Available"

↓

"Activated"

Questions:

Does activation require:

Template?

Workstation?

Production Version?

Station?

Capability?

Assignment?

If so,

is that assignment missing?

Should it already exist?

Or is Projection incorrectly requiring it?

---

# Phase 9 — Compare with Monitoring UI

Printer Adapter Monitoring UI clearly shows:

Printer ONLINE

Driver

Queue

Heartbeat

RabbitMQ

CUPS

Compare its API response

against

Projection Service response.

Determine:

whether Projection is missing data

or

Kiosk is discarding it.

---

# Phase 10 — Verify SignalR

Check whether:

SignalR updates:

only Network page

but not Printer page.

Verify:

subscriptions

event handlers

stores

state management

React queries

cache invalidation

Zustand

Redux

React Query

or equivalent.

---

# Phase 11 — Fix Architecture

Implement the proper fix.

Do NOT:

duplicate APIs

duplicate printer state

hardcode online printers

copy runtime data

Instead ensure:

Projection remains the single source of truth.

Printer pages

Network pages

Activation pages

all use the same canonical printer read model.

No duplicated logic.

---

# Phase 12 — Runtime Verification

After implementation verify:

1.

Printer Adapter ONLINE

↓

Projection updated

↓

Network page displays printer

2.

Printer page shows:

Available Printers = 1

3.

Activate printer.

4.

Printer moves to:

Production Printers

5.

Deactivate.

6.

Printer returns to Available list.

7.

Heartbeat updates continue.

8.

Status changes ONLINE → OFFLINE immediately update both pages.

9.

Restart Projection Service.

Verify data reloads correctly.

10.

Restart Kiosk.

Verify printer still appears.

11.

Restart Printer Adapter.

Verify printer disappears then returns.

12.

No duplicate printer rows.

13.

No stale records.

14.

No manual database edits required.

---

# Deliverables

Provide:

## Root Cause

Exactly where the bug existed.

## Evidence

Source files.

Methods.

Queries.

DTOs.

APIs.

## Code Changes

Every modified file.

## Runtime Validation

Screenshots / API responses / SQL verification.

## Architectural Notes

Explain why the fix is correct.

Explain why it will not regress future printer integrations.

Do not report success until the complete runtime flow has been verified.