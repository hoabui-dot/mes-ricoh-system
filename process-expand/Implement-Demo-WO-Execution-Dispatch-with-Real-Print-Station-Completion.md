# Implement Demo WO Execution Dispatch with Real Print Station Completion

## Background

The current MES Work Order lifecycle, Kiosk application, and Edge Print Station are implemented but are not yet connected into one authoritative execution flow.

Current behavior:

- Work Orders are created as `Draft`.
- Compute & Check uses immutable WO operation planning snapshots.
- Approval currently requires a committed resource allocation for every operation.
- Approved Work Orders become `Released`.
- Kiosk UI currently displays Draft and Released Work Orders.
- The only demo Kiosk UI is served on port `13051`.
- MES Kiosk Gateway is the backend gateway for Kiosk/WebSocket communication.
- Print Station runtime and Workstation binding are projected into MES.
- Printer Adapter consumes Kafka commands and publishes physical print results.
- Station Agent Job Engine is currently the physical print-command producer.
- MES execution does not yet dispatch a WO print operation directly to the Print Station.
- Printer result events do not yet authoritatively complete the owning MES WO operation.

The required demo flow is:

```text
Create WO
→ Compute & Check
→ Approve with demo resource-allocation bypass
→ Start WO execution
→ dispatch ready non-print operations to the shared demo Kiosk
→ dispatch ready print operations to the real connected Print Station
→ Printer Adapter executes the physical print
→ printer result returns through Kafka
→ MES completes or fails the WO operation
→ subsequent Routing operations become eligible
→ WO completes after all operations finish
```

---

# Objective

Implement and verify a complete end-to-end demo execution flow while preserving the production-grade resource-planning architecture.

Required outcomes:

1. Allow WO approval without committed resource allocations only in explicit demo mode.
2. Preserve normal strict resource-allocation validation outside demo mode.
3. Dispatch all normal operations to the single shared demo Kiosk flow.
4. Dispatch print operations to the real bound Edge Print Station.
5. Trigger physical printing through Kafka only.
6. Consume printer results back into MES.
7. Complete or fail the owning WO operation from the printer result.
8. Continue Routing execution according to predecessor dependencies.
9. Prevent Draft Work Orders from being executed by Kiosk.
10. Create a repeatable full-flow verification script.
11. Continuously inspect logs, Kafka records, databases, Kiosk state, Adapter state, and physical output until the real flow passes.

Do not implement a browser-to-printer call.

Do not add a second HTTP production-print path beside Kafka.

---

# Phase 1 — Audit the Current Runtime

Read the current AI context and inspect the actual source, database, manifests, containers, and running logs.

Audit at minimum:

```text
mes-execution-service
mes-kiosk-gateway-service
kiosk-operator-ui
mes-master-data-service
MES Console
Station Gateway
Station Agent Job Engine
Projection Service
Printer Adapter
Kafka topics and consumer groups
Print Station runtime projection
Workstation / Print Station binding
WO header and WO operation tables
execution sessions
operation confirmation
outbox tables
printer command and result contracts
```

Trace these current flows completely:

```text
WO creation
Compute & Check
resource allocation
approval
WO start
operation start
operation confirm
Kiosk WO list
Kiosk WebSocket update
print command creation
Printer Adapter consumption
printer result publication
MES event consumption
```

For every claim classify it as:

```text
IMPLEMENTED_AND_VERIFIED
IMPLEMENTED_BUT_NOT_TESTED
PARTIALLY_IMPLEMENTED
MISSING
CONFLICTING_SOURCES
```

Do not rely on implementation reports when running code differs.

---

# Phase 2 — Add Explicit Demo Execution Policy

Introduce explicit configuration such as:

```text
MES_DEMO_BYPASS_RESOURCE_ALLOCATION=true
DEMO_KIOSK_RECEIVE_ALL_WORKSTATIONS=true
DEMO_KIOSK_TERMINAL_CODE=KIOSK-DEMO-01
```

Use the repository’s existing configuration conventions.

The default production behavior must remain:

```text
MES_DEMO_BYPASS_RESOURCE_ALLOCATION=false
```

## Approval in normal mode

Approval must continue to require:

- committed resource allocation for every required operation;
- allocation revalidation;
- Production Version freshness;
- valid approval role;
- correct WO lifecycle.

## Approval in demo mode

Approval may bypass only the committed resource-allocation requirement.

It must still validate:

- WO is `Draft` or `PendingApproval`;
- Production Version is still Released;
- Routing snapshot exists;
- Routing predecessor graph is valid;
- operation planning snapshots are valid;
- approval role is authorised;
- print operations have a resolvable Workstation / Print Station route before execution when required.

Record an audit entry:

```text
approval_mode = DEMO_RESOURCE_BYPASS
resource_allocation_bypassed = true
bypass_reason
approved_by
approved_at
```

Do not create fake Workstation, Equipment, Shift, calendar, employee, or reservation rows.

Do not silently weaken production mode.

---

# Phase 3 — Separate Approval from Execution Start

Approval must only perform:

```text
Draft / PendingApproval
→ Released
```

Add or confirm an explicit execution-start action:

```http
POST /api/mes/execution/work-orders/{woId}/start-execution
```

Use an existing equivalent endpoint if already present.

Starting execution must:

1. require WO status `Released`;
2. use an idempotency key;
3. transition WO to `InProgress`;
4. find all currently executable operations;
5. dispatch only operations whose predecessors are Finished;
6. queue dispatch events transactionally through the outbox;
7. avoid dispatching the same operation twice.

Do not dispatch every Routing operation immediately when dependencies are sequential.

---

# Phase 4 — Introduce an Execution Target Resolver

Each WO operation must resolve one execution target:

```text
KIOSK_DEMO
PRINT_STATION
AUTOMATIC
UNRESOLVED
```

Resolution must be backend-owned.

Do not infer the target only from translated names such as “Print Barcode”.

Use authoritative fields such as:

- Operation execution type;
- output-label requirement;
- explicit print-execution flag;
- Workstation execution mode;
- active Workstation / Print Station binding;
- Routing/WO operation snapshot.

Recommended explicit snapshot field:

```text
execution_target_type
```

For the demo:

```text
normal manual operation
→ KIOSK_DEMO

physical print operation
→ PRINT_STATION
```

If the target cannot be resolved, block dispatch with a stable error.

Examples:

```text
WO_OPERATION_EXECUTION_TARGET_UNRESOLVED
PRINT_WORKSTATION_NOT_RESOLVED
PRINT_STATION_BINDING_MISSING
PRINT_STATION_NOT_READY
```

---

# Phase 5 — Shared Demo Kiosk Dispatch

The Kiosk UI on port `13051` is a frontend application, not a backend command endpoint.

The authoritative path must be:

```text
MES Execution
→ transactional outbox
→ MES Kiosk Gateway
→ WebSocket / offline queue
→ Kiosk UI :13051
```

Do not send HTTP requests directly to the browser.

In demo mode, the Kiosk Gateway may expose all dispatched non-print operations to the configured demo Kiosk regardless of their real Workstation.

Add clear payload metadata:

```json
{
  "workOrderId": "...",
  "workOrderCode": "WO-20260727-0001",
  "woOperationId": "...",
  "sequenceNo": 10,
  "operationCode": "OP-MIX",
  "operationName": {},
  "workCenterId": "...",
  "workstationId": null,
  "dispatchMode": "DEMO_SHARED_KIOSK",
  "status": "READY_FOR_EXECUTION"
}
```

## Kiosk list filtering

Kiosk must not show executable actions for `Draft` Work Orders.

Default executable list:

```text
Released
InProgress
Paused
```

Draft rows may be hidden completely or shown read-only only in an explicit diagnostic mode.

The “Open Execution Operation” action must be disabled for non-executable lifecycle states.

---

# Phase 6 — Durable MES Print Job

When a ready WO operation resolves to `PRINT_STATION`, create a durable MES-owned print execution job.

Recommended tables or equivalent ownership:

```text
wo_print_job
wo_print_job_attempt
wo_print_job_event
```

Required job fields:

```text
id
job_code
work_order_id
wo_operation_id
routing_operation_id
operation_id
workstation_id
print_station_id
adapter_id
output_label_id
template_id
template_version
requested_quantity
status
command_event_id
idempotency_key
correlation_id
causation_id
attempt_count
selected_printer_code
created_at
dispatched_at
started_at
completed_at
failed_at
last_error_code
last_error_message
```

Recommended statuses:

```text
Pending
DispatchQueued
Dispatched
Printing
Completed
Failed
RetryPending
Cancelled
```

Create the job and outbox message in one database transaction.

The job must be the MES correlation owner for the print operation.

---

# Phase 7 — Print Station Readiness Before Dispatch

Before queueing the physical command, resolve:

1. WO operation snapshot requires physical printing.
2. Target Workstation is resolved.
3. Workstation has an active Print Station binding.
4. The binding has positive allocated printer quantity.
5. Print Station lifecycle is Active.
6. Runtime heartbeat is current.
7. Kafka status is Connected.
8. printing service is Connected.
9. active-for-work printer count is positive.
10. ready printer count is positive according to the selected demo policy.
11. station is not in an unrecoverable over-allocation state.

MES must not choose a physical printer ID unless an explicit printer override is required.

Normally:

```text
MES selects Print Station.
Printer Adapter selects a ready physical printer.
```

Return stable readiness errors and keep the operation retryable.

---

# Phase 8 — Publish One Kafka Print Command

Use Kafka only:

```text
station.commands.printer
```

Do not call Printer Adapter HTTP printing endpoints for production execution.

Use the existing event contract where possible, but ensure the envelope contains:

```json
{
  "eventId": "...",
  "eventType": "command.printer.print",
  "occurredAt": "...",
  "source": "mes-execution-service",
  "correlationId": "...",
  "causationId": "...",
  "partitionKey": "PRINT-STATION-01",
  "payload": {
    "printJobId": "...",
    "workOrderId": "...",
    "workOrderCode": "WO-20260727-0001",
    "woOperationId": "...",
    "routingOperationId": "...",
    "operationCode": "OP-PRINT",
    "workstationId": "...",
    "printStationId": "...",
    "adapterId": "...",
    "outputLabelId": "...",
    "templateId": "...",
    "templateVersion": "...",
    "quantity": 1,
    "printerCode": null
  }
}
```

Partition by `printStationId`.

The MES outbox publisher must use:

```text
acks=all
idempotent producer
retry with bounded backoff
```

Never publish fire-and-forget outside the owning database transaction.

---

# Phase 9 — Printer Adapter Execution

Preserve the Adapter’s existing exactly-once protection:

```text
consume command
→ reserve event/command ID in SQLite
→ select a ready printer
→ execute CUPS/TCP print
→ persist result
→ publish result event
→ commit Kafka offset
```

A replayed command must not produce a second physical print.

The result must include:

```text
printJobId
workOrderId
woOperationId
printStationId
adapterId
selectedPrinterCode
commandEventId
resultEventId
printedQuantity
completedAt
errorCode
errorMessage
```

Do not claim success from queue acceptance alone.

Success means the Adapter received a successful response from the configured physical printing path according to the current driver contract.

---

# Phase 10 — Consume Printer Results in MES

Add an independent MES Execution consumer group for printer results.

Consume:

```text
printer.printed
printer.batch.printed
printer.error
```

Use durable event-ID deduplication.

## On printed success

Transactionally:

1. locate the print job by `printJobId` or immutable correlation keys;
2. reject station/operation correlation mismatch;
3. mark the print job `Completed`;
4. record selected printer and printed quantity;
5. create an automatic operation confirmation;
6. close any active print execution session;
7. mark the WO operation `Finished`;
8. queue `MES.Execution.OperationFinished.v1`;
9. determine newly unblocked successor operations;
10. queue their dispatch events;
11. complete the WO if every operation is Finished.

## On printer failure

Transactionally:

1. mark the print job `Failed`;
2. record structured error details;
3. mark the operation `ExecutionError` or keep it `InProgress` with failure state according to the existing lifecycle;
4. notify MES Console and Kiosk;
5. allow an explicit retry/reprint action;
6. do not reject or cancel the entire WO automatically.

Printer failure is not equivalent to WO rejection.

---

# Phase 11 — Operation State Machine

Implement or verify clear states:

```text
Pending
Ready
DispatchQueued
Dispatched
InProgress
Finished
ExecutionError
Cancelled
```

At minimum preserve compatibility with existing persisted statuses.

Required transitions:

```text
Pending
→ Ready when predecessors are Finished

Ready
→ DispatchQueued

DispatchQueued
→ Dispatched

Dispatched
→ InProgress

InProgress
→ Finished on successful Kiosk confirmation or printer result

InProgress
→ ExecutionError on physical print failure
```

All transitions must be idempotent and audited.

A duplicate result event must not complete the operation twice or dispatch successors twice.

---

# Phase 12 — Real-Time UI Updates

Publish state changes through the existing asynchronous path.

## MES Console

Show:

```text
WO lifecycle
operation lifecycle
execution target
dispatch state
print job state
Print Station
selected physical printer
last print result
error and retry action
correlation ID
```

## Kiosk

For normal demo operations, show ready/start/confirm controls.

For print operations, show read-only machine status such as:

```text
Queued for printing
Printing
Printed successfully
Print failed
```

Kiosk must not call the Printer Adapter directly.

Use WebSocket/SignalR projections for continuous state.

Use REST only for initial load and diagnostics.

---

# Phase 13 — Retry and Recovery

Provide explicit retry behavior.

## Before Kafka publish

Retry through MES outbox.

## After command publish but before result

Keep the job `Dispatched` and reconcile using event ID and Adapter command reservation.

Do not issue a second new command automatically without checking the existing command state.

## Physical failure

Allow authorised retry:

```http
POST /api/mes/execution/work-orders/{woId}/operations/{opId}/print-retry
```

A retry should:

- retain the logical print job;
- create a new attempt;
- create a new command event ID;
- retain correlation to the original job;
- preserve complete audit history.

Prevent concurrent retry attempts.

---

# Phase 14 — Full-Flow Verification Script

Create a repeatable script, for example:

```text
scripts/verify-mes-wo-to-physical-print-flow.mjs
```

or use the repository’s preferred language.

The script must support:

```bash
WO_ID=<existing-or-created-id> \
PRINT_STATION_CODE=PRINT-STATION-01 \
EXPECTED_PRINTER_CODE=Zebra-GK420t-CUPS \
npm run verify:mes:wo-physical-print
```

The script must not merely call endpoints.

It must verify every layer.

## Preflight

Check:

- required containers are running;
- MES Execution health;
- MES Master Data health;
- Kiosk Gateway health;
- Kafka health;
- Printer Adapter health;
- CUPS/TCP printer status;
- Print Station runtime projection;
- Workstation binding;
- printer allocation;
- required topics;
- required consumer groups.

## Setup

Either:

- create an isolated demo WO from released master data; or
- safely use an explicitly supplied Draft WO.

The script must not mutate an arbitrary production WO.

## Flow

1. Run Compute & Check.
2. Approve using demo bypass.
3. verify WO becomes `Released`;
4. verify `MES.Execution.WOApproved.v1`;
5. start execution;
6. verify WO becomes `InProgress`;
7. verify normal ready operations appear through Kiosk Gateway;
8. complete required predecessor operations through official APIs;
9. wait until the print operation becomes ready;
10. verify MES creates one print job;
11. verify one outbox record;
12. verify one Kafka print command;
13. verify Printer Adapter consumes it;
14. verify Adapter command reservation exists;
15. verify physical printer receives the job;
16. wait for printer result;
17. verify MES result consumer processes it;
18. verify print job becomes `Completed`;
19. verify WO print operation becomes `Finished`;
20. verify `MES.Execution.OperationFinished.v1`;
21. verify successor operation becomes ready;
22. complete remaining demo operations;
23. verify WO becomes `Completed`;
24. verify `MES.Execution.WOCompleted.v1`.

## Exactly-once test

Replay the same Kafka command record or safely retry the same event ID.

Confirm:

```text
physical print count does not increase
Adapter returns existing result or ignores duplicate
MES does not create another confirmation
successors are not dispatched twice
```

## Failure test

Where safe:

- use an invalid printer/template or temporarily disabled queue;
- verify `printer.error`;
- verify operation does not become Finished;
- restore printer;
- invoke explicit retry;
- verify successful recovery.

---

# Phase 15 — Automated Log Collection

The verification script must collect and timestamp logs from:

```text
mes-execution-service
mes-master-data-service
mes-kiosk-gateway-service
kiosk UI or nginx where relevant
platform-kafka
Station Agent Job Engine if retained
Projection Service
Printer Adapter
CUPS or printer driver
```

Filter logs by:

```text
workOrderId
woOperationId
printJobId
correlationId
commandEventId
resultEventId
```

Write a verification artifact such as:

```text
artifacts/wo-print-e2e/<timestamp>/
├── summary.json
├── timeline.md
├── api-responses/
├── kafka-records/
├── database-checks/
├── container-logs/
└── printer-evidence/
```

Do not include secrets or bearer tokens.

---

# Phase 16 — Iterative Repair Requirement

Run the full-flow script after each relevant change.

When it fails:

1. identify the exact failed stage;
2. inspect the owning service;
3. correct the root cause;
4. rebuild only affected services;
5. rerun from a safe clean fixture;
6. continue until the entire flow passes.

Do not stop after builds pass.

Do not report success when only a simulated printer succeeds if the configured physical printer is available and physical printing was requested.

Do not claim physical success without result-event and MES-state evidence.

---

# Phase 17 — Compatibility and Cleanup

Audit the existing Station Agent Job Engine print producer.

Choose one authoritative production command owner for this MES flow.

Preferred target:

```text
MES Execution durable print job
→ Kafka
→ Printer Adapter
```

If Job Engine remains necessary as an orchestration boundary, MES must send one durable request to Job Engine and Job Engine must remain the only publisher of `command.printer.print`.

Do not allow both MES Execution and Job Engine to publish the same physical command.

Document the final ownership clearly.

Remove or disable obsolete duplicate paths only after the new path passes E2E verification.

---

# Tests

Add automated tests for:

## Demo approval

- strict mode still blocks missing allocation;
- demo mode approves without allocation;
- invalid role still fails;
- stale Production Version still fails;
- bypass audit is persisted.

## Dispatch

- only predecessor-ready operations dispatch;
- non-print operation targets shared demo Kiosk;
- print operation targets Print Station;
- duplicate start does not duplicate dispatch;
- Draft WO never appears as executable.

## Print readiness

- missing binding;
- offline station;
- Kafka disconnected;
- no ready printer;
- zero allocated printer quantity;
- valid ready station.

## Print result

- success completes operation;
- failure does not complete operation;
- duplicate result is idempotent;
- correlation mismatch is rejected;
- successor dispatch occurs once;
- all Finished operations complete the WO.

## Retry

- explicit retry creates one new attempt;
- concurrent retry is blocked;
- original history is retained.

---

# Documentation

Update:

```text
AI_CONTEXT.md
MES Work Order lifecycle documentation
MES Execution README
MES Kiosk Gateway README
Kiosk UI README
Print Station integration documentation
Printer Adapter documentation
Kafka event map
service manifests
troubleshooting guide
```

Document:

- demo bypass boundaries;
- strict production behavior;
- Kiosk demo routing;
- print execution ownership;
- command and result contracts;
- operation state machine;
- retry behavior;
- full-flow verification script;
- exact evidence from the physical print run.

---

# Acceptance Criteria

The task is complete only when:

1. Demo mode can approve a valid WO without resource allocations.
2. Production mode still requires valid allocations.
3. Draft WOs are not executable in Kiosk.
4. One Kiosk UI on port `13051` receives all non-print demo operations through Kiosk Gateway.
5. Print operations are not sent to browser execution.
6. A print operation resolves a real Workstation / Print Station binding.
7. MES creates one durable print job.
8. Exactly one Kafka print command is published.
9. Printer Adapter executes one physical print.
10. A duplicate command does not print again.
11. Printer success returns to MES.
12. MES marks the correct WO operation Finished.
13. Printer failure leaves the operation incomplete and retryable.
14. Successor operations are dispatched according to dependencies.
15. WO reaches Completed only after all operations finish.
16. Full-flow script passes.
17. Correlated logs and database evidence are produced.
18. Builds and automated tests pass.
19. Documentation is updated.
20. No duplicate HTTP/Kafka physical-print path remains.

# Required Final Report

Provide:

## Current-flow audit

- implemented paths;
- missing paths;
- conflicting producers;
- lifecycle issues;
- Kiosk filtering issues.

## Final architecture

- approval policy;
- execution dispatcher;
- shared demo Kiosk;
- print-job ownership;
- Kafka command/result flow;
- operation completion flow.

## Verification evidence

Include:

```text
WO ID
WO operation ID
Print job ID
command event ID
result event ID
Print Station
Adapter ID
physical printer code
printed quantity
MES final operation status
MES final WO status
```

## Full-flow script

Report:

- command used;
- preflight result;
- each stage result;
- exactly-once replay result;
- failure/recovery result;
- artifact directory.

Do not report “implemented and verified” unless a real printer produced the physical output and the correlated success result completed the correct MES WO operation.