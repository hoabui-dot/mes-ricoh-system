# Phase 1 — Complete MES Resource Master Data Foundation

## Role

Act as a senior MES domain architect, database engineer, backend engineer, frontend engineer, and enterprise product designer.

Your task is to complete the missing **resource master-data foundation** in the MES platform.

This phase must focus only on master data and its management UX. Do not implement full Work Order scheduling, automatic machine allocation, or Kiosk execution logic yet. Those belong to later phases.

The implementation must align with:

- `product-doc/IV-RESOURCES & CAPABILITIES CATALOG.md`
- The current `AI_CONTEXT.md`
- Existing repository source code, migrations, service manifests, APIs, tests, Docker configuration, and runtime behavior

The running source code and database are the source of truth. Product documents define the target domain model but must not be treated as already implemented.

---

# 1. Phase Goal

Complete the following resource hierarchy and master-data relationships:

```text
Site
└── Production Area
    └── Work Center
        └── Workstation
            └── Equipment

With effective-dated assignment:

Work Center
    +
Workstation
    +
Equipment
    ↓
Resource Assignment

The MES Console must allow users to understand:

Which factory and area a resource belongs to
Which Workstations belong to a Work Center
Which Equipment is currently assigned to each Workstation
Which assignment is Primary, Alternate, or Supporting
When an assignment becomes effective or expires
Whether a machine is available for planning
Manufacturer, model, serial number, efficiency, and operational state of Equipment
2. Important Domain Clarification

Do not model Workstation as a factory.

Use the following meanings consistently:

Site
= Factory / plant

Production Area
= Workshop, line, cell, or zone inside the factory

Work Center
= Logical capacity group used by Routing and planning

Workstation
= Logical execution point where an operator uses Kiosk, Tablet, Manual, or Automatic execution

Equipment
= Physical machine or production device

Routing must continue to reference a logical Work Center, not a physical machine.

Equipment must be connected to Work Center and Workstation through Resource Assignment.

3. Audit the Existing Implementation First

Before changing code, inspect:

MD_SITE
MD_PRODUCTION_AREA
MD_WORK_CENTER
MD_WORKSTATION
MD_EQUIPMENT
MD_RESOURCE_ASSIGNMENT
Existing Drizzle schemas
Database migrations
Generic master-data resource registry
API handlers and validation schemas
Service manifest
Outbox events
Seed data
MES Console sidebar and routes
Existing Work Center screen
Existing Equipment screen
Existing Work Calendar screen
Existing Workstation or assignment code, if any
i18n resources
Shared form, table, select, dialog, and localized-text components

Explicitly classify each entity and field as:

IMPLEMENTED_AND_VERIFIED
IMPLEMENTED_BUT_NOT_TESTED
PARTIALLY_IMPLEMENTED
MISSING
AMBIGUOUS

Do not create duplicate schemas when a partial implementation already exists.

4. Complete the Production Area Model and UX

Production Area represents the internal factory hierarchy:

Workshop
Line
Cell
Zone

Required fields:

interface ProductionArea {
  areaId: string;
  siteId: string;
  areaCode: string;
  areaName: LocalizedText;
  description?: LocalizedText;
  areaType: "Workshop" | "Line" | "Cell" | "Zone";
  parentAreaId?: string;
  sequenceNo: number;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
}

Required validation:

Area code unique within Site
Parent Area belongs to the same Site
No hierarchy cycles
Parent-child Area types must be logically valid
Areas with historical references must not be deleted
Use Inactive instead of destructive deletion

Required routes:

/master-data/production-areas
/master-data/production-areas/new
/master-data/production-areas/:id
/master-data/production-areas/:id/edit

Required UX:

Tree view of factory hierarchy
Table/list fallback
Site filter
Area type filter
Localized name primary, code secondary
Child count
Work Center count
Status
Clear parent hierarchy breadcrumb
5. Complete the Work Center Model and UX

Required fields:

interface WorkCenter {
  workCenterId: string;
  workCenterCode: string;
  workCenterName: LocalizedText;
  description?: LocalizedText;

  siteId: string;
  areaId: string;

  resourceType: "MachineGroup" | "LaborCell" | "Mixed";
  capacityModel: "TimeBased" | "QuantityBased";
  finiteCapacityFlag: boolean;
  defaultShiftId?: string;
  maxConcurrentJobs: number;

  status: "Active" | "Inactive";

  createdAt: string;
  updatedAt: string;
}

Required validation:

Work Center belongs to a valid Area and Site
Area and Site must match
Work Center code unique according to current domain scope
maxConcurrentJobs > 0
Do not place machine IP, IoT endpoint, manufacturer, model, or serial number in Work Center
Historical Work Centers must not be deleted

Required routes:

/master-data/work-centers
/master-data/work-centers/new
/master-data/work-centers/:id
/master-data/work-centers/:id/edit

Work Center detail must include:

Overview
Workstations
Assigned Equipment
Assignment History

Do not implement live production load yet unless an existing API already supports it.

6. Implement or Complete Workstation Master Data

Workstation is MVP-Core and must be visible in MES Console.

Required fields:

interface Workstation {
  workstationId: string;
  workstationCode: string;
  workstationName: LocalizedText;
  description?: LocalizedText;

  siteId: string;
  areaId: string;

  executionMode: "Kiosk" | "Tablet" | "Manual" | "Automatic";
  maxConcurrentJobs: number;
  defaultTerminalId?: string;

  status: "Active" | "Inactive";

  createdAt: string;
  updatedAt: string;
}

Required validation:

Workstation code unique according to current scope
Site and Area must match
maxConcurrentJobs > 0
Default Terminal must belong to the same Site/Area when terminal ownership is available
Workstations with execution history cannot be deleted
Inactive Workstations cannot receive new active assignments

Required routes:

/master-data/workstations
/master-data/workstations/new
/master-data/workstations/:id
/master-data/workstations/:id/edit

Required Workstation detail tabs:

Overview
Current Assignments
Assigned Equipment
Assignment History
Terminal

Do not expose UUIDs.

7. Enrich the Equipment Model

Audit the current Equipment schema and add any missing fields.

Required target model:

interface Equipment {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: LocalizedText;
  description?: LocalizedText;

  siteId: string;
  equipmentType: string;

  manufacturer?: string;
  model?: string;
  serialNumber?: string;

  planningResourceFlag: boolean;

  executionStatus:
    | "Available"
    | "Maintenance"
    | "OutOfService";

  defaultEfficiency: number;

  status: "Active" | "Inactive";

  createdAt: string;
  updatedAt: string;
}

Required validation:

Equipment code unique within Site
Manufacturer, model, and serial number have bounded lengths
defaultEfficiency > 0
Define and document whether values above 1.0 are allowed
Inactive Equipment cannot receive new active assignments
OutOfService Equipment remains visible historically
ExecutionStatus must not be used as a replacement for transactional downtime history
Existing Equipment IDs must remain unchanged

Required routes:

/master-data/equipment
/master-data/equipment/new
/master-data/equipment/:id
/master-data/equipment/:id/edit

Equipment detail must include:

Overview
Current Assignment
Assignment History

Required overview fields:

Localized name
Code
Site
Equipment type
Manufacturer
Model
Serial number
Planning resource status
Execution status
Default efficiency
Master status
8. Implement Resource Assignment

Resource Assignment is the effective-dated relationship between Work Center, Workstation, and Equipment.

Required model:

interface ResourceAssignment {
  assignmentId: string;

  siteId: string;
  workCenterId: string;
  workstationId: string;
  equipmentId?: string;

  assignmentRole:
    | "Primary"
    | "Alternate"
    | "Supporting";

  schedulingFlag: boolean;
  oeeAggregationFlag: boolean;

  effectiveFrom: string;
  effectiveTo?: string;

  createdAt: string;
  updatedAt: string;
}

Although Site may be derivable, include or validate Site consistently according to the current schema convention.

Required validation:

Work Center, Workstation, and Equipment belong to the same Site
Workstation and Work Center belong to compatible Areas
effectiveTo > effectiveFrom
No Equipment may be assigned as Primary to two Workstations during overlapping effective periods
Inactive resources cannot receive a new active assignment
Equipment-specific assignment is optional only when the relationship is intentionally Work Center-to-Workstation
Existing historical assignments must not be overwritten
Moving Equipment must close the old assignment and create a new one
Ending an assignment must set effectiveTo, not delete the record
Scheduling flag controls whether the assignment may be used by future planning
OEE flag is stored but no new OEE engine is required in this phase

Use database-level protection where practical.

For overlapping assignment validation, prefer:

PostgreSQL exclusion constraint, or
Transaction-safe overlap validation with proper locking

Do not rely only on frontend validation.

9. Resource Assignment UX

Create a dedicated route:

/master-data/resource-assignments

Also expose assignments from Work Center, Workstation, and Equipment detail pages.

Required actions:

Assign resource
Move Equipment
End assignment
View history

Recommended assignment form:

Resource placement
Site
Work Center
Workstation
Equipment, optional where allowed
Assignment behavior
Assignment role
Available for scheduling
Include in future OEE aggregation
Effective period
Effective from
Effective to

All selects must display:

Localized name
Business code
Relevant parent context

Examples:

Cụm ép lưu hóa
WC-MOLD · Xưởng ép lưu hóa
Trạm ép số 01
WS-MOLD-01 · Cụm ép lưu hóa
Máy ép Toyo số 01
EQ-MOLD-01 · Toyo TM-500

Never show raw UUIDs.

10. Recommended MES Console Navigation

Update the resource section of the sidebar.

Recommended structure:

RESOURCES & CAPABILITIES

Factory Structure
- Production Areas
- Work Centers
- Workstations

Physical Resources
- Equipment
- Resource Assignments

Keep existing routes compatible where possible.

Do not label Workstation as factory or plant.

Site management may remain in its existing section if already implemented.

11. Shared Resource Hierarchy Component

Create a reusable component for displaying resource placement.

Example:

<ResourceHierarchy
  site={...}
  area={...}
  workCenter={...}
  workstation={...}
  equipment={...}
/>

Render:

Site
└── Production Area
    └── Work Center
        └── Workstation
            └── Equipment

Every node must include:

Explicit resource type
Localized name
Business code
Status
Link to detail page, when allowed

Use this shared component in:

Work Center detail
Workstation detail
Equipment detail
Resource Assignment detail
Assignment confirmation dialog
12. Database Migration and Existing Data

Create forward-only migrations.

Do not modify already applied migrations.

The migration must:

Inspect existing Workstation, Equipment, and Assignment tables.
Add missing columns safely.
Preserve existing IDs and foreign keys.
Backfill localized names and missing metadata where evidence exists.
Create Workstations for existing resource topology only when a reliable mapping can be derived.
Avoid inventing false equipment placement.
Add indexes and constraints after validation.
Preserve historical references.
Record unresolved data-quality gaps.

For Equipment fields without evidence:

manufacturer = NULL
model = NULL
serial_number = NULL

Do not fabricate values.

For existing Work Center-to-Equipment relationships without Workstation evidence:

Do not silently invent a production Workstation and claim it is authoritative.
Either create clearly marked migration placeholders for review, or
Leave the relationship unresolved and create a data-quality report.

If using placeholders, they must be identifiable:

Migration-generated workstation
Requires review

Do not mark them as verified production master data.

13. API Contract Requirements

Update APIs to return enriched business objects.

Example Equipment detail response:

{
  "equipment_id": "uuid",
  "equipment_code": "EQ-MOLD-01",
  "equipment_name": {
    "vi": "Máy ép Toyo số 01",
    "en": "Toyo Molding Press 01"
  },
  "equipment_type": "MoldingPress",
  "manufacturer": "Toyo",
  "model": "TM-500",
  "serial_number": "TM500-2026-001",
  "planning_resource_flag": true,
  "execution_status": "Available",
  "default_efficiency": 0.95,
  "status": "Active",
  "site": {
    "id": "uuid",
    "code": "SITE-KZ3",
    "name": {
      "vi": "Nhà máy Kizuna 3",
      "en": "Kizuna 3 Plant"
    }
  },
  "current_assignment": {
    "assignment_id": "uuid",
    "role": "Primary",
    "scheduling_flag": true,
    "effective_from": "2026-01-01T00:00:00Z",
    "work_center": {
      "id": "uuid",
      "code": "WC-MOLD",
      "name": {
        "vi": "Cụm ép lưu hóa",
        "en": "Molding Work Center"
      }
    },
    "workstation": {
      "id": "uuid",
      "code": "WS-MOLD-01",
      "name": {
        "vi": "Trạm ép số 01",
        "en": "Molding Station 01"
      }
    }
  }
}

Avoid N+1 frontend requests.

List APIs should return enough projected display information for tables.

14. Events

Inspect whether these events already exist:

MES.MasterData.WorkCenterActivated.v2
MES.MasterData.EquipmentActivated.v2

Determine whether Workstation and Resource Assignment need new events.

Potential events:

MES.MasterData.WorkstationActivated.v1
MES.MasterData.ResourceAssignmentCreated.v1
MES.MasterData.ResourceAssignmentEnded.v1
MES.MasterData.EquipmentAssignmentChanged.v1

Only add events when there is a verified consumer or a clear architectural requirement.

All meaningful lifecycle changes must follow the transactional outbox rule.

Do not publish an event after the database transaction using an unsafe direct call.

Preserve event compatibility.

15. Localization

All business names and descriptions must use the existing LocalizedText model.

Support:

VI
EN
JA
KO

Use the shared localized editor.

Required frontend labels, statuses, helper text, validation errors, and page guidance must be translated.

Business data belongs in localized database fields.

Do not store localized business names as application translation keys.

16. UI Design Requirements

Use the current industrial MES design system.

Each management page should contain:

Page header
Purpose description
Filters and search
Primary create action
Readable table
Row detail navigation
Empty state
Error state

Creation and editing must use dedicated child routes, not unlabeled inline toolbar forms.

Use:

Clear labels
Helper text
Sectioned forms
Name-primary/code-secondary identity
Status badges
Effective-period visualization
Assignment timeline
Responsive desktop/tablet layouts
Light and dark theme support

Do not expose IDs.

17. Required Use Cases

Implement and test:

UC-01 — Create Production Area

Create a Workshop under a Site and a child Line under the Workshop.

Expected:

Hierarchy is valid
No cycle
Tree renders correctly
UC-02 — Create Work Center

Create a Work Center under a valid Area.

Expected:

Site is derived or validated
Capacity fields are stored
Detail page shows hierarchy
UC-03 — Create Workstation

Create a Kiosk Workstation under an Area.

Expected:

It appears in Workstation list
It can later receive Resource Assignments
UC-04 — Create enriched Equipment

Create Equipment with:

Manufacturer
Model
Serial number
Efficiency
Planning flag
Execution status

Expected:

Data appears in list and detail
No field is silently lost
UC-05 — Assign Workstation to Work Center

Create an assignment without Equipment where allowed.

Expected:

Workstation appears under Work Center
Effective period is shown
UC-06 — Assign Equipment as Primary

Assign Equipment to a Workstation and Work Center.

Expected:

Current assignment appears in all relevant detail pages
Scheduling flag is visible
UC-07 — Prevent overlapping Primary assignment

Attempt to assign the same Equipment as Primary to another Workstation over the same period.

Expected:

Backend rejects the request
Stable error code
Human-readable remediation
UC-08 — Alternate assignment

Assign Equipment as Alternate.

Expected:

It does not replace the Primary assignment
Role is clearly displayed
UC-09 — Move Equipment

Move Equipment to another Workstation.

Expected:

Old assignment receives effectiveTo
New assignment is created
History remains intact
UC-10 — End assignment

End an active assignment.

Expected:

Record remains historically visible
Equipment has no current assignment after the effective end
UC-11 — Inactive resource validation

Attempt to assign inactive Workstation or Equipment.

Expected:

Request is rejected
UC-12 — Cross-site assignment

Attempt to map resources from different Sites.

Expected:

Request is rejected
UC-13 — Existing-data migration

Verify old Work Centers and Equipment remain accessible with unchanged IDs.

Expected:

No broken references
Missing values remain null or flagged, not fabricated
18. Testing Requirements
Migration tests
Existing IDs preserved
Existing references preserved
New columns created
Backfill valid
Constraints apply successfully
Overlap protection works
Cross-site invalid records are detected
Migration can run on current database state
Backend tests
CRUD for Production Area
CRUD for Work Center
CRUD for Workstation
CRUD for Equipment
Resource Assignment creation
Resource Assignment ending
Equipment movement
Effective-date validation
Overlap validation
Same-site validation
Active-status validation
LocalizedText validation
List/detail projection
Event/outbox behavior where implemented
Frontend tests
Sidebar routes
Dedicated creation pages
All fields have labels
Manufacturer/model/serial render correctly
Workstation page exists
Assignment page exists
Resource hierarchy component
Current assignment display
Assignment history
Role/status labels
No UUID display
Localization
Keyboard behavior
Light/dark theme
Integration tests

Run the complete foundation flow:

Site
→ Area
→ Work Center
→ Workstation
→ Equipment
→ Resource Assignment
→ Move Equipment
→ End Assignment
19. Runtime Verification

After implementation:

Apply migrations.
Verify old database records.
Build mes-master-data-service.
Build mes-console.
Run backend tests.
Rebuild and recreate affected Docker services.
Check migration logs.
Check service health.
Call all new list/detail/create APIs.
Open all new routes.
Create one complete resource hierarchy.
Test overlapping assignment rejection.
Test Equipment movement.
Verify assignment history.
Review Vietnamese and English UI.
Verify no UUID is displayed.

Do not mark the work verified based only on compilation.

20. Required Implementation Report

Create:

implementation-fix/mes-resource-master-data-foundation-phase-1.md

Include:

Original gap
Product-document target
Existing source findings
Status classification
Previous schema
New schema
Migration details
Backfill decisions
Data-quality gaps
New routes
UI hierarchy
Assignment lifecycle
API contracts
Event decisions
Files changed
Tests
Runtime commands and results
Before/after screenshots
Remaining Phase 2 dependencies

Clearly state that this phase does not yet implement:

Automatic WO machine allocation
Finite-capacity scheduling
Capability filtering
Resource Calendar planning
Kiosk skill enforcement
Actual resource confirmation
21. Acceptance Criteria

Phase 1 is complete only when:

Production Area is manageable in MES Console.
Work Center has complete domain fields and hierarchy context.
Workstation exists as a first-class MES master-data entity.
Workstation is not modeled as a factory.
Equipment contains manufacturer, model, serial number, planning flag, execution status, and efficiency.
Resource Assignment connects Work Center, Workstation, and Equipment.
Assignments are effective-dated.
Equipment movement preserves history.
Overlapping Primary assignments are blocked.
Cross-site assignments are blocked.
Inactive resources cannot receive new assignments.
Existing IDs and references remain valid.
Dedicated child routes replace incomplete inline creation UX.
Resource hierarchy is clearly visible in detail pages.
Business names and codes are shown instead of UUIDs.
VI/EN/JA/KO localization is complete.
Database migrations, tests, Docker rebuild, API checks, and browser verification pass.
The implementation report documents all verified behavior and remaining gaps.