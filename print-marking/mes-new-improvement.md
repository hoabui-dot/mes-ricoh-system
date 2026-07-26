
---

# Enterprise Implementation Prompt (MES Enhancement)

````md
# Enterprise MES Enhancement Phase

Analyze the complete MES codebase, AI documentation, Product Documentation, Station Agent architecture, Device Simulator, and Factory integration before implementing any new features.

The current MES implementation provides a solid planning foundation but still lacks many execution-oriented capabilities expected from an enterprise Manufacturing Execution System compliant with ISA-95 Level 3.

The objective of this phase is to evolve the MES into a complete production execution platform while preserving backward compatibility.

## Core Objectives

The implementation must introduce the following enterprise modules.

---

## 1. Production Scheduling Engine

Implement a finite-capacity scheduling engine capable of automatically scheduling Work Orders according to:

- Production Order priority
- Due date
- Shift calendar
- Machine availability
- Station capacity
- Worker availability
- Worker skill matrix
- Maintenance windows
- Factory holidays

Provide visual scheduling APIs and timeline views.

---

## 2. Manufacturing Workflow Engine

Extend Workflow Templates into hierarchical execution definitions.

Workflow

→ Operations

→ Steps

→ Device Actions

→ Validation Rules

→ Transition Rules

Each workflow must support conditional branching, retry policies, optional steps, parallel execution where applicable, and version control.

Workflow definitions must be stored in the database and managed from the MES UI.

---

## 3. Shop Floor Execution

Implement a complete execution lifecycle.

Work Orders must support:

- Draft
- Approved
- Released
- Dispatched
- Running
- Paused
- On Hold
- Cancelled
- Completed
- Failed

Operators must be able to:

- Start execution
- Pause
- Resume
- Hold
- Cancel
- Complete
- Record production loss
- Record reject quantity

All actions must generate immutable audit events.

---

## 4. Station & Equipment Assignment

Create hierarchical production resources.

Factory

→ Area

→ Line

→ Station

→ Machine

Every Work Order must be assigned to physical equipment before dispatching to Station Agent.

Support reassignment before execution starts.

---

## 5. Material Consumption

Introduce material tracking.

Support:

- Material Master
- Material Lots
- Batch Numbers
- Warehouse References
- Material Reservation
- Material Consumption
- Remaining Inventory
- Scrap Material

Material consumption must be linked to Production Orders.

---

## 6. Tooling Management

Manage production molds and tools.

Track:

- Running Hours
- Cycle Count
- Maintenance Schedule
- Remaining Lifetime
- Calibration
- Tool Status

Prevent production if required tooling is unavailable.

---

## 7. Quality Management

Implement a complete quality subsystem.

Support:

- Inspection Plans
- Sampling Rules
- Inspection Records
- Defect Codes
- NCR
- CAPA
- Disposition
- Quality Approval

Integrate Vision inspection results from Station Agent.

---

## 8. Product Traceability

Create complete end-to-end genealogy.

Every finished product must reference:

Production Order

Work Order

Material Lot

Operator

Shift

Station

Machine

Workflow

Inspection

Package

Shipment

Support genealogy queries from finished product backward to raw material.

---

## 9. Equipment Monitoring

Maintain live equipment status.

Support:

- Online
- Offline
- Idle
- Running
- Setup
- Maintenance
- Breakdown
- Waiting Material
- Waiting Operator

Receive real-time updates from Station Agent.

---

## 10. OEE Dashboard

Implement Overall Equipment Effectiveness.

Availability

Performance

Quality

Calculate OEE per:

Factory

Area

Line

Station

Machine

Shift

Day

Month

Provide historical trends.

---

## 11. Downtime Management

Track downtime events.

Support:

- Planned Downtime
- Unplanned Downtime
- Breakdown
- Maintenance
- Material Shortage
- Operator Absence
- Power Failure

Store root causes and corrective actions.

---

## 12. SPC

Implement Statistical Process Control.

Track production measurements.

Generate:

Control Charts

Trend Charts

Warnings

Process Capability

Cp

Cpk

Out-of-control alerts.

---

## 13. KPI Dashboard

Provide executive dashboards including:

Production Output

Yield

Scrap

OEE

Downtime

Machine Utilization

Worker Productivity

Order Completion

Queue Length

Shift Performance

---

## 14. Approval Workflow

Support configurable approval pipelines.

Create

Review

Approve

Release

Execute

Close

All approvals require audit logging.

---

## 15. AI-ready Architecture

Design the platform for future AI integration.

Prepare data models for:

Production recommendations

Automatic scheduling

Worker assignment optimization

Failure prediction

Predictive maintenance

Quality prediction

Do not implement AI yet.

Only prepare extensible architecture.

---

## 16. Data Platform Integration

Publish domain events for future analytics.

RabbitMQ

CDC

Kafka

Data Lake

ClickHouse

Superset

Power BI

No business logic should directly depend on analytical storage.

---

## General Requirements

Follow:

- Modular Monolith Architecture
- Domain-Driven Design (DDD)
- CQRS
- Repository Pattern
- Outbox Pattern
- Event-Driven Architecture
- Immutable Audit History
- Optimistic Concurrency Control

Every module must include:

- AI_DOCUMENT.md
- PRODUCT_DOCUMENT.md
- README.md
- Database migration
- REST APIs1
- RBAC permissions
- Unit tests
- Integration tests
- Seed data
- OpenAPI documentation

The implementation must remain fully compatible with the existing Station Agent and Device Simulator architecture while preparing the MES for future enterprise-scale deployment.