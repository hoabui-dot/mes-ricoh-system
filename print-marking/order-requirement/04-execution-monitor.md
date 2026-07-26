# Phase 04 - Execution Monitor

Version: 1.0

Status: Ready for Implementation

---

# Overview

Execution Monitor is the realtime observability layer of the Manufacturing Execution System.

Unlike Dispatch Engine, Execution Monitor never sends commands.

Unlike Work Order, Execution Monitor never owns business state.

Its responsibility is to continuously observe every execution happening inside the factory and build a realtime operational view.

Execution Monitor is the single source of truth for production visibility.

---

# Primary Responsibilities

Execution Monitor is responsible for:

• Receiving execution events
• Tracking job progress
• Aggregating execution status
• Monitoring device health
• Monitoring gateway health
• Detecting execution anomalies
• Producing realtime dashboard data
• Building production timeline
• Publishing realtime updates
• Producing KPI metrics
• Producing OEE metrics
• Triggering notifications

Execution Monitor never performs business decisions.

---

# Position Inside Architecture

Production Workflow

↓

Production Order

↓

Work Order

↓

Dispatch Engine

↓

Gateway

↓

Station Agent

↓

RabbitMQ Events

↓

Execution Monitor

↓

Projection Database

↓

SSE

↓

MES Dashboard

↓

Operator

---

# Why Execution Monitor Exists

Without Execution Monitor

Every frontend must subscribe directly to RabbitMQ.

MES

↓

RabbitMQ

↓

Browser

Impossible.

Instead

RabbitMQ

↓

Execution Monitor

↓

Projection

↓

SSE

↓

Browser

---

# Event Sources

Execution Monitor consumes events from

Dispatch Engine

Station Agent

MQTT Adapter

Printer Adapter

Laser Adapter

Vision Adapter

PLC Adapter

Gateway

Heartbeat Service

Assignment Engine

Notification Service

---

# Event Types

WorkOrderCreated

DispatchStarted

DispatchCompleted

DispatchFailed

StationAccepted

ExecutionStarted

ExecutionProgress

PrinterStarted

PrinterCompleted

PrinterFailed

LaserStarted

LaserCompleted

LaserFailed

VisionStarted

VisionPassed

VisionFailed

PLCStarted

PLCCompleted

PLCRejected

HeartbeatUpdated

GatewayDisconnected

GatewayConnected

StationDisconnected

StationConnected

ManualOverrideRequested

ManualOverrideCompleted

RetryStarted

RetryCompleted

RetryFailed

JobCompleted

JobFailed

---

# Event Pipeline

RabbitMQ

↓

Consumer

↓

Event Validation

↓

Event Mapper

↓

Projection Builder

↓

Realtime Publisher

↓

Dashboard

---

# Projection Database

Execution Monitor owns its own database.

No foreign keys.

Read optimized only.

---

# Projection Tables

production_dashboard

production_timeline

production_jobs

station_status

gateway_status

device_status

worker_status

execution_alerts

heartbeat_cache

production_metrics

production_oee

---

# production_dashboard

Stores current production overview.

Columns

Factory

Area

Line

Station

RunningJobs

CompletedToday

FailedToday

RetryToday

AverageCycleTime

CurrentShift

OperatorCount

UpdatedAt

---

# production_jobs

One row represents one Work Order.

Columns

WorkOrderID

ProductionOrderID

StationID

Status

CurrentStep

CurrentDevice

Progress

CurrentAttempt

StartedAt

CompletedAt

Duration

Operator

LastEvent

UpdatedAt

---

# production_timeline

Append-only timeline.

Columns

TimelineID

WorkOrderID

EventType

Source

Message

Payload

Timestamp

---

# station_status

Current station information.

Columns

StationID

Status

Heartbeat

CurrentJob

QueueLength

CPU

Memory

LastUpdated

---

# device_status

Current device state.

Columns

DeviceID

DeviceType

StationID

Status

Busy

CurrentJob

Heartbeat

LastUpdated

---

# gateway_status

Columns

GatewayID

Online

Heartbeat

ConnectedStations

Latency

LastUpdated

---

# heartbeat_cache

Stores latest heartbeat only.

Columns

Source

Status

ReceivedAt

Latency

IPAddress

Version

---

# execution_alerts

Generated alerts.

Columns

AlertID

Severity

Type

Message

Source

CreatedAt

ResolvedAt

---

# production_metrics

Stores calculated KPIs.

Columns

Completed

Failed

Retry

SuccessRate

AverageCycleTime

QueueTime

ExecutionTime

UpdatedAt

---

# production_oee

Stores OEE indicators.

Columns

Availability

Performance

Quality

OEE

Shift

UpdatedAt

---

# Heartbeat Architecture

Execution Monitor never polls devices.

Heartbeat originates from devices.

Device

↓

Station Agent

↓

RabbitMQ

↓

Execution Monitor

↓

Projection

↓

Dashboard

Heartbeat is event-driven.

---

# Device Status

Possible values

ONLINE

OFFLINE

BUSY

IDLE

ERROR

MAINTENANCE

DISCONNECTED

UNKNOWN

---

# Gateway Status

ONLINE

OFFLINE

CONNECTING

ERROR

---

# Station Status

READY

WAITING

RUNNING

STOPPED

ERROR

OFFLINE

---

# Job Progress

Progress is calculated.

Print

25%

Laser

50%

Vision

75%

PLC

100%

Never manually update percentage.

Always derive from completed steps.

---

# Timeline Rules

Timeline is immutable.

Every event becomes one record.

Example

08:01

Job Created

08:02

Dispatched

08:03

Accepted

08:04

Printer Started

08:05

Printer Finished

08:06

Laser Started

08:07

Vision Failed

08:08

Retry Requested

08:09

Retry Started

08:10

Completed

Timeline is append only.

---

# Device Health

Health comes from DeviceHeartbeat.

Heartbeat Interval

5 seconds

Offline Threshold

15 seconds

Error Threshold

30 seconds

Health Score

Healthy

Warning

Critical

---

# Production Dashboard

Realtime cards

Running Jobs

Waiting Jobs

Completed Today

Failed Today

Retry Today

Online Stations

Offline Stations

Connected Gateways

OEE

---

# Live Production Table

Columns

Work Order

Product

Station

Current Step

Status

Progress

Operator

Started

Duration

Current Attempt

Last Event

---

# Realtime Technology

Backend

Go

↓

RabbitMQ Consumer

↓

Projection Builder

↓

SSE

↓

React

Reason

One-way communication

Lower memory

Higher scalability

Better than WebSocket for dashboard.

---

# Refresh Rules

SSE

Instant

Projection

Realtime

Dashboard Cards

Realtime

Timeline

Realtime

History

Lazy Loading

Charts

Every 5 seconds

---

# Alert Rules

Generate alerts for

Gateway Offline

Station Offline

Device Offline

Printer Error

Laser Error

Vision Failure

PLC Failure

Job Timeout

Dispatch Timeout

Retry Overflow

Heartbeat Lost

---

# Metrics

Average Cycle Time

Average Dispatch Time

Average Verification Time

Average Retry Time

Failure Rate

Success Rate

OEE

Device Utilization

Station Utilization

Gateway Utilization

---

# Logging

Every event stores

CorrelationID

TraceID

WorkOrderID

AttemptID

StationID

GatewayID

DeviceID

OperatorID

Timestamp

---

# Security

Dashboard APIs are read-only.

No write operations.

RBAC

Operator

Supervisor

Production Manager

Plant Manager

Administrator

Each role has different visibility.

---

# API Endpoints

GET /dashboard

GET /dashboard/live

GET /dashboard/kpi

GET /dashboard/oee

GET /timeline

GET /timeline/{workOrderId}

GET /stations

GET /stations/{id}

GET /devices

GET /alerts

GET /metrics

GET /heartbeats

---

# Acceptance Criteria

✓ No polling to devices

✓ Event-driven heartbeat

✓ Projection database only

✓ Immutable timeline

✓ Realtime dashboard

✓ SSE streaming

✓ KPI calculation

✓ OEE calculation

✓ Alert generation

✓ Device health monitoring

✓ Gateway monitoring

✓ Full observability

---

# Next Phase

Phase 05

Manual Operations

Topics

Manual Override

Reprint

Remark

Print & Remark

Approval Workflow

Audit Trail

Operator Tracking

Human-in-the-loop

Failure Recovery

Immutable Retry History