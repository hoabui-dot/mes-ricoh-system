# Re-Audit and Complete the Remote MacOS Printer Adapter E2E Verification

## Background

The demo WO execution dispatch and MES-owned print-job flow have been implemented.

The previous implementation report states that physical printing was not tested because MES Print Station readiness returned:

```text
PRINT_STATION_RUNTIME_NOT_READY
ready_printer_count = 0
```

However, the actual deployment architecture must be understood correctly.

The Printer Adapter does not run on the MES server.

It runs independently on a remote MacOS edge host that is physically connected to the printers.

The current architecture is:

```text
MES Server
├── MES Execution Service
├── MES Master Data Service
├── MES Kiosk Gateway
├── Kafka
└── MES runtime projections

Remote MacOS Edge
├── Printer Adapter
├── MacOS CUPS / TCP printer connection
├── physical Zebra printer
└── Kafka producer and consumer
```

The MES server must not require access to a local CUPS queue.

The authoritative physical print path is:

```text
MES Execution
→ Kafka
→ remote Printer Adapter on MacOS
→ MacOS CUPS / TCP
→ physical printer
```

The authoritative result path is:

```text
remote Printer Adapter
→ Kafka printer result
→ MES Execution result consumer
→ WO print job and WO operation completion
```

The Kiosk already receives online printer or adapter state originating from the remote Printer Adapter.

Therefore, at least part of this path is already working:

```text
remote Printer Adapter
→ Kafka heartbeat/status
→ Projection Service or MES runtime projection
→ Kiosk
```

Do not stop the investigation merely because one MES readiness response reports zero ready printers.

Determine why the online signal reaches the Kiosk while MES readiness still blocks physical execution.

---

# Objective

Perform a full evidence-based re-audit and run the actual cross-server print flow.

Required outcomes:

1. Confirm the remote MacOS Printer Adapter is the active adapter instance.
2. Confirm its Kafka producer and consumer connections.
3. Confirm its real physical printer inventory and readiness.
4. Confirm the MES runtime projection is consuming the same adapter events.
5. Resolve any stale, mismatched, or incorrectly mapped readiness state.
6. Run the existing full-flow script from the correct host.
7. Trigger one real physical print through Kafka.
8. Receive the printer result back in MES.
9. Confirm the correct WO operation is completed.
10. Produce a report based on runtime evidence rather than assumptions.

Do not replace the remote printer with a local simulator unless explicitly running a separate simulator test.

Do not require CUPS on the MES server.

Do not add an HTTP print path.

Kafka remains authoritative.

---

# Architecture Mindset

Use this ownership model:

## MES owns

```text
Work Order
WO Operation
execution target
Workstation
Print Station binding
Print Station readiness projection
durable print job
Kafka command outbox
printer-result consumer
operation completion
```

## Remote MacOS Edge owns

```text
Printer Adapter runtime
printer registry
CUPS queues
TCP printer endpoints
physical printer status
physical print execution
command idempotency
selected physical printer
printer result publication
```

## Kafka owns transport only

Kafka is not the source of business state.

It carries:

```text
commands
heartbeats
status events
print success events
print failure events
```

The browser and Kiosk UI must never directly call the Printer Adapter for production printing.

---

# Phase 1 — Verify the Actual Running Topology

Inspect the running runtime on both hosts.

## MES server

Verify:

```text
mes-execution-service
mes-master-data-service
mes-kiosk-gateway-service
kiosk-operator-ui
platform-kafka
Kafka topics
Kafka consumer groups
MES databases
```

## Remote MacOS host

Verify:

```text
Printer Adapter container/process
Printer Adapter version/image
Printer Adapter configuration
Kafka bootstrap servers
PRINT_STATION_ID
PRINTER_ADAPTER_ID
CUPS server configuration
real printer queue
printer status
Adapter health endpoint
Adapter logs
```

Record:

```text
host
container/process name
image and tag
service version
environment values excluding secrets
Kafka client ID
Kafka group ID
Print Station ID
Adapter ID
printer code
printer queue
```

Ensure there is no stale Printer Adapter container running with old environment values.

---

# Phase 2 — Correlate the Online Signal Seen by Kiosk

The Kiosk already displays an online signal.

Trace that signal completely.

Identify:

1. exact Kafka event type;
2. source service;
3. adapter ID;
4. Print Station ID;
5. printer code;
6. event timestamp;
7. Kafka topic;
8. partition and offset;
9. projection consumer;
10. database projection row;
11. Kiosk API/WebSocket payload.

Determine whether the Kiosk online state represents:

```text
adapter online
printer registered
printer online
printer ready
Kafka connected
CUPS connected
```

These states must not be treated as equivalent.

Produce a state matrix:

| State | Runtime value | Source event | Timestamp |
|---|---:|---|---|
| Adapter online | | | |
| Kafka connected | | | |
| CUPS connected | | | |
| Printer registered | | | |
| Printer online | | | |
| Printer ready | | | |
| Active for work | | | |

Do not infer printer readiness from adapter heartbeat alone.

---

# Phase 3 — Investigate `ready_printer_count = 0`

Trace the complete calculation of:

```text
registered_printer_count
online_printer_count
ready_printer_count
active_for_work_printer_count
busy_printer_count
offline_printer_count
error_printer_count
```

Inspect:

- Printer Adapter source event payload;
- Kafka record;
- event deserialization;
- MES runtime consumer;
- runtime projection update;
- readiness endpoint;
- Kiosk projection;
- stale-heartbeat evaluation;
- time zone and UTC conversion;
- naming and casing mappings;
- null/default handling.

Check for common causes:

```text
Adapter emits PascalCase but MES expects camelCase
Adapter uses printerCount while MES expects registeredPrinterCount
Printer online is not mapped to ready
active_for_work flag is missing
heartbeat timestamp is parsed incorrectly
projection is reading an old adapter instance
station ID mismatch
adapter ID mismatch
Workstation is bound to another Print Station ID
runtime row is stale
multiple runtime rows exist
Kiosk reads Projection Service while MES reads another projection
MacOS CUPS queue is online but paused
printer is accepting jobs but marked disabled
old container reports offline after new container reports online
out-of-order event overwrites newer state
```

Compare the latest event timestamp before updating state.

An older offline/status event must not overwrite a newer online event.

---

# Phase 4 — Verify Remote Printer Adapter Readiness Directly

From the MacOS edge host, verify the physical printing layer.

Run the appropriate checks:

```bash
lpstat -p
lpstat -v
lpstat -a
lpoptions -p <printer>
```

Also inspect:

```text
CUPS queue enabled
CUPS queue accepting jobs
printer not paused
printer device URI
USB/TCP reachability
paper/media state
driver state
printer error state
```

Call Printer Adapter diagnostics:

```text
health
printer list
printer detail
Kafka status
last heartbeat
last status event
last consumed command
last published result
```

A printer should be `Ready` only if the actual Adapter readiness rules pass.

If the Adapter reports online but not ready, report the exact failed readiness condition.

Do not change MES validation merely to force a pass.

Fix the actual edge state or an incorrect mapping.

---

# Phase 5 — Verify Kafka Connectivity Across Servers

Confirm that both MES and the remote MacOS Adapter connect to the same Kafka cluster and listener.

Verify:

```text
bootstrap server
advertised listener
DNS/IP
port
security protocol
topic names
consumer group
ACLs
partition assignment
consumer lag
```

Required command topic:

```text
station.commands.printer
```

Required result topic:

```text
station.events.printer
```

Confirm the remote Adapter is actively subscribed to the command topic.

Do not treat successful heartbeat publishing as proof that command consumption works.

Publishing and consuming may fail independently due to:

```text
different credentials
different listener
wrong consumer group
wrong topic
ACL differences
deserialization errors
no partition assignment
offset position
event-type header mismatch
```

---

# Phase 6 — Inspect the Verification Script Assumptions

Audit:

```text
scripts/verify-mes-wo-to-physical-print-flow.mjs
```

Determine why the previous AI said it could not run the script.

Check whether the script incorrectly assumes:

```text
Printer Adapter is local
CUPS is local
localhost resolves the Adapter
Docker container names exist on the MES server
MacOS files are directly accessible
printer logs are local
```

The script must support a remote Adapter deployment.

Introduce or verify configuration such as:

```text
MES_BASE_URL
MASTER_DATA_BASE_URL
KIOSK_GATEWAY_BASE_URL
KAFKA_BOOTSTRAP_SERVERS
PRINT_STATION_CODE
PRINTER_ADAPTER_BASE_URL
PRINTER_ADAPTER_HOST_MODE=remote
EXPECTED_PRINTER_CODE
REMOTE_ADAPTER_LOG_MODE
```

The script may call remote Adapter health and diagnostic APIs.

It must not require shell access to the MacOS host for the core test.

Optional SSH-based log collection may be supported separately when credentials are explicitly provided.

Core E2E success must be verifiable through:

```text
MES APIs
Kafka records
MES database state
Adapter diagnostic API
printer result events
```

---

# Phase 7 — Run the Script from the Correct Host

The full-flow script should normally run from the MES repository host because it owns:

```text
MES APIs
WO database checks
Kafka inspection
Kiosk Gateway
execution logs
```

The Printer Adapter remains remote.

Example:

```bash
MES_BASE_URL=http://localhost:13030 \
MASTER_DATA_BASE_URL=http://localhost:13020 \
KIOSK_GATEWAY_BASE_URL=http://localhost:13050 \
PRINTER_ADAPTER_BASE_URL=http://<MACOS_IP>:5003 \
KAFKA_BOOTSTRAP_SERVERS=<KAFKA_IP>:19092 \
PRINT_STATION_CODE=PRINT-STATION-01 \
EXPECTED_PRINTER_CODE=Zebra-GK420t-CUPS \
MES_DEMO_BYPASS_RESOURCE_ALLOCATION=true \
npm run verify:mes:wo-physical-print
```

Adapt ports to the real runtime.

Do not use `localhost:5003` unless the script is actually running on the MacOS Adapter host.

---

# Phase 8 — Execute a Safe Diagnostic Kafka Command

Before using a WO, run a controlled diagnostic command through the same Kafka path.

The diagnostic must:

1. create one unique event ID;
2. target the actual Print Station ID;
3. use a known valid template;
4. use quantity `1`;
5. publish to `station.commands.printer`;
6. confirm the remote Adapter consumes it;
7. confirm Adapter SQLite command reservation;
8. confirm physical print;
9. confirm success event;
10. confirm duplicate replay does not print again.

Do not use the diagnostic as the final WO acceptance proof.

It is only used to isolate Kafka/Adapter/printer issues.

---

# Phase 9 — Execute the Full MES WO Flow

Use a dedicated safe demo Work Order.

Required sequence:

1. create or identify a valid Draft WO;
2. run Compute & Check;
3. approve with explicit demo bypass;
4. confirm WO is Released;
5. start execution;
6. complete predecessor Kiosk operations;
7. confirm the print operation becomes ready;
8. verify the execution target resolves to `PRINT_STATION`;
9. verify the correct Workstation binding;
10. verify the correct Print Station;
11. create one durable MES print job;
12. create one outbox command;
13. publish one Kafka command;
14. confirm remote Adapter consumption;
15. confirm the physical printer outputs the label;
16. receive `printer.printed`;
17. consume the result in MES;
18. mark the print job Completed;
19. mark the correct WO operation Finished;
20. dispatch successor operations;
21. finish remaining operations;
22. confirm WO Completed.

Record every ID:

```text
WO ID
WO code
WO operation ID
routing operation ID
print job ID
attempt ID
command event ID
Kafka partition
Kafka offset
result event ID
Print Station ID
Adapter ID
printer code
correlation ID
```

---

# Phase 10 — Verify Result Contract Compatibility

Inspect the exact Adapter result event.

Ensure MES accepts both the real event shape and expected naming conventions.

Required correlation fields:

```text
printJobId or job_id
workOrderId
woOperationId
commandEventId
resultEventId
printStationId
adapterId
selectedPrinterCode
printedQuantity
status
completedAt
errorCode
errorMessage
```

If the Adapter currently publishes legacy field names, implement an explicit compatibility mapper.

Do not silently default missing IDs.

A result without enough correlation must go to DLQ or error state, not complete an arbitrary WO operation.

---

# Phase 11 — Check Consumer Groups and Lag

Verify the following independently:

## Printer Adapter command consumer

```text
topic: station.commands.printer
assigned partition
current offset
lag
last consumed event
last handler error
```

## MES printer-result consumer

```text
group: mes-execution-printer-results
topic: station.events.printer
assigned partition
current offset
lag
last consumed result
last committed result
last handler error
```

## Runtime projection consumer

```text
topic: station.events.printer
independent consumer group
last heartbeat/status event
projection update
```

These consumers must not accidentally share the same group when they require independent copies.

---

# Phase 12 — Reconcile Kiosk and MES Projection Differences

If Kiosk reports online but MES readiness reports offline or zero ready printers:

1. identify which service the Kiosk reads;
2. identify which database or projection it uses;
3. compare its latest event ID and timestamp with MES Master Data;
4. compare station and adapter identity;
5. compare readiness calculation rules;
6. correct the projection divergence.

There must be one consistent source contract for adapter and printer runtime data.

Different UIs may present different summaries, but they must derive from compatible facts.

---

# Phase 13 — Physical Evidence

Physical printing must not be claimed from a Kafka success alone.

Collect evidence such as:

```text
Adapter consumed command log
Adapter SQLite reservation
CUPS job ID
CUPS completed status
printer-selected code
printer result event
MES consumed result
WO operation Finished
```

Where practical, also record:

```text
printed label identifier
template code/version
output label ID
printed timestamp
```

Do not include secrets.

---

# Phase 14 — Failure and Recovery

Run at least one controlled failure test where safe:

```text
pause printer queue
or
use an invalid template
```

Verify:

```text
printer.error published
MES print job becomes Failed
WO operation does not become Finished
retry remains available
```

Then restore the printer and run explicit retry.

Verify:

```text
new attempt created
new command event ID
same logical print job
physical print succeeds
operation finishes once
```

---

# Phase 15 — Exactly-Once Verification

Replay the original command event ID.

Confirm:

```text
Adapter reservation already exists
no second physical print
no second successful MES confirmation
no duplicate successor dispatch
no duplicate WO completion
```

The result may be replayed, but MES event deduplication must prevent duplicate state transitions.

---

# Phase 16 — Logging and Timeline

Generate one correlated timeline:

```text
T0 MES print job created
T1 outbox row committed
T2 Kafka command published
T3 Adapter consumed command
T4 Adapter reserved command ID
T5 CUPS job accepted
T6 physical print completed
T7 printer result published
T8 MES result consumed
T9 print job completed
T10 WO operation finished
T11 successor dispatched
```

Collect logs from:

```text
mes-execution-service
mes-master-data-service
mes-kiosk-gateway-service
Kafka
Printer Adapter
Projection Service
CUPS
```

Use correlation IDs rather than only timestamps.

---

# Phase 17 — Report Corrections

Rewrite the implementation report after runtime verification.

The report must distinguish:

```text
Adapter online
Printer online
Printer ready
CUPS accepting jobs
Kafka command consumer active
Physical print verified
Printer result consumed by MES
WO operation completed
```

Do not use a single “online” status to represent all layers.

If physical printing still fails, report the exact lowest failing layer.

Example:

```text
Kafka connectivity: PASS
Adapter command consumption: PASS
Command idempotency reservation: PASS
CUPS queue acceptance: FAIL
Physical printer output: NOT REACHED
MES result consumption: NOT REACHED
```

Do not report only:

```text
PRINT_STATION_RUNTIME_NOT_READY
```

without showing why the runtime was not ready.

---

# Acceptance Criteria

The investigation is complete only when:

1. The real remote MacOS Adapter instance is identified.
2. The Kiosk online signal is traced to its exact source event.
3. MES and Kiosk runtime projections are compared.
4. The reason for `ready_printer_count=0` is proven.
5. The verification script supports a remote Adapter.
6. The script runs from the MES host without requiring local CUPS.
7. Kafka command publication is verified.
8. Remote Adapter command consumption is verified.
9. Physical CUPS/TCP printing is verified.
10. The result event returns through Kafka.
11. MES consumes the result.
12. The correct WO operation becomes Finished.
13. Duplicate command replay does not print twice.
14. Failure and explicit retry are verified.
15. The implementation report contains a correlated timeline and exact failure/success evidence.

# Required Final Report

Provide:

## Runtime topology

- MES host;
- Kafka listener;
- remote MacOS Adapter host;
- Adapter ID;
- Print Station ID;
- printer code;
- CUPS queue.

## Online-state trace

- source event;
- topic;
- event ID;
- timestamp;
- consumer;
- projection;
- Kiosk payload.

## Readiness diagnosis

Report each state separately:

```text
Adapter
Kafka
CUPS
Printer registered
Printer online
Printer ready
Active for work
MES projection freshness
```

## Script execution

Report:

```text
host where script ran
environment used
WO ID
print job ID
command event ID
result event ID
physical printer
final operation status
final WO status
```

## Exactly-once evidence

- first physical print;
- replay attempt;
- Adapter reservation;
- unchanged physical print count;
- MES deduplication result.

## Remaining issue

If the flow still fails, report the exact failing component and evidence.

Do not report that the script cannot run merely because the Printer Adapter is on another server. The current architecture is explicitly designed for remote Kafka-connected Printer Adapter execution.