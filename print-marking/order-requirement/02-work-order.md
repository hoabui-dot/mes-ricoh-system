# Phase 02 - Work Order Module

Version: 1.0

Status: Ready for Implementation

---

# Objective

This document defines the implementation of the Work Order module.

This module is the execution bridge between the business planning layer and the industrial execution layer.

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

Industrial Devices

Unlike Production Workflow, Work Orders represent real manufacturing jobs.

Every Work Order corresponds to actual production that will eventually be executed by printers, laser markers, vision cameras, PLC controllers and other industrial equipment.

---

# Business Context

MES has two major responsibilities.

Planning

Execution

Planning produces Production Orders.

Execution produces Work Orders.

The Work Order module begins where planning ends.

---

# Position Inside Entire System

MES

│

├── Production Workflow

├── Production Orders

├── Workforce

├── Assignment Engine

└── Work Orders

↓

Dispatch Engine

↓

Gateway

↓

Station Agent

↓

Industrial Devices

---

# Goals

The Work Order module must support

Generate Work Orders

Split Production Orders

Manage execution state

Track execution progress

Retry execution

Manual intervention

Audit history

Realtime updates

Dispatch preparation

Gateway integration

Station traceability

---

# Out of Scope

Actual device communication

Printer

Laser

Vision

PLC

These belong to Station Agent.

---

# Core Business Concepts

Production Order

Represents business demand.

Example

Produce

1000 Coffee Packages

↓

Generate

1000 Work Orders

Each Work Order represents one physical product.

Alternatively

Generate

100 Work Orders

Each containing

Quantity = 10

Generation strategy is configurable.

---

# Aggregate Root

WorkOrder

This is the central execution aggregate.

Everything revolves around WorkOrder.

Never update ProductionOrder execution directly.

ProductionOrder progress is calculated from WorkOrders.

---

# Domain Entities

WorkOrder

Aggregate Root

WorkOrderStep

Execution History

Manual Override

Dispatch Record

Assignment Snapshot

Execution Timeline

---

# Work Order Lifecycle

Created

↓

Ready

↓

Assigned

↓

Queued

↓

Dispatching

↓

Waiting Station

↓

Accepted

↓

Executing

↓

Completed

↓

Verified

↓

Finished

Alternative

Executing

↓

Failed

↓

Retry Pending

↓

Retrying

↓

Completed

Alternative

Executing

↓

Cancelled

Alternative

Executing

↓

Manual Override

↓

Retry

---

# State Rules

Created

Only system.

Ready

Workflow validated.

Assigned

Workers assigned.

Queued

Waiting dispatch.

Dispatching

Gateway communication.

Waiting Station

Station not yet accepted.

Accepted

Station accepted.

Executing

Station processing.

Completed

Physical operation completed.

Verified

Vision verification completed.

Finished

Business completed.

Failed

Execution failed.

Retry Pending

Waiting user or automatic retry.

Retrying

New execution.

Cancelled

Business cancelled.

---

# State Machine Rules

Created

↓

Ready

↓

Assigned

↓

Queued

↓

Dispatching

↓

Waiting Station

↓

Accepted

↓

Executing

↓

Completed

↓

Verified

↓

Finished

Failures

Executing

↓

Failed

↓

Retry Pending

↓

Retrying

↓

Executing

Manual Override

Failed

↓

Manual Override

↓

Retry Pending

↓

Retrying

Never

Failed

↓

Executing

Direct transition is forbidden.

Retry always creates a Retry Context.

---

# Retry Philosophy

Never overwrite execution.

Every retry creates

Execution Attempt

Attempt Number

Retry Reason

Operator

Timestamp

Correlation ID

Trace ID

Retry Strategy

Automatic

Manual

Scheduled

---

# Work Order Identity

Fields

ID

WorkOrderNo

ProductionOrderID

WorkflowVersion

CurrentStep

Status

Priority

Quantity

Revision

CreatedAt

UpdatedAt

StartedAt

CompletedAt

FinishedAt

CreatedBy

UpdatedBy

CorrelationID

TraceID

---

# Work Order Step

Each workflow operation becomes

one WorkOrderStep.

Example

Workflow

Print

Laser

Vision

PLC

↓

Generated

WorkOrder Steps

10 Print

20 Laser

30 Vision

40 PLC

Each step maintains its own state.

---

# Step Status

Pending

Ready

Executing

Completed

Skipped

Failed

Cancelled

Retry Pending

Retrying

Verified

---

# Step Types

PRINT

MARK

PRINT_AND_MARK

VISION

PLC

WAIT

MANUAL

CUSTOM

Future

Robot

Packaging

Inspection

AI Validation

---

# Execution Attempt

Each retry creates

ExecutionAttempt

Fields

Attempt No

Started

Finished

Operator

Reason

Result

Error Code

Error Message

Retry Strategy

Duration

Station

Gateway

CorrelationID

---

# Dispatch Record

Every dispatch generates

DispatchRecord

Fields

Gateway

Station

Sent Time

Received Time

Dispatch Status

Acknowledged

Timeout

Payload

Retry Count

Latency

---

# Assignment Snapshot

Workers may change.

Assignment history must never change.

Store snapshot.

Fields

Worker ID

Worker Name

Shift

Skill Level

Department

Assigned Time

Assignment Revision

---

# Timeline

Every important event becomes timeline entry.

Examples

Created

Assigned

Queued

Dispatched

Accepted

Executing

Printer Started

Printer Finished

Laser Started

Laser Failed

Retry Requested

Retry Started

Vision Failed

PLC Reject

Completed

Finished

Timeline is append-only.

Never update history.

---

# Database Design

The Work Order module owns its own database.

No cross-database foreign keys are allowed.

All relationships with other modules must use logical UUID references.

The database follows the Database-per-Service principle.

---

## Tables

The Work Order module consists of the following tables.

work_orders

work_order_steps

work_order_attempts

work_order_dispatches

work_order_assignments

work_order_events

work_order_manual_actions

work_order_state_history

work_order_outbox_events

---

# work_orders

Aggregate Root.

Stores the current execution state.

Columns

ID

WorkOrderNo

ProductionOrderID

WorkflowID

WorkflowVersion

Priority

Quantity

CurrentState

CurrentStep

CurrentAttempt

StationID

GatewayID

DispatchMode

CorrelationID

TraceID

CreatedAt

UpdatedAt

StartedAt

FinishedAt

CreatedBy

UpdatedBy

---

Indexes

WorkOrderNo

CurrentState

ProductionOrderID

StationID

CreatedAt

CorrelationID

---

# work_order_steps

Represents every execution step.

Example

PRINT

↓

LASER

↓

VISION

↓

PLC

Columns

ID

WorkOrderID

Sequence

StepType

DeviceType

DeviceCode

Status

StartedAt

CompletedAt

Duration

RetryCount

ErrorCode

ErrorMessage

Payload

CreatedAt

UpdatedAt

---

Indexes

WorkOrderID

Status

Sequence

---

# work_order_attempts

Every retry creates one record.

History is immutable.

Columns

ID

WorkOrderID

AttemptNo

TriggerType

Automatic

Manual

Scheduled

OperatorID

Reason

StartedAt

CompletedAt

Status

CorrelationID

TraceID

---

Indexes

WorkOrderID

AttemptNo

Status

---

# work_order_dispatches

Stores gateway dispatch records.

Columns

ID

WorkOrderID

AttemptID

GatewayID

StationID

RoutingKey

Exchange

DispatchStatus

Payload

SentAt

AcknowledgedAt

CompletedAt

RetryCount

LatencyMs

CreatedAt

---

DispatchStatus

Pending

Published

Acknowledged

Timeout

Rejected

Completed

Failed

---

# work_order_assignments

Assignment snapshot.

Never update.

Always insert.

Columns

ID

WorkOrderID

WorkerID

WorkerName

Department

Workshop

Shift

Skill

AssignedBy

AssignedAt

Revision

---

Revision increases whenever assignment changes.

Old records remain.

---

# work_order_events

Timeline.

Append only.

Columns

ID

WorkOrderID

AttemptID

EventType

Source

Message

Payload

OccurredAt

CorrelationID

TraceID

---

Examples

WORKORDER_CREATED

DISPATCH_STARTED

PRINT_STARTED

LASER_STARTED

VISION_FAILED

PLC_REJECTED

MANUAL_OVERRIDE

COMPLETED

---

# work_order_manual_actions

Stores operator interventions.

Columns

ID

WorkOrderID

AttemptID

OperatorID

OperatorName

Action

Reason

Comment

CreatedAt

CorrelationID

TraceID

---

Action

Retry

Reprint

Remark

PrintAndRemark

Cancel

Resume

Pause

---

# work_order_state_history

Stores every state transition.

Columns

ID

WorkOrderID

OldState

NewState

Reason

TriggeredBy

CreatedAt

---

Never update.

Append only.

---

# work_order_outbox_events

Implements Outbox Pattern.

Columns

ID

AggregateID

AggregateType

EventType

Payload

Status

RetryCount

CreatedAt

PublishedAt

LastError

---

Status

Pending

Publishing

Published

Failed

DeadLetter

---

# CQRS Design

The module strictly follows CQRS.

Commands

↓

Write Model

↓

Outbox

↓

RabbitMQ

↓

Projection

↓

Realtime Dashboard

Queries never read aggregate directly.

They always read Projection Database.

---

# Commands

CreateWorkOrderCommand

GenerateWorkOrdersCommand

AssignWorkersCommand

QueueWorkOrderCommand

DispatchWorkOrderCommand

AcceptWorkOrderCommand

StartExecutionCommand

CompleteExecutionCommand

FailExecutionCommand

RetryExecutionCommand

ManualOverrideCommand

CancelWorkOrderCommand

PauseWorkOrderCommand

ResumeWorkOrderCommand

FinishWorkOrderCommand

---

Each command

Validates

↓

Loads Aggregate

↓

Executes Business Rules

↓

Creates Domain Events

↓

Stores Aggregate

↓

Stores Outbox Event

↓

Commit

---

# Queries

GetWorkOrder

GetWorkOrders

GetTimeline

GetDispatchHistory

GetAttempts

GetAssignments

SearchWorkOrders

GetRealtimeStatus

GetDashboard

---

Queries must never modify state.

---

# REST APIs

POST

/api/work-orders

Create work order.

---

POST

/api/work-orders/generate

Generate work orders from Production Order.

---

GET

/api/work-orders

Search.

Supports

keyword

status

station

workflow

priority

date

---

GET

/api/work-orders/{id}

Details.

---

GET

/api/work-orders/{id}/timeline

Timeline.

---

GET

/api/work-orders/{id}/attempts

Retry history.

---

GET

/api/work-orders/{id}/dispatches

Dispatch history.

---

POST

/api/work-orders/{id}/dispatch

Dispatch to Gateway.

---

POST

/api/work-orders/{id}/retry

Retry.

---

POST

/api/work-orders/{id}/manual

Manual Override.

---

POST

/api/work-orders/{id}/cancel

Cancel.

---

POST

/api/work-orders/{id}/pause

Pause.

---

POST

/api/work-orders/{id}/resume

Resume.

---

GET

/api/work-orders/dashboard

Dashboard summary.

---

# RabbitMQ Integration

Exchange

mes.events

Routing Keys

workorder.created

workorder.generated

workorder.assigned

workorder.dispatched

workorder.accepted

workorder.executing

workorder.completed

workorder.failed

workorder.retry.requested

workorder.retry.started

workorder.finished

---

Consumers

Dispatch Engine

Projection

Notification

Audit

Analytics

---

# Event Envelope

Every event uses the standard envelope.

{
    eventId,
    correlationId,
    traceId,
    aggregateId,
    aggregateType,
    eventType,
    timestamp,
    payload
}

No custom formats allowed.

---

# Outbox Pattern

The transaction order is fixed.

Update Aggregate

↓

Insert Timeline

↓

Insert State History

↓

Insert Outbox Event

↓

Commit Transaction

↓

Background Worker

↓

RabbitMQ Publish

↓

Mark Published

This guarantees no lost events.

---

# Dispatch Engine Integration

Dispatch Engine subscribes

workorder.dispatched

Dispatch Engine

↓

Resolve Gateway

↓

Resolve Station

↓

Prepare MQTT Payload

↓

Publish

↓

Wait ACK

↓

Publish Result Event

Dispatch Engine never owns Work Order state.

Only Job Engine changes execution state.

---

# Gateway Integration

Gateway receives

MQTT payload.

Gateway validates

↓

Station exists

↓

Station online

↓

Forward

↓

Receive ACK

↓

Publish ACK Event

Gateway never contains business logic.

Only routing.

---

# Station Agent Integration

Station Agent receives

Job

↓

Create Job

↓

Print

↓

Laser

↓

Vision

↓

PLC

↓

Publish Events

Station Agent never knows Production Order.

Only Work Order ID.

Only Attempt ID.

Only Correlation ID.

---

# Device Simulator Integration

Development environment.

Station Agent communicates exactly as production.

Instead of

Physical Printer

↓

Device Simulator

Same contracts.

Same MQTT.

Same RabbitMQ.

Same payload.

Zero code changes between DEV and Production.

Only configuration changes.
