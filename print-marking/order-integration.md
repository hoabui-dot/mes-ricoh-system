# Production Order Integration (MES → Station Agent) Implementation Prompt

# Objective

Implement the complete Production Order execution workflow between the MES Platform and the existing Station Agent ecosystem.

The current Device Simulator will temporarily act as the Factory Gateway / Factory Orchestrator.

This implementation must connect the Go MES backend with the existing Station Agent workflow while preserving the current event-driven architecture.

Do NOT redesign Station Agent.

Reuse the existing processing pipeline.

---

# Existing System Summary

There are currently two independent systems.

## 1. MES Platform (Go)

Responsible for

- Master Data
- Workforce
- Planning
- Production Orders
- Assignment Engine
- Dashboard
- RBAC
- Audit
- Notification

MES currently has no connection to hardware.

---

## 2. Station Agent (.NET)

Already implements an industrial edge architecture.

Services include

- MQTT Adapter
- Job Engine
- Projection Service
- Print Adapter
- Laser Adapter
- Vision Adapter
- PLC Adapter
- Device Simulator
- Kiosk UI

Communication

MQTT

↓

RabbitMQ

↓

Outbox Pattern

↓

SignalR

↓

Realtime UI

---

# Current Station Workflow

The existing workflow is

Factory Gateway

↓

MQTT Adapter

↓

Outbox Transaction

↓

RabbitMQ

↓

Job Engine

↓

Create Job

↓

Execute Steps

↓

Print Adapter

↓

Laser Adapter

↓

Vision Adapter

↓

PLC Adapter

↓

Projection

↓

SignalR

↓

Kiosk UI

Do not modify this workflow.

MES only becomes the upstream system.

---

# Production Order Types

Support the following production modes.

## PRINT_ONLY

```
Print Label

↓

Complete
```

---

## MARK_ONLY

```
Laser Mark

↓

Vision Verify

↓

Success

or

PLC Reject
```

Vision is executed ONLY after laser succeeds.

If laser fails

Vision must NOT execute.

PLC executes only for failed products.

---

## PRINT_AND_MARK

```
Print Label

↓

Laser Mark

↓

Vision Verify

↓

Success

or

PLC Reject
```

---

# Production Order Lifecycle

Inside MES

```
Draft

↓

Released

↓

Sent To Gateway

↓

Accepted

↓

Running

↓

Completed

↓

Closed
```

Failure

```
Released

↓

Running

↓

Failed
```

Cancellation

```
Released

↓

Cancelled
```

---

# Gateway Integration

Create a Gateway Client inside MES.

Current implementation

```
REST API

↓

Device Simulator
```

Future

```
REST

or

gRPC

↓

Factory Gateway
```

Only the Gateway Client should know the endpoint.

Business logic must never call Device Simulator directly.

---

# Gateway APIs

Device Simulator becomes Factory Gateway.

Expose endpoints.

Example

POST

```
/gateway/production-orders
```

Payload

```
ProductionOrder

Operation Type

Station

Priority

Products

Routing

Metadata
```

Return

```
Gateway Order ID

Accepted

Timestamp
```

---

# Device Simulator

Improve Device Simulator.

It becomes

Factory Gateway Simulator.

Responsibilities

Receive Production Order

↓

Validate

↓

Generate MQTT Command

↓

Trigger existing workflow

↓

Track Status

↓

Return Events

No business logic should be duplicated.

Only orchestrate.

---

# Reuse Existing Station Flow

The Gateway must publish exactly the same MQTT payloads currently generated manually.

Instead of clicking

Trigger Print Job

Trigger Mark Job

Trigger Print + Mark

MES now generates those requests automatically.

No duplicate code.

---

# Real-time Status Streaming

MES must stream production status.

Status changes originate from Station Agent.

Flow

Projection Service

↓

SignalR

↓

Gateway

↓

MES

↓

SSE

↓

MES Frontend

Do not poll.

Event driven only.

---

# Production Order Detail Page

Create a realtime monitoring page.

Display

Order Number

Product

Station

Operation

Priority

Current Step

Current Device

Running Time

Progress

Operator

Gateway Status

Station Status

Current Attempt

Timeline

---

Timeline Example

```
Released

↓

Gateway Accepted

↓

MQTT Published

↓

Job Created

↓

Printing

↓

Laser Running

↓

Vision Success

↓

Completed
```

If failed

```
Vision Failed

↓

PLC Reject

↓

Job Failed
```

Display exact failure reason.

---

# Production Order List

Columns

Order Number

Product

Station

Operation

Priority

Status

Progress

Created Time

Updated Time

Actions

Support

Search

Filter

Pagination

Sorting

Realtime updates

---

# Production Creation

Create Production Order.

Fields

Order Number

Product

Quantity

Operation

Station

Priority

Due Time

Description

Attachments

Validation

Operation required

Quantity > 0

Station required

---

# Release Action

Only Released orders are sent to Gateway.

Flow

Create

↓

Draft

↓

Manager reviews

↓

Release

↓

Gateway

↓

Station Agent

---

# Current Station Status Mapping

Map existing Station Agent states.

Job Created

↓

Queued

↓

Processing

↓

Printing

↓

Laser Running

↓

Vision Running

↓

Vision Passed

↓

Vision Failed

↓

PLC Rejecting

↓

Completed

↓

Failed

↓

Cancelled

↓

Manual Override

↓

Retry

↓

Reprint

↓

Remark

Use existing events.

Do not create new states unless necessary.

---

# Manual Operations

MES should display if

Operator performed

Manual Reprint

Manual Remark

Retry Failed Job

Manual Override

These events already exist inside Station Agent.

Display them in MES timeline.

---

# Error Handling

If Gateway unavailable

Order remains

Released

Retry available.

If Station Agent rejects

Display reason.

If Vision fails

Display OCR result.

If PLC rejects

Display reject completed.

Everything should appear in timeline.

---

# Event Correlation

Use

TraceId

CorrelationId

ProductionOrderId

JobId

StationId

Every event across MES and Station Agent must be traceable.

---

# Backend

Implement

Gateway Client

Production Gateway Service

Realtime Event Consumer

Status Synchronizer

Projection Updater

No polling.

RabbitMQ + Events only.

---

# Frontend

Implement

Production Orders

Realtime Dashboard

Order Detail

Timeline

Gateway Status

Station Status

Execution Progress

Live Event Log

Auto refresh via SSE.

---

# Device Simulator

Convert Factory Gateway tab into

Factory Gateway Orchestrator.

Display

Incoming Orders

Current Queue

Running Order

Completed Orders

Failed Orders

Outgoing MQTT

Event Log

Current Device Status

Each Production Order can be expanded.

Show

Payload

MQTT

RabbitMQ

Job ID

Timeline

Execution Time

Current Device

Failure

Retry

---

# Seed Data

Generate

Products

Stations

Production Orders

Routing

Priorities

Sample running orders

Completed orders

Failed orders

Cancelled orders

Manual reprint history

Vision failures

PLC rejects

so the UI immediately demonstrates all workflows.

---

# Testing

Implement

Unit Tests

Gateway Tests

Integration Tests

Realtime Streaming Tests

End-to-End Tests

Station Integration Tests

Failure Recovery Tests

Gateway Offline Tests

Vision Failure Tests

PLC Reject Tests

Retry Tests

Manual Reprint Tests

Target coverage >90%.

---

# Documentation

Update

README.md

docs/PRODUCTION.md

docs/GATEWAY.md

docs/STATION_INTEGRATION.md

docs/EVENT_FLOW.md

docs/API_REFERENCE.md

Include

- End-to-end architecture
- Sequence diagrams
- Production lifecycle
- Gateway responsibilities
- Station Agent interaction
- Current MQTT payload mapping
- Current RabbitMQ routing
- Existing Job Engine state machine
- SignalR → MES realtime flow
- Failure scenarios
- Retry strategy
- Manual override workflow
- Event correlation strategy

The final result should make MES the upstream production management system while the Station Agent continues to own device orchestration, hardware communication, realtime execution, and fault recovery.