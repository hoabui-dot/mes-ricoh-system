# Reset, Seed, and Verify a Complete MES Work Order Test Dataset

## Background

The current MES development database contains many incomplete, obsolete, and invalid records created while the Work Order, Production Version, Routing snapshot, resource-planning, WMS, Kiosk, and Print Station flows were still evolving.

Observed problems include:

- Work Orders created with materials but zero Routing Operations.
- Work Orders rejected during approval with `WO_ROUTING_SNAPSHOT_MISSING`.
- Partial or legacy Work Order snapshots.
- Production Versions referencing incomplete Routing or MBOM data.
- Missing or inconsistent resource-planning records.
- Material requirements that cannot be validated against WMS.
- Stale execution, Kiosk, print-job, outbox, inbox, and projection records.
- Test records created under older contracts that are no longer valid.

A clean deterministic dataset is required before continuing Work Order and physical-print testing.

The goal is to create one guarded script that:

1. audits the current MES data;
2. exports a diagnostic report;
3. deletes all mutable development/test data safely;
4. preserves schema migrations and required static configuration;
5. seeds one complete production scenario;
6. verifies every Work Order prerequisite;
7. creates a new Work Order through the official API;
8. proves exactly when Routing, planning, and material snapshots are created;
9. runs the complete WO flow;
10. reports the exact root cause if any stage fails.

This is a destructive development-database operation.

It must never run accidentally against production.

---

# Objective

Create an executable script such as:

```text
scripts/reset-seed-and-verify-mes-wo-flow.mjs

or use the repository’s preferred scripting language.

The script must support:

MES_ENV=development \
CONFIRM_DESTRUCTIVE_RESET=YES_DELETE_MES_TEST_DATA \
npm run reset-seed-verify:mes-wo

The script must produce a clean MES test baseline containing one internally consistent dataset that can pass:

Production Version readiness;
MBOM material explosion;
Routing snapshot creation;
Work Order planning snapshot creation;
Compute & Check;
approval;
optional resource-allocation bypass;
execution start;
Kiosk dispatch;
Print Station readiness;
Kafka physical-print dispatch;
printer-result correlation;
Work Order operation completion;
Work Order completion.

Do not directly patch invalid Work Orders.

Delete obsolete test data and recreate valid data through canonical APIs or idempotent seed services.

Safety Requirements

Before deleting anything, enforce all of the following:

MES_ENV is development, local, test, or staging
database host is not a known production host
database name matches an explicit allow-list
CONFIRM_DESTRUCTIVE_RESET has the exact required value
current Git branch and deployment context are logged
a dry-run audit completes successfully

Abort immediately if:

environment = production
database is not explicitly allow-listed
confirmation value is missing
database identity cannot be proven

Do not rely only on a database name containing dev.

Check:

host;
port;
database;
Kubernetes namespace or Docker Compose project;
service environment;
optional database marker table.

Recommended protection:

mes_environment_marker.environment_type = DEVELOPMENT
Execution Modes

Support:

--dry-run
--reset
--seed-only
--verify-only
--full
Dry run

Must not mutate data.

It should report:

tables discovered;
row counts;
invalid WOs;
orphan rows;
deletion plan;
seed plan;
environment safety result.
Full mode

Runs:

audit
→ backup diagnostic metadata
→ cleanup
→ seed
→ rebuild projections where required
→ verify master data
→ create test WO
→ verify snapshots
→ execute full WO flow
→ generate final report
Phase 1 — Discover the Actual Schema

Do not hard-code assumed table names before auditing the real schema.

Inspect migrations, ORM models, and database metadata for all tables related to:

Work Orders
WO operations
WO materials
WO snapshots
resource allocations
capacity reservations
approval logs
execution sessions
operation confirmations
print jobs
print attempts
print events
Kiosk dispatch/tasks
outbox
inbox
event deduplication
WMS integration
inventory projections
Production Versions
MBOM
Routing
Operation Catalog
Work Centers
Workstations
Print Stations
employees
skills
shifts
calendars

Create an internal dependency graph based on:

foreign keys;
service ownership;
event references;
logical IDs stored in JSON;
projection dependencies.

Do not assume foreign keys cover every logical relationship.

Phase 2 — Audit Current Work Order Data

For every existing Work Order, classify it as:

VALID
INCOMPLETE
LEGACY_CONTRACT
ORPHANED
PARTIALLY_COMMITTED
INCONSISTENT_LIFECYCLE
UNVERIFIABLE

Validate at minimum:

production_version_id exists
Production Version snapshot exists
Item Revision snapshot exists
MBOM snapshot exists
Routing snapshot exists
WO operation count > 0
WO material requirements exist where MBOM has components
operation count equals expected released Routing operation count
routing_operation_id is populated
operation_id is populated
sequence is valid
predecessors are valid
planning snapshot exists
base quantity is valid
cycle time is valid
required workers are valid
execution target is resolvable
print metadata exists for print operations
lifecycle is consistent

Report examples:

WO has 5 material rows but 0 operation rows
WO references a deleted Routing
WO snapshot was created from a stale Production Version
WO has print jobs for an operation that does not exist
WO is Released with no approval log
WO is Draft but has active execution sessions
Phase 3 — Determine the Correct Snapshot Boundary

Trace the current code path and prove when each snapshot is created.

Audit:

Create Work Order handler
Production Version resolver
Routing read-model loader
MBOM explosion
WO transaction
Compute & Check
Approval
Start Execution
Kafka consumers
projection consumers

Create a snapshot ownership matrix:

Snapshot	Expected creation time	Actual creation time	Source
Production Version identity	WO creation		
Item Revision identity	WO creation		
MBOM identity	WO creation		
Routing identity	WO creation		
Routing Operations	WO creation		
Planning Standard	WO creation		
Material Requirements	WO creation		
Resource Allocation	after WO creation		
Approval facts	approval		
Execution session	operation start		
Physical printer result	printer completion		

The target rule is:

Production configuration snapshots
must be created atomically during Work Order creation.

Approval must validate existing snapshots.

Approval must not be the first point where Routing Operations are copied.

Compute & Check must use the WO snapshots.

It must not silently rebuild them from mutable master data.

Phase 4 — Investigate WO_ROUTING_SNAPSHOT_MISSING

Find every active code path that returns:

WO_ROUTING_SNAPSHOT_MISSING

Determine whether the error can occur because of:

Routing header released with zero operations
Routing operations not projected into MES Execution
event ordering issue
projection consumer lag
empty UUID or NULL mapping
selected Production Version ignored
wrong Routing ID
Routing operations filtered by obsolete Item/Site relationship
transaction committed before operation insert
operation insert failed but header/materials committed
read model was stale
snapshot was expected at approval instead of creation

Add structured diagnostics.

The error response must include safe details such as:

{
  "code": "WO_ROUTING_SNAPSHOT_MISSING",
  "details": {
    "workOrderId": "...",
    "productionVersionId": "...",
    "routingId": "...",
    "expectedRoutingOperationCount": 6,
    "actualWorkOrderOperationCount": 0,
    "routingReadModelOperationCount": 0,
    "snapshotExpectedAt": "WORK_ORDER_CREATION",
    "correlationId": "..."
  }
}

Do not expose raw SQL errors to the UI.

Log the underlying technical cause separately.

Phase 5 — Cleanup Strategy

The reset must delete all mutable test and transactional data in dependency-safe order.

Include, where present:

WO print events
WO print attempts
WO print jobs
operation confirmations
execution sessions
capacity reservations
resource-allocation audit
resource allocations
WO operation events
WO operations
WO material requirements
WO approval logs
WO headers
Kiosk task projections
execution dispatch projections
WO-related outbox rows
WO-related inbox/deduplication rows
WO-related DLQ/retry records
WMS reservations created by test WOs
inventory staging records created by test WOs

Also clean invalid development master data when explicitly included in the reset profile:

test Production Versions
test MBOMs and lines
test Routings and Routing Operations
test Production Standards
test Operation skill overrides
test resource capabilities
test calendars
test shifts
test assignments
test Workstations
test Work Centers
test Print Station bindings
test Operation Catalog rows
test Item Revisions
test Items

Preserve:

schema migrations
system users and roles
required UOM reference data
language/reference dictionaries
Kafka topic configuration
real Print Station runtime projection where it comes from the remote Adapter
real physical printer registration unless the seed explicitly owns it

Use one database transaction per service-owned database.

Where multiple databases are involved, use a controlled staged reset and report partial failure clearly.

Phase 6 — Orphan Cleanup

After deletion, verify and remove remaining orphan records.

Examples:

WO operation without WO header
material requirement without WO
print job without WO operation
print attempt without print job
print result without print job
execution session without operation
allocation without operation
reservation without allocation
Kiosk task without WO operation
outbox event referencing a deleted WO
inbox/deduplication row referencing a deleted test event
WMS reservation referencing a deleted WO

Do not delete unrelated integration history.

Scope event cleanup by:

aggregate type;
aggregate ID;
event type;
correlation ID;
known test prefixes.
Phase 7 — Seed a Complete Master-Data Scenario

Seed one deterministic scenario with stable business codes.

Example prefix:

E2E-
Factory hierarchy

Create:

Factory/Site
Shopfloor
Work Center
Workstation

Example:

E2E-SITE-01
E2E-SF-01
E2E-WC-PRINT
E2E-WS-PRINT

Add all required active lifecycle and planning flags.

Item and Item Revision

Create:

Finished good Item
Released Item Revision
Required component Items and Revisions

Use valid UOMs.

Operation Catalog

Create at least:

Operation 10 — Preparation
Operation 20 — Physical Label Printing
Operation 30 — Quality Confirmation

The print operation must contain the authoritative print-execution marker used by the backend.

Do not identify print operations only by translated names.

Routing

Create a Released Routing with:

valid Routing header
three Released Routing Operations
valid sequences
valid predecessors
valid Work Centers
valid planning values
valid execution targets

Example:

10 Preparation
20 Print Label, predecessor 10
30 Quality Confirmation, predecessor 20
Production Standards

Ensure every schedulable Routing Operation resolves:

base quantity
setup time
cycle time
required workers
efficiency
yield

Use either inherited defaults or explicit Routing overrides according to the current architecture.

Verify the resolved values before release.

MBOM

Create a Released MBOM with:

finished-good output context
at least one required component
base quantity
component quantity
scrap/yield where supported
issue operation
backflush policy
validity
Production Version

Create one Released Production Version connecting:

Released Item Revision
Released MBOM
Released Routing
derived execution Site
validity
lot-size range
base UOM
localized VI/EN/JA/KO name

The Production Version must be the authoritative WO selection.

Phase 8 — Seed Labor and Planning Data

Even if allocation approval is currently bypassed, seed enough planning data to test both advisory and strict flows later.

Create:

Shift
Work Calendar
active Employees
Employee-to-Work-Center assignments
required Skills
Employee skills
Resource Assignments
Resource Capabilities

For every Routing Operation, ensure the selected Work Center has:

at least one active Workstation
required Machine/Equipment where applicable
effective assignment
valid capability
calendar coverage
sufficient configured workers

Do not claim scheduled employee availability unless shift and calendar data are actually seeded.

Phase 9 — Seed Print Station Integration

Use the actual remote Print Station where available.

Validate:

E2E-WS-PRINT
→ active Workstation Print Station binding
→ PRINT-STATION-01
→ PRINT-ADAPTER-01
→ Zebra-GK420t-CUPS

Ensure:

allocated printer quantity > 0
runtime ONLINE
Kafka CONNECTED
printer registered
printer ready
active for work
template available

Do not start a local Printer Adapter on the MES host.

If the real Workstation ID cannot be replaced safely, either:

bind the seeded Workstation to the real Print Station; or
seed the scenario using the currently bound real Workstation.

Document the chosen strategy.

Phase 10 — WMS and Material Requirements

Audit the actual WMS integration contract.

Determine whether WO material readiness uses:

live WMS API
Kafka inventory projection
local inventory read model
mock adapter
seeded test database

The script must not fake a successful WMS result in the MES database if WMS is authoritative.

Connected WMS mode

Seed or create through the official WMS API:

warehouse
storage location
component inventory
lot/batch where required
available quantity greater than WO demand

Then verify MES can query or receive the stock state.

Isolated test mode

Use the repository-approved WMS simulator or test fixture.

Clearly mark:

WMS_MODE=simulated

Do not silently fall back from live WMS to simulation.

Required verification

For the seeded WO:

MBOM material requirements are created
required quantity is correct
WMS available quantity is sufficient
stock check is Ready
material staging can proceed where implemented

Capture:

component revision
required quantity
available quantity
warehouse/location
WMS request ID or event ID
status
Phase 11 — Seed Through Canonical APIs Where Possible

Prefer:

official Master Data APIs
official release endpoints
official Work Order API
official WMS APIs
official binding APIs

Use direct SQL only for:

environment reset;
deterministic reference data unavailable through APIs;
projection cleanup;
migration-controlled fixtures.

Do not directly insert Released master data while bypassing required release validation unless the seed framework already defines that behaviour.

Phase 12 — Verify Master Data Before Creating the WO

The script must run a preflight report.

Required checks:

Production Version Released
Production Version effective
quantity within lot-size range
Item Revision Released
MBOM Released
MBOM lines exist
Routing Released
Routing Operations count = expected
all Operations exist
all Work Centers exist
planning values resolved
predecessor graph valid
one execution Site resolved
Print Station binding ready
WMS stock sufficient

Abort WO creation if any preflight check fails.

Do not create another invalid Work Order.

Phase 13 — Create the Test Work Order

Create the WO using only authoritative user-authored fields:

{
  "production_version_id": "...",
  "quantity": 2,
  "target_completion_date": "..."
}

Capture the entire API request and response.

Do not send independent Item Revision, MBOM, Routing, Site, or UOM IDs unless testing legacy mismatch rejection.

Phase 14 — Verify Snapshot Creation Immediately

Immediately after successful creation, before Compute & Check or approval, verify:

wo_header exists
production_version_id matches selected PV
item_revision_id derived correctly
mbom_id derived correctly
routing_id derived correctly
site_id derived correctly
WO material count equals MBOM explosion result
WO operation count equals Routing operation count
planning snapshot exists on every operation
predecessor snapshot exists
execution target exists
print operation metadata exists

This is the critical assertion:

Routing and planning snapshots must already exist immediately after WO creation.

If they appear only after Compute & Check or approval, report the implementation as incorrect.

Phase 15 — Transaction Failure Test

Create one intentionally invalid fixture in an isolated transaction, such as a Production Version whose Routing read model has zero operations.

Attempt WO creation.

Verify:

creation fails
wo_header count does not increase
wo_operation count does not increase
material requirement count does not increase
outbox count does not increase

This proves partial commits are prevented.

Delete the intentionally invalid fixture afterwards.

Phase 16 — Run Compute & Check

Run the official endpoint.

Verify:

calculation uses WO planning snapshots
not current mutable Routing defaults
operation durations are returned
material readiness is returned
warnings are preserved
no snapshot is created for the first time here

Capture operation-level diagnostics.

Phase 17 — Approval Policy

The current temporary policy may allow approval without resource allocations.

Detect and report the active policy:

RESOURCE_ALLOCATION_POLICY=ADVISORY

or:

resource allocation required = true

Do not silently change policy inside the seed script.

The script may support:

APPROVAL_MODE=advisory-allocation
APPROVAL_MODE=strict-allocation
Advisory mode

Verify zero allocations do not block approval.

Strict mode

Create and commit valid allocation rows for every operation before approval.

Report the selected mode.

Phase 18 — Run the Complete WO Flow

After approval:

verify WO becomes Released;
start execution;
verify WO becomes InProgress;
complete the first Kiosk operation through official APIs;
verify the print operation becomes ready;
verify one MES print job is created;
verify one Kafka command is published;
verify the remote Adapter consumes it;
verify physical Zebra output;
verify one printer result returns;
verify the print operation becomes Finished;
complete the final Kiosk operation;
verify WO becomes Completed.

Do not update WO or operation statuses directly with SQL.

Phase 19 — Repeatability Test

After one successful run:

run cleanup again;
seed the same business codes;
verify no duplicate-key or stale-projection issue;
create another WO;
rerun the flow.

The complete script must be deterministic and repeatable.

Use idempotent upserts only for static reference data.

Use fresh IDs for transactional data.

Phase 20 — Generated Artifacts

Write:

artifacts/mes-reset-seed-verify/<timestamp>/
├── environment.json
├── schema-discovery.json
├── pre-cleanup-audit.md
├── deletion-plan.md
├── deleted-row-counts.json
├── seed-manifest.json
├── master-data-readiness.json
├── wms-readiness.json
├── wo-create-request.json
├── wo-create-response.json
├── snapshot-verification.json
├── compute-check.json
├── approval.json
├── execution-timeline.md
├── print-evidence.json
├── database-integrity.json
├── failure-report.md
└── summary.json

Do not include passwords, access tokens, or secrets.

Failure Classification

Use stable categories:

ENVIRONMENT_SAFETY
DATABASE_SCHEMA
CLEANUP_FOREIGN_KEY
ORPHAN_DATA
SEED_MASTER_DATA
MASTER_DATA_RELEASE
PRODUCTION_VERSION_READINESS
ROUTING_READ_MODEL
ROUTING_SNAPSHOT
PLANNING_SNAPSHOT
MBOM_EXPLOSION
WMS_CONNECTIVITY
WMS_STOCK_SHORTAGE
WO_TRANSACTION
COMPUTE_CHECK
APPROVAL_POLICY
EXECUTION_DISPATCH
KIOSK
PRINT_STATION_READINESS
KAFKA_COMMAND
PRINTER_ADAPTER
CUPS
PHYSICAL_PRINTER
RESULT_EVENT
WO_COMPLETION

Every failure report must include:

stage
expected
actual
entity IDs
host/service
correlation ID
relevant log lines
database evidence
recommended fix
Automated Tests

Add tests for:

destructive-reset production guard;
dry-run performs no mutation;
cleanup deletes children before parents;
orphan detection;
repeatable seed;
Released Routing always has operations;
Production Version references valid released entities;
WO creation snapshots Routing immediately;
WO creation snapshots MBOM immediately;
missing Routing read-model operations cause rollback;
partial commit cannot occur;
WMS shortage is reported correctly;
advisory approval passes without allocation;
strict approval requires allocation when enabled;
full print flow uses the seeded print operation.
Documentation

Update:

AI_CONTEXT.md
MES development reset documentation
Work Order snapshot lifecycle documentation
test-data README
WMS integration README
physical-print E2E runbook

Document explicitly:

Routing and planning snapshots are created during Work Order creation.
Compute & Check consumes snapshots.
Approval validates snapshots.
Approval does not create missing snapshots.

Mark conflicting legacy documentation as superseded.

Acceptance Criteria

The task is complete only when:

The script refuses to run on production.
Dry-run produces a complete audit.
All mutable test WO data can be cleaned safely.
No orphan transactional records remain.
One deterministic complete MES dataset is seeded.
Routing contains valid released operations.
MBOM contains valid material requirements.
WMS reports sufficient stock for the seeded WO.
Production Version is fully ready.
WO creation uses Production Version ID.
WO creation creates all Routing Operation snapshots immediately.
WO creation creates all material snapshots immediately.
Invalid snapshot creation rolls back the entire transaction.
Compute & Check uses existing snapshots.
Approval does not unexpectedly fail with WO_ROUTING_SNAPSHOT_MISSING.
The selected approval policy behaves as documented.
Kiosk execution works.
Physical print flow works.
Printer result completes the correct operation.
The WO reaches Completed.
The script is repeatable.
Full artifacts and failure diagnostics are generated.
Required Final Report

Provide:

Environment safety
resolved environment;
database host/name;
production guard result.
Cleanup
invalid WOs found;
orphan records found;
deleted rows by table;
preserved data.
Seed manifest
Factory/Site;
Shopfloor;
Work Centers;
Workstations;
Operations;
Routing and operation count;
MBOM and line count;
Production Version;
employees, skills, shifts, and calendars;
Print Station binding;
WMS inventory.
Snapshot findings

Explain:

when snapshots were expected
when they were actually created before the fix
when they are created after the fix
why previous approval returned WO_ROUTING_SNAPSHOT_MISSING
WO evidence
WO ID/code;
operation snapshot count;
material requirement count;
planning snapshot count;
Compute & Check result;
approval result;
execution result.
WMS evidence
component;
required quantity;
available quantity;
WMS request/event ID;
readiness result.
Print evidence
print job ID;
command event ID;
Adapter ID;
selected printer;
CUPS job ID;
result event ID;
print operation status.
Final database integrity
orphan count;
invalid WO count;
partial snapshot count;
final WO status;
repeatability result.

Do not report completion if the database was only cleaned without successfully creating and executing a new snapshot-complete Work Order.

Viết thêm 1 english prompt để:
- move docker compose của print-marking sang file chung với mes để dễ quản lý và rebuild, add rebuild command vào package.json cho print station giống như MES hiện tại
-  tại kiosk của print marking, cần kiểm trang lại trang label template đang bị error 502
- kiểm tra lại trang bảng điều khiển của kiosk xem có thực sự đang realtime được bởi signalR của projection service không, hệ thống print marking có đang nhận được event từ Kafka của MES không ? và projection có biết để bắn lên kiosk không, dữ liệu kiosk có cần thay đổi theo MES data hiện tại tại trang bảng điều khiển không ?
Hãy viết english prompt để phân tích hết các yếu tố và fix để hệ thống in realtime Kafka với MES request lệnh in
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

Pr