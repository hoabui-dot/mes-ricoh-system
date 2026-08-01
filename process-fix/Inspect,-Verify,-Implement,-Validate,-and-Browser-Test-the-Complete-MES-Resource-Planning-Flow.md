# Inspect, Verify, Implement, Validate, and Browser-Test the Complete MES Resource Planning Flow

## Role

Act as a senior MES solution architect, senior backend engineer, senior frontend engineer, database engineer, QA automation engineer, and implementation auditor.

Your task is to inspect the current Resource Planning implementation, verify the actual running architecture, identify gaps, implement the missing flow step by step, create a complete use-case validation suite, and execute a full Browser E2E test for the entire Resource Planning workflow.

Do not stop after producing an analysis.

Continue implementing each required step until the complete Resource Planning flow is working and verified, unless a real technical or environmental blocker prevents further progress.

When a blocker prevents completion, create a detailed Markdown report describing:

- the blocker;
- the exact failed step;
- the evidence;
- the affected files or services;
- commands already attempted;
- logs or error responses;
- the required corrective action;
- the next executable step after the blocker is resolved.

Do not claim completion unless the implementation, validation scripts, and Browser E2E have actually run successfully.

---

# 1. Primary objective

Complete the basic MES Resource Planning workflow after the Machine Flow has reached 100% completion.

The target flow is:

```text
Released Production Version
        ↓
Create Work Order
        ↓
Resolve Routing Operations
        ↓
Resolve Work Center for each Operation
        ↓
Find Workstations under the Work Center
        ↓
Validate Workstation eligibility
        ↓
Validate Machine Requirements
        ↓
Validate effective Machine Unit assignments
        ↓
Return Ready and Blocked candidates
        ↓
Planner manually selects a Workstation
        ↓
Resolve exact Physical Machine Units
        ↓
Commit Work Order Resource Allocation
        ↓
Verify allocation persistence
        ↓
Execution uses the committed allocation

This is a basic manual planning flow for demonstration.

Do not implement:

workstation scoring;
machine scoring;
weighted ranking;
APS;
finite-capacity optimization;
AI dispatch;
automatic scheduling;
scenario optimization;
load balancing;
predictive allocation;
digital twin;
production simulation.

Candidates only need to be classified as:

READY
BLOCKED

Blocked candidates must include clear blocking reasons.

2. Current completed architecture that must be preserved

The Machine domain is already complete and verified.

Preserve the following ownership model.

Product Definition
Item
  ↓
Item Revision
  ├── EBOM
  ├── MBOM
  ├── Routing
  └── Production Version

A released Production Version must reference a compatible released Item Revision, MBOM, and Routing.

Released Product Definition records remain immutable according to the current domain rules.

Routing

Routing Operations target a Work Center.

Routing Operation
        ↓
Work Center

Routing must not directly own the final selected Workstation for the basic planning flow.

The Workstation is selected during Work Order planning.

Do not add an Execution Scenario entity unless the actual existing architecture already requires it and the current use case cannot be completed without it.

Workstation
Work Center
    ↓
Workstation
      ├── Machine Requirement Groups
      ├── Effective Resource Assignments
      ├── Machine Readiness
      └── Assignment History
Machine
Machine Definition
        ↓
Physical Machine Unit
        ↓
Resource Assignment
        ↓
Workstation

A Machine Definition is not a physical machine.

A Physical Machine Unit owns:

asset code;
serial number;
physical identity;
lifecycle;
execution status;
planning eligibility.
Requirement versus Assignment

Machine Requirement answers:

What type and quantity of machine does this Workstation require?

Resource Assignment answers:

Which exact Physical Machine Unit is currently assigned to this Workstation?

These concepts must remain separate.

Work Order Allocation

Work Order Resource Allocation answers:

Which Workstation and exact Physical Machine Units are committed to this Work Order operation?

Work Order allocation must not modify Workstation master assignments.

Master assignment and Work Order allocation must remain separate.

3. Inspect the current implementation before changing code

Before implementing anything, inspect the actual repository and running environment.

The source code, migrations, database constraints, API behavior, and running UI are authoritative.

Documentation is supporting context only.

Inspect at minimum:

Repository structure
root package.json;
workspace definitions;
backend services;
MES Console;
shared packages;
database packages;
current migrations;
seed scripts;
verification scripts;
Browser E2E setup;
CI configuration;
Docker Compose or deployment manifests.
Existing Work Order domain

Inspect:

Work Order entity and table;
Work Order Operation entity;
Work Order status lifecycle;
Production Version reference;
Routing reference;
Routing Operation snapshot or reference;
planned quantity;
Site;
Work Center;
planned start/end;
release behavior;
dispatch behavior;
execution relationship.
Existing Resource Planning domain

Inspect whether the following already exist:

resource allocation table;
workstation allocation table;
machine allocation table;
employee allocation table;
resource reservation;
allocation status;
allocation history;
planner APIs;
candidate APIs;
planning service;
readiness service;
dispatch service;
manual assignment UI;
planner UI;
allocation UI.
Existing Machine integration

Inspect:

Workstation Machine Requirements;
Resource Assignments;
effective date rules;
Machine Unit availability;
planning eligibility;
lifecycle validation;
current Machine Readiness API;
assignment history;
exact unit mapping.
Existing Product Definition integration

Inspect:

Production Version release rules;
Routing Operations;
Work Center mapping;
Production Standard mapping;
MBOM issue operation mapping;
Work Order creation from Production Version.
Existing UI

Inspect:

Work Order list;
Work Order create form;
Work Order detail;
operation detail;
planning tabs;
allocation tabs;
dispatch tabs;
readiness views;
existing stable selectors;
loading states;
translated messages;
API cache invalidation behavior.
Runtime environment

Verify:

MES Console URL;
SSO/Keycloak;
API gateway;
Work Order service;
Master Data service;
Product Definition service;
execution service;
database connectivity;
Kafka connectivity where relevant;
required demo data;
Browser E2E availability.
4. Produce an initial design verification report

Before implementation, create:

implementation-fix/resource-planning-design-verification-<YYYYMMDD>.md

The report must describe the actual current state.

Use these sections:

# Resource Planning Design Verification

## Executive Summary

## Current Running Architecture

## Existing Entities and Tables

## Existing APIs

## Existing UI

## Existing Scripts and Tests

## Confirmed Working Parts

## Missing Parts

## Architectural Inconsistencies

## Data Integrity Risks

## Implementation Risks

## Recommended Minimal Design

## Step-by-Step Implementation Plan

## Blockers

## Final Initial Assessment

Clearly distinguish:

already implemented;
partially implemented;
missing;
obsolete;
duplicated;
inconsistent;
blocked.

Do not begin by creating duplicate entities or APIs when the repository already contains equivalent functionality.

5. Define the minimal authoritative Resource Planning design

Use the existing architecture where possible.

The minimal target design should support the following.

Candidate Resolution

Input:

Work Order ID;
Work Order Operation ID, where operations are modeled separately.

Resolve:

Work Order
  ↓
Production Version
  ↓
Routing
  ↓
Routing Operation
  ↓
Work Center
  ↓
Workstations

For every Workstation under the resolved Work Center, determine:

READY
BLOCKED

Candidate output must include:

Workstation ID;
Workstation code;
localized name;
Work Center;
active lifecycle status;
eligibility status;
blocking reasons;
required Machine Definitions;
required quantity;
assigned Physical Machine Units;
available Physical Machine Units;
exact selectable Machine Units where applicable.

Do not add a numeric score.

Do not sort by artificial optimization criteria.

A stable business sort such as Workstation code is sufficient.

Minimum hard filters

A Workstation is blocked when any applicable condition is false:

belongs to the Routing Operation Work Center;
lifecycle is active/released according to current rules;
planning is enabled;
required Machine Requirement groups are satisfiable;
enough exact Physical Machine Units are effectively assigned;
Machine Units are identified;
Machine Units are planning eligible;
Machine Unit lifecycle permits planning;
Machine Unit execution status is available;
no conflicting active Work Order allocation exists where exclusivity applies;
required Site/Work Center relationships are consistent.

Use the current domain rules instead of inventing new states.

Manual planner selection

The planner must be able to:

Open Work Order Operation
  ↓
View candidate Workstations
  ↓
See Ready and Blocked candidates
  ↓
See blocking reasons
  ↓
Select one Ready Workstation
  ↓
Select or confirm exact Physical Machine Units
  ↓
Commit allocation

Blocked candidates must not be allocatable.

Resource Allocation

Prefer extending the existing allocation model if one exists.

A committed allocation should contain enough information to identify:

Work Order;
Work Order Operation;
Routing Operation;
Work Center;
selected Workstation;
exact Physical Machine Unit;
allocation role;
planned quantity where relevant;
allocation status;
committed timestamp;
committed by;
cancellation or release timestamp;
history or audit metadata.

Do not place a mutable array of Machine Unit IDs directly on Workstation or Work Order if a normalized allocation model already exists or is required.

Allocation lifecycle

Use the existing lifecycle where available.

Otherwise implement a minimal lifecycle such as:

DRAFT
COMMITTED
RELEASED
CANCELLED

Avoid creating states that are not needed by the current demo.

A committed allocation must not silently change when the Workstation master assignment changes later.

The allocation must preserve the exact planned resource identity.

Concurrency

Allocation commit must revalidate eligibility inside the same transaction.

The system must prevent two incompatible Work Orders from simultaneously allocating the same exclusive Machine Unit.

Use database constraints, locking, transactional validation, or the repository’s current concurrency mechanism.

Do not rely only on a frontend validation check.

6. Implement step by step

Proceed through the implementation in the following order.

Do not attempt all changes at once.

After each step:

build or typecheck the affected service;
run the relevant tests;
verify the API manually;
record the result;
continue only after the current step is stable.
Step 1 — Confirm and repair Work Order creation from Production Version

Verify that a Work Order can be created from a released Production Version.

Validate:

Item Revision;
MBOM;
Routing;
Site;
planned quantity;
Work Order number;
Work Order lifecycle;
operation generation or resolution;
Production Version compatibility.

If operation rows are generated from Routing, verify that each Work Order Operation preserves:

routing operation identity;
sequence;
operation;
Work Center;
production standard reference where applicable.

Do not duplicate operations when retrying Work Order creation.

Add or repair idempotency and uniqueness rules where appropriate.

Exit criteria:

Released Production Version
  -> Create Work Order
  -> Work Order Operations exist
  -> Each operation resolves the correct Work Center
Step 2 — Implement or repair Candidate Resolver

Create a single authoritative backend resolver.

Suggested service responsibility:

resolveCandidates(workOrderId, workOrderOperationId)

Do not duplicate candidate logic in controllers and frontend code.

The resolver must return both Ready and Blocked Workstations.

Suggested response shape:

{
  "workOrderId": "uuid",
  "workOrderOperationId": "uuid",
  "routingOperationId": "uuid",
  "workCenter": {
    "id": "uuid",
    "code": "WC-COMP-01",
    "name": "Compression Molding"
  },
  "summary": {
    "total": 3,
    "ready": 1,
    "blocked": 2
  },
  "candidates": [
    {
      "workstation": {
        "id": "uuid",
        "code": "WS-COMP-01",
        "name": "Compression Press Station 01"
      },
      "status": "READY",
      "blockingReasons": [],
      "machineRequirements": [
        {
          "machineDefinitionId": "uuid",
          "machineDefinitionCode": "MCH-HYD-PRESS",
          "requiredQuantity": 1,
          "assignedQuantity": 1,
          "availableQuantity": 1,
          "selectableUnits": [
            {
              "id": "uuid",
              "assetCode": "WST-HP-001",
              "serialNumber": "HP-2026-001"
            }
          ]
        }
      ]
    },
    {
      "workstation": {
        "id": "uuid",
        "code": "WS-COMP-02",
        "name": "Compression Press Station 02"
      },
      "status": "BLOCKED",
      "blockingReasons": [
        {
          "code": "MACHINE_REQUIREMENT_UNSATISFIED",
          "messageKey": "resourcePlanning.machineRequirementUnsatisfied",
          "details": {
            "requiredQuantity": 1,
            "availableQuantity": 0
          }
        }
      ],
      "machineRequirements": []
    }
  ]
}

Reuse current API error and i18n conventions.

Exit criteria:

resolver returns deterministic results;
Ready and Blocked candidates are both visible;
blocking reasons are structured;
no numeric score exists;
no N+1 query explosion for normal demo data.
Step 3 — Implement Candidate API

Use the repository’s current REST conventions.

A possible endpoint is:

GET /work-orders/{workOrderId}/operations/{operationId}/candidate-workstations

Or reuse an existing equivalent route.

Requirements:

authentication;
authorization;
Site access validation;
Work Order existence validation;
operation ownership validation;
released Product Definition validation where required;
structured response;
localized message keys rather than backend-localized hardcoded text where that is the current convention.

Add tests for:

valid candidate resolution;
missing Work Order;
operation not owned by Work Order;
no Work Center;
no Workstations;
all candidates blocked;
mixed Ready and Blocked candidates.
Step 4 — Implement allocation preview and validation

Before committing, support validation of a selected candidate.

Possible command:

POST /work-orders/{workOrderId}/operations/{operationId}/resource-allocation/validate

Input:

{
  "workstationId": "uuid",
  "machineUnitIds": ["uuid"]
}

Validate:

selected Workstation belongs to the candidate Work Center;
candidate is still Ready;
exact units satisfy all requirements;
no duplicate unit;
each unit is assigned to the selected Workstation;
each unit is identified;
each unit is planning eligible;
each unit is available;
each unit has no incompatible allocation conflict;
quantity requirements are satisfied.

The preview must not create persistent allocation rows.

Return:

VALID
INVALID

with structured reasons.

Step 5 — Implement atomic allocation commit

Implement or repair the allocation command.

Possible route:

POST /work-orders/{workOrderId}/operations/{operationId}/resource-allocation

Input:

{
  "workstationId": "uuid",
  "machineUnitIds": ["uuid"],
  "note": "Planner-selected resource"
}

Inside one transaction:

lock or protect the relevant Work Order Operation;
re-resolve eligibility;
validate the Workstation;
validate each Physical Machine Unit;
detect conflicting active allocations;
create or update the operation-level allocation according to lifecycle rules;
create exact Machine Unit allocation rows;
write audit/history information;
commit;
return the persisted allocation.

Do not:

allocate blocked candidates;
trust stale frontend candidate data;
overwrite history without traceability;
alter Workstation Resource Assignment;
modify Machine Unit master assignment as a side effect.

Add concurrency validation.

At least test that a second incompatible allocation against the same exclusive Machine Unit is rejected.

Step 6 — Implement allocation read and cancellation

Implement or verify:

GET /work-orders/{workOrderId}/operations/{operationId}/resource-allocation

And where required:

POST /work-orders/{workOrderId}/operations/{operationId}/resource-allocation/cancel

Cancellation must:

preserve allocation history;
make the resource available for future planning when appropriate;
require a reason if current conventions require one;
not delete audit evidence.
Step 7 — Implement Planner UI

Extend the existing Work Order detail instead of creating an unrelated standalone planning application unless current architecture already has one.

Recommended layout:

Work Order Detail
  ├── Summary
  ├── Operations
  ├── Materials
  ├── Resource Planning
  ├── Readiness
  └── Execution

Within Resource Planning:

Operation list
  ↓
Selected Operation
  ↓
Candidate Workstations
  ↓
Ready / Blocked
  ↓
Machine requirement detail
  ↓
Exact Machine Unit selection
  ↓
Validate
  ↓
Commit Allocation

Candidate card or row must display:

Workstation code and name;
Work Center;
Ready or Blocked;
blocking reasons;
Machine required quantity;
assigned quantity;
available quantity;
exact selectable units;
current allocation indicator.

Requirements:

Blocked candidate cannot be selected;
stale candidates refresh before commit;
validate and commit are separate when useful;
commit button is protected against duplicate submission;
success automatically refreshes the allocation;
errors are translated and structured;
no raw UUID or enum appears as the primary UI identity;
no browser alert() or confirm().

Add stable selectors.

Suggested contract:

work-order-resource-planning-tab
work-order-operation-list
work-order-operation-row
candidate-workstation-list
candidate-workstation-card
candidate-workstation-status
candidate-blocking-reasons
candidate-machine-requirement
candidate-machine-unit-option
candidate-select-button
allocation-validate-button
allocation-commit-button
allocation-current-summary
allocation-cancel-button
allocation-history
Step 8 — Connect committed allocation to Execution

Verify the current execution flow.

When execution starts for a Work Order Operation:

it must use the committed Workstation;
it must use the committed Physical Machine Units;
it must not silently select another Workstation;
it must reject start when a mandatory committed allocation is missing;
it must reject start when allocation has been cancelled;
it must preserve the allocation identity in execution records.

Do not build advanced dispatch orchestration.

For the demo, it is sufficient that the committed planning result is authoritative for execution.

7. Build a complete Resource Planning use-case catalog

After implementation, create:

docs/testing/mes-resource-planning-use-cases.md

The document must contain a complete set of functional and validation use cases.

Use this structure for every case:

## UC-RP-XXX — Use-case title

### Objective

### Preconditions

### Test Data

### User Steps

### API Steps

### Expected Result

### Database Validation

### Cleanup

### Result

At minimum include the following.

Happy-path use cases
UC-RP-001 — Create Work Order from released Production Version
Released Production Version
  -> Create Work Order
  -> Generate Work Order Operations
  -> Resolve Work Center
UC-RP-002 — Resolve candidate Workstations
Operation Work Center
  -> Find Workstations
  -> Return Ready and Blocked candidates
UC-RP-003 — Select Ready Workstation manually
View candidates
  -> Select Ready Workstation
  -> Select exact Machine Units
  -> Validate
UC-RP-004 — Commit Resource Allocation
Valid selection
  -> Commit transaction
  -> Persist Workstation allocation
  -> Persist exact Machine Units
UC-RP-005 — Read committed allocation
Refresh
  -> Allocation remains visible
  -> Exact Workstation and Machine Units remain unchanged
UC-RP-006 — Execution uses committed allocation
Committed allocation
  -> Start operation
  -> Execution references selected Workstation and Machine Units
UC-RP-007 — Cancel allocation
Committed allocation
  -> Cancel with reason
  -> History preserved
  -> Resource becomes reusable
Validation and negative use cases
UC-RP-101 — Production Version is not released

Expected:

Work Order creation or planning is blocked according to current policy.
UC-RP-102 — Routing Operation has no Work Center

Expected:

no candidate resolution;
structured blocking reason.
UC-RP-103 — Work Center has no active Workstations

Expected:

empty candidate set;
explicit reason.
UC-RP-104 — Workstation is inactive

Expected:

candidate is Blocked.
UC-RP-105 — Machine Requirement is missing an effective assignment

Expected:

candidate is Blocked;
reason identifies unsatisfied Machine Requirement.
UC-RP-106 — Assigned Machine Unit is pending identification

Expected:

candidate is Blocked.
UC-RP-107 — Machine Unit is not planning eligible

Expected:

candidate is Blocked.
UC-RP-108 — Machine Unit is in Maintenance

Expected:

candidate is Blocked.
UC-RP-109 — Machine Unit is Out of Service

Expected:

candidate is Blocked.
UC-RP-110 — Required quantity is greater than available quantity

Expected:

candidate is Blocked;
required, assigned, and available quantities are returned.
UC-RP-111 — Selected Workstation belongs to another Work Center

Expected:

validation and commit rejected.
UC-RP-112 — Selected Machine Unit is not assigned to selected Workstation

Expected:

validation and commit rejected.
UC-RP-113 — Duplicate Machine Unit IDs are submitted

Expected:

validation rejected.
UC-RP-114 — Stale candidate becomes unavailable before commit

Flow:

Resolve Ready candidate
  -> change Machine Unit to Maintenance
  -> attempt commit

Expected:

commit revalidation rejects the stale selection.
UC-RP-115 — Same exclusive Machine Unit allocated by two Work Orders

Expected:

one commit succeeds;
conflicting commit fails;
no duplicate active allocation exists.
UC-RP-116 — Blocked candidate selected through direct API call

Expected:

backend rejects the request regardless of frontend restrictions.
UC-RP-117 — Allocation commit submitted twice

Expected:

idempotent result or controlled conflict;
no duplicate allocation rows.
UC-RP-118 — Cancelled allocation used for execution

Expected:

execution start rejected.
UC-RP-119 — Execution without mandatory allocation

Expected:

start rejected with clear reason.
UC-RP-120 — Unauthorized planner

Expected:

API and UI deny commit action.
8. Create a full use-case validation script

Create one authoritative orchestration script.

Recommended location:

scripts/test-mes-resource-planning-flow.mjs

Or use the repository’s existing script language and conventions.

Add a maintained package command:

{
  "scripts": {
    "test:mes:resource-planning-flow": "node scripts/test-mes-resource-planning-flow.mjs"
  }
}

Do not create multiple overlapping scripts for the same full flow.

The script must execute a complete Resource Planning use case from setup through cleanup.

Full scripted flow

The script must execute, at minimum:

1. Verify environment safety
2. Resolve authentication
3. Resolve demo Site
4. Resolve released Production Version
5. Resolve Routing and Routing Operations
6. Resolve target Work Center
7. Create or locate one Ready Workstation
8. Create or locate one Blocked Workstation
9. Verify Machine Requirements
10. Verify exact Physical Machine Units
11. Create Work Order
12. Verify Work Order Operations
13. Request candidate Workstations
14. Verify Ready candidate
15. Verify Blocked candidate and reasons
16. Validate Ready selection
17. Commit Resource Allocation
18. Read allocation after refresh
19. Verify exact Workstation
20. Verify exact Physical Machine Units
21. Verify duplicate commit behavior
22. Verify conflicting allocation behavior
23. Verify execution uses committed allocation
24. Cancel allocation where supported
25. Verify history
26. Cleanup test-owned data

Every step must print:

[START] Step description
[PASS] Step result
[FAIL] Step result
[SKIP] Step result and reason

At the end print:

Resource Planning Verification Summary

Total:
Passed:
Failed:
Skipped:
Run ID:
Work Order:
Work Order Operation:
Ready Workstation:
Blocked Workstation:
Allocated Machine Units:
Cleanup:
Duration:

The process must exit with a non-zero exit code when a required assertion fails.

9. Validation script requirements
Data isolation

Use a unique run ID:

E2E-RP-<timestamp>-<random>

Use it for disposable:

Work Order number or note;
descriptions;
allocation note;
temporary fixture names where necessary.

Do not overwrite the canonical Won Seal Tech demo data.

Prefer reusing stable released Product Definition and Master Data fixtures.

Create only the minimum disposable data required.

Safety

Before mutations, validate:

environment is not production;
explicit mutation flag exists;
required service URLs exist;
credentials exist;
target Site exists;
target Production Version exists.

Suggested guard:

ALLOW_RESOURCE_PLANNING_E2E_MUTATION=true

Do not rely only on localhost detection.

Cleanup

Cleanup must:

cancel or release test allocations;
remove disposable execution records where safely supported;
remove disposable Work Order Operations;
remove disposable Work Order;
leave shared Product Definition and Master Data intact;
verify no test-owned active allocation remains;
print cleanup status.

Do not weaken production dependency protection to make cleanup easier.

10. Add focused backend tests

Add unit or integration tests around the core candidate and allocation services.

At minimum verify:

Work Center candidate lookup;
active Workstation filtering;
Machine Requirement quantity evaluation;
effective Resource Assignment evaluation;
Machine Unit lifecycle evaluation;
planning eligibility evaluation;
availability evaluation;
conflict detection;
allocation transaction rollback;
idempotency;
cancellation;
audit/history preservation.

Mock only external dependencies.

Use real database integration tests for transaction and uniqueness behavior where the repository supports them.

11. Implement full Browser E2E

After backend, script, and UI verification pass, implement Browser E2E for the complete Resource Planning flow.

Reuse the existing Playwright setup used by the completed Machine Flow.

Do not create a second Browser E2E framework.

Suggested structure:

e2e/
  resource-planning/
    resource-planning-flow.spec.ts
    resource-planning-validation.spec.ts

  pages/
    WorkOrderListPage.ts
    WorkOrderCreatePage.ts
    WorkOrderDetailPage.ts
    ResourcePlanningPage.ts
    ExecutionPage.ts

  fixtures/
    resource-planning-test-data.ts
12. Mandatory Browser E2E happy path

The full browser test must execute the following through the browser where the action is part of the user flow:

Authenticate
  ↓
Open Work Orders
  ↓
Create Work Order from released Production Version
  ↓
Open Work Order detail
  ↓
Verify generated Operations
  ↓
Open Resource Planning
  ↓
Select an Operation
  ↓
Load candidate Workstations
  ↓
Verify one Ready candidate
  ↓
Verify one Blocked candidate
  ↓
Open Blocked reasons
  ↓
Select the Ready candidate
  ↓
Select exact Physical Machine Unit
  ↓
Validate selection
  ↓
Commit allocation
  ↓
Verify success feedback
  ↓
Refresh browser
  ↓
Verify allocation persistence
  ↓
Open Execution
  ↓
Verify committed Workstation and Machine Unit
  ↓
Start or validate execution according to current implemented flow
  ↓
Verify execution references committed allocation
  ↓
Cleanup disposable fixture

The browser test must prove the complete chain:

Product Definition
  -> Work Order
  -> Work Order Operation
  -> Candidate Resolution
  -> Manual Selection
  -> Resource Allocation
  -> Execution
13. Mandatory Browser E2E validation cases

Add focused browser validation tests for the most important user-facing failures.

At minimum:

Blocked candidate

Verify:

candidate displays Blocked badge;
blocking reason is visible;
select action is unavailable.
Stale candidate

Flow:

Load Ready candidate
  -> modify prerequisite through API
  -> commit from browser

Verify:

backend rejects commit;
UI displays translated stale-readiness error;
no allocation is created.
Duplicate commit

Verify:

double-click or repeated submit does not create duplicate allocation;
button disables while request is in progress.
Refresh persistence

Verify:

committed Workstation and Machine Units remain after refresh;
UI loads persisted allocation rather than stale client state.
Cancel allocation

Verify:

confirmation dialog;
cancellation reason where required;
history remains visible;
current allocation state changes correctly.
Authorization

Where test credentials are available, verify that a non-planner user cannot commit allocation.

14. Browser E2E selector contract

Prefer accessible roles and labels.

Add stable selectors only where necessary.

Recommended selectors:

work-order-list
work-order-create-button
work-order-create-form
work-order-production-version-select
work-order-quantity-input
work-order-save-button

work-order-detail
work-order-operation-list
work-order-operation-row
work-order-resource-planning-tab

candidate-workstation-list
candidate-workstation-card
candidate-workstation-ready
candidate-workstation-blocked
candidate-blocking-reason-list
candidate-select-button

candidate-machine-requirement-list
candidate-machine-unit-list
candidate-machine-unit-checkbox

resource-allocation-validate-button
resource-allocation-commit-button
resource-allocation-summary
resource-allocation-status
resource-allocation-cancel-button
resource-allocation-history

execution-tab
execution-workstation
execution-machine-unit
execution-start-button

Do not use:

generated class names;
deep CSS selectors;
nth-child;
raw UUID text;
arbitrary timeouts.
15. Demo polishing for Resource Planning

Improve the presentation without introducing unnecessary architecture.

Work Order list

Ensure the list clearly displays:

Work Order number;
Item;
Revision;
Production Version;
planned quantity;
status;
operation planning summary;
allocated versus unallocated operations.
Work Order detail

Clearly separate:

Definition
Operations
Materials
Resource Planning
Readiness
Execution
History

Do not merge planning and execution into one ambiguous section.

Candidate UI

Every candidate must clearly show:

Workstation identity;
Ready or Blocked;
Work Center;
Machine Requirement summary;
exact available Machine Units;
blocking reasons;
current allocation state.

Do not show raw API objects.

Do not show raw enum values.

Allocation UI

Clearly display:

selected Workstation;
exact Machine Units;
allocation status;
committed time;
committed by;
cancellation status;
history.
Feedback

Every mutation must include:

loading state;
duplicate-submit prevention;
success toast;
translated error toast;
structured detail;
automatic cache refresh;
no manual refresh requirement.
Empty states

Examples:

No candidate Workstations were found for this Work Center.
All candidate Workstations are currently blocked.
Review the blocking reasons before planning this operation.
This operation has not been allocated.
Select a Ready Workstation to continue.
i18n

Register all required messages for:

Vietnamese;
English;
Japanese;
Korean.

Vietnamese remains the default.

No raw translation key, enum, UUID, or [object Object] may appear.

16. Documentation

Create the following files.

Design verification
implementation-fix/resource-planning-design-verification-<YYYYMMDD>.md
Implementation report
implementation-fix/complete-resource-planning-flow-<YYYYMMDD>.md
Use-case catalog
docs/testing/mes-resource-planning-use-cases.md
Browser E2E guide
docs/testing/mes-resource-planning-browser-e2e.md
Blocker report

Only when a real blocker exists:

implementation-fix/resource-planning-blocker-<YYYYMMDD-HHmm>.md
17. Blocker handling

Do not stop at the first failure.

Attempt reasonable corrective actions in sequence.

For example:

Inspect logs
  -> verify configuration
  -> verify migration
  -> verify environment variables
  -> rebuild affected service
  -> restart affected service
  -> check health
  -> retry API
  -> retry script
  -> retry Browser E2E

Create a blocker report only when:

required infrastructure is unavailable;
access credentials are unavailable;
an external dependency cannot be repaired from the repository;
a destructive migration requires explicit approval;
a production-only safety restriction prevents testing;
an unrecoverable data inconsistency requires business clarification.

The blocker report must contain:

# Resource Planning Implementation Blocker

## Blocked Objective

## Current Step

## Expected Behavior

## Actual Behavior

## Error Evidence

## Logs

## Commands Executed

## Files Inspected

## Root Cause Assessment

## Attempted Fixes

## Why Automatic Recovery Is Not Safe

## Required Human Decision or Infrastructure Change

## Exact Next Command After Resolution

If only one optional validation case is blocked, continue implementing all other applicable cases.

18. Verification commands

Run the actual repository equivalents.

At minimum verify:

npm run machines:verify
npm run test:mes:machine-flow
npm run test:mes:resource-planning-flow
npm run test:e2e:machine
npm run test:e2e:resource-planning
npm run typecheck
npm run build
git diff --check

Also verify relevant service health.

Examples:

Master Data service
Product Definition service
Work Order service
Execution service
MES Console
API Gateway
Keycloak
Kafka where required

Run the full safe demo flow:

ALLOW_RESOURCE_PLANNING_E2E_MUTATION=true \
npm run test:mes:resource-planning-flow

ALLOW_RESOURCE_PLANNING_E2E_MUTATION=true \
npm run test:e2e:resource-planning

Do not claim Browser E2E success unless Chromium actually executed and the browser test passed.

19. Package scripts

Audit before adding scripts.

Prefer final maintained commands such as:

{
  "scripts": {
    "test:mes:resource-planning-flow": "node scripts/test-mes-resource-planning-flow.mjs",
    "test:e2e:resource-planning": "playwright test e2e/resource-planning --project=chromium",
    "test:e2e:resource-planning:headed": "playwright test e2e/resource-planning --project=chromium --headed",
    "test:e2e:resource-planning:debug": "playwright test e2e/resource-planning --project=chromium --debug",
    "test:e2e:resource-planning:report": "playwright show-report",
    "demo:resource-planning:verify": "npm run test:mes:resource-planning-flow && npm run test:e2e:resource-planning"
  }
}

Reuse equivalent existing commands.

Do not add duplicate aliases with identical behavior.

20. Acceptance criteria

The Resource Planning phase is complete only when all mandatory criteria pass.

Architecture
Routing Operation resolves a Work Center.
Planning resolves candidate Workstations.
Routing does not own the selected Workstation.
Machine Requirement remains separate from Resource Assignment.
Work Order allocation remains separate from master assignment.
Exact Physical Machine Units are persisted.
Allocation history is preserved.
No scoring or APS logic is introduced.
Candidate resolution
Ready and Blocked candidates are returned.
Blocking reasons are structured and visible.
Required, assigned, and available quantities are correct.
Ineligible Machine Units are excluded.
Candidate output is deterministic.
Allocation
Planner can select a Ready Workstation.
Exact Machine Units can be selected.
Backend revalidates at commit.
Commit is atomic.
Conflicts are prevented.
Repeated submission does not create duplicates.
Allocation persists after refresh.
Cancellation preserves history.
Execution
Execution uses the committed Workstation.
Execution uses the committed Machine Units.
Missing or cancelled allocation blocks execution where required.
Validation script
Full use case passes.
Mandatory validation cases pass.
Cleanup succeeds.
Script exits non-zero on required failure.
No unrelated fixture is modified.
Browser E2E
SSO login works.
Work Order is created through the browser.
operations are visible;
candidates are loaded;
Ready and Blocked candidates are verified;
blocking reasons are visible;
Ready candidate is selected;
exact Machine Unit is selected;
allocation is committed;
persistence is verified after refresh;
execution references the allocation;
cleanup succeeds.
Quality
typecheck passes;
build passes;
relevant backend tests pass;
service health is valid;
git diff --check passes;
no raw UUID, enum, translation key, or object rendering appears in the demo flow.
21. Final implementation report

After completing the task, create:

implementation-fix/complete-resource-planning-flow-<YYYYMMDD>.md

Use this structure:

# Complete Resource Planning Flow Implementation Report

## Final Status

## Executive Summary

## Initial Architecture Assessment

## Implemented Architecture

## Database Changes

## Backend Changes

## API Changes

## Frontend Changes

## Candidate Resolver

## Resource Allocation

## Execution Integration

## Validation Use Cases

## Full Validation Script

## Browser E2E

## Demo Polishing

## Files Changed

## Migrations

## Package Scripts

## Environment Variables

## Verification Commands

## Verification Results

## Cleanup Result

## Remaining Limitations

## Blockers

## Final Acceptance Criteria

## Final Conclusion

The report must state one of:

Resource Planning Flow: COMPLETE
Resource Planning Flow: PARTIALLY COMPLETE
Resource Planning Flow: BLOCKED

Use COMPLETE only when:

the full backend flow passes;
the validation script passes;
the full Browser E2E passes;
cleanup succeeds;
build and typecheck pass.
22. Final expected output

When finished, provide a concise execution summary containing:

Design verification:
Implementation:
Candidate resolver:
Allocation transaction:
Execution integration:
Validation use cases:
Full validation script:
Browser E2E:
Build:
Typecheck:
Cleanup:
Report:
Final status:

Include the paths of all generated Markdown reports.

Do not provide only recommendations.

Inspect, implement, run, repair, validate, and continue step by step until the complete Resource Planning flow is operational or a documented real blocker prevents completion.