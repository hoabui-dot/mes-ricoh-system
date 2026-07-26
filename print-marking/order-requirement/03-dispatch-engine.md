# Phase 03 - Dispatch Engine

Version: 1.0

Status: Ready for Implementation

---

# Overview

Dispatch Engine is responsible for orchestrating the execution of manufacturing jobs.

It is the bridge between the MES Planning Layer and the Edge Station Layer.

Unlike the Work Order module, Dispatch Engine never owns business entities.

It only coordinates execution.

Its responsibility is to transform a validated Work Order into executable commands for industrial stations.

---

# Responsibilities

Dispatch Engine must:

• Receive WorkOrder events
• Resolve destination station
• Resolve production line
• Resolve gateway
• Generate execution payload
• Publish command
• Wait for acknowledgement
• Monitor execution timeout
• Retry communication
• Publish execution events
• Preserve complete traceability

Dispatch Engine must never:

• Modify Work Orders
• Modify Production Orders
• Update Workforce
• Execute business validation
• Communicate directly with industrial devices

---

# Position Inside Architecture

MES

↓

Production Order

↓

Work Order

↓

Dispatch Engine

↓

Gateway

↓

RabbitMQ

↓

MQTT Adapter

↓

Station Agent

↓

Printer

Laser

Vision

PLC

---

# Why Dispatch Engine Exists

Without Dispatch Engine

MES

↓

Station Agent

This creates tight coupling.

MES would need to know

MQTT

Gateway

Station

Printer

Laser

Vision

PLC

Retry

Timeout

Heartbeat

Device Status

This violates separation of concerns.

Dispatch Engine isolates all execution infrastructure.

---

# Core Responsibilities

Dispatch Planning

Station Selection

Gateway Routing

Payload Transformation

Dispatch Retry

Acknowledgement Tracking

Execution Monitoring

Realtime Progress

Failure Recovery

Audit Logging

---

# Dispatch Lifecycle

Pending

↓

Preparing

↓

Publishing

↓

Waiting ACK

↓

Accepted

↓

Executing

↓

Completed

Alternative

Waiting ACK

↓

Timeout

↓

Retry

↓

Waiting ACK

Alternative

Accepted

↓

Rejected

↓

Retry

Alternative

Executing

↓

Failed

↓

Retry Pending

---

# Dispatch Aggregate

DispatchJob

Fields

DispatchId

WorkOrderId

AttemptId

GatewayId

StationId

Priority

RoutingKey

Exchange

Status

Payload

CorrelationId

TraceId

RetryCount

Timeout

CreatedAt

UpdatedAt

CompletedAt

---

# Station Resolution

Dispatch Engine does not hardcode stations.

Station resolution follows:

Production Line

↓

Station Group

↓

Station Capability

↓

Station Availability

↓

Station Health

↓

Load Balancing

↓

Final Station

Example

Production Line

Assembly Line 03

↓

Available Stations

Station-01

Station-02

Station-03

↓

Station-02 Busy

↓

Station-03 Offline

↓

Dispatch

Station-01

---

# Gateway Resolution

Every station belongs to one Gateway.

Gateway

↓

Station

↓

MQTT Edge

↓

Industrial Devices

Gateway configuration

Gateway ID

Host

MQTT Topic Prefix

QoS

KeepAlive

TLS

Authentication

Heartbeat

---

# Payload Generation

Dispatch Engine converts WorkOrder into Station Job.

MES Internal Model

↓

Dispatch DTO

↓

MQTT JSON

↓

Station Agent

Payload Example

{
    "workOrderId": "...",
    "attemptId": "...",
    "jobType":"PRINT_AND_MARK",
    "productCode":"FC-001",
    "quantity":1,
    "priority":"NORMAL"
}

Dispatch Engine never publishes domain entities.

Only DTOs.

---

# MQTT Contract

Must follow Station Agent Product Document.

Required Fields

site

area

line

machine

edge_id

timestamp

event_id

data[]

Dispatch Engine fills all metadata.

Station Agent only executes.

---

# RabbitMQ Contracts

Exchange

dispatch.events

Routing Keys

dispatch.created

dispatch.sent

dispatch.accepted

dispatch.executing

dispatch.completed

dispatch.failed

dispatch.timeout

dispatch.retry

dispatch.deadletter

---

# Communication Pattern

MES

↓

RabbitMQ

↓

Dispatch Engine

↓

RabbitMQ

↓

MQTT Adapter

↓

MQTT Broker

↓

Station Agent

↓

RabbitMQ

↓

Projection

↓

SignalR

↓

MES Dashboard

No synchronous HTTP calls.

Everything is event-driven.

---

# Retry Policy

Dispatch retry is infrastructure retry.

Business retry belongs to WorkOrder.

Infrastructure Retry

MQTT Timeout

Gateway Busy

Temporary Network Failure

Broker Restart

Business Retry

Printer Failed

Laser Failed

Vision Failed

Operator Retry

Never mix these concepts.

---

# Timeout Rules

Waiting ACK

10 seconds

Publishing

5 seconds

Gateway Timeout

30 seconds

Execution Timeout

Configured per Workflow

Example

Print

15 seconds

Laser

30 seconds

Vision

20 seconds

PLC

10 seconds

---

# Idempotency

DispatchId

must be globally unique.

Station Agent ignores duplicate DispatchId.

Dispatch Engine retries using same DispatchId.

Never generate new DispatchId during retry.

---

# Correlation

Every dispatch carries

TraceId

CorrelationId

WorkOrderId

AttemptId

DispatchId

StationId

GatewayId

This enables full tracing across

MES

RabbitMQ

Gateway

Station Agent

Projection

Kiosk

---

# Outbox Pattern

Dispatch Engine owns its own Outbox.

Transaction

Insert Dispatch

↓

Insert Timeline

↓

Insert Outbox

↓

Commit

↓

Background Worker

↓

RabbitMQ

↓

Published

---

# Heartbeat

Dispatch Engine subscribes

DeviceHeartbeat

GatewayHeartbeat

StationHeartbeat

Heartbeat is cached.

Dispatch decisions always use cached status.

Never ping devices synchronously.

---

# Station Selection Strategy

Priority

1

Online

2

Healthy

3

Idle

4

Lowest Queue

5

Same Production Line

6

Same Capability

If multiple stations qualify

Round Robin

---

# Failure Recovery

Gateway Offline

↓

Choose another Gateway

if possible

Station Offline

↓

Choose another Station

Printer Offline

↓

Dispatch Failure

↓

Retry Pending

Vision Failure

↓

Continue

↓

Receive Verification Failed

↓

Business Retry

---

# Manual Override

Manual Override never bypasses Dispatch Engine.

Operator

↓

MES

↓

RabbitMQ

↓

Dispatch Engine

↓

Gateway

↓

Station Agent

Everything follows normal execution.

---

# Security

Only Dispatch Engine may publish execution commands.

MQTT Adapter never accepts commands from external systems.

Gateway validates:

Signature

Station

Timestamp

TTL

Duplicate Event

---

# Monitoring

Metrics

Dispatch/sec

ACK latency

Timeouts

Retries

Gateway availability

Station utilization

MQTT publish latency

RabbitMQ latency

Dead Letter count

---

# Logging

Every dispatch logs

Payload

Headers

Routing

Latency

Retries

ACK

Completion

Failures

All logs include

TraceId

CorrelationId

DispatchId

---

# Acceptance Criteria

✓ Dispatch is asynchronous

✓ No HTTP between MES and Station Agent

✓ MQTT payload follows Product Document

✓ Dispatch retries are idempotent

✓ Full tracing supported

✓ Heartbeat driven routing

✓ Gateway abstraction complete

✓ Ready for multiple factories

✓ Ready for horizontal scaling

✓ Zero business logic inside Dispatch Engine

---

# Next Phase

Phase 04

Execution Monitor

Responsible for

Realtime monitoring

Execution timeline

Device health

Progress aggregation

Production KPIs

SignalR / SSE updates

Projection synchronization

Failure visualization