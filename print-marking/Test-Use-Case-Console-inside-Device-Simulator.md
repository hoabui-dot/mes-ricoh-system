# Feature Request: Build Enterprise Test Use Case Console inside Device Simulator

You are a Senior QA Automation Architect, MES Solution Architect, and Full Stack Engineer.

Your task is to analyze the existing codebase and extend the Device Simulator application with a new module called:

## Test Use Case Console

The goal is to provide a centralized testing dashboard capable of executing complete business scenarios of the manufacturing system without requiring manual operation from Kiosk UI.

The Device Simulator should evolve from a simple simulator into a complete Integration Testing Platform.

---

# Business Goal

Before every release, QA, Developers, Product Owners, and Directors should be able to validate:

* Core business flows
* Device integration flows
* Permission flows
* SignalR synchronization
* Projection updates
* Device heartbeat monitoring
* Rework / Retry operations
* Error handling scenarios

using a single testing console.

The objective is:

* One-click execution
* Full visibility
* Repeatable tests
* Automatic verification
* Release confidence

---

# New Navigation Tab

Add a new tab:

```text
Virtual Devices
Factory Gateway
Production History
Environment Config
Test Console
```

Place Test Console beside existing simulator tabs.

---

# Test Console Architecture

The Test Console should communicate directly with:

```text
Kiosk API
MES API
Projection API
Identity API
Device Simulator API
Factory Gateway API
SignalR Hub
```

The console should orchestrate complete business scenarios.

---

# Test Suite Categories

Group test cases by business domain.

## Authentication

* Login Success
* Login Failed
* Operator Login
* Admin Login
* Password Reset
* User Disabled

---

## Permission Control

* View History Permission
* Rework Permission
* Permission Denied
* Admin Access
* Operator Access

---

## Production Flow

* Print Product Success
* Laser Product Success
* Print + Mark Success
* Camera Verification Success
* Complete Job Success

---

## Rework Flow

* Reprint Product
* Re-Mark Product
* Retry Failed Job
* Verify New History Record Created
* Verify Original History Preserved
* Verify Audit Log Created

---

## Device Health

* Printer Offline
* Laser Offline
* Vision Offline
* Gateway Offline
* Heartbeat Timeout

---

## SignalR

* Realtime Device Status Update
* Realtime Production History Update
* Realtime Job Status Update
* Reconnect Scenario

---

## Failure Scenarios

* Printer Busy
* Laser Busy
* Device Timeout
* Gateway Disconnect
* Invalid Payload
* Duplicate Request

---

# Test Case Execution UI

Each test case should appear as a separate executable card.

Example:

```text
┌────────────────────────────────────┐
│ Print Product Success              │
│ Verify successful print workflow   │
│                                    │
│ [ Run Test ]                       │
└────────────────────────────────────┘
```

Status:

* Not Executed
* Running
* Passed
* Failed

Use clear visual indicators.

---

# Run All Tests

Provide:

```text
[ Run All ]
```

This should execute all test cases sequentially.

Display:

```text
Total Tests: 87
Passed: 85
Failed: 2
Running: 0
Success Rate: 97.7%
```

---

# Detailed Execution Log

Each test must generate a timeline.

Example:

```text
22:10:01
Create Failed Job

22:10:02
POST /api/jobs/retry

Payload:
{
  "jobId": "123"
}

22:10:03
Response 200 OK

22:10:03
SignalR Event Received

22:10:04
History Record Created

22:10:04
Audit Log Created

22:10:05
Test Passed
```

---

# Execution Trace View

Every step must capture:

* Timestamp
* Duration
* Request URL
* HTTP Method
* Request Payload
* Response Payload
* SignalR Events
* Database Verification Results

Example:

```text
Step 3

POST /api/rework

Duration:
312ms

Request:
{ ... }

Response:
{ ... }

Result:
PASS
```

---

# API Verification Layer

After each action, automatically verify:

## Database

* Job exists
* History exists
* Audit log exists

## Projection

* Projection updated

## SignalR

* Event published

## Device

* Device state updated

---

# Test Definition Engine

Do not hardcode test flows.

Create reusable JSON-based test definitions.

Example:

{
"name": "Rework Product Success",
"category": "Rework",
"steps": [
{
"action": "CreateFailedJob"
},
{
"action": "GrantPermission"
},
{
"action": "ExecuteRework"
},
{
"action": "VerifyHistory"
},
{
"action": "VerifyAudit"
}
]
}

New test cases should be configurable without modifying frontend code.

---

# Metrics Dashboard

Display:

* Total Test Cases
* Passed
* Failed
* Average Execution Time
* Longest Running Test
* SignalR Events Received
* API Calls Executed

---

# Export Capability

Allow exporting:

* JSON report
* Markdown report
* HTML report

Example:

```text
Test Run #2026-06-23

Passed:
85

Failed:
2

Success Rate:
97.7%
```

---

# Technical Requirements

Frontend:

* React
* TypeScript
* shadcn/ui
* TanStack Query

Backend:

* .NET
* Clean Architecture
* CQRS

Testing Layer:

* Test Orchestrator Service
* API Client Layer
* SignalR Monitoring Layer
* Execution Engine

---

# Deliverables

Analyze the existing Device Simulator codebase and implement:

1. Test Console UI.
2. Test Execution Engine.
3. API Integration Layer.
4. SignalR Event Monitor.
5. Timeline Log Viewer.
6. JSON Test Definition System.
7. Run-All Test Runner.
8. Report Exporting.
9. Execution Metrics Dashboard.
10. Architecture documentation.

The final implementation should make Device Simulator become the central validation platform for the entire MES/Kiosk ecosystem.
