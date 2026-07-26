# Fast Refactor Proposal — Extract Printer Adapter as an Independent HTTP Service

## Background

The current Station Agent architecture places `printer-adapter` inside the local Station Agent Docker stack and communicates with it primarily through RabbitMQ and internal service discovery.

This works well when all services are deployed together on the same IPC.

However, our target architecture is different.

The Printer Adapter will become an independent remote service deployed on another server.

The Print Station (Station Agent) should communicate with it through HTTP instead of RabbitMQ.

The Printer Adapter will continue to communicate directly with physical printers through TCP/IP or CUPS exactly as today.

The purpose of this refactor is to make deployment simpler without redesigning the whole Station Agent.

This is intended to be a **fast, low-risk refactor**, not a complete architecture rewrite.

---

# First Task — Architecture Review

Before writing any code, review the current implementation and determine whether this refactor can be safely completed without breaking the existing production flow.

Review at minimum:

- Printer Adapter
- Job Engine
- Station Gateway
- Kiosk
- Device Simulator
- Projection Service
- RabbitMQ consumers/producers
- Printer health polling
- Printer registry
- Label template rendering
- Print history
- Print retry logic

Reason carefully.

Determine whether RabbitMQ is only being used as a transport layer or whether Printer Adapter currently depends on RabbitMQ semantics for business correctness.

Questions to answer internally:

- Can HTTP replace RabbitMQ for Printer Adapter communication only?
- Does this introduce race conditions?
- Does it break idempotency?
- Does it affect retry behaviour?
- Does it affect print ordering?
- Does it affect batching?
- Does it affect current Job Engine state transitions?
- Does it require changes to Projection Service?
- Does it require changes to Device Simulator?

If you conclude the refactor is fundamentally unsafe, **STOP immediately**.

Do not write code.

Instead provide a detailed architectural report explaining:

- why it is unsafe
- what hidden dependencies exist
- what minimal redesign is required first
- estimated effort
- recommended architecture

Do not continue.

---

# If the Review Concludes It Is Safe

Proceed immediately.

The goal is only to replace the transport between Print Station and Printer Adapter.

Business behaviour must remain identical.

---

# Target Architecture

Current

MES
→ Station Gateway
→ RabbitMQ
→ Printer Adapter
→ TCP/CUPS
→ Printers

Target

MES
→ Station Gateway
→ Job Engine
→ HTTP
→ Printer Adapter
→ TCP/CUPS
→ Printers

Printer Adapter becomes a standalone deployable service.

RabbitMQ must no longer be required for Printer Adapter.

---

# Printer Adapter HTTP API

Implement REST endpoints equivalent to current behaviour.

At minimum:

GET /api/health

Returns

- status
- version
- printer count
- uptime

---

GET /api/printers

Returns printer registry.

---

GET /api/printers/active

Returns currently available printers.

This endpoint should preserve current behaviour because Job Engine already relies on it.

---

POST /api/print

Equivalent to today's print command.

Request should contain everything currently required to execute a print job.

Keep existing rendering logic.

Keep existing printer driver logic.

Keep TCP/CUPS support unchanged.

---

GET /api/jobs/{id}

Returns current execution state.

---

GET /api/print-history

Expose current history if already implemented.

---

# Internal Behaviour

Do NOT rewrite:

- printer registry
- template rendering
- ZPL generation
- TCP driver
- CUPS driver
- printer health polling

Only replace the communication layer.

If local queueing already exists, keep it.

If not, implement only the minimum lightweight queue necessary.

Do not redesign Job Engine.

---

# Job Engine Changes

Replace RabbitMQ publishing to Printer Adapter with HTTP requests.

Keep the current scheduling logic.

Keep printer selection logic.

Keep batching logic.

Keep state machine.

Only replace the transport.

---

# Error Handling

Printer Adapter should return proper HTTP status codes.

Job Engine should convert them into the same business behaviour currently produced by RabbitMQ events.

Retry behaviour should remain equivalent where practical.

---

# Health Monitoring

Station Agent should perform HTTP polling.

Example:

GET /api/health

and

GET /api/printers/active

No RabbitMQ health dependency.

---

# Build Verification

After implementation:

- build every Station Agent service
- resolve compilation errors
- resolve dependency errors

Run every service except Printer Adapter.

Specifically:

- Station Gateway
- Job Engine
- Projection Service
- Kiosk
- Device Simulator
- Laser Adapter
- Vision Service
- PLC Adapter
- Redis
- RabbitMQ (if still required by remaining services)

Do NOT run Printer Adapter.

Verify startup logs.

Ensure no service continuously retries connecting to Printer Adapter.

Fix startup issues if required.

---

# Docker

Build a new Printer Adapter image.

Push only the Printer Adapter image.

Docker Hub namespace:

vanhoadotbui2628

Confirm successful push.

Report:

- image name
- image tag
- image digest

---

# Documentation

Create a markdown document.

Include:

## Printer Adapter Deployment

How to run Printer Adapter independently.

---

## Printer Adapter HTTP API

Document every endpoint.

Include example requests and responses.

---

## Station Agent Configuration

Explain how Station Agent connects to Printer Adapter.

Example:

Printer Adapter Base URL

http://100.68.50.41:5003

Health endpoint

http://100.68.50.41:5003/api/health

Printer list

http://100.68.50.41:5003/api/printers

Active printers

http://100.68.50.41:5003/api/printers/active

Print

POST http://100.68.50.41:5003/api/print

Job status

GET http://100.68.50.41:5003/api/jobs/{id}

---

## Current Station Agent Endpoints

Document how to access the current Station Agent deployed on:

100.68.50.41

Include all current ports and services.

Explain which services remain local and which now communicate with Printer Adapter through HTTP.

---

# Final Report

Summarise:

- architectural review
- reasoning
- risks
- code changes
- APIs added
- services modified
- build status
- runtime verification
- Docker push result
- documentation location

If at any point the refactor is determined to require a major redesign instead of a fast transport replacement, stop immediately and provide the architectural feedback instead of proceeding.