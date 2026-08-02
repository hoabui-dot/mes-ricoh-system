# Task — Create a Complete MES Print Station Integration Document for WMS

You are working inside the existing S-Factory MES enterprise microservice repository.

This task is documentation-focused.

Do not modify MES, WMS, Print Station, Printer Adapter, Kafka, database schema, Docker Compose, or runtime configuration unless explicitly requested in a later task.

## Objective

Inspect the current MES, Print Station, Printer Adapter, Kafka, Kong, Keycloak, Docker Compose, service manifests, source code, environment configuration, APIs, event schemas, migrations, tests, and existing documentation.

Then create one complete technical integration document that explains how another system—especially WMS—can integrate with the existing printing infrastructure to print warehouse QR-code labels.

The document must be sufficiently detailed for a Senior WMS Engineer to implement the integration without having to reverse-engineer the MES printing source again.

The document must clearly separate:

- current implemented behavior;
- runtime environment configuration;
- development/demo behavior;
- management or diagnostic APIs;
- production print transport;
- missing or unverified behavior;
- WMS-specific recommendations that are not yet implemented.

Never invent an IP address, port, Kafka topic, credential, event field, API, or print workflow.

When a value is environment-dependent, document:

- where it is configured;
- how to discover the current value;
- an example placeholder;
- whether the value is safe to share;
- which team owns it.

Use classifications where appropriate:

- `IMPLEMENTED_AND_VERIFIED`
- `IMPLEMENTED_NOT_FULLY_VERIFIED`
- `PARTIALLY_IMPLEMENTED`
- `DEMO_ONLY`
- `MANAGEMENT_ONLY`
- `DIAGNOSTIC_ONLY`
- `NOT_IMPLEMENTED`
- `UNKNOWN_REQUIRES_RUNTIME_CONFIRMATION`
- `REQUIRES_PRODUCT_DECISION`

---

# Required Output

Create:

```text
AI_document/PRINT_STATION_INTEGRATION_FOR_WMS.md
```

The document must be written in English and Markdown.

It must become the canonical onboarding and integration reference for connecting WMS to the existing Print Station and Printer Adapter infrastructure.

---

# Source Precedence

Use this order of authority:

1. Running source code.
2. Docker Compose and runtime manifests.
3. Service manifests.
4. Environment variable definitions and example files.
5. Kafka producer and consumer implementations.
6. Event schemas and Schema Registry files.
7. Database migrations.
8. API handlers and clients.
9. Automated integration and E2E tests.
10. Current AI context and AI documentation.
11. Product documents and historical implementation reports.

When two sources conflict, explicitly document the conflict.

Do not silently choose the most convenient value.

---

# Required Document Structure

## 1. Executive Summary

Explain:

- what the current Print Station system is;
- how MES currently sends print work;
- how the remote Printer Adapter communicates;
- what role Kafka plays;
- what role HTTP APIs play;
- what WMS needs in order to print QR labels;
- whether WMS integration is currently implemented;
- the recommended integration direction.

Clearly state whether the normal production print path is:

```text
HTTP
Kafka
SignalR
Direct printer connection
```

Do not confuse management APIs with the production print-command transport.

---

## 2. Current Print Architecture

Describe every printing-related runtime component.

At minimum inspect and document:

- MES Execution Service;
- MES Traceability Service;
- MES Master Data Service;
- Print Station Projection Service;
- Print Station Kiosk UI;
- remote Printer Adapter;
- physical printer;
- Kafka;
- Schema Registry;
- Redis where used;
- SignalR;
- Kong;
- Keycloak;
- CUPS or printer driver integration;
- template storage or template-management component;
- databases that persist print jobs, attempts, templates, events, or projections.

For each component include:

| Field | Required content |
|---|---|
| Component name | Exact current name |
| Repository path | Source location |
| Runtime/deployment name | Compose/container/service name |
| Responsibility | What it owns |
| Inputs | API calls, Kafka topics, DB, files |
| Outputs | Events, print commands, status |
| Network protocol | HTTP, Kafka, SignalR, CUPS, etc. |
| Database ownership | If applicable |
| Current status | Classification |
| WMS relevance | How WMS would interact with it |

Include a Mermaid architecture diagram such as:

```text
MES / WMS
  -> print request owner
  -> outbox
  -> Kafka command topic
  -> remote Printer Adapter
  -> printer driver / CUPS
  -> physical printer
  -> Kafka printed/failed/status event
  -> projection consumers
  -> SignalR
  -> UI
```

The diagram must match the actual implementation.

---

## 3. Deployment Topology

Explain where every printing component runs.

Distinguish:

- main MOM/MES server;
- Print Station control plane;
- remote Mac or printer server;
- physical printer;
- local network;
- Docker network;
- Cloudflare tunnel or external access where currently used;
- WMS deployment location.

Document the deployment files that own each component, for example:

```text
infra/docker-compose.platform.yml
infra/docker-compose.mes.yml
infra/docker-compose.print-station.yml
docker-compose.print-adapter.yml
```

Use the actual file names found in the repository.

Include a Mermaid deployment diagram.

---

## 4. Network Connectivity Matrix

Create a detailed connectivity table.

Use this format:

| Source | Destination | Protocol | Host/IP source | Port | TLS | Authentication | Purpose | Required for production | Current value source |
|---|---|---|---|---:|---|---|---|---|---|

Include every proven connection, such as:

- WMS or MES service to Kafka broker;
- Printer Adapter to Kafka broker;
- Projection Service to Kafka;
- Printer Adapter to CUPS/printer;
- Print Station UI to Projection Service;
- SignalR connection;
- management HTTP APIs;
- health endpoints;
- template-management endpoints;
- Kong-exposed endpoints if applicable;
- Schema Registry;
- Redis;
- PostgreSQL.

## Rules for IP addresses and ports

Do not hardcode runtime IP addresses unless they are currently defined as canonical configuration.

For each host, IP, or port document:

- environment variable name;
- Docker Compose variable;
- config file;
- default value if one exists;
- current runtime lookup command;
- example placeholder;
- whether it may change between environments.

Example format:

```text
Kafka broker:
- Configuration key: KAFKA_BROKERS
- Current source: docker-compose.print-station.yml / adapter environment
- Example only: kafka:9092
- External adapter example: <KAFKA_HOST>:<KAFKA_EXTERNAL_PORT>
- Runtime confirmation required: Yes
```

If current runtime values such as a Mac LAN IP or Cloudflare URL cannot be established from source, write:

```text
UNKNOWN_REQUIRES_RUNTIME_CONFIRMATION
```

Then explain how an operator should retrieve them.

---

## 5. Kafka Configuration

Document the complete Kafka integration.

Include:

- broker configuration;
- internal and external listener behavior;
- security protocol;
- SASL mechanism if used;
- TLS configuration;
- username and password source;
- certificate source;
- client ID conventions;
- consumer group conventions;
- Schema Registry URL;
- topic creation behavior;
- partitioning;
- retention;
- retry behavior;
- offset commit behavior;
- idempotency behavior;
- message ordering expectations;
- dead-letter behavior;
- replay behavior;
- health checks.

Never reveal real secrets.

Document only secret variable names and secret-management locations.

---

## 6. Kafka Topic Inventory

Create an exact inventory of all printing-related topics.

Use:

| Topic | Producer | Consumer | Direction | Purpose | Key/partition key | Schema | Retry behavior | Current status |
|---|---|---|---|---|---|---|---|---|

At minimum inspect:

- station print-command topic;
- `station.events.printer`;
- print result events;
- printer heartbeat events;
- printer runtime/status events;
- template-related events if any;
- MES print-job events;
- traceability label events that participate in printing.

Do not assume a topic name from documentation alone.

Confirm it against producer/consumer source and runtime configuration.

Clearly identify:

```text
command topic
result topic
status topic
heartbeat topic
```

If multiple event types share one topic, document the envelope discriminator.

---

## 7. Event Envelope and Payload Contracts

For every relevant event, document:

- exact event name;
- event version;
- producer;
- consumer;
- envelope fields;
- payload fields;
- required and optional fields;
- data types;
- field meaning;
- validation rules;
- idempotency identity;
- correlation identity;
- business identity;
- partition key;
- expected response event;
- terminal success state;
- terminal failure state.

Include exact JSON examples derived from implemented source or schemas.

Do not invent payload fields.

Important fields to inspect include:

```text
event_id
event_type
event_version
occurred_at
source
trace_id
correlation_id
causation_id
print_job_id
request_id
station_id
printer_id
template_id
template_version
copies
label_quantity
payload
status
error_code
error_message
```

Use only fields proven by source.

For each event state whether WMS may publish or consume it directly.

---

## 8. MES Print Job Lifecycle

Explain the current MES print lifecycle in detail.

Cover:

- how a print requirement originates;
- Work Order or operation relationship;
- label quantity calculation;
- Production Standard dependency;
- print-template resolution;
- creation of `wo_print_job`;
- attempts;
- events;
- transaction and outbox behavior;
- Kafka command publishing;
- adapter execution;
- result handling;
- retry;
- cancellation if supported;
- idempotency;
- status transitions;
- UI projection.

Include a state diagram.

Example states must be replaced with exact current states from source:

```text
Pending
Queued
Dispatched
Printing
Printed
Failed
Retrying
Cancelled
```

Document the actual database fields and state machine.

---

## 9. Template Management

Explain how label templates are stored and managed.

Document:

- template owner;
- template ID and version;
- template format;
- QR-code support;
- barcode support;
- printer language such as ZPL, EPL, PDF, image, or another format;
- dynamic variable replacement;
- validation;
- deployment to the remote adapter;
- cache behavior;
- template refresh;
- template compatibility with printers;
- template test API;
- version immutability;
- rollback;
- current UI or management API.

Clearly distinguish:

- template management;
- template preview;
- manual test print;
- production print execution.

For WMS, document what is required to create templates for:

- pallet label;
- LPN label;
- bin label;
- item label;
- lot label;
- serial label;
- receiving label;
- picking label;
- packing/shipping label.

Do not claim these templates exist unless verified.

---

## 10. QR-Code Data Contract for WMS

Document what a WMS QR label should contain.

First, inspect whether the current codebase already defines WMS QR payloads.

If implemented, document the exact format.

If not implemented, create a clearly marked proposal:

```text
REQUIRES_PRODUCT_DECISION
```

The proposed section may discuss fields such as:

- label type;
- WMS entity type;
- warehouse code;
- location/bin code;
- item code;
- item revision;
- lot;
- serial;
- LPN;
- pallet;
- quantity;
- UOM;
- manufacturing date;
- expiry date;
- Work Order reference;
- receipt reference;
- shipment reference;
- checksum or signature;
- payload version.

Clearly distinguish:

- printed human-readable content;
- encoded QR payload;
- internal UUID;
- business code;
- traceability identity.

Do not expose internal UUIDs as the primary visible label identity unless the implemented contract explicitly requires them.

Include example QR payloads only when marked as implemented or proposed.

---

## 11. Recommended WMS Integration Model

Evaluate the current architecture and recommend the safest WMS integration approach.

Compare at least these options:

### Option A — WMS publishes directly to the existing printer command topic

Analyze:

- coupling;
- schema ownership;
- authorization;
- topic permissions;
- template ownership;
- result correlation;
- idempotency;
- retry;
- observability;
- risk of bypassing MES execution ownership.

### Option B — WMS owns a WMS Print Job aggregate and publishes WMS print commands

Analyze:

- separate ownership;
- reuse of Printer Adapter;
- shared command envelope;
- shared result topic;
- WMS-specific templates and labels;
- correlation back to WMS entities.

### Option C — Shared Print Orchestration Service

Analyze:

- central print API;
- shared queue;
- domain-neutral command contract;
- template resolution;
- station/printer routing;
- result fan-out;
- migration cost;
- operational ownership.

### Option D — WMS calls an existing HTTP management or test endpoint

Explain whether this is acceptable for production.

If current architecture states that HTTP is management/diagnostic/manual-test only, explicitly reject it as the normal WMS production path.

Provide a recommendation based on current implementation, not generic preferences.

The recommendation must preserve these rules:

- no direct WMS database access to MES or Print Station;
- no reuse of MES Work Order print tables as WMS inventory-print authority unless explicitly redesigned;
- no direct browser-to-printer production command;
- no duplicate printer ownership;
- no hardcoded remote adapter IP;
- no bypass of Kafka when Kafka is the production transport.

---

## 12. Proposed WMS Print Flow

Describe the target end-to-end WMS flow.

Example conceptual flow:

```text
WMS business action
  -> create WMS print job
  -> persist business state and outbox
  -> publish print command
  -> Printer Adapter receives command
  -> resolve/download template
  -> render QR code
  -> send to printer/CUPS
  -> publish printed or failed event
  -> WMS idempotent consumer updates print job
  -> WMS Console/PDA receives current status
```

Use a Mermaid sequence diagram.

Cover these WMS use cases:

- receiving label;
- LPN generation;
- pallet label;
- bin/location label;
- item/lot/serial label;
- packing label;
- shipping label;
- label reprint;
- failed print retry;
- printer offline;
- template missing;
- duplicate command;
- duplicate result;
- result received after timeout.

Mark each use case as:

- currently reusable;
- requires WMS implementation;
- requires shared Print Station change;
- requires product decision.

---

## 13. Printer and Station Selection

Explain how a print request selects:

- Print Station;
- printer;
- workstation binding;
- warehouse;
- zone;
- bin;
- label type;
- template;
- copies.

Inspect current selection rules.

Document whether selection is:

- explicit in the command;
- resolved from Workstation binding;
- resolved from template;
- resolved from Station configuration;
- resolved by Adapter;
- hardcoded;
- environment-based.

For WMS, propose how station selection should work for warehouse locations without breaking MES Workstation binding.

Do not reuse MES Workstation semantics for WMS bins unless approved by the domain design.

---

## 14. HTTP APIs

Inventory every printing-related HTTP API.

Use:

| Method | Path | Owner | Purpose | Authentication | Production command allowed? | WMS use |
|---|---|---|---|---|---|---|

Include:

- health;
- readiness;
- diagnostics;
- printer discovery;
- station management;
- template management;
- template upload/download;
- test connection;
- manual test print;
- print retry;
- print-job query;
- status query.

Explicitly label each endpoint:

```text
PRODUCTION
MANAGEMENT_ONLY
DIAGNOSTIC_ONLY
MANUAL_TEST_ONLY
DEPRECATED
```

Do not recommend a diagnostic endpoint as the main WMS integration method.

---

## 15. SignalR and UI Status Updates

Explain:

- which service exposes SignalR;
- URL/path;
- authentication;
- hub name;
- event names;
- reconnect behavior;
- initial state loading;
- deduplication;
- projection source of truth.

Clarify whether WMS should:

- subscribe directly;
- build its own projection;
- consume Kafka results;
- expose WMS WebSocket/SignalR status to WMS Console/PDA.

Do not require WMS to poll the remote Printer Adapter continuously if the current architecture uses projection services.

---

## 16. Security and Access Control

Document:

- Kafka ACL requirements;
- topic-level producer/consumer rights;
- adapter authentication;
- service account;
- credential rotation;
- TLS;
- SASL;
- Kong authentication;
- Keycloak roles;
- API authorization;
- network firewall requirements;
- secret storage;
- audit;
- trace IDs;
- correlation IDs;
- sensitive data handling.

For WMS integration, define the minimum permissions required.

Example:

```text
WMS Outbound service:
- Produce: <print command topic>
- Consume: <printer result topic or WMS-specific result topic>
- No access: MES execution database
- No direct access: printer credentials
```

Use actual topic names only when verified.

Never write real credentials into the document.

---

## 17. Configuration Reference

Create a complete environment-variable/configuration table.

Use:

| Variable | Component | Required | Example placeholder | Secret | Purpose | Source file |
|---|---|---:|---|---:|---|---|

Inspect and include variables for:

- Kafka brokers;
- Kafka security;
- Kafka username/password;
- Schema Registry;
- command topic;
- event topic;
- consumer group;
- adapter identity;
- station identity;
- printer name;
- CUPS endpoint;
- printer host/IP;
- printer port;
- HTTP binding;
- health port;
- management API port;
- Redis;
- PostgreSQL;
- SignalR;
- template directory;
- template server URL;
- Cloudflare/runtime URL if applicable;
- logging;
- retry;
- timeouts.

Clearly mark:

```text
SOURCE_DEFAULT
EXAMPLE_ONLY
RUNTIME_REQUIRED
SECRET
```

---

## 18. Runtime Discovery Commands

Provide commands to retrieve the current runtime configuration without exposing secrets.

Examples should be adapted to the actual repository:

```bash
docker compose config
docker compose ps
docker inspect <container>
docker compose logs <service>
docker exec <container> env
ss -lntp
curl <health-endpoint>
kcat -L -b <broker>
kcat -C ...
```

Do not print secret values in commands or expected output.

Document how to find:

- current adapter IP;
- current printer host;
- current exposed ports;
- current Kafka broker address;
- current station ID;
- current printer ID;
- current topics;
- current template IDs;
- current health status.

---

## 19. Failure Handling and Retry

Document behavior for:

- Kafka unavailable;
- Adapter offline;
- printer offline;
- CUPS unavailable;
- template not found;
- malformed payload;
- unsupported printer language;
- duplicate command;
- duplicate result;
- timeout;
- late result;
- partially printed label batch;
- printer reports failure;
- WMS consumer unavailable;
- Schema Registry unavailable.

Explain:

- retry owner;
- maximum retries;
- backoff;
- terminal failure;
- manual recovery;
- reprint policy;
- idempotency rule;
- audit rule.

If retry or DLQ behavior is not proven, mark it unknown.

---

## 20. Idempotency and Reprint Rules

Document how the system prevents duplicate labels.

Include:

- command event ID;
- print job ID;
- request ID;
- correlation ID;
- business label identity;
- adapter deduplication;
- consumer deduplication;
- result deduplication;
- retry versus reprint distinction;
- copies versus repeated command;
- manual reprint reason;
- reprint audit;
- label sequence/version.

For WMS, define the recommended idempotency key format without inventing an implemented contract.

Mark proposals clearly.

---

## 21. Observability and Operations

Document:

- logs;
- trace IDs;
- metrics;
- dashboards;
- print-job status;
- adapter heartbeat;
- printer health;
- Kafka lag;
- failed print count;
- retry count;
- template errors;
- alert conditions.

Explain how support staff trace one WMS print request through:

```text
WMS entity
-> WMS print job
-> outbox event
-> Kafka command
-> adapter log
-> printer/CUPS
-> result event
-> WMS projection/status
```

Provide a troubleshooting checklist.

---

## 22. Local Development Setup

Document the steps to run the print stack locally.

Include:

- required Compose files;
- startup order;
- required environment files;
- Kafka;
- Schema Registry;
- Print Station;
- Adapter;
- simulation mode;
- printer simulator if available;
- seed/template setup;
- verification commands;
- test print method;
- cleanup.

Clearly separate:

```text
simulation
manual test printing
real physical printing
```

---

## 23. Environment-Specific Integration Checklist

Create checklists for:

- local development;
- shared development;
- staging/UAT;
- production.

Each checklist should cover:

- DNS/IP;
- ports;
- TLS;
- firewall;
- Kafka ACL;
- credentials;
- topics;
- consumer groups;
- templates;
- printer configuration;
- station registration;
- monitoring;
- recovery;
- acceptance test.

---

## 24. WMS Implementation Checklist

Provide an actionable checklist for the future WMS team.

At minimum:

```text
[ ] Confirm integration option and ownership.
[ ] Define WMS print-job aggregate.
[ ] Define WMS QR payload.
[ ] Define template ownership.
[ ] Provision Kafka producer/consumer identity.
[ ] Provision topic ACLs.
[ ] Configure broker and Schema Registry.
[ ] Implement transactional outbox.
[ ] Implement idempotent printer-result consumer.
[ ] Implement retry/reprint policy.
[ ] Implement WMS Console/PDA status display.
[ ] Add audit.
[ ] Add integration tests.
[ ] Add E2E tests.
[ ] Test printer offline.
[ ] Test duplicate command/result.
[ ] Test missing template.
[ ] Test real QR scan.
[ ] Verify physical label content.
```

---

## 25. Acceptance Test Matrix

Create a complete test matrix.

Use:

| ID | Scenario | Preconditions | Action | Expected command | Expected result | Persistence | UI outcome |
|---|---|---|---|---|---|---|---|

Include:

- successful QR print;
- multiple copies;
- duplicate command;
- duplicate result;
- adapter offline;
- printer offline;
- template missing;
- invalid QR payload;
- Kafka reconnect;
- delayed result;
- retry;
- manual reprint;
- wrong station;
- wrong printer;
- unauthorized producer;
- unauthorized API caller;
- WMS restart during print;
- adapter restart during print;
- result after WMS restart;
- QR scan verification.

Separate:

- API/integration tests;
- Kafka contract tests;
- adapter tests;
- WMS E2E;
- physical printer acceptance tests.

---

## 26. Known Limitations and Open Decisions

Explicitly list:

- current runtime values not stored in source;
- missing WMS print-job model;
- missing WMS QR contract;
- missing WMS templates;
- missing Kafka ACL configuration;
- incomplete DLQ behavior;
- physical printer dependency;
- environment-specific adapter IP;
- Cloudflare URL variability;
- any use of demo flags;
- any manual test endpoint;
- any missing contract schema;
- any unverified retry behavior.

Do not hide gaps.

---

## 27. Recommended Final Architecture

End the document with a source-backed recommendation.

The recommendation should answer:

1. Should WMS call MES Execution to print?
2. Should WMS publish directly to the current adapter command topic?
3. Should WMS create its own print job and reuse the adapter?
4. Is a shared Print Orchestration Service justified?
5. Who owns WMS QR templates?
6. Who owns printer/station configuration?
7. Which service consumes printed/failed results?
8. How should WMS Console and PDA receive print status?
9. Which changes are required before production use?

Clearly separate:

```text
Current reusable infrastructure
Required WMS implementation
Required shared print-platform changes
Requires product decision
```

---

# Mandatory Architecture Rules

- Kafka is the normal production print transport when current source proves it.
- Do not convert management HTTP APIs into a second production command path.
- Do not poll the remote Adapter continuously for dashboard state.
- Do not hardcode adapter IP, printer IP, broker address, credentials, or Cloudflare URLs in WMS source.
- Do not give WMS direct access to MES or Print Station databases.
- Do not reuse MES Work Order print tables as WMS inventory-print ownership without an approved design.
- Do not duplicate Print Station printer ownership in WMS.
- Do not create a second physical-printer authority.
- Do not expose credentials in documentation.
- Do not invent topics, ports, payloads, templates, or APIs.
- Use transactional outbox for WMS print commands where implementation requires reliable event delivery.
- Use idempotent consumers for printed/failed results.
- Preserve correlation and trace IDs across WMS, Kafka, Adapter, and UI.
- Treat physical printing as unverified until tested with the real Adapter, CUPS, printer, template, and QR scanner.

---

# Required Verification Before Completion

Before finishing the document:

1. Cross-check every topic against producer and consumer source.
2. Cross-check every API path against route source.
3. Cross-check every port against Compose/configuration.
4. Cross-check every environment variable against source.
5. Cross-check every event field against schema or code.
6. Cross-check every database table against migrations.
7. Confirm which HTTP APIs are management-only.
8. Confirm the current production print command path.
9. Confirm whether WMS integration currently exists.
10. Identify all runtime values that still require operator confirmation.
11. Verify that no real secret is written into the document.
12. Verify that every recommendation is clearly distinguished from implemented behavior.

---

# Completion Report

After creating the document, provide a short report containing:

- files inspected;
- current production print transport;
- confirmed Kafka topics;
- confirmed APIs;
- confirmed configuration sources;
- runtime values that remain unknown;
- WMS integration recommendation;
- missing implementation required for WMS;
- verification commands used;
- document path.

Do not claim that WMS QR printing is production-ready unless the complete Kafka, Adapter, template, physical printer, result-consumer, and QR-scan acceptance flow has been executed successfully.