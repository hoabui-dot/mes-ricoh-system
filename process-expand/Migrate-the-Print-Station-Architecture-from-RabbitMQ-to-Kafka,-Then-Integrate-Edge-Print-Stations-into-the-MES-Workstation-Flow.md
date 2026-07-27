# Migrate the Print Station Architecture from RabbitMQ to Kafka, Then Integrate Edge Print Stations into the MES Workstation Flow

## Background

The current printing platform uses RabbitMQ as the internal event bus for the Station Agent and the independently deployed Printer Adapter.

Current print transport includes events such as:

```text
command.printer.print
command.printer.print.batch

printer.printed
printer.batch.printed
printer.heartbeat
printer.status.changed
printer.error

The current architecture already supports:

independently deployed Printer Adapter
remote broker connectivity
physical printer execution through CUPS or TCP
printer heartbeat and status events
Job Engine orchestration
Projection Service read models
SignalR updates to Kiosk
idempotent physical print execution
SQLite outbox and local persistence

The target architecture changes the messaging platform from RabbitMQ to Kafka and completely removes RabbitMQ from the active Print Station runtime.

After the Kafka migration is completed and verified, integrate Print Stations into the MES Workstation flow using the following business model:

1 connected Edge Print System
=
1 MES Print Workstation

However, keep the technical entities separated:

MES Workstation
↔ 1:1 active binding
Edge Print Station
→ Printer Adapter
→ N physical printers

The printers inside an Edge Print Station are internal execution capacity for the single bound Workstation.

They must not be shared with another Workstation under this model.

Final Target Architecture
MES
├── Workstation master data
├── Print Station master data
├── Workstation ↔ Print Station binding
├── Print Station runtime projection
├── readiness and allocation
└── Kafka

                        ▲
                        │ Kafka events and commands
                        ▼

Edge Print Station
├── Station Gateway
├── Job Engine
├── Projection Service
├── Kiosk
├── Printer Adapter
├── CUPS / TCP drivers
└── N physical printers

The final production flow is:

MES Work Order
→ Work Order Operation
→ allocated MES Workstation
→ resolve bound Edge Print Station
→ validate edge readiness
→ publish print command through Kafka
→ Printer Adapter selects one ready printer
→ physical print
→ publish print result and runtime events
→ update MES and Kiosk projections
Critical Execution Order

This work must be completed in two strictly ordered phases.

Phase 1

Migrate the complete Print Station event architecture from RabbitMQ to Kafka.

RabbitMQ must not be removed until Kafka parity is proven.

Phase 2

Integrate the final Edge Print Station model into the MES Workstation business flow.

Do not begin destructive RabbitMQ removal before all Kafka acceptance gates pass.

Do not implement the MES Workstation changes on top of a partially migrated or unstable messaging flow.

Mandatory Source-of-Truth Audit

Before modifying code, inspect the real repository and running runtime.

Read the project AI context files first, then verify all claims against:

running source code
service manifests
Docker Compose files
database migrations and schemas
event contracts
producers and consumers
outbox workers
runtime logs
tests
implementation records

Audit at minimum:

Station Gateway
Job Engine
Printer Adapter
Projection Service
Kiosk UI
Device Simulator
Laser Adapter
Vision Service
PLC Adapter
shared contracts
RabbitMQ infrastructure
Kafka infrastructure
Schema Registry
Docker Compose
MES master-data service
MES execution service
MES Console
Print Station migrations
Workstation forms
resource readiness
resource allocation

Create an evidence matrix for every current RabbitMQ route.

For each route record:

routing key
producer
consumer
payload contract
exchange
queue
durability
acknowledgement behaviour
retry behaviour
dead-letter behaviour
idempotency behaviour
outbox ownership
projection side effects
SignalR side effects
test coverage
runtime evidence

Do not assume RabbitMQ is used only for printing.

Search all source, Compose, environment files, documentation, and tests for:

RabbitMQ
RabbitMq
RABBITMQ_
station.events
BasicPublish
BasicConsume
IConnection
IModel
ExchangeDeclare
QueueDeclare
rabbitmqctl
15672
15673
5672
5673
Phase 1 — Kafka Migration
1.1 Migration Objective

Replace RabbitMQ with Kafka as the active message transport for the entire Print Station event architecture.

The final active runtime must contain no RabbitMQ broker, no RabbitMQ client dependency, no RabbitMQ workers, and no RabbitMQ configuration.

Kafka must provide equivalent or stronger behaviour for:

asynchronous command delivery
event publishing
consumer isolation
replay safety
idempotency
retry handling
dead-letter handling
reconnect
observability
projection updates
Kiosk real-time state
offline recovery
1.2 Do Not Perform a Blind Transport Rewrite

RabbitMQ queues and Kafka consumer groups have different semantics.

Do not map:

RabbitMQ queue
=
Kafka topic

without analysing ownership.

Design Kafka topology according to business event ownership.

Recommended initial topic model:

station.commands.printer
station.events.printer
station.events.jobs
station.events.devices
station.events.production
station.events.integration
station.dlq

A more granular model is acceptable if consistent with existing platform conventions.

At minimum, preserve the logical contracts for:

command.printer.print
command.printer.print.batch

printer.printed
printer.batch.printed
printer.heartbeat
printer.status.changed
printer.error

Prefer versioned Kafka event names or headers, for example:

PrintCommandRequested.v1
PrintBatchCommandRequested.v1
PrinterPrinted.v1
PrinterBatchPrinted.v1
PrinterHeartbeat.v1
PrinterStatusChanged.v1
PrinterError.v1

Do not rename contracts without either:

a compatibility adapter, or
a controlled migration plan.
1.3 Kafka Message Envelope

Use or extend the platform’s existing Kafka envelope conventions.

The envelope should contain:

{
  "eventId": "uuid-or-ulid",
  "eventType": "PrinterHeartbeat.v1",
  "eventVersion": 1,
  "occurredAt": "2026-07-27T00:00:00Z",
  "source": "printer-adapter",
  "correlationId": "uuid",
  "causationId": "uuid",
  "stationId": "PRINT-STATION-01",
  "workstationId": "WS-PRINT-01",
  "partitionKey": "PRINT-STATION-01",
  "payload": {}
}

Do not embed secrets.

Preserve existing event IDs when migrating existing outbox records or compatibility paths.

1.4 Partitioning Strategy

Define partition keys explicitly.

Recommended:

Printer command:
partition key = printStationId

Printer-specific status:
partition key = printerCode

Job result:
partition key = jobId or productionOrderNo

Print Station runtime:
partition key = printStationId

The chosen key must preserve ordering where required.

For one Edge Print Station:

commands for the same station
→ ordered within one Kafka partition

Do not rely on global ordering.

1.5 Consumer Groups

Each service must use its own consumer group.

Examples:

printer-adapter
job-engine-printer-results
projection-service-printer-events
kiosk-monitoring-projection
station-integration

Projection Service and Job Engine must receive independent copies of the same result event.

They must not share one consumer group when both need the event.

The Printer Adapter command consumer group must be isolated from monitoring consumers.

1.6 Kafka Configuration

Support the platform’s existing conventions where available.

At minimum:

KAFKA_BOOTSTRAP_SERVERS
KAFKA_CLIENT_ID
KAFKA_GROUP_ID
KAFKA_SECURITY_PROTOCOL
KAFKA_SASL_MECHANISM
KAFKA_SASL_USERNAME
KAFKA_SASL_PASSWORD
KAFKA_SSL_CA_LOCATION
KAFKA_SCHEMA_REGISTRY_URL
KAFKA_AUTO_OFFSET_RESET
KAFKA_ENABLE_IDEMPOTENCE

Printer Adapter identity must be stable and configurable:

PRINT_STATION_ID=PRINT-STATION-01
PRINTER_ADAPTER_ID=PRINT-ADAPTER-01

Do not use IP address as identity.

1.7 Kafka Producer Reliability

Configure producers for safe delivery.

Required characteristics:

acks=all
enable.idempotence=true
appropriate retries
bounded delivery timeout
compression where useful

Preserve transactional outbox behaviour.

The recommended flow remains:

business transaction
→ local SQLite outbox
→ Kafka outbox publisher

Do not replace durable outbox publishing with fire-and-forget Kafka publishing.

Outbox records must track:

pending
published
failed
retry count
next retry
Kafka topic
partition
offset
published timestamp
last error
1.8 Kafka Consumer Reliability

For each consumer:

consume message
validate envelope and contract
reserve idempotency key
execute business transaction
commit local database changes
commit Kafka offset only after safe processing

Do not commit offsets before physical print execution is safely accounted for.

For physical printing:

reserve command ID durably
→ execute physical I/O
→ persist result
→ publish result event
→ commit command offset

The existing unique command execution reservation must be retained.

A redelivered Kafka record must not print twice.

1.9 Retry and Dead-Letter Strategy

Design retries by failure type.

Retriable
temporary Kafka issue
temporary CUPS issue
temporary TCP printer issue
temporary database lock
temporary downstream dependency issue
Non-retriable
invalid payload
unknown event version
missing target station
missing printer configuration
invalid template
cross-station command

Use either:

retry topics

or:

consumer-local retry with bounded backoff

according to platform standards.

Provide dead-letter topics, for example:

station.commands.printer.retry.1
station.commands.printer.retry.2
station.commands.printer.dlq
station.events.printer.dlq

DLQ records must retain the original envelope plus sanitised failure metadata.

1.10 Convert All Producers and Consumers

Audit and migrate every RabbitMQ integration.

At minimum:

Station Gateway

Replace RabbitMQ outbox publishing with Kafka publishing.

Job Engine

Migrate:

production-order input consumption
print command publishing
printer result consumption
manual reprint events
job lifecycle events
outbox worker
Printer Adapter

Migrate:

single print command consumption
batch print command consumption
print result publishing
heartbeat publishing
status publishing
error publishing
Projection Service

Migrate all event consumption.

Ensure it receives:

printer heartbeat
printer status
printer error
single print result
batch print result
job events
production events
device events
Kiosk

Kiosk must continue using Projection Service and SignalR.

Do not make Kiosk consume Kafka directly in the browser.

Other Station services

Audit and migrate:

Laser Adapter
Vision Service
PLC Adapter
Device Simulator
manual override flows
alarm events

Do not remove RabbitMQ while any active workflow still depends on it.

1.11 Dual-Run Migration Strategy

Use a controlled migration.

Recommended stages:

Stage A — Kafka infrastructure ready
topics created
ACLs configured
Schema Registry compatible
health checks passing
Stage B — Dual publish

Existing producers publish to both RabbitMQ and Kafka.

Consumers still use RabbitMQ as authoritative.

Compare:

event count
payload hash
ordering
latency
failures
duplicates
Stage C — Shadow Kafka consumers

Kafka consumers process into shadow diagnostics without mutating authoritative state.

Compare Kafka outcomes with RabbitMQ outcomes.

Stage D — Consumer cutover

Move one consumer at a time to Kafka.

Suggested order:

heartbeat and status projection
non-critical monitoring events
print result projection
Job Engine result consumption
Printer Adapter command consumption
production-order command flow
remaining device workflows
Stage E — Kafka authoritative

Stop RabbitMQ publishing while keeping RabbitMQ broker temporarily available for rollback.

Run complete regression tests.

Stage F — RabbitMQ removal

Only after all gates pass:

down RabbitMQ
remove RabbitMQ container
remove volumes if safely disposable
remove Compose service
remove ports
remove environment variables
remove client packages
remove runtime workers
remove health checks
remove obsolete documentation

Do not skip directly to Stage F.

1.12 Continuous Verification During Migration

After every producer or consumer migration:

build affected service
run unit tests
run integration tests
restart only affected service
inspect logs
verify Kafka topic consumption
verify offsets
verify database mutation
verify projection
verify SignalR
verify no duplicate event
verify no duplicate physical print

Maintain a migration ledger:

event
producer migrated
consumer migrated
dual-publish verified
shadow verified
cutover verified
RabbitMQ dependency removed
1.13 Kafka Observability

Expose:

producer status
consumer status
assigned partitions
consumer lag
last produced event
last consumed event
last committed offset
reconnect count
latest error
DLQ count

Update Printer Adapter Monitoring UI to replace RabbitMQ monitoring with Kafka monitoring.

The UI should show:

Kafka bootstrap connectivity
client ID
consumer group
assigned partitions
consumer lag
command topic
result topic
heartbeat topic
last command consumed
last event published

Never expose Kafka credentials.

1.14 Kafka Health Endpoints

Update health endpoints.

Example Printer Adapter health:

{
  "service": "printer-adapter",
  "status": "Healthy",
  "kafka": {
    "status": "Connected",
    "clientId": "PRINT-ADAPTER-01",
    "consumerGroup": "printer-adapter",
    "assignedPartitions": 2,
    "consumerLag": 0
  },
  "cups": {
    "status": "Connected"
  },
  "printers": {
    "registered": 3,
    "online": 3,
    "ready": 2,
    "busy": 1,
    "offline": 0,
    "error": 0
  }
}

The service must become Degraded when Kafka is unavailable.

1.15 RabbitMQ Removal

After Kafka is authoritative and all verification gates pass:

Run:

docker compose stop rabbitmq
docker compose rm -f rabbitmq

Use the actual service/container name.

Then remove RabbitMQ from:

all Compose files
environment files
Docker networks
health dependencies
service startup ordering
monitoring UI
CI pipelines
test containers
source packages
application configuration
README files
AI context
deployment scripts

Search again for all RabbitMQ references.

Remaining references must be classified as:

historical documentation
migration record
or unintended residual dependency

No active runtime reference is allowed.

Remove RabbitMQ volumes only after proving they contain no required business state.

RabbitMQ queues must not be considered authoritative storage.

1.16 Phase 1 Acceptance Tests
Contract tests
every migrated event serialises correctly
schema compatibility passes
old and new payload parity is verified
unsupported versions fail safely
Producer tests
Kafka unavailable
reconnect
outbox retry
duplicate publish
idempotent producer
topic missing
authentication failure
Consumer tests
duplicate record
offset replay
restart before commit
poison message
retry topic
DLQ
partition rebalance
consumer recovery
Physical print tests
one command prints once
replaying same record does not print twice
consumer restart does not duplicate print
print result reaches Job Engine
print result reaches Projection Service
Kiosk updates through SignalR
heartbeat continues
printer status changes continue
Full E2E
MES/Station Gateway
→ Kafka
→ Job Engine
→ Kafka
→ Printer Adapter
→ physical/simulated printer
→ Kafka
→ Job Engine
→ Projection Service
→ SignalR
→ Kiosk

Run with:

simulation printer
CUPS printer where safe
TCP printer where available
1.17 Phase 1 Hard Acceptance Gate

Do not start Phase 2 until all conditions are true:

all active RabbitMQ events have Kafka equivalents
all producers are migrated
all consumers are migrated
Printer Adapter prints exactly once after replay testing
Job Engine state is correct
Projection Service state is correct
Kiosk real-time updates work
Kafka lag is observable
reconnect works
DLQ works
RabbitMQ can be stopped without runtime errors
all Station services remain healthy after RabbitMQ removal
no active RabbitMQ client dependency remains
all Compose files validate
all builds and tests pass
runtime smoke tests pass
Phase 2 — Integrate Edge Print Stations into the MES Workstation Flow
2.1 Final Business Model

Adopt this invariant:

1 connected Edge Print System
=
1 MES print Workstation

Technical model:

MES Workstation
↔ one active Edge Print Station binding

Edge Print Station
→ one Printer Adapter runtime
→ zero or many physical printers

Business rules:

One Workstation has at most one active Edge Print Station.
One Edge Print Station has at most one active Workstation.
All printers inside the edge belong to that Workstation’s internal print capacity.
Printers are not shared with another Workstation.
The edge selects the physical printer for each print command.

Do not merge Workstation and Print Station into one table.

2.2 Preserve Existing MES Resource Architecture

Keep:

Site
→ Production Area / Shopfloor
→ Work Center
→ Workstation
→ physical Machine / Equipment requirements

Workstation remains the MES execution point.

Print Station remains the edge runtime/integration resource.

Routing continues to reference Work Center.

Work Order allocation continues to select Workstation.

Print Station is resolved after or as part of Workstation readiness/allocation.

2.3 MES Entity Model
Workstation

Existing master data.

Do not add Kafka, CUPS, printer count, adapter version, or heartbeat fields directly to Workstation.

Print Station master

Reuse or update:

md_print_station

Recommended fields:

id
code
localized name
description
site_id
shopfloor_id
station_identity
adapter_identity
deployment_mode
capabilities
gateway_url if still required
lifecycle_status
active_flag
created_at
updated_at
Runtime projection

Create or update a dedicated runtime projection:

print_station_runtime_projection

Fields:

print_station_id
adapter_instance_id
runtime_status
kafka_status
printing_service_status
registered_printer_count
online_printer_count
ready_printer_count
busy_printer_count
offline_printer_count
error_printer_count
software_version
last_heartbeat_at
last_inventory_changed_at
last_status_changed_at
latest_error
observed_at

Do not mix master lifecycle status with runtime status.

Example:

Lifecycle: Active
Runtime: Offline

is valid.

2.4 Workstation–Print Station Binding

Reuse or update:

md_workstation_print_station_binding

Enforce effective-dated active 1:1 semantics.

Required rules:

one active binding per Workstation
one active binding per Print Station
same Site
compatible Shopfloor
active lifecycle
no overlapping active periods
historical bindings are retained
binding replacement is transactional
binding changes do not mutate historical Work Orders

Prefer partial unique indexes where supported.

2.5 Edge Registration and Identity

Implement a controlled registration flow.

Recommended:

MES creates Print Station registration
→ edge starts with station registration token
→ edge registers station ID and adapter ID
→ MES verifies identity
→ edge starts publishing Kafka heartbeat and inventory events
→ MES runtime projection becomes visible
→ user binds edge to Workstation

Identity must not depend on:

IP
hostname
container name
Kafka connection ID

Use stable:

printStationId
adapterId
2.6 Edge Runtime Events

Implement Kafka events for the edge.

Print Station registered
PrintStationRegistered.v1
Print Station heartbeat
PrintStationHeartbeat.v1

Example:

{
  "printStationId": "PRINT-STATION-01",
  "adapterId": "PRINT-ADAPTER-01",
  "runtimeStatus": "ONLINE",
  "kafkaStatus": "CONNECTED",
  "printingServiceStatus": "CONNECTED",
  "printers": {
    "registered": 3,
    "online": 3,
    "ready": 2,
    "busy": 1,
    "offline": 0,
    "error": 0
  },
  "softwareVersion": "1.0.0",
  "observedAt": "2026-07-27T00:00:00Z"
}
Inventory changed
PrintStationInventoryChanged.v1

Publish when:

printer added
printer removed
printer configuration changed
printer activated/deactivated
printer template binding changed
Runtime status changed
PrintStationStatusChanged.v1
Printer status changed
PrinterStatusChanged.v1

Do not publish the complete inventory every few seconds.

Heartbeat should carry summary counts.

Inventory events should carry detailed device changes.

2.7 Ready Printer Semantics

Define printer states carefully.

Registered
Online
Ready
Busy
Offline
Error
Maintenance
Disabled

A printer is Ready only when all required conditions pass, for example:

registered
online
active for production
not busy
not in maintenance
valid driver connection
printing service ready
required template available where applicable

Do not treat Online as automatically Ready.

2.8 MES Print Station Page

Add or update:

Integration / Print Stations

Each row represents one connected edge system.

Display:

Code
Name
Site
Shopfloor
Station ID
Adapter ID
Bound Workstation
Lifecycle Status
Runtime Status
Kafka Status
Printing Service Status
Registered Printers
Online Printers
Ready Printers
Busy Printers
Error Printers
Software Version
Last Heartbeat
Latest Error

Example:

PRINT-STATION-01
WS-PRINT-01
Online
Kafka Connected
3 registered
2 ready
1 busy

Detail sections:

Overview
Workstation Binding
Runtime Health
Printers
Kafka Connectivity
Events
Health History

The MES page is for business configuration and operational visibility.

Do not duplicate all low-level Printer Adapter configuration.

2.9 Workstation Form Changes

The Workstation form must contain two independent resource sections.

Physical Machine Requirements

Keep the existing Machine Group and physical-unit requirement flow.

Only Machine, Equipment, or Machine Unit resources may be selected here.

Print Stations and printers must never appear in this picker.

Print Station / Edge Integration

Add a separate selector.

Example:

Print Station

PRINT-STATION-01
Adapter: PRINT-ADAPTER-01
Runtime: Online
Kafka: Connected
Printers: 3 registered / 2 ready
Last heartbeat: 10 seconds ago
Site: SITE-01
Shopfloor: SF-01

Filter candidates by:

same Site
compatible Shopfloor
active lifecycle
capability includes PRINT
not actively bound to another Workstation
registered edge identity

Runtime offline stations may be selectable only according to business policy, but must show warnings.

2.10 Workstation Resource Mode

Add or reuse a classification:

PHYSICAL_EQUIPMENT
EDGE_PRINT_STATION
HYBRID
NONE

The mode must not replace the underlying relationships.

It only validates and describes the configuration.

Rules:

PHYSICAL_EQUIPMENT
→ machine requirements required
→ print station absent

EDGE_PRINT_STATION
→ print station required
→ machine requirements optional/empty according to policy

HYBRID
→ both allowed or required

NONE
→ neither required

For a dedicated print Workstation:

Mode = EDGE_PRINT_STATION
Machine Requirements = empty
Print Station = required
2.11 Workstation Readiness

Extend current MES resource readiness.

For a Workstation requiring an Edge Print Station, validate:

binding exists
binding is active and effective
Print Station lifecycle active
same Site
compatible Shopfloor
edge heartbeat current
runtime online
Kafka connected
printing service connected
registered printers > 0
ready printers >= minimum required
no critical edge error
required printing capability exists

Return:

READY
READY_WITH_WARNINGS
BLOCKED

Suggested blocking codes:

PRINT_STATION_BINDING_MISSING
PRINT_STATION_INACTIVE
PRINT_STATION_OFFLINE
PRINT_STATION_HEARTBEAT_STALE
PRINT_STATION_KAFKA_DISCONNECTED
PRINTING_SERVICE_UNAVAILABLE
NO_REGISTERED_PRINTER
NO_READY_PRINTER
PRINT_STATION_ALREADY_BOUND
PRINT_STATION_SITE_MISMATCH
PRINT_STATION_SHOPFLOOR_MISMATCH
2.12 Work Order Allocation and Historical Snapshot

When allocating or dispatching a print operation, persist a snapshot:

workstation_id
print_station_id
binding_id
adapter_id
selected_printer_code
runtime_observed_at
ready_printer_count
Kafka command event ID

Do not resolve current bindings when reading historical execution.

If the binding changes later, historical Work Orders must still show the original edge and printer.

2.13 Printer Selection Responsibility

MES should normally send:

{
  "workstationId": "WS-PRINT-01",
  "printStationId": "PRINT-STATION-01",
  "printerCode": null
}

The edge selects a ready printer internally.

The Printer Adapter may use:

round robin
least busy
priority
failover

Do not assign printers from one Edge Print Station to another Workstation.

Under this final model:

all printers in PRINT-STATION-01
belong to the execution capacity of WS-PRINT-01
2.14 Dispatch Validation at the Edge

Printer Adapter must reject commands when:

printStationId does not match local station identity
workstationId does not match configured/bound Workstation where enforced
command targets another edge
no ready printer exists
command event ID was already processed

Publish a structured failure event.

Do not silently reroute to another Print Station.

2.15 MES APIs

Add or update APIs according to current conventions.

Print Station APIs
GET    /api/v1/print-stations
POST   /api/v1/print-stations
GET    /api/v1/print-stations/{id}
PATCH  /api/v1/print-stations/{id}
DELETE /api/v1/print-stations/{id}

GET    /api/v1/print-stations/{id}/runtime
GET    /api/v1/print-stations/{id}/printers
GET    /api/v1/print-stations/{id}/events
GET    /api/v1/print-stations/{id}/workstation
Binding APIs
GET    /api/v1/workstations/{id}/print-station-binding
PUT    /api/v1/workstations/{id}/print-station-binding
DELETE /api/v1/workstations/{id}/print-station-binding

Replacement must be transactional and effective-dated.

Readiness

Extend the existing readiness API rather than creating a conflicting second readiness engine.

2.16 Seed and Demo Data

Update the seed so a complete demo flow exists:

Site
→ Shopfloor
→ Work Center
→ Workstation
→ Print Station
→ active 1:1 binding

Recommended:

Workstation:
WS-PRINT-01

Print Station:
PRINT-STATION-01

Adapter:
PRINT-ADAPTER-01

Mode:
EDGE_PRINT_STATION

Do not seed runtime as Online blindly.

Runtime must come from real Kafka events or remain Unknown/Pending.

The seed must be idempotent.

2.17 Phase 2 Tests
Binding tests
valid 1:1 binding
second Workstation cannot bind same Print Station
second Print Station cannot bind same Workstation
cross-Site rejection
incompatible Shopfloor rejection
replacement retains history
inactive station rejection
effective-date overlap rejection
Runtime projection tests
heartbeat creates/updates projection
inventory update changes counts
status event updates runtime
stale heartbeat changes readiness
duplicate event is idempotent
out-of-order event is handled safely
Workstation form tests
machine picker excludes Print Stations
Print Station selector is separate
bound station excluded from other Workstations
runtime details render
warnings render
mode validation works
save and edit hydration work
Readiness tests
ready edge
no binding
edge offline
Kafka disconnected
no printer
no ready printer
stale heartbeat
degraded edge
hybrid Workstation
Dispatch tests
command contains Workstation and Print Station IDs
edge accepts matching station
edge rejects wrong station
edge selects one ready printer
duplicate command does not print twice
historical snapshot persists
2.18 Full Runtime Verification

Run the complete final flow:

start Kafka and required platform infrastructure
verify RabbitMQ is absent
start Station services
start independent Printer Adapter
confirm Kafka clients connect
confirm Print Station heartbeat reaches MES
confirm MES Print Station page shows the edge
confirm printer counts update
create or edit WS-PRINT-01
bind PRINT-STATION-01
confirm another Workstation cannot select it
run readiness
create a test Work Order
allocate to WS-PRINT-01
publish the print command through Kafka
confirm one physical or simulated print
confirm selected printer is recorded
confirm result updates Job Engine
confirm Projection Service updates
confirm Kiosk updates through SignalR
restart Printer Adapter
confirm temporary offline/stale state
confirm automatic recovery
replay the command
confirm no duplicate physical print
Build, Deployment, and Image Updates

Rebuild every modified service.

At minimum:

station-gateway
job-engine
printer-adapter
projection-service
kiosk-ui
printer-adapter-ui
device-simulator
any migrated device adapter
mes-master-data-service
mes-execution-service
mes-console

Validate all Compose files.

Recreate affected containers.

Do not leave stale containers using RabbitMQ images.

Push updated images only after runtime verification.

Use explicit version tags and optionally update latest according to repository policy.

Report exact:

image
tag
architecture
digest
push result

Do not claim an image was pushed unless Docker Hub confirms it.

Documentation

Create:

implementation/print-station-rabbitmq-to-kafka-migration.md
implementation/mes-edge-print-station-workstation-flow.md

Update:

AI_CONTEXT.md
print-marking/AI_CONTEXT.md
Station service READMEs
MES master-data README
MES execution README
MES Console README
deployment documentation

Document:

old RabbitMQ architecture
final Kafka architecture
topic map
consumer groups
partition keys
retry/DLQ policy
outbox behaviour
RabbitMQ removal evidence
final Workstation/Print Station model
runtime projection
1:1 binding rules
readiness rules
dispatch flow
test evidence
known limitations
Stop Conditions

Stop and report before destructive actions if:

any active event route cannot be mapped
Kafka does not preserve required ordering
physical-print idempotency cannot be proven
Projection or Kiosk misses events
dual-run produces mismatched payloads
RabbitMQ is still used by another active Station workflow
Kafka credentials or ACLs are unavailable
Schema Registry rejects required contracts
one Edge Print Station is already actively shared by multiple Workstations
existing Work Orders would lose historical resource identity
RabbitMQ removal would remove the only copy of required business data

Otherwise, continue through both phases.

Final Acceptance Criteria
Kafka migration
Kafka replaces RabbitMQ for all active Station events.
Printer Adapter consumes commands from Kafka.
Printer Adapter publishes status and results to Kafka.
Job Engine consumes printer results from Kafka.
Projection Service consumes all required Kafka events.
Kiosk real-time behaviour remains correct.
Physical-print idempotency is preserved.
Retry and DLQ behaviour works.
Kafka reconnect works.
Consumer lag is observable.
RabbitMQ can be stopped without failures.
RabbitMQ service is removed.
RabbitMQ client packages are removed.
RabbitMQ configuration is removed.
Docker Compose files contain no active RabbitMQ service.
Builds and tests pass.
MES Workstation integration
One Edge Print Station can have only one active Workstation binding.
One Workstation can have only one active Edge Print Station binding.
Printer devices remain internal to their Edge Print Station.
Printer counts come from runtime events.
Print Station page displays runtime and printer counts.
Workstation machine picker contains only Machine/Equipment resources.
Workstation has a separate Print Station selector.
Workstation mode supports EDGE_PRINT_STATION.
Readiness validates edge and printer availability.
Dispatch resolves the bound edge.
Edge selects a ready printer.
Historical execution snapshots preserve Workstation, Print Station, adapter, and printer.
Seed runs idempotently.
Full MES-to-printer E2E test passes.
Required Final Report

Provide a structured report.

Audit
all RabbitMQ routes found
Kafka mappings
affected services
risks
Kafka Migration
topics
partitions
keys
consumer groups
schemas
retries
DLQs
outbox changes
idempotency evidence
RabbitMQ Removal
service stopped
container removed
volumes decision
packages removed
configuration removed
residual references
MES Model
Workstation model
Print Station model
runtime projection
binding constraints
Workstation UI flow
readiness
dispatch snapshot
Verification
builds
tests
dual-run comparison
Kafka cutover
physical/simulation print
Projection update
Kiosk update
replay test
restart/recovery test
Images
image names
tags
architectures
digests
push results
Remaining Risks

Do not report “implemented and verified” unless RabbitMQ was fully removed from the active runtime, Kafka E2E passed, the MES binding flow worked, and a print command completed exactly once through the final architecture.