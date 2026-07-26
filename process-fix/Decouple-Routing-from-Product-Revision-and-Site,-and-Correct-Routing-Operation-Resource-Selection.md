# Decouple Routing from Product Revision and Site, and Correct Routing Operation Resource Selection

## Objective

Review the current MES Routing implementation and correct the Routing ownership and operation-flow model.

The target model is:

```text
Reusable Routing
    └── Routing Operations
            ├── Operation
            ├── Default Work Center
            ├── Sequence
            ├── Predecessors
            └── Scheduling parameters

Routing must not require:

Product Revision
Site / Factory
Shopfloor
Workstation

Product Revision and Routing are linked later through Production Version.

Factory and Shopfloor are already derived from each selected Work Center through the resource hierarchy.

1. Audit Current Implementation

Inspect:

MD_ROUTING_HEADER
MD_ROUTING_OPERATION
MD_PRODUCTION_VERSION
Routing migrations and database constraints
Routing generic registry and specialised APIs
Routing create/edit/detail/list screens
Production Version create/edit validation
Work Center composition
Workstation Operation Capability
Routing release validation
Work Order creation and Routing snapshot logic
Production Standards linked to Routing Operations
MBOM and Production Version compatibility checks
Existing seed and demo Routings

Determine all places where Routing currently assumes:

Routing belongs to Product Revision
Routing belongs to Site
Routing Operations select Workstation
All Work Centers must belong to one Site

Remove those assumptions consistently from database, backend, frontend, validation, and seed data.

Do not modify already-applied migrations. Use forward-only migrations.

2. Correct Routing Header Ownership

Routing must be a reusable process definition.

Target model:

interface RoutingHeader {
  routingId: string;
  routingCode: string;

  name: LocalizedText;
  description?: LocalizedText;

  routingVersion: string;

  routingType:
    | "Standard"
    | "Alternate"
    | "Rework";

  validFrom: string;
  validTo?: string;

  status:
    | "Draft"
    | "InReview"
    | "Released"
    | "Obsolete";

  createdByUserId: string;
  createdAt: string;
  updatedByUserId: string;
  updatedAt: string;
}

Remove Routing ownership of:

productRevisionId
siteId

Routing CRUD must no longer require Product Revision or Site.

Do not merely hide these fields in the UI while keeping them mandatory in the backend.

3. Product Revision Relationship

Routing must not directly belong to one Product Revision.

Use Production Version as the official relationship:

Product Revision
+
MBOM
+
Routing
=
Production Version

A single Routing may therefore be reused by:

Product A Revision 1
Product A Revision 2
Product B Revision 1
Product C Revision 3

Production Version remains responsible for determining whether the selected Product Revision, MBOM, and Routing are compatible.

Do not duplicate a Routing for every Product Revision when the process flow is the same.

4. Production Version Validation

Update Production Version validation after removing Product Revision and Site from Routing.

Production Version must validate:

Product Revision exists and is eligible for the requested lifecycle.
MBOM belongs to the Product Revision according to current MBOM ownership rules.
Routing is active or Released according to lifecycle policy.
Routing contains at least one valid Routing Operation.
Every Routing Operation references an active Operation.
Every selected Work Center currently supports its Operation.
Production Standards and capability rules are valid where required.

Do not require:

Routing.productRevisionId = ProductionVersion.productRevisionId

because Routing no longer owns Product Revision.

Do not require:

Routing.siteId = ProductionVersion.siteId

because Routing no longer owns Site.

Preserve existing Production Version IDs and historical references.

5. Remove Site from Routing CRUD

Remove the Site/Factory selector from:

Routing create
Routing edit
Routing detail summary
Routing list filters that imply Routing ownership
Routing API create/update payloads
Routing database required fields and constraints
Routing validation rules

Factory and Shopfloor must not be independently selected in Routing.

Each Routing Operation selects a Work Center, and the resource hierarchy already determines:

Work Center
→ Shopfloor
→ Factory

The UI may show Factory and Shopfloor as read-only context after a Work Center is selected.

6. Allow Multi-Factory Routing

One Routing may use Work Centers from different Factories.

Example:

Sequence 10
Operation: Mixing
Work Center: WC-MIX-FACTORY-A

Sequence 20
Operation: Metal Preparation
Work Center: WC-PREP-FACTORY-B

Sequence 30
Operation: Molding
Work Center: WC-MOLD-FACTORY-A

Sequence 40
Operation: Final Inspection
Work Center: WC-QC-FACTORY-C

Do not reject this Routing because the Work Centers belong to different Factories.

Remove any validation such as:

All Work Centers in one Routing must belong to the same Site

When a Routing uses multiple Factories, return an informational warning instead of a blocking error:

INTER_FACTORY_ROUTING

Friendly message:

This Routing uses Work Centers from multiple Factories.

Ensure that material transfer, lead time, inventory movement,
and Work Order ownership are configured for transitions between Factories.

Do not automatically create transfer or logistics records in this task.

7. Correct Routing Operation Resource Ownership

Routing Operation must reference:

Operation
+
Default Work Center

It must not select or persist Workstation as its primary resource.

Target model:

interface RoutingOperation {
  routingOperationId: string;
  routingId: string;

  sequenceNo: number;

  operationId: string;
  defaultWorkCenterId: string;

  predecessorSequences: number[];

  schedulingMode:
    | "Finite"
    | "Infinite";

  overlapAllowed: boolean;
  transferBatchQty?: number;

  queueTimeMin: number;
  moveTimeMin: number;

  milestoneFlag: boolean;
}

Remove direct Workstation selection from Routing CRUD.

Routing must stay stable when individual Workstations or Machines change.

Planning later resolves:

Work Center
→ eligible Workstations
→ Machine Groups
→ Machine Units
8. Correct Routing Operation Form Order

For every Routing Operation row, use this flow:

1. Select Operation
2. Load supported Work Centers
3. Select Default Work Center
4. Configure sequence and scheduling fields

The Work Center selector must be disabled until an Operation is selected.

Placeholder:

Select an Operation first

Do not load all Work Centers as unrestricted options.

9. Filter Work Centers by Operation Support

After selecting an Operation, return only Work Centers that currently support it.

A Work Center is eligible when:

Work Center is Active
AND
Work Center Composition is Active
AND
at least one active Workstation belongs to the Work Center
AND
that Workstation has an active Workstation Operation Capability
for the selected Operation

Factory and Shopfloor must not be used as filters unless the user explicitly applies an optional UI filter.

Suggested API:

GET /api/mes/master-data/operations/:operationId/supported-work-centers

Example response:

{
  "items": [
    {
      "work_center": {
        "id": "uuid",
        "code": "WC-MOLD-01",
        "name": {
          "vi": "Cụm ép lưu hóa số 01",
          "en": "Molding Work Center 01"
        }
      },
      "shopfloor": {
        "code": "SF-MOLD",
        "name": {
          "vi": "Xưởng ép lưu hóa",
          "en": "Molding Shopfloor"
        }
      },
      "factory": {
        "code": "FAC-BD",
        "name": {
          "vi": "Nhà máy Bình Dương",
          "en": "Binh Duong Factory"
        }
      },
      "supporting_workstation_count": 2
    }
  ]
}

Use translated names as primary identity and code as secondary information.

Do not display UUIDs.

10. Operation Change Behaviour

When the user changes an Operation in an existing Routing row:

Re-query supported Work Centers.
Check whether the currently selected Work Center still supports the new Operation.
If not supported:
Clear the Work Center field.
Show a friendly warning.
Require a new Work Center selection.

Message:

The previously selected Work Center does not support the new Operation.
Please select another Work Center.

Do not retain an invalid Work Center in form state.

11. Backend Validation

Frontend filtering is only a usability feature.

On create, update, release, and Production Version use, the backend must validate:

Operation exists
Operation is Active
Work Center exists
Work Center is Active
Work Center currently exposes the Operation
At least one active Workstation supports the Operation
Routing Operation sequence is unique
Predecessor graph has no cycle

Stable errors:

ROUTING_OPERATION_INACTIVE
ROUTING_WORKCENTER_INVALID
WORKCENTER_OPERATION_NOT_SUPPORTED
ROUTING_SEQUENCE_DUPLICATE
ROUTING_PREDECESSOR_CYCLE

Do not require same-Factory validation between Routing Operations.

12. Routing List and Detail UI

Routing list must show:

Routing translated name
Routing code
Version
Type
Number of Operations
Number of Factories involved
Status
Updated by
Updated at

Do not show Product Revision or Site as Routing ownership columns.

Routing detail must show each Operation as:

Sequence 10

Operation
Mixing
OP-MIX

Default Work Center
Rubber Mixing Center
WC-MIX-01

Location
Factory A
→ Mixing Shopfloor

Location is derived and read-only.

For multi-Factory Routings, show:

Factories involved: 3

and an informational badge:

Multi-Factory Routing
13. Routing Create/Edit UI

Basic information section:

Generated Routing code
Localized Routing name
Localized description
Routing version
Routing type
Valid from/to
Status

Remove:

Product Revision selector
Site selector
Factory selector
Shopfloor selector

Operation-flow section:

Sequence
Operation
Default Work Center
Read-only Factory/Shopfloor context
Predecessors
Scheduling mode
Queue time
Move time
Overlap settings
Delete row action

The label must be:

Default Work Center

Do not label it as Workstation.

14. Compatibility Migration

Create forward-only migrations to:

Make Routing Product Revision reference nullable or remove it safely.
Make Routing Site reference nullable or remove it safely.
Preserve existing Routing IDs.
Preserve existing Routing Operation IDs.
Preserve existing Production Version references.
Preserve existing Work Order snapshots.
Backfill Routing names if currently missing.
Keep historical Product Revision/Site values in an archive or migration report when required for audit.

Do not rewrite historical Work Order data.

If old Routings contain a Workstation reference:

Resolve its parent Work Center.
Backfill defaultWorkCenterId.
Record ambiguous rows that cannot be mapped safely.
Do not guess when a Workstation has no valid parent Work Center.
15. Production Standard Compatibility

Production Standards currently reference Product Revision and Routing Operation.

Preserve this relationship.

The correct ownership is:

Routing
= reusable process structure

Routing Operation
= reusable step and default Work Center

Production Standard
= Product Revision-specific timing and labour standard

Do not move Product Revision-specific cycle time into Routing Header.

Existing Production Standards must continue to reference:

Product Revision
Routing Operation
Work Center
Optional Machine
16. MBOM Compatibility

MBOM remains Product Revision-specific.

MBOM Lines may reference the central Operation through IssueOperationID.

Do not require Routing Header to own Product Revision merely because MBOM and Routing are combined later.

Production Version remains the point where:

Product Revision
+
MBOM
+
Routing

becomes an executable production configuration.

17. Detail/Help Modal

Update Routing page help content to explain:

Routing is a reusable process definition.

It is not owned by one Product Revision or one Factory.

Product Revision, MBOM, and Routing are combined later
through Production Version.

For each Routing step:
1. Select the Operation.
2. Select a Work Center that supports that Operation.
3. The Work Center already determines its Shopfloor and Factory.
4. Planning later resolves the exact Workstation and Machine Units.

Also explain:

A Routing may use Work Centers from multiple Factories.

Factory and Shopfloor are shown only as derived location context.
They are not selected independently in Routing.

Provide VI/EN/JA/KO translations.

18. Flow Validation Script

Create one script:

scripts/test-mes-reusable-routing-flow.mjs

The script must:

Create or reuse active Operations.
Identify supported Work Centers for each Operation.
Create a Routing without Product Revision and Site.
Add multiple Routing Operations.
Use Work Centers from at least two different Factories when available.
Verify unsupported Work Center/Operation combinations are rejected.
Verify valid combinations are accepted.
Verify Routing can be selected by more than one Product Revision through Production Version.
Verify Routing Operations persist Work Center, not Workstation.
Print request status, relevant business codes, warnings, and errors.
Print a final PASS or FAIL.
Exit non-zero on failure.
Review service and Console logs for unexplained schema, validation, or UI errors before completing the task.
19. Acceptance Criteria

The task is complete when:

Routing CRUD no longer requires Product Revision.
Routing CRUD no longer requires Site or Factory.
Routing Header is reusable across Product Revisions.
Product Revision connects to Routing through Production Version.
Routing may use Work Centers from different Factories.
Same-Site validation is removed from Routing.
Factory and Shopfloor are derived from Work Center.
Routing Operation selects Operation first.
Work Center options are filtered by Operation support.
Routing Operation stores Default Work Center, not Workstation.
Changing Operation clears an unsupported selected Work Center.
Backend rejects unsupported Operation/Work Center combinations.
Routing list/detail no longer presents Product Revision or Site as owners.
Multi-Factory Routing is shown as information, not an error.
Existing Production Standards, Production Versions, Work Orders, and historical references remain compatible.
The reusable Routing flow script passes with no unexplained errors.