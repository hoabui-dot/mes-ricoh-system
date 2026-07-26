# Refactor Production Order Business Logic to Support Real Manufacturing Dispatch

## Background

The current MES implementation has an incorrect manufacturing execution model.

Currently:

Production Order

↓

One Work Order

↓

One Station Execution

↓

One Product

This is incorrect.

In a real MES, a Production Order represents a manufacturing demand, not a single execution.

One Production Order should generate many executable jobs depending on quantity, routing, batching strategy and station assignment.

The system must be redesigned to follow enterprise MES standards.

---

# Manufacturing Model

The new hierarchy must become:

Production Order

↓

Dispatch Plan

↓

Work Orders

↓

Execution Jobs

↓

Station Agent

↓

Device Execution

Where:

Production Order

Represents customer demand.

Example

PO-20260703-001

Product

FC-WP-R0100G-B

Quantity

150 pcs

Status

Released

This order itself is never executed directly.

---

# Dispatch Plan

A Dispatch Plan defines how the order will be executed.

Example

Quantity

150

Station

Station-Combined-01

Execution Team

Team A

Dispatch Strategy

Serial

Batch Size

1

The dispatch plan can later be changed without modifying the original Production Order.

---

# Work Orders

A Production Order may generate many Work Orders.

Examples

PO

150 pcs

↓

WO-000001

↓

WO-000002

↓

WO-000003

...

↓

WO-000150

Each Work Order represents exactly one physical product.

Every Work Order owns:

Unique ID

Serial Number

Barcode

QR Code

Current Status

Current Step

Current Attempt

Assigned Station

Assigned Team

Execution History

Timeline

Operator

Traceability

Retry History

Audit Trail

---

# Why One Work Order Per Product

This manufacturing line prints labels, laser marks products and verifies traceability.

Each physical product has:

Different barcode

Different QR

Different laser content

Independent camera verification

Independent retry history

Independent PLC reject history

Therefore,

one physical product

must equal

one Work Order.

---

# Production Order Screen

Keep the Production Order page as the planning page.

It should only display:

PO Number

Customer

Product

Target Quantity

Completed

Running

Failed

Cancelled

Progress

Start Time

Estimated Finish

Priority

Dispatch Plans

No execution details should appear here.

---

# Create Dispatch Plan

After a Production Order is released,

the planner creates one or multiple Dispatch Plans.

Example

PO

150 pcs

↓

Dispatch Plan A

Station Combined 01

Quantity

100

↓

Dispatch Plan B

Station Combined 02

Quantity

50

The total quantity of all Dispatch Plans cannot exceed the Production Order quantity.

---

# Dispatch Strategy

Support multiple strategies.

Serial Dispatch

One product per execution.

Batch Dispatch

Multiple products in one execution.

Round Robin

Distribute evenly across stations.

Priority Station

Fill preferred station first.

Load Balance

Assign based on current station workload.

For now implement

Serial Dispatch.

---

# Team Assignment

Before dispatching,

the planner chooses:

Execution Team

Example

Team A

Morning Shift

Station Combined 01

Operator Count

2

The team assignment becomes immutable once dispatch starts.

---

# Work Order Generation

When the planner clicks

Generate Work Orders

the backend creates:

150 Work Orders

Each receives:

WorkOrderId

Serial

TraceId

Barcode

QR

Status

Pending

Station

Execution Team

Workflow

Attempt

1

Timeline

Created

The generation must happen asynchronously.

Progress should be displayed.

---

# Work Order Screen

The existing Work Order page should become the execution page.

Display

Table

WorkOrder

Serial

Status

Current Step

Station

Team

Progress

Current Attempt

Last Update

Search

Filter

Pagination

Bulk Selection

---

# Bulk Dispatch

Users should select any number of Work Orders.

Examples

Dispatch

1

Dispatch

10

Dispatch

50

Dispatch

All Pending

The selected Work Orders are sent to Dispatch Engine.

---

# Dispatch Modal

When clicking Dispatch

Show modal

Station

Execution Team

Workflow

Priority

Estimated Time

Confirmation

---

# Execution Flow

Work Order

↓

Dispatch Engine

↓

Gateway

↓

Station Agent

↓

Printer

↓

Laser

↓

Vision

↓

PLC

↓

Completed

Each Work Order executes independently.

---

# Real-time Status

Every Work Order streams status independently.

Examples

Pending

Queued

Dispatched

Accepted

Printing

Print Completed

Laser Running

Laser Completed

Vision Running

Vision Passed

Vision Failed

Retry

Rejected

Completed

Cancelled

Paused

---

# Detail Modal

Clicking a Work Order opens a detail modal.

The modal contains

General Information

Execution Timeline

Gateway Timeline

Device Timeline

Printer Logs

Laser Logs

Vision Logs

PLC Logs

Retry History

Current Payload

MQTT Messages

Correlation IDs

Trace IDs

Duration

Operator

Execution Attempts

Station

Workflow Version

Audit Logs

Comments

All labels must support i18n translation.

---

# Timeline

Every Work Order owns its own immutable timeline.

Example

08:01

Created

08:02

Dispatched

08:03

Gateway Accepted

08:04

Printer Started

08:05

Printer Completed

08:06

Laser Started

08:07

Laser Completed

08:08

Vision Started

08:09

Vision Passed

08:10

Completed

---

# Execution Team

A Work Order belongs to exactly one execution team.

Example

Production Team A

Morning Shift

2 Operators

Supervisor

Nguyen Van A

Displayed in:

Work Order Card

Detail Modal

Timeline

Dashboard

---

# Translation

All UI text must use i18n.

Support

English

Vietnamese

No hardcoded strings.

---

# Backend Changes

Add

DispatchPlan aggregate

WorkOrder aggregate

ExecutionJob aggregate

DispatchService

BulkDispatch API

GenerateWorkOrders API

StationAssignment Service

Dispatch Progress SSE

---

# APIs

POST

/production-orders/{id}/dispatch-plans

POST

/dispatch-plans/{id}/generate-work-orders

GET

/work-orders

GET

/work-orders/{id}

POST

/work-orders/bulk-dispatch

POST

/work-orders/{id}/dispatch

POST

/work-orders/{id}/cancel

POST

/work-orders/{id}/pause

POST

/work-orders/{id}/resume

GET

/work-orders/stream

---

# Device Simulator

The Device Simulator remains the execution orchestrator.

Instead of receiving

one Production Order,

it now receives

one Work Order.

Each Work Order goes through the existing simulation flow:

Gateway

↓

MQTT

↓

Station Agent

↓

Printer

↓

Laser

↓

Vision

↓

PLC

↓

Completion Event

No simulator changes are required to device execution logic.

Only the orchestration entry point changes.

---

# Acceptance Criteria

The implementation is complete only if:

- One Production Order can generate hundreds or thousands of Work Orders.
- Work Orders can be generated asynchronously.
- Users can select any subset of Work Orders for dispatch.
- Work Orders execute independently.
- Every Work Order has its own immutable execution history.
- Real-time streaming updates each Work Order individually.
- Device Simulator processes one Work Order at a time.
- All UI supports English and Vietnamese translations.
- The architecture aligns with enterprise MES standards and enables future support for parallel stations, batching, load balancing, and multi-line production.