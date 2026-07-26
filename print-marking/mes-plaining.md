# MES Phase 3 - Shift Planning & Workforce Scheduling Implementation Prompt

## Objective

Implement the complete **Shift Planning & Workforce Scheduling** module for the MES Platform.

This module is responsible for planning factory shifts, assigning workers into teams, scheduling monthly work calendars, and supporting automatic workforce allocation for Production Orders.

The implementation must cover:

- Backend APIs
- Database
- Business Rules
- RBAC
- Frontend
- Seed Data
- Documentation
- Unit Tests
- Integration Tests

The implementation must follow the existing architecture and coding standards.

---

# Existing System

The MES backend already contains:

- Identity Module
- RBAC (Casbin)
- Workforce Module
- Departments
- Workshops
- Teams
- Workers
- Skills
- Production Orders
- Assignment Engine
- Audit Log
- Outbox Pattern
- RabbitMQ
- Projection
- Notification
- PostgreSQL
- Redis
- Go Modular Monolith

The frontend already contains

- React
- TypeScript
- TailwindCSS
- shadcn/ui
- TanStack Query
- React Hook Form
- Zod

Do not redesign the architecture.

Only extend it.

---

# Business Goal

Factory managers must be able to

- Configure factory shifts
- Configure monthly schedules
- Assign workers
- Assign teams
- View workload
- Resolve scheduling conflicts
- Prepare workforce before production starts

Everything should happen before Production Orders are released.

---

# Functional Requirements

The module consists of six major parts.

```
Shift Templates

↓

Factory Calendar

↓

Monthly Schedule

↓

Team Assignment

↓

Worker Assignment

↓

Workforce Availability
```

---

# Module 1

Shift Templates

Create reusable shift definitions.

Examples

Morning Shift

Afternoon Shift

Night Shift

Overtime Shift

Fields

```
ID

Code

Name

Description

Start Time

End Time

Break Start

Break End

Working Hours

Cross Day

Color

Status
```

Example

Morning

```
07:00

15:00
```

Night

```
22:00

06:00

CrossDay=true
```

Validation

- End Time required
- Start < End unless CrossDay
- Working Hours auto calculated
- No duplicate code

---

# CRUD APIs

```
GET

POST

PUT

DELETE

/api/v1/shifts
```

---

# Module 2

Factory Calendar

Generate shift instances for a month.

Manager selects

```
Year

Month
```

System generates

```
July 1

Morning

Afternoon

Night

↓

July 2

Morning

Afternoon

Night
```

No manual creation.

Generate automatically.

Support regeneration.

Never duplicate existing shifts.

---

API

```
POST

/calendar/generate
```

Body

```
Year

Month
```

---

# Module 3

Monthly Workforce Planning

Main planning screen.

Manager chooses

```
Workshop

↓

Team

↓

Month
```

System displays calendar.

Example

```
July

Mon Tue Wed Thu Fri ...

Worker A

Morning

Morning

OFF

Night

...

Worker B

OFF

Morning

Morning

...
```

Support

- Drag & Drop
- Multi Select
- Copy Schedule
- Paste Schedule
- Weekly Copy
- Monthly Copy

---

# Module 4

Assign Teams

Manager can assign

Entire Team

↓

Shift

instead of assigning every worker.

Example

```
Team A

↓

Morning Shift

↓

July

1-15
```

System expands automatically.

---

Rules

Workers inherit team schedule.

Worker schedule may override team schedule.

Priority

Worker Override

↓

Team Assignment

---

# Module 5

Assign Individual Workers

Assign

Worker

↓

Shift

↓

Specific Date

Support

- Multi-select
- Bulk assignment
- Drag assignment
- Replace assignment
- Remove assignment

---

Validation

Worker cannot have

Morning

+

Night

same day.

Worker cannot exceed

Maximum working hours.

Worker on leave

cannot assign.

Worker suspended

cannot assign.

---

# Module 6

Leave Integration

Existing Leave module.

When worker

On Leave

Automatically

Disable assignment.

Display

Gray color.

Cannot save.

---

# Availability Engine

Calculate worker availability.

Available

Busy

Leave

Suspended

Overtime

Unavailable

Expose API

```
GET

/workers/availability
```

Assignment Engine will consume this later.

---

# Calendar View

Frontend

Desktop optimized.

Month View.

Rows

Workers

Columns

Days

Cell

```
Shift Badge
```

Example

```
M

Morning

A

Afternoon

N

Night

OFF
```

---

Color

Morning

Orange

Afternoon

Blue

Night

Purple

Leave

Gray

Holiday

Green

Overtime

Red

---

# Planning Features

Implement

Drag Drop

Resize

Copy

Paste

Undo

Redo

Bulk Assignment

Multi Select

Keyboard Shortcut

Search Worker

Filter Team

Filter Workshop

Filter Skill

Filter Status

---

# Team Schedule

Separate page

Display

```
Team

↓

Current Shift

↓

Members

↓

Coverage
```

Coverage

Shows

Required

vs

Assigned

workers.

---

# Dashboard

Create

Planning Dashboard

Widgets

Total Workers

Available

Leave

Busy

Unassigned

Overtime

Shift Coverage %

Heatmap

Daily Staffing

Skill Coverage

---

# RBAC

Permissions

```
shift.read

shift.create

shift.update

shift.delete

calendar.generate

calendar.update

schedule.read

schedule.assign

schedule.bulk

team.assign

worker.assign

planning.dashboard
```

Integrate with existing Casbin.

---

# Notifications

Publish events

```
ShiftGenerated

WorkerAssigned

WorkerRemoved

TeamAssigned

ScheduleUpdated
```

Notification module consumes later.

---

# Audit Logging

Every scheduling action

must create audit records.

Record

User

Before

After

Timestamp

TraceId

IP

---

# Projection

Update

Projection module.

Generate

Read Models

```
Daily Workforce

Monthly Coverage

Worker Schedule

Team Coverage

Shift Statistics
```

---

# Backend Structure

```
planning/

    shift/

    calendar/

    assignment/

    scheduling/

    projection/

    service/

    repository/

    api/
```

Follow existing architecture.

---

# Frontend Pages

Implement

## Shift Management

CRUD

Search

Filter

Pagination

Create Dialog

Edit Dialog

Delete Confirmation

---

## Monthly Planning

Large Calendar

Workers

Shift Badges

Drag Drop

Bulk Actions

Assignment Panel

Conflict Highlight

---

## Team Assignment

Assign Team

Coverage

Current Members

Planning Status

---

## Workforce Availability

Table

Current Status

Skill

Today's Shift

Leave

Hours

Search

Filter

---

## Planning Dashboard

Charts

Statistics

Coverage

Heatmap

Real-time refresh

---

# Seed Data

After implementation, create a complete seed dataset.

Use the existing Worker data.

Automatically generate:

## Shift Templates

- Morning (07:00–15:00)
- Afternoon (15:00–23:00)
- Night (23:00–07:00, Cross Day)
- Overtime (08:00–12:00)

---

## Monthly Calendar

Generate the current month automatically.

---

## Team Assignments

Distribute existing workers into teams based on their current Team records.

If a worker already belongs to a Team, preserve that relationship.

---

## Shift Assignments

Automatically create realistic schedules.

Rules:

- 5 working days + 1 day off (or configurable factory pattern).
- Rotate Morning → Afternoon → Night every week.
- Respect worker availability.
- Skip workers marked as On Leave or Suspended.
- Ensure balanced staffing across teams.

---

## Leave Data

Generate sample leave requests for a small subset of workers to simulate real scheduling conflicts.

---

## Dashboard Data

Populate projections so the Planning Dashboard shows meaningful KPIs immediately after startup.

---

# Testing

Implement

Unit Tests

Integration Tests

Business Rule Tests

Calendar Tests

Assignment Tests

Conflict Detection Tests

Availability Tests

Seed Tests

Target

>90% coverage

---

# Documentation

After implementation, update:

- docs/SHIFT_PLANNING.md
- docs/CALENDAR.md
- docs/SCHEDULING.md
- docs/RBAC.md
- docs/API_REFERENCE.md
- README.md

Documentation must include:

- Architecture
- Database schema
- Scheduling workflow
- Team vs Worker assignment precedence
- Availability calculation
- Conflict detection rules
- Calendar generation algorithm
- API reference
- Frontend page guide
- Seed data strategy
- Testing strategy

---

# Acceptance Criteria

The implementation is complete only when:

- All CRUD operations work correctly.
- Monthly calendars can be generated and regenerated safely.
- Team and worker scheduling support drag-and-drop, bulk operations, and conflict detection.
- Leave and worker status are enforced during assignment.
- Availability APIs are ready for the Assignment Engine.
- RBAC protects every endpoint.
- Audit logs are recorded for every scheduling action.
- Projection dashboards update correctly.
- Seed data creates a fully usable demo environment from existing workers.
- Documentation and automated tests are complete.