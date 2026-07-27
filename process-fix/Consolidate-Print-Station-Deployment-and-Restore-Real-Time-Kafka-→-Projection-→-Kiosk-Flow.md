# Consolidate Print Station Deployment and Restore Real-Time Kafka → Projection → Kiosk Flow

## Background

The Print Station subsystem has evolved into an integral part of the MES architecture.

Current topology:

```text
MES
    │
    ▼
Kafka
    │
    ▼
Remote MacOS Printer Adapter
    │
    ▼
Projection Service
    │
 SignalR
    │
    ▼
Print Station Kiosk
```

However, several infrastructure and runtime issues remain:

1. Print Station Docker Compose files are still maintained separately from the MES deployment.
2. Print Station does not have a unified rebuild command like MES.
3. The Label Template page in the Print Station Kiosk currently returns HTTP 502.
4. The Dashboard page must be audited to determine whether it is actually real-time.
5. It must be verified that MES Kafka events reach the Print Station Projection Service.
6. It must be verified that Projection Service pushes updates to the Kiosk through SignalR.
7. The Kiosk dashboard must accurately reflect the latest MES execution state instead of stale cached data.

The objective is to make the Print Station behave like a first-class MES subsystem with a deterministic real-time execution flow.

---

# Objective

Perform a complete audit of the Print Station deployment, infrastructure, Kafka event pipeline, Projection Service, SignalR updates, and Kiosk UI.

Fix every issue necessary so that:

- deployment is unified;
- rebuild is simplified;
- Kafka events flow end-to-end;
- Projection receives every MES execution event;
- SignalR broadcasts changes immediately;
- Kiosk dashboard always reflects current MES execution state;
- Label Template page works correctly.

Do not implement partial fixes.

---

# Phase 1 — Consolidate Docker Compose

Audit the current deployment.

Review:

```text
infra/docker-compose.mes.yml
infra/docker-compose.platform.yml
print-marking docker-compose files
Printer Adapter deployment
Projection deployment
SignalR configuration
Kiosk deployment
shared Docker networks
```

Move all Print Station services into the shared MES deployment.

Target:

```text
infra/

docker-compose.platform.yml

docker-compose.mes.yml

docker-compose.print-station.yml
```

or merge into the existing compose strategy already used by MES if that is the established convention.

Requirements:

- one shared Docker network;
- one shared rebuild workflow;
- no duplicated Kafka configuration;
- no duplicated environment variables;
- no duplicated health-check definitions;
- consistent restart policies;
- deterministic startup ordering.

Do not duplicate services already provided by MES.

---

# Phase 2 — Unified Rebuild Commands

MES already exposes rebuild commands through package.json.

Implement equivalent commands for Print Station.

Example:

```bash
npm run rebuild:print-station

npm run restart:print-station

npm run verify:print-station

npm run logs:print-station
```

The rebuild command should:

1. build every Print Station image;
2. recreate the containers;
3. wait for health;
4. verify Projection;
5. verify SignalR;
6. verify Kafka;
7. print a concise summary.

The command should behave consistently with:

```bash
npm run rebuild:mes
```

---

# Phase 3 — Investigate Label Template HTTP 502

The Label Template page currently returns:

```text
502 Bad Gateway
```

Do not simply restart containers.

Trace the request.

Determine:

```text
Browser
↓

Kiosk

↓

API

↓

Projection

↓

Printer Adapter

↓

Database
```

Identify the real failure.

Possible causes include:

- reverse proxy;
- incorrect API URL;
- container DNS;
- authentication;
- missing route;
- timeout;
- Projection failure;
- Printer Adapter management API;
- incorrect environment variables;
- stale compose networking.

Provide the exact failing request.

Fix the root cause.

After the fix verify:

- page loads;
- templates list correctly;
- template preview works;
- template CRUD still works;
- print-test still works.

---

# Phase 4 — Audit Dashboard Real-Time Behaviour

The current Dashboard must be analysed completely.

Determine:

Does it currently obtain data via:

```text
HTTP polling

SignalR

cached state

Projection

Kafka

database queries
```

Map every widget.

For every card determine:

```text
source

update mechanism

expected refresh

actual refresh
```

Produce a dependency matrix.

---

# Phase 5 — Audit Kafka Event Pipeline

Verify the entire pipeline.

Current target architecture:

```text
MES Execution

↓

Kafka

↓

Projection Service

↓

Projection Database

↓

SignalR Hub

↓

Kiosk Dashboard
```

Audit every topic.

Examples:

```text
MES.Execution.*

station.events.*

station.commands.*

printer.*

operation.*

work-order.*
```

Determine:

- which events are published;
- which events Projection subscribes to;
- which events are ignored;
- which events should update Dashboard.

Verify:

consumer groups

offsets

lag

dead-letter

ordering

duplicate handling

idempotency

---

# Phase 6 — Projection Service Audit

Projection Service should become the authoritative read model.

Verify:

- subscriptions;
- consumers;
- database updates;
- SignalR broadcasts.

Determine whether Projection currently knows when:

```text
WO created

WO approved

WO started

operation dispatched

operation started

operation completed

print job created

printer started

printer completed

printer failed

WO completed
```

If not, implement the missing projections.

Do not let Kiosk call MES directly for execution state.

Projection should own the Dashboard read model.

---

# Phase 7 — SignalR Audit

Verify SignalR end-to-end.

Determine:

```text
Projection

↓

Hub

↓

Connection

↓

Subscription

↓

Dashboard
```

For every Dashboard component verify:

- subscribed event;
- handler;
- UI update.

Eliminate unnecessary polling.

SignalR should become the authoritative update mechanism.

Reconnect automatically.

Handle:

- disconnect;
- reconnect;
- duplicate events;
- out-of-order events.

---

# Phase 8 — Dashboard Data Model

Audit whether Dashboard still reflects the legacy Print Marking system.

It should instead reflect the current MES execution model.

Determine whether cards should display:

```text
Current Work Orders

Current Operations

Current Print Queue

Current Print Jobs

Printer Status

Print Station Status

Kafka Status

Projection Status

SignalR Status

Ready Printers

Failed Jobs

Running Jobs
```

Remove obsolete cards.

Update Dashboard terminology to match MES.

---

# Phase 9 — Verify MES → Print Station Integration

Run a controlled execution.

Create:

```text
Production Version

↓

Work Order

↓

Approve

↓

Start Execution

↓

Print Operation
```

Verify every stage.

Expected flow:

```text
MES

↓

Kafka command

↓

Projection receives event

↓

Dashboard updates

↓

Printer Adapter consumes command

↓

Physical printer

↓

Printer result

↓

Kafka result

↓

Projection updates

↓

SignalR

↓

Dashboard updates

↓

MES completes operation
```

No manual refresh should be required.

---

# Phase 10 — Dashboard Verification

Perform live verification.

Without refreshing the browser:

Verify Dashboard changes when:

- WO approved;
- WO started;
- operation dispatched;
- print queued;
- print started;
- print completed;
- printer offline;
- printer online;
- Kafka disconnected;
- Kafka reconnected.

Every transition should appear automatically.

---

# Phase 11 — Failure Diagnostics

If any stage fails, produce an explicit report.

Examples:

```text
Kafka publish failed

Projection consumer offline

SignalR disconnected

Hub not broadcasting

Dashboard not subscribed

Printer Adapter unreachable

API gateway routing issue

Reverse proxy issue

Wrong Docker network

Wrong container hostname

Wrong Tailscale address

Wrong Kafka bootstrap server

HTTP 502

Database unavailable
```

Never report only:

```text
Failed
```

Instead provide:

- exact stage;
- root cause;
- affected service;
- request;
- response;
- logs;
- recommendation.

---

# Phase 12 — Runtime Verification Script

Create:

```text
scripts/verify-print-station-realtime-flow.mjs
```

The script should automatically verify:

- Docker health;
- Kafka;
- Projection;
- SignalR;
- Kiosk;
- Printer Adapter;
- Dashboard;
- Label Template endpoint.

Then execute a controlled print request and verify:

```text
MES Event

↓

Kafka

↓

Projection

↓

SignalR

↓

Dashboard

↓

Printer Adapter

↓

Physical Printer

↓

Printer Result

↓

Projection

↓

Dashboard
```

Produce a timeline.

---

# Documentation

Update:

```text
AI_CONTEXT.md

Print Station README

Projection README

Kiosk README

Deployment README

Realtime architecture documentation

Docker deployment documentation
```

Replace obsolete deployment instructions.

Document the new unified rebuild workflow.

---

# Acceptance Criteria

The task is complete only when:

1. Print Station deployment is unified with MES.
2. Rebuild commands exist and work.
3. Label Template page no longer returns HTTP 502.
4. Projection consumes all required MES Kafka events.
5. Projection updates its read model correctly.
6. SignalR broadcasts every relevant change.
7. Dashboard updates in real time without refresh.
8. Printer events update Dashboard immediately.
9. Kafka connectivity is verified.
10. Remote Printer Adapter remains the authoritative edge runtime.
11. Verification script passes.
12. Documentation is updated.

---

# Required Final Report

Provide:

## Deployment

- Docker Compose consolidation
- rebuild commands
- package.json updates

## Label Template

- root cause
- fix
- verification

## Kafka

- topics
- consumers
- offsets
- event flow

## Projection

- subscriptions
- read model
- broadcasts

## SignalR

- hub
- events
- reconnect
- verification

## Dashboard

- old model
- new model
- real-time verification

## End-to-End Timeline

```text
MES
↓

Kafka

↓

Projection

↓

SignalR

↓

Dashboard

↓

Printer Adapter

↓

Printer

↓

Kafka Result

↓

Projection

↓

Dashboard

↓

MES
```

Include timestamps for every stage and identify any latency or missing event.