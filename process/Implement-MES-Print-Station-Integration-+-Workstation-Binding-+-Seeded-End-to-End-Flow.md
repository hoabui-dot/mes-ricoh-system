# Implement MES Print Station Integration + Workstation Binding + Seeded End-to-End Flow

## Objective

Integrate the existing Print Marking Station Agent into the main MES as a managed execution system.

This implementation combines two phases into one controlled change:

1. Create MES-side Print Station integration management.
2. Bind MES Workstations to Print Stations.

Also create an idempotent seed script that inserts a complete, immediately testable print-workstation flow into MES.

The intended runtime flow is:

```text
MES Work Order
→ Work Order Operation
→ Workstation
→ Print Station Binding
→ Station Agent Gateway
→ Job Engine
→ Remote Printer Adapter over HTTP
→ Physical Printer

Important domain separation:

Workstation
= MES logical execution location

Print Station
= independently deployed Station Agent runtime

Printer Adapter
= remote HTTP service used by the Print Station

Printer / Machine Unit
= physical printing resource

Do not merge these concepts into a single entity.

Critical Working Rules

Before changing code, audit the existing implementation.

Inspect the real source code, database schemas, migrations, APIs, frontend pages, seeds, and tests.

Do not assume the previously described architecture already exists exactly as documented.

Use this evidence order:

Running source code
Database schema and migrations
Existing domain entities and repositories
Controllers and services
Existing seed scripts
Existing tests
Documentation

If the existing MES domain model conflicts with this prompt, preserve the established architecture and adapt this design carefully.

If the implementation would require destructive database changes, major Workstation redesign, or breaking existing Work Order flows, stop before coding and provide:

discovered conflict
affected modules
why the requested fast implementation is unsafe
minimum safe alternative
migration impact
estimated effort

If the change can be implemented safely, proceed immediately without waiting for confirmation.

Phase A — Audit Existing MES Structures

Inspect at minimum:

Factory/Site
Shopfloor
WorkCenter
Workstation
Machine
Machine Unit
ResourceAssignment
Workstation supported operations
Routing
Production Version
Work Order
Work Order Operation
allocation or dispatch services
integration configuration modules
frontend navigation and permission system
database migration conventions
existing seed framework

Determine:

where Workstation entities live
whether Workstation is site- or shopfloor-scoped
whether soft deletion is used
how localized names are represented
how status and lifecycle fields are represented
whether integration entities already exist
how Work Orders reference Workstations
where runtime dispatch is performed
whether environment variables are currently used for Station Agent URLs
whether there is an existing generic external-system registry

Do not duplicate a suitable existing generic integration model.

Phase B — MES Print Station Integration Model

Create a central MES entity representing one deployed Station Agent instance.

Recommended name:

PrintStation

Alternative names are acceptable only if they match existing MES naming conventions, for example:

StationAgent
PrintStationAgent
EdgeStation
ExecutionStation

Do not call this entity Printer, because it represents the full Station Agent runtime rather than one physical printer.

Required Print Station fields

At minimum:

interface PrintStation {
  id: string;

  code: string;
  name: LocalizedText;

  description?: LocalizedText;

  siteId: string;
  shopfloorId?: string;

  gatewayBaseUrl: string;

  deploymentMode:
    | "PHYSICAL"
    | "SIMULATION"
    | "HYBRID";

  status:
    | "PENDING"
    | "ONLINE"
    | "OFFLINE"
    | "DEGRADED"
    | "DISABLED";

  capabilities: Array<
    "PRINT"
    | "LASER"
    | "VISION"
    | "PLC"
  >;

  softwareVersion?: string;
  lastHeartbeatAt?: Date;
  lastHealthCheckAt?: Date;
  lastHealthError?: string;

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

Adapt naming and persistence style to the existing MES conventions.

Business rules

Implement the following rules:

code must be unique.
gatewayBaseUrl is required.
gatewayBaseUrl must not end with duplicated path separators.
Print Station must belong to one Site.
Shopfloor, when provided, must belong to the same Site.
Disabled Print Stations cannot receive new dispatches.
Simulation Print Stations must be clearly identifiable.
Physical and hybrid Print Stations may be used for production.
Do not store Printer Adapter credentials, RabbitMQ credentials, Redis credentials, SQLite paths, or Docker details in this entity.
Do not use IP address as the primary identity.
Do not delete a Print Station that has active bindings or active Work Orders.
Prefer soft delete or disable according to existing project conventions.
Phase C — Workstation Binding

Create a separate binding entity.

Recommended name:

WorkstationPrintStationBinding

Do not add only a simple printStationId column directly to Workstation unless the existing architecture strongly requires that approach.

A separate binding is preferred because it supports:

history
primary and backup assignments
effective dates
future failover
one Print Station serving multiple Workstations
Required binding fields
interface WorkstationPrintStationBinding {
  id: string;

  workstationId: string;
  printStationId: string;

  role:
    | "PRIMARY"
    | "BACKUP";

  effectiveFrom: Date;
  effectiveTo?: Date;

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}
Binding validation rules
Workstation and Print Station must belong to the same Site.
If both have Shopfloor scope, they must belong to the same Shopfloor unless the current MES explicitly supports cross-shopfloor execution.
One Workstation may have only one active PRIMARY binding during an overlapping effective period.
A BACKUP binding is optional.
The same Workstation and Print Station pair must not be duplicated for the same active period.
effectiveTo must be later than effectiveFrom.
A disabled Print Station cannot be assigned as a new active primary binding.
A binding cannot be deleted or deactivated when an active Work Order currently depends on it, unless the project already has a safe reallocation mechanism.
Binding changes must not mutate historical Work Order execution records.
Production dispatch must resolve only currently effective active bindings.
Phase D — Database Migration

Create proper database migrations for:

Print Station table
Workstation-to-Print-Station binding table
indexes
unique constraints
foreign keys inside the MES database
audit fields
status fields
optional soft-delete fields

Recommended constraints:

UNIQUE(print_station.code)

INDEX(print_station.site_id)
INDEX(print_station.status)
INDEX(print_station.is_active)

INDEX(binding.workstation_id)
INDEX(binding.print_station_id)
INDEX(binding.is_active)
INDEX(binding.effective_from)
INDEX(binding.effective_to)

Enforce one active primary binding safely.

If the database cannot express the effective-date overlap constraint cleanly through a simple unique index, enforce it transactionally in the application service and add the strongest safe database constraint possible.

Do not create foreign keys from MES to the Station Agent database.

Phase E — Backend CRUD APIs

Implement CRUD APIs following the current MES API conventions.

Suggested endpoints:

Print Stations
GET    /api/v1/print-stations
POST   /api/v1/print-stations
GET    /api/v1/print-stations/{id}
PATCH  /api/v1/print-stations/{id}
DELETE /api/v1/print-stations/{id}

Use the project’s actual delete convention.

Additional endpoints:

POST /api/v1/print-stations/{id}/test-connection
GET  /api/v1/print-stations/{id}/health
GET  /api/v1/print-stations/{id}/workstations
Workstation bindings
GET    /api/v1/workstations/{workstationId}/print-station-bindings
POST   /api/v1/workstations/{workstationId}/print-station-bindings
PATCH  /api/v1/workstation-print-station-bindings/{bindingId}
DELETE /api/v1/workstation-print-station-bindings/{bindingId}

Add a resolution endpoint if appropriate:

GET /api/v1/workstations/{workstationId}/resolved-print-station

Expected result:

{
  "workstationId": "...",
  "bindingId": "...",
  "role": "PRIMARY",
  "printStation": {
    "id": "...",
    "code": "PRINT-STATION-01",
    "gatewayBaseUrl": "http://100.68.50.41:5001",
    "status": "ONLINE"
  }
}
Phase F — Print Station Health Check

The MES should check the Station Agent over HTTP.

The current Station Agent server is:

100.68.50.41

Use the Station Gateway endpoint as the Print Station runtime endpoint.

Do not confuse this with the independent Printer Adapter URL.

Recommended health request:

GET http://100.68.50.41:5001/health

If the actual implemented health path differs, inspect the service and use the real endpoint.

The test-connection operation should:

Resolve the configured gatewayBaseUrl.
Call the Station Agent health endpoint.
Use a short configurable timeout.
Record:
last health-check timestamp
status
version, if returned
failure reason
Return a clear result to the frontend.
Never expose internal exception stack traces.

Status mapping suggestion:

Successful healthy response → ONLINE
Successful degraded response → DEGRADED
Timeout/network failure     → OFFLINE
Administratively disabled   → DISABLED
Not tested yet              → PENDING

Do not run continuous high-frequency polling in the request path.

A manual health test is required now. A scheduled background monitor may be added only if it fits the existing architecture cleanly.

Phase G — Frontend Management UI

Add a new MES page:

Integration
→ Print Stations

or follow the existing navigation naming.

Print Station list page

Display:

code
localized name
site
shopfloor
gateway URL
deployment mode
capabilities
status
software version
bound workstation count
last heartbeat
active status

Actions:

create
edit
view
test connection
bind workstation
disable
delete, where safe
Print Station detail page

Recommended sections:

Overview
Workstation Bindings
Health
Configuration

Do not add printer management here yet unless the current MES already supports external printer discovery.

Workstation integration UI

In Workstation detail/edit pages, add a section:

Print Station Integration

Display:

current primary Print Station
backup Print Station, when configured
effective dates
Print Station status
gateway URL
test connection action
bind action
unbind action

Do not copy Station Agent internal configuration into the Workstation form.

Phase H — Dispatch Resolution Preparation

Add an application service that resolves the effective Print Station for a Workstation.

Example:

resolvePrintStationForWorkstation(
  workstationId: string,
  executionTime: Date
): Promise<ResolvedPrintStation>

Resolution rules:

Find active binding.
Filter by effective period.
Prefer PRIMARY.
Primary Print Station must be active.
Primary must not be DISABLED.
Define current behaviour for OFFLINE and DEGRADED:
either reject dispatch
or return warning status

Do not yet rewrite the complete Work Order execution pipeline unless it is a small, clearly isolated change.

At minimum, ensure the resolver is implemented and covered by tests so the next phase can use it.

If current Work Order dispatch already has a clean extension point, integrate resolution there safely.

Phase I — Seed Complete Print Workstation Flow

Create an idempotent seed script that inserts a complete testable print flow.

The script must safely support repeated execution without creating duplicates.

Recommended script name:

scripts/seed-print-workstation-flow.*

Use the repository’s existing seed language and framework.

Seeded data

Create or reuse the following hierarchy:

Site
→ Shopfloor
→ WorkCenter
→ Workstation
→ Print Station
→ Active Primary Binding

Recommended seeded values:

Site
Code: SITE-PRINT-DEMO
Name: Print Demo Site

Reuse an existing suitable site if project seed conventions require it.

Shopfloor
Code: SF-PRINT-DEMO
Name: Print Demo Shopfloor
WorkCenter
Code: WC-PRINT-01
Name: Print Work Center
Workstation
Code: WS-PRINT-01
Name: Print Workstation 01
Operation

Create or reuse:

Code: OP-PRINT-LABEL
Name: Print Label

Bind it to the seeded Workstation as a supported operation if that relationship already exists.

Print Station
Code: PRINT-STATION-01
Name: Print Station 01
Site: seeded site
Shopfloor: seeded shopfloor

Gateway Base URL:
http://100.68.50.41:5001

Deployment Mode:
PHYSICAL

Capabilities:
PRINT

Initial Status:
PENDING or ONLINE only if a real health check succeeds

Active:
true

Do not seed ONLINE blindly.

The seed may perform a health check only when the project’s seed conventions allow external calls. Otherwise seed as PENDING.

Binding
Workstation:
WS-PRINT-01

Print Station:
PRINT-STATION-01

Role:
PRIMARY

Effective From:
current seed baseline or a stable historical date

Active:
true
Machine and Machine Unit

If the current MES Workstation flow requires machine assignments, create or reuse:

Machine Code:
MACHINE-PRINTER-ZEBRA

Machine Unit Code:
PRINTER-UNIT-01

Map the Machine Unit to the seeded Workstation using the current ResourceAssignment model.

Do not invent relationships that conflict with the existing resource hierarchy.

Routing

If routing seed support exists, create or reuse:

Routing Code:
ROUTING-PRINT-DEMO

Add one operation:

Sequence: 10
Operation: OP-PRINT-LABEL
Default WorkCenter: WC-PRINT-01
Product and Production Version

Only seed these if the current MES requires them to create a Work Order.

Create the minimum valid chain:

Item / Product
→ Item Revision
→ Released MBOM
→ Released Routing
→ Production Version

Do not introduce EBOM into runtime execution.

Work Order

If practical and consistent with existing seeds, create a demo Work Order:

Code:
WO-PRINT-DEMO-001

Operation:
OP-PRINT-LABEL

Allocated Workstation:
WS-PRINT-01

The seeded Work Order must be clearly marked as demo/test data.

Do not automatically dispatch the Work Order during database seeding.

Phase J — Seed Safety Requirements

The seed must:

Be idempotent.
Use stable codes as natural lookup keys.
Reuse existing entities when codes already exist.
Update only fields owned by this seed.
Avoid deleting user-created data.
Run inside transactions where supported.
Print a clear summary.
Report created, reused, updated, and skipped records.
Fail clearly when an existing record has an incompatible Site relationship.
Never silently move an existing Workstation to another Site.
Never silently replace an existing active primary binding.
Validate the final relationship graph after seeding.

Example output:

Print workstation flow seed completed

Site: reused SITE-PRINT-DEMO
Shopfloor: created SF-PRINT-DEMO
WorkCenter: created WC-PRINT-01
Workstation: created WS-PRINT-01
Operation: reused OP-PRINT-LABEL
Print Station: created PRINT-STATION-01
Primary Binding: created
Machine Unit: created PRINTER-UNIT-01
Routing: created ROUTING-PRINT-DEMO
Work Order: skipped because required Production Version was unavailable
Phase K — Automated Tests

Add tests for both phases together.

Print Station tests
create valid Print Station
reject duplicate code
reject invalid gateway URL
reject Shopfloor belonging to another Site
disable Print Station
test connection success
test connection timeout
test connection malformed response
Binding tests
create valid binding
reject cross-Site binding
reject duplicate binding
reject overlapping primary binding
allow backup binding
resolve current primary
ignore expired binding
ignore future binding
reject disabled Print Station for a new primary binding
Resolver tests
resolve active primary
return no binding error
handle offline Print Station
handle degraded Print Station
preserve historical Work Order reference after binding change
Seed verification tests
run seed once
run seed twice
verify no duplicate records
verify seeded Workstation resolves to PRINT-STATION-01
verify URL is http://100.68.50.41:5001
verify supported print operation
verify Machine Unit assignment when applicable
verify Routing sequence is 10
Phase L — Verification Script

Create:

scripts/verify-print-workstation-integration.*

The script should verify through APIs where possible:

Print Station exists.
Workstation exists.
Binding exists.
Binding is active and primary.
Sites match.
Print operation is supported.
Resolver returns PRINT-STATION-01.
Gateway URL equals:
http://100.68.50.41:5001
Health endpoint is reachable, when the Station Agent is running.
Seed can execute repeatedly without duplication.

The verification script must distinguish:

PASS
FAIL
SKIPPED

A Station Agent health check may be SKIPPED when the external runtime is unavailable, but database and resolver validation must still pass.

Phase M — Build and Runtime Validation

After implementation:

Run database migrations.
Run the print-workstation seed.
Run the seed a second time.
Verify no duplicates.
Build all modified backend services.
Build the MES frontend.
Run relevant unit and integration tests.
Start the affected MES services.
Check startup logs.
Call Print Station CRUD APIs.
Call binding APIs.
Call the resolver endpoint.
Call the seeded Print Station health test.
Run the verification script.

Do not claim success based only on compilation.

Inspect logs for:

migration errors
foreign-key errors
duplicate records
frontend API errors
repeated health-check failures
incorrect URL construction
invalid binding resolution
timezone/effective-date issues
Phase N — Documentation

Create an implementation document:

implementation/mes-print-station-workstation-integration.md

Include:

objective
final domain model
database schema
API list
frontend pages
binding rules
seed data
seed command
verification command
known limitations
next dispatch phase

Document the current seeded Station Agent endpoint:

Station Agent server:
100.68.50.41

Station Gateway:
http://100.68.50.41:5001

Clarify that the independent Printer Adapter is configured internally by the Station Agent and is not the MES Workstation binding target.

Important Architectural Boundary

The MES binding must point to the Station Agent Gateway:

Workstation
→ Print Station
→ Station Gateway

It must not point directly to the remote Printer Adapter:

Workstation
✗→ Printer Adapter

Correct responsibility:

MES
→ dispatches production execution to Station Agent

Station Agent
→ orchestrates print workflow

Job Engine
→ calls remote Printer Adapter over HTTP

Printer Adapter
→ sends ZPL through TCP/IP or CUPS
Final Acceptance Criteria

The implementation is complete only when:

Print Station CRUD works.
Workstation binding CRUD works.
Cross-Site bindings are rejected.
One active primary binding is enforced.
Print Station health testing works over HTTP.
Workstation detail displays its Print Station binding.
Print Station detail displays bound Workstations.
Resolver returns the correct active Print Station.
The seed creates a complete print Workstation flow.
Running the seed twice creates no duplicates.
The seeded gateway URL is http://100.68.50.41:5001.
Existing MES Workstation CRUD still works.
Existing non-print Workstations remain unaffected.
Existing Work Order data remains valid.
Database migrations succeed.
Backend and frontend builds succeed.
Tests pass.
Verification script passes all non-external checks.
Health check is reported honestly as PASS, FAIL, or SKIPPED.
Documentation is updated.
Final Report

At completion, report:

audit findings
existing structures reused
new entities
migrations
backend endpoints
frontend pages
validation rules
resolver behaviour
exact seeded records
first seed result
second seed result
health-check result
tests executed
build results
runtime logs checked
verification script result
documentation path
remaining risks

Do not report “implemented and verified” unless the migrations, repeated seed execution, builds, tests, runtime API checks, and resolver verification were actually executed successfully.
