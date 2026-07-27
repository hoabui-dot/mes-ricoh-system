# Complete MES Print Station–Workstation Capacity Allocation and Runtime Visibility

## Background

The RabbitMQ-to-Kafka migration and the first MES Print Station runtime integration have been implemented.

Current runtime evidence includes:

- Kafka is authoritative for the rebuilt Station Agent runtime.
- Printer Adapter publishes heartbeat and printer runtime events through Kafka.
- MES Master Data consumes those events.
- `md_print_station_runtime_projection` stores adapter identity, Kafka status, heartbeat, printer counts, errors, and printer snapshots.
- The runtime API returns adapter and physical-printer information.

However, the MES Print Station and Workstation integration is incomplete.

The final business model is not one-to-one.

The correct model is:

```text
One Edge Print Station
→ may serve multiple MES Workstations

One MES Workstation
→ may use one active Edge Print Station

Each Workstation binding reserves a configured number of printers
from that Print Station's available printer capacity.

Example:

PRINT-STATION-01
Registered printers: 10

WS-PRINT-A
Allocated printer quantity: 5

WS-PRINT-B
Allocated printer quantity: 5

Remaining allocatable quantity: 0

When the remaining printer capacity is zero, no additional Workstation may be linked unless an existing allocation is reduced or removed.

Physical printers remain owned and selected internally by the Edge Print Station. MES allocates printer capacity by quantity, not necessarily by individual printer ID.

Objective

Complete and correct the MES integration with these outcomes:

Allow one Print Station to serve multiple Workstations.
Allow each Workstation to bind to at most one active Print Station.
Require each binding to specify an allocated printer quantity.
Prevent total active allocation from exceeding the Print Station’s allocatable printer capacity.
Display printer counts and allocated capacity in the Print Station table and detail page.
Remove the Site column from the Print Station table.
Filter the Workstation selector correctly.
Exclude Workstations already bound to another active Print Station.
Hide ended bindings from current active lists.
Add Print Station integration information to Workstation list and detail pages.
Preserve effective-dated allocation history.
Keep runtime printer inventory separate from MES master configuration.

Do not apply only a frontend patch.

Audit and correct the database model, APIs, validation, runtime projection, form state, concurrency handling, and UI together.

Final Business Model

Use these rules as authoritative:

One Edge Print Station may have zero or many active Workstation bindings.

One Workstation may have zero or one active Print Station binding.

Every active binding must reserve a positive printer quantity.

The sum of active allocated printer quantities must not exceed the
Print Station's allocatable printer capacity.

Physical printers remain internal resources of the Edge Print Station.

MES allocates printer quantity to a Workstation.

The Edge Print Station selects the actual ready physical printer at runtime.

Example:

PRINT-STATION-01
├── Registered printers: 10
├── Allocatable printers: 10
├── WS-A allocation: 5
├── WS-B allocation: 3
└── Remaining capacity: 2

Another Workstation may allocate at most 2.

Important Capacity Definitions

Do not treat all printer counts as equivalent.

The runtime projection should distinguish:

registeredPrinterCount
onlinePrinterCount
readyPrinterCount
busyPrinterCount
offlinePrinterCount
errorPrinterCount
activeForWorkPrinterCount

Define the authoritative allocation capacity explicitly.

Recommended initial rule:

allocatablePrinterCount = activeForWorkPrinterCount

Alternative:

allocatablePrinterCount = registeredPrinterCount

is acceptable only if allocation represents configured capacity rather than current runtime readiness.

The implementation must audit current business expectations and document which count is authoritative.

Recommended enterprise separation:

Configured Allocation Capacity
= number of printers the station permits MES to allocate

Runtime Ready Capacity
= number of currently ready printers

Allocated Quantity
= quantity reserved for Workstations

Remaining Configured Capacity
= Configured Allocation Capacity - Sum(active allocations)

Runtime Shortage
= Sum(active allocations) - Ready Printer Count

Example:

Configured allocation capacity: 10
Allocated: 10
Ready now: 7

Configuration state: Fully allocated
Runtime state: Degraded, shortage of 3 ready printers

Do not automatically delete or reduce Workstation allocations when printers temporarily go offline.

Phase 1 — Audit Current Implementation

Inspect the actual source and database before modifying code.

Review at minimum:

md_print_station
md_print_station_runtime_projection
md_print_station_runtime_events
md_workstation_print_station_binding

Print Station repositories
Print Station binding services
Print Station list/detail APIs
Workstation list/detail APIs
runtime Kafka consumer
runtime DTO mapping
MES Console Print Station screen
MES Console Workstation screen
Workstation form hydration
database indexes and constraints
seed data
tests

Determine:

whether the current binding supports an allocation quantity;
why the UI currently displays multiple Workstations without capacity information;
whether one Workstation can currently bind to multiple Print Stations;
whether ended bindings are returned as active;
how printer count is projected;
which runtime count should become allocation capacity;
whether there is already a configured capacity override;
whether binding changes are protected against concurrent requests;
whether the frontend appends stale bindings;
whether Workstation selectors use frontend-only filtering;
whether Workstation list/detail already expose Print Station summaries.

Do not assume the implementation report matches the current runtime exactly.

Phase 2 — Update the Binding Data Model

Reuse:

md_workstation_print_station_binding

Add or verify fields equivalent to:

id
workstation_id
print_station_id
allocated_printer_quantity
role
effective_from
effective_to
active_flag
created_by
created_at
updated_by
updated_at
ended_by
end_reason
Required constraints
Workstation uniqueness

A Workstation may have at most one current active Print Station binding.

Conceptually:

CREATE UNIQUE INDEX uq_workstation_active_print_station
ON md_workstation_print_station_binding(workstation_id)
WHERE active_flag = TRUE
  AND effective_to IS NULL;
Print Station multiplicity

Do not create a unique active constraint on print_station_id.

One Print Station may have multiple active Workstation bindings.

Allocation quantity

Require:

allocated_printer_quantity > 0
Effective periods

Require:

effective_to IS NULL
or
effective_to > effective_from

Preserve historical ended rows.

Phase 3 — Capacity Validation

When creating or replacing a binding:

lock the target Workstation;
lock the target Print Station;
lock or serialise all active allocation rows for that Print Station;
determine the configured allocation capacity;
calculate current active allocated quantity;
exclude the current binding quantity during edit;
validate the requested quantity;
reject when the new total exceeds capacity;
persist transactionally.

Formula:

availableQuantity =
allocationCapacity
- sum(other active binding quantities)

Validation:

requestedQuantity <= availableQuantity

Return stable errors:

WORKSTATION_ALREADY_HAS_PRINT_STATION
PRINT_STATION_CAPACITY_UNAVAILABLE
PRINT_STATION_ALLOCATION_EXCEEDS_CAPACITY
PRINT_STATION_RUNTIME_NOT_AVAILABLE
PRINT_STATION_INACTIVE
PRINT_STATION_BINDING_CONFLICT
INVALID_ALLOCATED_PRINTER_QUANTITY

Example error response:

{
  "code": "PRINT_STATION_CAPACITY_UNAVAILABLE",
  "message": "The requested allocation exceeds the remaining printer capacity.",
  "details": {
    "printStationCode": "PRINT-STATION-01",
    "capacity": 10,
    "allocated": 8,
    "remaining": 2,
    "requested": 3
  }
}

Backend validation must remain authoritative.

Do not rely only on the quantity shown in the browser.

Phase 4 — Handle Runtime Inventory Changes

Printer Adapter may report a changed printer count.

Example:

Previous registered capacity: 10
New registered capacity: 8
Current MES allocation: 10

Do not silently remove bindings.

Instead mark the Print Station as:

OVER_ALLOCATED

or:

DEGRADED

Expose:

configuredCapacity
allocatedQuantity
remainingQuantity
runtimeReadyQuantity
allocationDeficit

Example:

{
  "configuredCapacity": 8,
  "allocatedQuantity": 10,
  "remainingQuantity": 0,
  "allocationDeficit": 2,
  "runtimeStatus": "DEGRADED"
}

Block new allocations and allocation increases until the deficit is resolved.

Allow:

reducing an allocation;
ending a binding;
restoring printer capacity.

Do not block unlink or capacity reduction.

Phase 5 — Define Capacity Ownership

Audit and choose one of these models.

Model A — Runtime-derived capacity
allocationCapacity = activeForWorkPrinterCount

Suitable when Printer Adapter is the complete authority for production-enabled printers.

Model B — MES configured limit

Add to md_print_station:

maximum_allocatable_printer_count

Then:

allocationCapacity =
min(
  maximumAllocatablePrinterCount,
  activeForWorkPrinterCount
)

This is more enterprise-friendly because MES can intentionally reserve fewer printers than the edge physically exposes.

Recommended approach:

runtimeDiscoveredPrinterCount
runtimeActiveForWorkCount
configuredAllocationLimit
effectiveAllocationCapacity

Where:

effectiveAllocationCapacity =
configuredAllocationLimit is set
  ? min(configuredAllocationLimit, runtimeActiveForWorkCount)
  : runtimeActiveForWorkCount

Document the final decision.

Phase 6 — Correct Unlink Semantics

Unlinking a Workstation must end its current binding.

Use effective-dated history:

active_flag = false
effective_to = current timestamp
ended_by = current actor
end_reason = user-provided or system reason

After unlink:

the Workstation disappears from the Print Station active allocation list;
the Print Station disappears from the Workstation active integration section;
the allocated quantity is returned to available capacity;
the Workstation becomes selectable for another Print Station;
historical allocation remains available for audit;
historical Work Orders remain unchanged.

Example:

Before unlink:
Capacity: 10
WS-A: 5
WS-B: 5
Remaining: 0

After unlink WS-B:
Capacity: 10
WS-A: 5
Remaining: 5
Phase 7 — Repair Existing Data

Create a safe migration or repair script.

Audit:

Workstations bound to multiple active Print Stations;
bindings with missing allocation quantity;
bindings with zero or negative quantity;
Print Stations whose active allocation exceeds capacity;
ended bindings still marked active;
duplicate current binding rows.

For existing active bindings without quantity, do not assign arbitrary values silently.

Use one of these controlled approaches:

set quantity to 1 only when explicitly accepted as the legacy migration default;
infer quantity from documented seed/configuration;
report ambiguous rows for manual correction.

Document every repair.

Do not end valid multiple Workstation bindings merely because they share one Print Station.

They are now valid when total allocated quantity does not exceed capacity.

Phase 8 — Update Print Station List Table

The left-side table currently shows:

Station Code
Station Name
Site
Deployment Mode
Status

Change it to:

Station Code
Station Name
Workstations
Printer Capacity
Allocated
Remaining
Runtime Status

Remove:

Site

The edge does not need to know MES Site.

MES hierarchy may be resolved through linked Workstations when required.

Suggested row
PRINT-STATION-01
MES Label Print Station 01
2 Workstations
10 Printers
8 Allocated
2 Remaining
Online
Suggested printer-capacity rendering
10 total / 8 allocated / 2 remaining

Optionally include runtime readiness:

10 configured / 7 ready

When no runtime inventory has been received:

Unknown

Do not show 0 unless the edge explicitly reported zero.

Phase 9 — Update Print Station Detail

The detail panel should contain:

Identity
Station code
Station name
Adapter ID
Station identity
Deployment mode
Lifecycle status
Capacity summary
Registered printers
Active-for-work printers
Configured allocation limit
Effective allocation capacity
Allocated quantity
Remaining quantity
Ready printers
Busy printers
Offline printers
Error printers
Allocation deficit
Linked Workstations

Show zero or many active Workstation allocations.

Each row should display:

Workstation code
Workstation name
Allocated printer quantity
Binding role
Effective from
Runtime readiness
Unlink action
Edit allocation action

Example:

WS-PRINT-A
Allocated printers: 5
Status: Active

WS-PRINT-B
Allocated printers: 3
Status: Active

The title should remain plural:

Linked Workstations

Display summary:

2 Workstations linked
8 of 10 printers allocated
2 printers remaining
Phase 10 — Correct the Workstation Selector

The selector must show only valid Workstation candidates.

Exclude:

Workstations already bound to another active Print Station.
Inactive or obsolete Workstations.
Workstations with ended lifecycle periods.
Deleted or hidden Workstations.
Workstations invalid for the relevant MES hierarchy policy.

Do not exclude Workstations already linked to the currently selected Print Station merely because the station has multiple Workstations.

However, already-linked Workstations should not appear as candidates for creating duplicate bindings.

They should appear only in the active allocation list where their quantity can be edited.

Recommended endpoint:

GET /api/mes/master-data/print-stations/{id}/workstation-candidates

Example:

{
  "printStationId": "...",
  "capacity": {
    "effective": 10,
    "allocated": 8,
    "remaining": 2
  },
  "candidates": [
    {
      "workstationId": "...",
      "workstationCode": "WS-PRINT-C",
      "workstationName": {
        "vi": "Trạm in C",
        "en": "Print Workstation C"
      },
      "eligible": true,
      "maximumAllocatableQuantity": 2,
      "alreadyBoundToPrintStation": false
    }
  ]
}

When remaining capacity is zero:

selector may be disabled;
no new candidate binding may be submitted;
show a clear message:
No printer capacity remains for another Workstation.

Backend must still reject race-condition requests.

Phase 11 — Binding UI

The link section must require:

Workstation
Allocated printer quantity
Role, if retained

Example:

Select Workstation: WS-PRINT-C
Available printer capacity: 2
Allocated quantity: [2]

Validation:

minimum = 1
maximum = remaining capacity
integer only

When editing an existing allocation:

maximum editable quantity =
current allocation + current remaining capacity

Example:

Current WS-A allocation: 5
Remaining capacity: 2
Maximum new WS-A allocation: 7

Do not force users to unlink and recreate just to adjust quantity.

Phase 12 — Workstation List Changes

Add columns:

Print Station
Allocated Printers
Print Integration Status

Example:

WS-PRINT-A
PRINT-STATION-01
5
Connected

Unbound Workstation:

No Print Station
0
Not Connected

Recommended list DTO:

{
  "printStationIntegration": {
    "connected": true,
    "printStationId": "...",
    "printStationCode": "PRINT-STATION-01",
    "allocatedPrinterQuantity": 5,
    "runtimeStatus": "ONLINE",
    "readyPrinterCount": 7,
    "capacitySatisfied": true
  }
}

Avoid N+1 frontend requests.

Join or project the summary in the backend list endpoint.

Phase 13 — Workstation Detail Changes

Add:

Print Station Integration

Display:

Print Station Code
Print Station Name
Adapter ID
Allocated Printer Quantity
Total Station Capacity
Total Allocated Capacity
Remaining Station Capacity
Runtime Status
Kafka Status
Printing Service Status
Registered Printers
Ready Printers
Last Heartbeat
Latest Error
Capacity Satisfaction

Example:

Print Station: PRINT-STATION-01
Allocated to this Workstation: 5 printers
Station capacity: 10
Total allocated: 8
Remaining: 2
Ready now: 7
Status: Connected

When runtime ready capacity is below the Workstation allocation, show:

Degraded — 5 printers allocated, only 3 currently ready.

Add navigation to the Print Station detail page.

Phase 14 — Workstation Create/Edit Flow

Keep two independent sections.

Physical Machine Requirements

Only Machine, Equipment, or Machine Unit resources.

Print Station Integration

Allow selecting zero or one Print Station.

Require an allocation quantity when a station is selected.

Candidate display:

PRINT-STATION-01
Capacity: 10
Allocated: 8
Remaining: 2
Ready now: 7
Runtime: Online

Rules:

No Print Station selected
→ allocation quantity must be empty or zero

Print Station selected
→ allocation quantity must be a positive integer

Requested allocation > remaining capacity
→ reject

Editing current binding must include its existing allocation in available capacity calculation.

Phase 15 — API Changes
Print Station summary API

Return:

{
  "registeredPrinterCount": 10,
  "activeForWorkPrinterCount": 10,
  "configuredAllocationLimit": null,
  "effectiveAllocationCapacity": 10,
  "allocatedPrinterQuantity": 8,
  "remainingPrinterQuantity": 2,
  "readyPrinterCount": 7,
  "allocationDeficit": 0,
  "linkedWorkstationCount": 2
}
Create binding
POST /api/mes/master-data/print-stations/{id}/workstation-bindings
{
  "workstationId": "...",
  "allocatedPrinterQuantity": 5,
  "role": "PRIMARY",
  "effectiveFrom": "..."
}
Update allocation
PATCH /api/mes/master-data/workstation-print-station-bindings/{bindingId}
{
  "allocatedPrinterQuantity": 4
}
End allocation
DELETE /api/mes/master-data/workstation-print-station-bindings/{bindingId}

Use the project’s actual effective-ending convention.

Candidate endpoint
GET /api/mes/master-data/print-stations/{id}/workstation-candidates
Workstation integration detail
GET /api/mes/master-data/workstations/{id}/print-station-integration
Phase 16 — Readiness Rules

A Workstation integrated with a Print Station is ready when:

active binding exists
allocated printer quantity > 0
Print Station lifecycle is active
edge heartbeat is current
Kafka is connected
printing service is connected
ready printer capacity is sufficient according to business policy

Define whether readiness requires:

readyPrinterCount >= this Workstation allocated quantity

or only:

readyPrinterCount > 0

Recommended enterprise rule:

readyPrinterCount >= total active allocated quantity
→ READY

readyPrinterCount > 0 but below total active allocation
→ READY_WITH_WARNINGS or DEGRADED

readyPrinterCount = 0
→ BLOCKED

If the edge internally schedules jobs and does not guarantee simultaneous printer usage, use warning rather than blocking for a temporary shortage.

Document the chosen policy.

Suggested codes:

PRINT_STATION_BINDING_MISSING
PRINT_STATION_ALLOCATION_MISSING
PRINT_STATION_ALLOCATION_EXCEEDS_CAPACITY
PRINT_STATION_OVER_ALLOCATED
PRINT_STATION_OFFLINE
PRINT_STATION_HEARTBEAT_STALE
PRINT_STATION_KAFKA_DISCONNECTED
PRINTING_SERVICE_UNAVAILABLE
NO_READY_PRINTER
READY_PRINTER_CAPACITY_BELOW_ALLOCATION
Phase 17 — Concurrency Tests

Capacity allocation must be race-safe.

Test:

Remaining capacity = 2

Request A allocates 2
Request B allocates 2 concurrently

Only one may succeed.

Use:

row locking;
serialisable transaction;
advisory lock;
or another repository-approved concurrency mechanism.

Do not rely on reading the current count and inserting later without protection.

Phase 18 — Automated Tests
Database and service tests
one Workstation cannot have two active Print Stations;
one Print Station may have multiple active Workstations;
positive allocation required;
total allocation cannot exceed capacity;
editing excludes current allocation from calculation;
unlink returns capacity;
ended rows do not consume capacity;
over-allocation after runtime capacity reduction is detected;
concurrent allocation cannot oversubscribe capacity.
Candidate tests
excludes Workstations bound to another Print Station;
excludes Workstations already linked to current Print Station from create candidates;
includes newly unlinked Workstation;
returns maximum allocatable quantity;
returns no allocatable candidates when remaining capacity is zero.
Print Station API tests
list returns printer capacity;
list returns allocated and remaining quantity;
Site column data is not required by UI;
detail returns multiple Workstation allocations;
ended bindings are excluded;
missing runtime returns Unknown.
Workstation API tests
list returns Print Station code and allocation quantity;
detail returns station capacity information;
unbound Workstation returns null integration;
runtime shortage is shown separately from binding existence.
Frontend tests
Print Station table shows capacity, allocated, and remaining;
Site column is removed;
multiple linked Workstations render correctly;
each binding shows allocated quantity;
selector disables when capacity is exhausted;
quantity cannot exceed remaining capacity;
editing allocation works;
unlink returns capacity;
Workstation list shows station and allocation;
Workstation detail shows full integration information;
stale state is refreshed after mutations.
Phase 19 — Runtime Verification

Use the live Print Station fixture.

Query runtime printer counts.
Confirm the effective allocation capacity.
Inspect current active Workstation bindings.
Assign valid allocation quantities to legacy bindings.
Confirm total allocation does not exceed capacity.
Open Print Station list.
Confirm Site column is removed.
Confirm capacity, allocated, and remaining columns are shown.
Open Print Station detail.
Confirm multiple active Workstations are shown correctly.
Confirm each Workstation shows its allocated quantity.
Add a new Workstation within remaining capacity.
Confirm allocated and remaining totals update.
Attempt allocation above remaining capacity.
Confirm backend rejection.
Exhaust the capacity.
Confirm the selector no longer permits a new binding.
Reduce one existing allocation.
Confirm capacity becomes available.
Bind another Workstation.
Unlink it.
Confirm capacity returns immediately.
Confirm the Workstation becomes available for another Print Station.
Confirm Workstation list shows integration and allocation quantity.
Confirm Workstation detail shows Print Station runtime and capacity.
Simulate runtime printer-count reduction.
Confirm over-allocation/degraded status is shown without deleting bindings.
Restore capacity.
Confirm automatic recovery.
Confirm historical binding rows remain in the database.
Acceptance Criteria

The task is complete only when:

One Print Station may have multiple active Workstation bindings.
One Workstation may have at most one active Print Station.
Every active binding has a positive allocated printer quantity.
Total active allocation cannot exceed effective station capacity.
Concurrent requests cannot oversubscribe capacity.
Ended bindings do not consume capacity.
Unlink returns capacity.
Runtime capacity reduction does not delete bindings.
Over-allocation is clearly reported.
Print Station table shows printer capacity.
Print Station table shows allocated quantity.
Print Station table shows remaining quantity.
Site column is removed.
Print Station detail shows multiple Workstations and their quantities.
Selector excludes Workstations bound elsewhere.
Selector blocks new linking when capacity is exhausted.
Workstation list shows Print Station and allocated quantity.
Workstation detail shows Print Station and runtime information.
Runtime and master-data states remain separate.
Builds, migrations, tests, and runtime verification pass.
Required Final Report

Report:

Capacity model
authoritative capacity source;
configured limit;
effective allocation capacity;
runtime-ready capacity;
over-allocation behaviour.
Database changes
allocation field;
constraints;
indexes;
concurrency strategy;
repair migration.
Existing data
bindings found;
quantities assigned;
over-allocation conflicts;
repair actions.
API changes
summary fields;
binding create/update/end;
candidates;
Workstation integration detail.
UI changes
table columns;
removed Site column;
Workstation allocation list;
quantity input;
filtering;
exhausted-capacity state;
Workstation list and detail changes.
Runtime evidence
printer capacity;
allocated quantity;
remaining quantity;
linked Workstations;
failed over-capacity request;
unlink and returned capacity;
degraded runtime-capacity scenario.

Do not report “implemented and verified” unless the backend prevents over-allocation under concurrent requests and the live MES UI displays correct capacity totals for multiple linked Workstations.