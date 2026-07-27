# Execute and Verify the Full MES WO-to-Physical-Printer Flow

## Background

The remote MacOS Printer Adapter infrastructure is now verified as ready.

Current verified state:

```text
Adapter: Healthy
Kafka: Connected
CUPS: Connected
Printer: Zebra-GK420t-CUPS Online
Printer active for work: true
MES Print Station readiness: ready=true
Kiosk printer projection: ONLINE
Physical Adapter print-test: successful
```

The previous full Work Order test did not reach the print dispatch stage because the selected legacy Work Order failed normal resource-allocation validation:

```text
WO_RESOURCE_ALLOCATION_INVALID
WO_OPERATION_ALLOCATION_MISSING
operation_count=6
committed_allocation_count=0
```

The current task is to execute and verify the actual business flow:

```text
MES Work Order
→ print operation dispatch
→ Kafka print command
→ remote MacOS Printer Adapter
→ physical CUPS/Zebra print
→ Kafka print result
→ MES print job completion
→ MES WO operation completion
→ UI projection update
```

The task is not complete after an Adapter `print-test`.

A real MES-owned Work Order print operation must produce the physical label and return a correlated result to MES.

---

# Architecture Mindset

Use this architecture as authoritative:

```text
MES Server
├── MES Execution Service
├── MES Master Data Service
├── MES Kiosk Gateway
├── MES Console
├── Kafka Broker
└── MES databases and runtime projections

Remote MacOS Print Edge
├── Printer Adapter
├── MacOS CUPS
├── Zebra physical printer
└── Kafka producer and consumer
```

The authoritative production flow is:

```text
MES Execution
→ Kafka
→ remote Printer Adapter
→ CUPS
→ physical printer
```

The result flow is:

```text
remote Printer Adapter
→ Kafka
→ MES Execution printer-result consumer
→ MES print job
→ WO operation
→ Kiosk and MES Console
```

Do not call the Printer Adapter HTTP print endpoint for production execution.

Do not call CUPS from the MES server.

Do not start another Printer Adapter on the MES host.

Kafka is the authoritative transport.

---

# Network Responsibilities

Clearly distinguish these network paths.

## Kafka runtime path

Both MES and the remote Printer Adapter must connect to the same reachable Kafka external listener.

Example:

```text
KAFKA_BOOTSTRAP_SERVERS=<KAFKA_TAILSCALE_IP>:19092
```

The Kafka broker `advertised.listeners` value must be reachable from both hosts.

Do not advertise:

```text
localhost
Docker-only service names
unreachable private LAN addresses
```

to the remote MacOS Adapter.

## Printer Adapter diagnostic path

The verification script may optionally call:

```text
http://<MACOS_TAILSCALE_IP>:5003
```

for health and printer diagnostics.

This HTTP connection is not the physical print transport.

## CUPS path

The Printer Adapter uses the MacOS LAN address:

```text
CUPS_SERVER=192.168.2.31:631
```

or the actual current Mac host CUPS address.

This path is internal to the remote Print Edge:

```text
Printer Adapter container
→ MacOS CUPS
```

The MES server does not need access to this CUPS IP.

---

# Objective

Implement or complete a verification script that:

1. creates or prepares a valid test Work Order;
2. gets the WO through Compute & Check and approval;
3. starts execution;
4. completes any predecessor demo operations;
5. reaches the print operation;
6. creates one durable MES print job;
7. publishes one Kafka print command;
8. confirms the remote Adapter consumes it;
9. confirms one physical Zebra label is printed;
10. receives one correlated Kafka result;
11. confirms MES completes the correct print operation;
12. confirms successor dispatch and final WO state;
13. reports the exact failure layer if any step fails.

The script must run the real business flow, not only the Adapter test-print API.

---

# Phase 1 — Audit the Existing Verification Script

Review:

```text
scripts/verify-mes-wo-to-physical-print-flow.mjs
```

Audit whether it currently:

- only checks readiness;
- stops after approval failure;
- requires an existing WO;
- creates a valid isolated WO;
- supports demo allocation bypass;
- supports strict allocation setup;
- starts execution;
- completes predecessor operations;
- waits for the print operation;
- inspects MES print jobs;
- reads Kafka command/result evidence;
- waits for operation completion;
- writes correlated artifacts.

Correct incomplete assumptions.

The script must not report success merely because:

```text
Printer Adapter health = Healthy
MES readiness = ready
Adapter print-test = successful
```

---

# Phase 2 — Support Two Test Modes

Implement two explicit test modes.

## Mode A — Demo bypass

```text
TEST_MODE=demo-bypass
```

Requirements:

- `MES_DEMO_BYPASS_RESOURCE_ALLOCATION=true`;
- non-empty bypass reason;
- approval audit proves bypass;
- no fake allocations or reservations are created.

This mode exists to verify the complete execution and physical-print integration without requiring full resource-planning data.

## Mode B — Strict production planning

```text
TEST_MODE=strict-allocation
```

Requirements:

- valid shift;
- effective Workstation assignments;
- required supporting equipment;
- committed resource allocations;
- normal approval validation.

The script must report which mode was used.

Do not silently switch modes.

For the requested demo verification, use `demo-bypass` unless the user explicitly requires strict planning verification.

---

# Phase 3 — Ensure the Running Service Uses Demo Configuration

When `TEST_MODE=demo-bypass`, verify the actual running `mes-execution-service` configuration.

Confirm:

```text
MES_DEMO_BYPASS_RESOURCE_ALLOCATION=true
```

Do not assume that setting an environment variable only for the script changes the running service.

If the service is running in Docker Compose:

1. update the Compose override or runtime environment;
2. rebuild only if source changed;
3. recreate `mes-execution-service`;
4. verify the environment inside the running container;
5. verify its health;
6. restore the production-safe value after the controlled test if required.

Never leave the shared production configuration accidentally enabled.

Record:

```text
configuration before test
configuration during test
configuration after test
```

---

# Phase 4 — Create a Safe Isolated WO Fixture

Prefer creating a fresh isolated test WO instead of using a legacy Draft WO.

The fixture must have:

```text
Released Item Revision
Released Production Version
Released MBOM
Released Routing
valid operation snapshots
print operation
valid Workstation
active Print Station binding
ready remote printer
```

Use an identifiable code or test correlation marker.

Example:

```text
E2E-WO-PRINT-<timestamp>
```

Do not mutate an arbitrary production WO.

Store:

```text
work_order_id
work_order_code
quantity
production_version_id
routing_id
print_operation_id
print_workstation_id
print_station_id
```

---

# Phase 5 — Run Compute & Check

Call:

```http
POST /api/mes/execution/work-orders/{woId}/compute-check
```

Verify:

- HTTP success;
- operation snapshots are present;
- print operation exists;
- duration calculation succeeds;
- warnings are recorded;
- no blocking planning-data error remains.

Demo bypass applies to allocation approval only.

It must not hide invalid Routing snapshots or missing print-operation data.

---

# Phase 6 — Approve the Work Order

Call:

```http
POST /api/mes/execution/work-orders/{woId}/approve
```

In demo bypass mode, verify:

```text
WO status = Released
approval_mode = DEMO_RESOURCE_BYPASS
resource_allocation_bypassed = true
bypass_reason is persisted
```

If approval still fails with allocation errors:

- verify the running service environment;
- verify the bypass branch is reached;
- verify the request includes the required reason;
- inspect logs and database approval records.

Do not stop with only the HTTP error.

Report the exact configuration or code path that prevented bypass.

---

# Phase 7 — Start Execution

Call:

```http
POST /api/mes/execution/work-orders/{woId}/start-execution
```

Verify:

```text
WO status = InProgress
only predecessor-ready operations are dispatched
```

Capture dispatch events and Kiosk Gateway updates.

For non-print operations in demo mode:

```text
execution_target = KIOSK_DEMO
```

For the print operation:

```text
execution_target = PRINT_STATION
```

---

# Phase 8 — Complete Predecessor Demo Operations

Determine the dependency chain leading to the print operation.

Use the official Kiosk or MES Execution APIs to:

- start predecessor operations;
- provide required demo confirmations;
- complete them safely;
- verify `MES.Execution.OperationFinished.v1`.

Do not update operation rows directly in the database.

Continue until the print operation becomes ready.

---

# Phase 9 — Verify Print Target Resolution

Before dispatch, verify the print operation resolves:

```text
workstation_id
print_station_id
print_station_code
adapter_id
allocated_printer_quantity
ready_printer_count
active_for_work_printer_count
```

Required checks:

```text
active binding exists
Print Station lifecycle active
runtime ONLINE
Kafka CONNECTED
printer registered
printer ready
printer active for work
allocation quantity > 0
```

If resolution fails, output the readiness response and exact failed rule.

---

# Phase 10 — Verify Durable Print Job Creation

Confirm MES creates one row in:

```text
wo_print_job
```

and one initial attempt in:

```text
wo_print_job_attempt
```

Capture:

```text
print_job_id
attempt_id
status
work_order_id
wo_operation_id
workstation_id
print_station_id
adapter_id
template_id
requested_quantity
command_event_id
correlation_id
```

Confirm one outbox row exists for the print command.

Repeated execution-start or dispatch retries must not create duplicate logical jobs.

---

# Phase 11 — Verify Kafka Command Publication

Verify one record is published to:

```text
station.commands.printer
```

with:

```text
eventType = command.printer.print
```

Capture:

```text
topic
partition
offset
event_id
key
event-type header
correlation_id
print_job_id
wo_id
wo_operation_id
print_station_id
```

Verify the broker metadata uses a listener reachable by the remote MacOS Adapter.

If the Adapter cannot consume:

- print the broker bootstrap value;
- print returned broker metadata;
- print advertised listener;
- test TCP reachability from the MacOS host;
- detect wrong public, LAN, Docker, or Tailscale IP.

Do not report only `Kafka timeout`.

---

# Phase 12 — Verify Remote Adapter Consumption

Using Adapter diagnostics or result events, prove:

```text
command received
command ID reserved
target station matched
template resolved
printer selected
CUPS job submitted
```

Capture:

```text
last consumed command ID
consumer group
partition
offset
SQLite reservation result
selected printer code
CUPS job ID
```

The script must not require local Docker access to the MacOS host.

Use:

- remote Adapter diagnostics API;
- Kafka evidence;
- result event;
- optionally SSH log collection when explicitly configured.

---

# Phase 13 — Verify Physical Print

Confirm:

```text
CUPS accepted job
CUPS completed job
Zebra produced physical label
```

Collect:

```text
printer code
CUPS job ID
template code/version
label/output ID
submission timestamp
completion timestamp
```

A successful Adapter HTTP health response is not physical-print proof.

A successful Kafka publish is not physical-print proof.

---

# Phase 14 — Verify Kafka Result

Wait for one of:

```text
printer.printed
printer.batch.printed
printer.error
```

Capture:

```text
result_event_id
command_event_id
print_job_id
work_order_id
wo_operation_id
print_station_id
adapter_id
selected_printer_code
printed_quantity
status
error_code
error_message
```

Verify the MES consumer group:

```text
mes-execution-printer-results
```

consumes and commits the record.

---

# Phase 15 — Verify MES Completion

On successful result, verify transactionally:

```text
wo_print_job.status = Completed
wo_print_job_attempt.status = Completed
WO print operation status = Finished
operation confirmation exists
execution session closed
MES.Execution.OperationFinished.v1 queued/published
successor operation dispatched
```

When all operations are completed:

```text
WO status = Completed
MES.Execution.WOCompleted.v1 published
```

On failure:

```text
print job = Failed
attempt = Failed
operation != Finished
retry remains available
```

---

# Phase 16 — Failure Classification

If the flow fails, classify the exact lowest failing layer.

Use these categories:

```text
MES_CONFIGURATION
WO_MASTER_DATA
WO_COMPUTE_CHECK
WO_APPROVAL
WO_EXECUTION_DISPATCH
PRINT_TARGET_RESOLUTION
MES_OUTBOX
KAFKA_BROKER
KAFKA_ADVERTISED_LISTENER
KAFKA_ACL
ADAPTER_COMMAND_CONSUMER
ADAPTER_CONTRACT
TEMPLATE_RESOLUTION
CUPS_CONNECTIVITY
CUPS_AUTHORIZATION
PRINTER_QUEUE
PHYSICAL_PRINTER
RESULT_EVENT_PUBLISH
MES_RESULT_CONSUMER
RESULT_CORRELATION
WO_OPERATION_COMPLETION
UI_PROJECTION
```

Each failure must include:

```text
expected
actual
host
IP/hostname
port
service/container
event ID
correlation ID
relevant log lines
recommended fix
```

Examples:

```text
KAFKA_ADVERTISED_LISTENER

Expected:
Remote MacOS Adapter receives broker metadata using Tailscale IP.

Actual:
Broker metadata returned kafka:29092.

Fix:
Configure external advertised listener with the Kafka host Tailscale IP.
```

```text
CUPS_CONNECTIVITY

Expected:
Adapter container connects to MacOS CUPS at 192.168.2.31:631.

Actual:
Connection attempted through host.docker.internal / 192.168.65.254.

Fix:
Use the Mac LAN address in CUPS_SERVER and CUPS_HEALTH_HOST.
```

---

# Phase 17 — Network Report

Generate a network matrix:

| Connection | Source | Destination | Protocol | Required IP | Result |
|---|---|---|---|---|---|
| MES → Kafka | MES server | Kafka broker | Kafka TCP | internal/Tailscale | |
| Adapter → Kafka | MacOS edge | Kafka broker | Kafka TCP | Tailscale/external listener | |
| MES → Adapter diagnostics | MES server | MacOS Adapter | HTTP | optional Tailscale | |
| Adapter → CUPS | Adapter container | MacOS host | IPP/CUPS | Mac LAN IP | |
| Kiosk → Gateway | Browser | Kiosk Gateway | HTTP/WebSocket | MES host | |

Clearly state which connection is:

```text
required for production runtime
optional for diagnostics
local to the Print Edge
```

Do not say MES and Adapter need direct HTTP communication when Kafka alone is sufficient for command/result transport.

---

# Phase 18 — Verification Script Output

The script must create:

```text
artifacts/wo-print-e2e/<timestamp>/
├── summary.json
├── timeline.md
├── network-report.md
├── failure-report.md
├── api-responses/
├── kafka/
├── database/
├── adapter/
├── cups/
└── logs/
```

`summary.json` must include:

```json
{
  "success": true,
  "testMode": "demo-bypass",
  "workOrderId": "...",
  "workOrderCode": "...",
  "printOperationId": "...",
  "printJobId": "...",
  "commandEventId": "...",
  "resultEventId": "...",
  "printStationCode": "PRINT-STATION-01",
  "adapterId": "PRINT-ADAPTER-01",
  "printerCode": "Zebra-GK420t-CUPS",
  "cupsJobId": "...",
  "physicalPrintVerified": true,
  "mesOperationCompleted": true,
  "workOrderCompleted": true
}
```

On failure, `success=false` and include:

```text
failedStage
failureCategory
rootCause
recommendedFix
```

---

# Phase 19 — Example Execution

Run with real values, not placeholders.

Example:

```bash
TEST_MODE=demo-bypass \
MES_BASE_URL=http://localhost:18000 \
MASTER_DATA_BASE_URL=http://localhost:13020 \
KIOSK_GATEWAY_BASE_URL=http://localhost:13050 \
KAFKA_BOOTSTRAP_SERVERS=<KAFKA_TAILSCALE_IP>:19092 \
PRINTER_ADAPTER_BASE_URL=http://<MACOS_TAILSCALE_IP>:5003 \
PRINTER_ADAPTER_HOST_MODE=remote \
PRINT_STATION_CODE=PRINT-STATION-01 \
EXPECTED_PRINTER_CODE=Zebra-GK420t-CUPS \
BYPASS_REASON="Controlled cross-server physical print E2E verification" \
npm run verify:mes:wo-physical-print
```

The report must show the actual resolved IP values.

Do not leave `<REMOTE_MACOS_HOST>` or `<KAFKA_TAILSCALE_IP>` placeholders in the final execution report.

---

# Exactly-Once Verification

After the first successful physical print:

1. replay the same command event ID;
2. verify Adapter reservation detects the duplicate;
3. verify no second physical label is printed;
4. verify MES does not create another operation confirmation;
5. verify successor dispatch is not duplicated.

Then run one explicit retry test using a new attempt and new event ID.

Differentiate:

```text
duplicate replay
```

from:

```text
authorised retry
```

---

# Acceptance Criteria

The task is complete only when:

1. A fresh or controlled WO reaches approval.
2. Demo bypass is explicitly enabled and audited, or strict allocation is completed.
3. WO execution starts.
4. Predecessor operations complete through official APIs.
5. The print operation resolves the real Print Station.
6. One MES print job is created.
7. One Kafka command is published.
8. The remote MacOS Adapter consumes it.
9. The Adapter submits one CUPS job.
10. The Zebra printer produces one physical label.
11. One printer result returns through Kafka.
12. MES consumes and correlates the result.
13. The correct WO operation becomes Finished.
14. Successor operations continue.
15. WO reaches the expected final state.
16. Duplicate replay does not print twice.
17. The report identifies every IP, host, topic, event ID, and state transition.
18. Any failure contains an exact root cause and recommended fix.
19. No local MES Printer Adapter is started.
20. No HTTP production print path is introduced.

# Required Final Report

Provide:

## Test identity

```text
timestamp
test mode
WO ID
WO code
print operation ID
print job ID
```

## Network topology

```text
MES host
Kafka host and advertised listener
MacOS Adapter Tailscale IP
Adapter diagnostic URL
MacOS CUPS LAN IP
printer queue
```

## Kafka evidence

```text
command topic
command event ID
partition
offset
Adapter consumer group
result topic
result event ID
MES result consumer group
```

## Physical evidence

```text
selected printer
CUPS job ID
template
printed quantity
physical output confirmation
```

## MES evidence

```text
print job state
attempt state
WO operation state
successor state
WO final state
```

## Failure report

When unsuccessful, report the exact lowest failing layer, including:

```text
wrong IP
wrong advertised listener
port unreachable
stale container
wrong image
wrong environment
Kafka ACL
schema/contract mismatch
CUPS authentication
queue paused
template missing
result correlation failure
```

Do not report the flow as complete unless the real MES Work Order produces the physical label and the correlated printer result completes the correct MES WO operation.