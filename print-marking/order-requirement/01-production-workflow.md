# Phase 01 - Production Workflow Module

Version: 1.0

Status: Ready for Implementation

---

# Objective

This document defines the complete implementation specification for the Production Workflow module of the MES Platform.

Production Workflow is responsible for describing **how a product should be manufactured**, independent from production orders or work orders.

A workflow acts as a reusable template containing ordered manufacturing operations.

Production Orders reference a Production Workflow.

Work Orders are generated based on Production Orders and execute the selected workflow.

This module is purely configuration and planning.

It never communicates directly with Station Agent or industrial devices.

---

# Business Context

Current system architecture consists of three independent systems.

MES Platform (Go)

↓

Gateway Orchestrator (Device Simulator)

↓

Station Agent (.NET)

↓

Industrial Devices

Production Workflow belongs entirely inside MES.

Its responsibility ends after Work Orders are generated.

Execution will be implemented in later phases.

---

# Goals

Implement an enterprise-grade Production Workflow module capable of:

- Creating workflow templates
- Versioning workflows
- Publishing workflows
- Archiving workflows
- Managing ordered manufacturing operations
- Defining operation requirements
- Supporting multiple station types
- Supporting future workflow evolution
- Remaining immutable once published

---

# Out of Scope

The following are NOT implemented in this phase.

Dispatch Engine

Worker Assignment

Station Execution

Realtime Device Status

Gateway Communication

Station Agent Integration

Execution Monitoring

Manual Reprint

Manual Remark

These will be implemented in later phases.

---

# Business Concepts

## Production Workflow

A Production Workflow describes the manufacturing process of one product family.

Example

Coffee Package

↓

Print Label

↓

Laser Mark

↓

Vision Inspection

↓

PLC Reject

Another workflow

Bottle

↓

Print Label

↓

Vision

Another workflow

Metal Plate

↓

Laser

↓

Vision

Each workflow is reusable.

Multiple Production Orders may reference the same workflow.

---

## Workflow Version

Workflow definitions are immutable.

Whenever users modify a published workflow:

DO NOT UPDATE

Instead:

Create new Version

Example

Workflow

Packaging A

Version 1

↓

Published

↓

Production Orders created

↓

Need change

↓

Create Version 2

↓

Production Orders after today

↓

Use Version 2

Old Production Orders continue using Version 1.

This guarantees manufacturing traceability.

---

## Workflow Status

Workflow lifecycle

Draft

↓

Ready

↓

Published

↓

Archived

Rules

Draft

Editable

Ready

Validation completed

Published

Read-only

Archived

Cannot create new Production Orders

Existing Production Orders continue working.

---

# Core Domain Model

Production Workflow

contains

Workflow Operations

Workflow Operation

references

Station Type

Required Skills

Estimated Duration

Validation Rules

Execution Sequence

---

# Domain Entities

## ProductionWorkflow

Aggregate Root

Fields

ID

Workflow Code

Workflow Name

Description

Product Family

Version

Status

Published At

Archived At

Created By

Updated By

Created At

Updated At

Revision

---

Behavior

Create()

Rename()

Publish()

Archive()

Clone()

CreateNextVersion()

Validate()

AddOperation()

RemoveOperation()

MoveOperation()

---

Business Rules

Workflow Code must be unique.

Workflow Name required.

Workflow Version starts at 1.

Only Draft workflows are editable.

Published workflows cannot change.

Archive only allowed if no Draft version exists.

Only one Published version per Workflow Code.

---

## WorkflowOperation

Entity

Fields

ID

Workflow ID

Sequence

Operation Type

Station Type

Estimated Duration

Retry Limit

Is Required

Description

Metadata

---

Behavior

Move()

Validate()

UpdateMetadata()

---

Business Rules

Sequence must be unique.

Sequence must start at 10.

Increment by 10.

Example

10

20

30

40

Allows inserting future operations.

---

# Supported Operation Types

Initial implementation

PRINT

MARK

PRINT_AND_MARK

VISION_VERIFY

PLC_REJECT

WAIT

MANUAL_APPROVAL

Future

PACKAGING

WEIGHING

QUALITY_CHECK

ROBOT_PICK

CUSTOM

Operation type must be extensible.

Never use switch statements.

Implement Strategy Pattern.

---

# Station Types

Workflow references station types instead of physical stations.

Supported

PRINT_STATION

LASER_STATION

COMBINED_STATION

VISION_STATION

PLC_STATION

Future

ROBOT

CONVEYOR

AGV

---

# Required Skills

Operations may require skills.

Example

Laser Operation

Requires

Laser Operator

Level 3

Example

Vision

Requires

QC Operator

Level 2

Skill validation occurs later during Assignment Engine.

Workflow only stores requirements.

---

# Validation Rules

Workflow validation executes before publishing.

Validation checks

Workflow Name exists

Workflow Code exists

At least one Operation

No duplicated Sequence

Operation Type valid

Station Type valid

Duration > 0

Retry >= 0

No circular dependency

Maximum operation count configurable

No duplicated operation sequence

Validation returns all errors.

Never stop on first error.

---

# Versioning Rules

Published workflows are immutable.

Update flow

Draft

↓

Ready

↓

Publish

↓

Need change

↓

Clone

↓

Version +1

↓

Draft

↓

Modify

↓

Publish

History remains preserved forever.

---

# Database Design

Table

production_workflows

Columns

id

workflow_code

workflow_name

description

product_family

version

status

published_at

archived_at

revision

created_by

updated_by

created_at

updated_at

Indexes

workflow_code

status

product_family

Unique

workflow_code

version

---

Table

workflow_operations

Columns

id

workflow_id

sequence

operation_type

station_type

estimated_duration

retry_limit

is_required

metadata

created_at

updated_at

Indexes

workflow_id

sequence

Unique

workflow_id + sequence

---

# REST API Specification

All APIs follow REST conventions.

Base URL

/api/v1/workflows

---

## Create Workflow

POST /api/v1/workflows

Request

{
  "workflowCode": "WF-COFFEE-001",
  "workflowName": "Coffee Package Workflow",
  "description": "Standard production workflow",
  "productFamily": "Coffee"
}

Response

201 Created

Returns Workflow DTO

---

## Update Draft Workflow

PUT /api/v1/workflows/{id}

Only Draft workflows can be updated.

Published workflows return

409 Conflict

---

## Clone Workflow

POST /api/v1/workflows/{id}/clone

Creates

Version +1

Status = Draft

Returns newly created workflow.

---

## Publish Workflow

POST /api/v1/workflows/{id}/publish

Business validation

Workflow Status == Ready

Workflow passes validation

No existing Published version

If validation fails

400 Bad Request

Returns validation errors.

---

## Archive Workflow

POST /api/v1/workflows/{id}/archive

Business Rules

Cannot archive Draft

Cannot archive Ready

Only Published

Archive never deletes data.

---

## Get Workflow

GET /api/v1/workflows/{id}

Returns

Workflow

Operations

Version

Status

Metadata

Audit Summary

---

## Search Workflow

GET /api/v1/workflows

Supports

keyword

status

productFamily

version

createdBy

page

pageSize

sort

---

## Add Operation

POST

/api/v1/workflows/{id}/operations

Request

{
  "sequence":30,
  "operationType":"MARK",
  "stationType":"LASER_STATION",
  "estimatedDuration":8,
  "retryLimit":2,
  "isRequired":true
}

---

## Update Operation

PUT

/api/v1/workflows/{workflowId}/operations/{operationId}

---

## Delete Operation

DELETE

/api/v1/workflows/{workflowId}/operations/{operationId}

Only Draft

---

## Move Operation

POST

/api/v1/workflows/{workflowId}/operations/{operationId}/move

Request

{

    "newSequence":40

}

Backend automatically reorders sequences.

---

# CQRS Design

Commands

CreateWorkflow

UpdateWorkflow

PublishWorkflow

ArchiveWorkflow

CloneWorkflow

AddOperation

RemoveOperation

MoveOperation

UpdateOperation

ValidateWorkflow

Queries

GetWorkflow

GetWorkflowVersion

SearchWorkflow

ListPublishedWorkflows

ListWorkflowHistory

ListWorkflowOperations

---

# Domain Events

WorkflowCreated

WorkflowUpdated

WorkflowPublished

WorkflowArchived

WorkflowVersionCreated

WorkflowValidated

OperationAdded

OperationRemoved

OperationMoved

OperationUpdated

Each event contains

EventId

AggregateId

WorkflowCode

Version

CorrelationId

TraceId

Timestamp

UserId

---

# RabbitMQ Events

Exchange

mes.events

Routing Keys

workflow.created

workflow.updated

workflow.published

workflow.archived

workflow.operation-added

workflow.operation-updated

workflow.operation-removed

workflow.version-created

All events use JSON.

Example

{
  "eventId":"",
  "aggregateId":"",
  "workflowCode":"WF-COFFEE-001",
  "version":2,
  "occurredAt":"..."
}

---

# Outbox Pattern

Workflow updates must use Transactional Outbox.

Transaction

Update Database

↓

Insert Outbox Event

↓

Commit

↓

Background Publisher

↓

RabbitMQ

Never publish directly from HTTP handlers.

---

# Repository Interfaces

WorkflowRepository

Create()

Update()

FindById()

FindByCode()

FindPublished()

Search()

WorkflowOperationRepository

Add()

Update()

Delete()

ListByWorkflow()

ExistsSequence()

Repositories never contain business logic.

---

# Application Services

WorkflowApplicationService

Coordinates

Validation

Transaction

Domain

Events

DTO Mapping

No business rules.

Business logic belongs to Domain.

---

# RBAC

Permissions

workflow.view

workflow.create

workflow.update

workflow.publish

workflow.archive

workflow.clone

workflow.delete

operation.create

operation.update

operation.delete

operation.move

Recommended Roles

MES Administrator

Full Access

Production Engineer

Create

Update

Publish

Supervisor

View

Clone

Operator

View Only

---

# Audit Logging

Every action must generate audit records.

Capture

User

Action

Workflow

Old Values

New Values

IP

Correlation ID

Trace ID

Timestamp

Reason

Example

Workflow Published

User

admin

Old Status

READY

New Status

PUBLISHED

---

# Validation Rules

Workflow Code

Uppercase

Unique

Regex

^[A-Z0-9-_]+$

Workflow Name

Required

Max 200 chars

Description

Optional

1000 chars

Estimated Duration

>0

Retry Limit

0~10

Operation Sequence

Positive

Unique

Station Type

Enum

Operation Type

Enum

---

# Frontend Requirements

Framework

React

TypeScript

Vite

TailwindCSS

shadcn/ui

TanStack Query

React Hook Form

Zod

React DnD

---

# Workflow List Page

Table Columns

Workflow Code

Workflow Name

Version

Status

Product Family

Operations

Created Date

Published Date

Actions

Toolbar

Search

Status Filter

Product Filter

Create Button

Export

Import

Pagination

---

# Workflow Detail Page

Sections

Basic Information

Operations

Validation

History

Versions

Audit

Action Buttons

Save

Validate

Publish

Clone

Archive

---

# Workflow Operation Editor

Supports

Drag & Drop

Sequence Editing

Retry Limit

Duration

Station

Operation Type

Metadata JSON

Future

Condition

Branch

Loop

Optional Step

---

# UX Requirements

Never lose unsaved changes.

Warn before leaving page.

Confirm destructive actions.

Show loading indicators.

Show validation summary.

Support keyboard shortcuts.

---

# Seed Data

Generate

3 Product Families

Coffee

Bottle

Medicine

Each

2 Workflow Versions

Each

5 Operations

Include

Print

Laser

Vision

PLC

---

# Unit Tests

Workflow Aggregate

Workflow Validation

Version Creation

Operation Ordering

Publish Rules

Archive Rules

Clone Rules

Validation Rules

Minimum Coverage

90%

---

# Integration Tests

Workflow CRUD

Operation CRUD

Publish

Clone

Archive

Outbox

RabbitMQ

Audit

Search

Pagination

---

# Happy Path

Create Workflow

↓

Add Operations

↓

Validate

↓

Publish

↓

Production Order references Workflow

---

# Edge Cases

Duplicate Workflow Code

Duplicate Sequence

Invalid Station Type

No Operations

Multiple Published Versions

Archive Draft

Modify Published Workflow

Delete Published Workflow

Invalid Retry

---

# Failure Scenarios

Database Timeout

RabbitMQ Down

Duplicate Publish Request

Concurrent Update

Network Failure

Transaction Rollback

Outbox Retry

Dead Letter Queue

---

# Mermaid State Diagram

stateDiagram-v2

[*] --> Draft

Draft --> Ready

Ready --> Published

Published --> Archived

Published --> Draft : Clone New Version

Archived --> [*]

---

# Mermaid Sequence Diagram

User

->

Workflow API

Create Workflow

↓

Workflow Aggregate

↓

Repository

↓

Database

↓

Outbox

↓

RabbitMQ

↓

Audit Log

↓

Response

---

# Acceptance Criteria

✓ Workflow CRUD completed

✓ Versioning works

✓ Publish immutable

✓ Archive supported

✓ Validation complete

✓ Audit generated

✓ RabbitMQ events published

✓ Outbox implemented

✓ UI completed

✓ Tests pass

Coverage

>=90%

---

# Deliverables

Backend

REST API

Database Migration

Repositories

Domain

CQRS

RabbitMQ

Outbox

Audit

Frontend

Workflow Pages

Operation Editor

Validation UI

History

Version Management

Tests

Unit Tests

Integration Tests

Seed Data

Documentation

README

Architecture

API

Events

Database

Mermaid Diagrams

---

# Definition of Done

The Production Workflow module is considered complete only when:

- All REST APIs pass integration tests.
- Workflow versioning preserves immutable history.
- Published workflows cannot be modified.
- Operations can be reordered safely.
- Validation prevents invalid workflows.
- Outbox publishes events successfully.
- Audit records are generated for every mutation.
- React UI supports full CRUD, versioning, and publishing.
- Test coverage is at least 90%.
- Documentation is updated.