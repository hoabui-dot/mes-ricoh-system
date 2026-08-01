# Complete the MES MBOM Architecture and End-to-End Workflow

## Objective

Continue from the existing MBOM redesign and complete all remaining backend, MES Console, migration, substitute-policy, Production Version, Work Order, WMS, documentation, and runtime-verification gaps.

The current implementation must be treated as a partially completed foundation, not as a finished feature.

Existing verified foundation:

- MBOM Header and MBOM Line remain separate.
- MBOM and Routing remain independent from Item Revision ownership.
- Production Version remains the authoritative selector of Item Revision + MBOM + Routing + Site.
- MBOM lines support hierarchy, UOM, phantom, issue operation, backflush, optional material, and effective dating.
- Basic substitute controls exist.
- MBOM detail and validation APIs exist.
- Released MBOM structure is immutable.
- Historical Work Orders must not be rewritten.

Do not reintroduce `item_revision_id` into `md_mbom_header`.

Do not reintroduce product ownership into Routing.

Do not add `MBOMType`.

Do not replace Production Version authority with direct MBOM ownership.

---

# 1. Read and Re-Audit the Current Implementation

Before adding new code, read:

```text
AI_CONTEXT.md
product-doc/
process-fix/Redesign-MBOM-Architecture-and-Workflow.md
implementation-fix/Redesign-MBOM-Architecture-and-Workflow-Implementation.md
services/mes-master-data-service
services/mes-execution-service
services/mes-console
services/wms-outbound-service
services/wms-console
database migrations 0030, 0039, 0048, 0049
current MBOM tests and verification scripts

Verify the actual source for every capability claimed in the previous implementation report.

Create a completion-gap matrix:

Capability
Current source evidence
Current status
Missing behaviour
Required implementation
Verification method

Use the repository evidence vocabulary.

Do not trust the previous report when source, migration, test, or runtime evidence disagrees.

2. Preserve the Final Architecture

The final model must remain:

Independent Item Revision
Independent MBOM
Independent Routing
Independent Site

        ↓ selected together by

Production Version

        ↓ snapshot into

Work Order

Required invariants:

MBOM does not directly own Item Revision.
Routing does not directly own Item Revision or Site.
Production Version is the only authoritative manufacturing configuration selector.
Production Version validates compatibility across:
Item Revision;
MBOM;
Routing;
Site;
base UOM;
operations;
resource/site context.
Work Order creation uses only a valid released Production Version.
Historical Work Orders retain immutable snapshots.
EBOM is never used directly for Work Order material explosion.
3. Complete the MES Console MBOM Workflow

Replace the remaining fragmented header/detail forms with a complete guided workflow.

A drag-and-drop implementation is optional. A complete usable hierarchical editor is mandatory.

3.1 MBOM List

Display:

Localized MBOM name
MBOM code
Version
Purpose
Site
Base quantity
Base UOM
Line count
Hierarchy depth
Substitute count
Status
Effective period
Production Version usage count
Last updated

Because MBOM is independent, do not display one output product as though MBOM owns it.

Instead show:

Used by Production Versions

with product names, revision codes, sites, and Production Version codes.

Add filters for:

Status
Site
Purpose
Base UOM
Used / unused
Effective / expired
3.2 Create MBOM Workflow

Implement these steps:

Step 1 — Header

Capture:

MBOM code
localized name VI/EN/JA/KO
localized description
version
purpose
site
base quantity
base UOM
effective from
effective to

Do not request output Item Revision in the MBOM header.

Show a clear explanation:

This MBOM defines an independent manufacturing structure.
The product output will be selected later through Production Version.
Step 2 — Manufacturing Structure

Create a hierarchical tree editor.

Required actions:

Add root component
Add child component
Edit line
Remove line
Move line to another parent
Move line up/down
Reorder siblings
Expand/collapse
Duplicate a line as draft input

Each line must manage:

Component Item Revision
Quantity per
UOM
Scrap rate
Phantom
Issue operation
Backflush
Optional
Effective from
Effective to

The component selector must display:

Localized Item name
Item code
Revision code
Item type
Item group
Base UOM
Lifecycle status

Use only valid component Item Revisions.

Step 3 — Substitutes

For each MBOM line, provide complete substitute management:

Create
View
Edit
Delete
Request approval
Approve
Reject

Display:

Original component
Substitute component
Technical group result
Priority
Conversion factor
Maximum usage percent
Approval requirement
Approval status
Effective period
Approver
Approval/rejection reason
Step 4 — Validation

Call the authoritative backend validation endpoint.

Group errors by:

Header
Hierarchy
Quantity
UOM
Lifecycle
Effective dating
Cycle
Operation
Substitute
Release readiness
Production Version compatibility warning

Clicking an error must focus or highlight the affected line or field.

Step 5 — Review

Show the complete flattened and hierarchical structure before save.

Include:

Total lines
Root components
Nested components
Phantom components
Optional components
Substitutes
UOM summary
Validation result
Step 6 — Save Draft

Save header and complete desired-state line structure transactionally.

Step 7 — Release

Provide an explicit release action with confirmation.

Released MBOMs must be read-only.

Provide:

Create New Version

to copy the released MBOM into a new Draft version while preserving the old version.

4. Add Optimistic Concurrency Control

The complete structure replacement endpoint must prevent lost updates.

Add an MBOM structure revision or equivalent optimistic-lock field.

For example:

structure_version

The detail response must return it.

The save request must include:

{
  "expected_structure_version": 5,
  "lines": []
}

If the stored version changed, return:

409 MBOM_STRUCTURE_VERSION_CONFLICT

The response must include the latest structure version.

MES Console must:

prevent silent overwrite;
show a conflict message;
allow reload;
preserve the user's unsaved draft locally where practical.

Add concurrency tests with two competing updates.

5. Complete MBOM Line Backend Rules

Backend validation must cover:

Positive quantity_per.
UOM exists and is Released/Active.
Decimal precision matches the selected UOM.
Fractional values are rejected when UOM disallows fractions.
Parent belongs to the same MBOM.
No direct hierarchy cycle.
No indirect hierarchy cycle.
Sibling sequence uniqueness.
Effective dates are valid.
Current active rows do not overlap incorrectly.
Component Revision lifecycle is valid.
Component cannot reference an invalid or obsolete Item Revision.
Issue operation exists and is active.
Released MBOM cannot be edited.
Empty structure cannot be released.

Clearly define the duplicate-component policy:

whether the same component may appear more than once under different parents;
whether it may appear more than once under the same parent;
how duplicate lines are aggregated during Work Order explosion.

Record the rule in product documentation and tests.

6. Complete Substitute Policy

The current substitute implementation is incomplete.

6.1 Schema and Audit Fields

Add or verify:

approval_status
approval_reason
requested_by
requested_at
approved_by
approved_at
rejected_by
rejected_at
rejection_reason
effective_from
effective_to
status

Do not overwrite approval history.

Use a separate approval-history table if a single row cannot preserve the required audit trail.

6.2 Technical Group Compatibility

Enforce:

Substitute Item Group == Original Component Item Group

unless there is an approved exception.

If current Item Group data is not authoritative enough:

audit and document the exact gap;
create an explicit substitute-compatibility exception model;
require approval and reason;
do not silently accept incompatible substitutions.
6.3 UOM Compatibility

Validate:

same UOM, or
an authoritative active UOM conversion exists.

Do not rely only on a manually entered conversion_factor when a central conversion exists.

Define precedence:

Item-specific UOM conversion
→ global compatible conversion, if allowed
→ approved manual exception

Reject invalid or dimensionally incompatible conversion.

6.4 Effective Dating

Reject overlapping active substitute definitions for the same:

MBOM line
Substitute revision
Effective period
6.5 Runtime Usage

Extend the downstream contract so substitute definitions can be used in material planning and fulfilment.

The runtime must preserve:

original_component_revision_id
actual_component_revision_id
substitute_id
conversion_factor_used
approved_by
approval_reference

Do not mark substitute support complete until actual material consumption can identify which material was used.

7. Add Product-Context Workflow Without Changing Ownership

The schema remains decoupled, but the user needs a product-oriented workflow.

Implement one or both of these flows.

Option A — From Item Revision

On Item Revision detail, add:

Create Manufacturing Configuration

Workflow:

Select or create MBOM
Select or create Routing
Select Site
Create Production Version Draft
Validate
Release Production Version

The Item Revision is only contextual input to Production Version.

It must not be persisted as MBOM ownership.

Option B — From Production Version

Create a guided Production Version wizard:

Select Item Revision
Select Site
Select or create MBOM
Select or create Routing
Validate compatibility
Save Draft
Release

When a new MBOM is created inside this flow:

create an independent MBOM;
return to the Production Version wizard;
select the new MBOM;
do not add an Item Revision FK to MBOM.
8. Strengthen Production Version Compatibility

Because MBOM and Routing are independent, Production Version must perform all compatibility validation.

Required checks:

Item Revision
Released/effective.
Not Raw Material.
Item type is Finished Good or Semi-Finished.
Site eligibility is valid.
MBOM
Released/effective.
Contains valid current lines.
Base UOM is compatible with output Item base UOM.
Structure is valid.
Not obsolete.
Not outside validity range.
Routing
Released/effective.
Contains valid operations.
Work Centers used by operations belong to the selected Site.
Required operations are active.
MBOM-to-Routing

For every issue_operation_id:

operation exists;
operation belongs to the selected Routing;
operation is effective;
operation is allowed to issue material;
referenced Work Center belongs to Production Version Site.

Return structured compatibility errors such as:

PRODUCTION_VERSION_MBOM_UOM_MISMATCH
PRODUCTION_VERSION_ISSUE_OPERATION_NOT_IN_ROUTING
PRODUCTION_VERSION_WORK_CENTER_SITE_MISMATCH
PRODUCTION_VERSION_MBOM_NOT_EFFECTIVE
PRODUCTION_VERSION_ROUTING_NOT_EFFECTIVE
MBOM_OUTPUT_RAW_MATERIAL

Do not rely on UI-only filtering.

9. Audit and Harden Migration 0049

Review migration:

0049_reconcile_released_mbom_line_lifecycle

Produce a row-level reconciliation report.

For every promoted line, prove:

header was Released
line was current
parent relationship was valid
quantity was positive
UOM was valid
component lifecycle was valid
no cycle existed
effective dates were valid

If migration 0049 promoted rows without proving these conditions:

do not hide the issue;
add a follow-up corrective migration;
mark uncertain rows for manual review;
do not automatically delete or rewrite historical data.

Create:

implementation-fix/MBOM-0049-Migration-Reconciliation.md

Include:

row ID
previous status
new status
promotion reason
validation evidence
linked Production Versions
linked historical Work Orders
manual-review requirement

Also provide aggregate pre/post counts for:

Headers
Lines
Substitutes
Orphan lines
Cycle violations
Invalid UOMs
Invalid components
Duplicate sequences
Released-header/Draft-line mismatches
Production Version mismatches
10. Complete Work Order Explosion

Audit and verify the exact material explosion implementation.

Required base formula:

scale = WO requested quantity / MBOM base quantity
required quantity = MBOM line quantity_per × scale

Apply scrap using the repository's explicit business rule.

Document whether the rule is:

required × (1 + scrap rate)

or another approved formula.

Use decimal-safe arithmetic.

Apply UOM precision and rounding only according to authoritative UOM and conversion rules.

Hierarchy Rules

Define and test:

Non-phantom semi-finished component
X
├── AB
└── C

The X Work Order directly requires:

AB
C

Do not automatically flatten A and B into X when AB is an independently manufactured semi-finished item.

Phantom component

If AB is marked phantom and policy permits explosion:

X
├── A
├── B
└── C

Preserve genealogy and source-line references.

Optional component

Do not treat optional material as mandatory demand unless selected by the configured business rule.

Effective Lines

Only current effective lines are exploded.

Duplicate Lines

Apply the documented duplicate aggregation policy.

Store snapshot fields for every exploded requirement:

mbom_header_id
mbom_version
mbom_line_id
source_parent_line_id
component_revision_id
quantity_per
scaled_quantity
scrap_rate
required_quantity
uom_id
uom_code
phantom
optional
issue_operation_id
backflush
11. Complete WMS Integration

Verify the full flow:

Released Production Version
→ Work Order created
→ MBOM snapshot
→ Material requirements
→ MES material request
→ WMS request
→ allocation/staging
→ actual consumption

WMS must receive:

work_order_id
work_order_code
production_version_id
mbom_header_id
mbom_version
mbom_line_id
component_revision_id
component item code/name
required quantity
uom_id
uom_code
issue operation
work center
phantom flag
optional flag
substitute candidates where applicable

Required verification:

correct quantities;
correct UOM;
no fabricated UOM;
idempotent request identity;
duplicate MBOM lines handled consistently;
non-phantom semi-finished components remain separate;
substitute use is auditable;
shortage behaviour remains correct.

Update WMS projections and UI only through APIs/events, never cross-service database access.

12. Add Complete Automated Tests
MES Master Data

Test:

complete hierarchy CRUD;
move/reorder;
concurrency conflict;
direct and indirect cycles;
parent ownership;
sibling sequence;
UOM precision;
integer-only UOM;
effective overlap;
immutable Released structure;
create new version;
substitute CRUD;
technical-group validation;
approved compatibility exception;
UOM conversion;
approval/rejection audit.
Production Version

Test:

Finished Good accepted;
Semi-Finished accepted;
Raw Material rejected;
MBOM base UOM mismatch rejected;
issue operation absent from Routing rejected;
Work Center Site mismatch rejected;
invalid validity dates rejected;
Released/effective requirements enforced.
Execution

Test:

quantity scaling;
scrap calculation;
decimal precision;
non-phantom semi-finished handling;
phantom explosion;
optional component handling;
duplicate aggregation;
immutable snapshots.
WMS

Test:

correct material request payload;
correct UOM;
retry idempotency;
shortage;
substitute selection;
actual substitute audit.
UI

Test:

all workflow steps;
hierarchy editing;
validation error focus;
substitute edit/delete/approve/reject;
read-only Released view;
create-new-version;
optimistic conflict handling;
product-context Production Version flow.
13. Required Runtime E2E Scenario

Create deterministic demo data.

Items
A  — Raw Material
B  — Raw Material
C  — Raw Material
AB — Semi-Finished
X  — Finished Good

Create Released Item Revisions for all five.

MBOM AB
AB manufacturing structure:

A × 1 PCS
B × 2 PCS
MBOM X
X manufacturing structure:

AB × 1 PCS
C  × 1 PCS

Do not place A and B directly in MBOM X.

Routings

Create valid independent Routings for:

AB production
X production

Assign valid issue operations.

Production Versions

Create:

PV-AB = AB Revision + MBOM-AB + Routing-AB + Site
PV-X  = X Revision  + MBOM-X  + Routing-X  + Site
Work Order

Create a Work Order for X.

Prove:

WO uses PV-X.
WO snapshots MBOM-X.
Direct requirements are AB and C.
A and B are not incorrectly flattened.
Quantities scale correctly.
UOM values are authoritative.
WMS receives AB and C.
Physical or simulated staging updates the correct requirements.
Historical snapshots remain unchanged after creating a newer MBOM version.
Phantom Variant

Create a separate draft/test MBOM variant with a phantom semi-finished relationship and prove the configured explosion behaviour.

Substitute Variant

Create a shortage case where one component has an approved substitute and prove:

original requirement
→ substitute proposal
→ approval
→ WMS allocation
→ actual consumption
→ audit/traceability

Capture event IDs, API payloads, database snapshots, and visible UI evidence.

14. Complete Documentation Reconciliation

Update product documents so they match running architecture.

Specifically reconcile any sections still claiming:

MD_MBOM_HEADER.ProductRevisionID
MD_ROUTING_HEADER.ProductRevisionID
MD_ROUTING_HEADER.SiteID

Mark obsolete schema descriptions as superseded rather than silently deleting historical content.

Document the final model:

MBOM = independent manufacturing material structure
Routing = independent manufacturing process structure
Production Version = Item Revision + MBOM + Routing + Site authority
Work Order = immutable snapshot of one Production Version
EBOM = independent engineering structure

Update:

product-doc/II-PRODUCTS-&-MBOM-CATALOG.md
product-doc/III-ROUTING-&-STANDARDS-CATALOG.md
product-doc/VII-ERD-MATRIX-&-DEV-VALIDATION.md
relevant API contract documentation
relevant event documentation

Include:

hierarchy rules;
duplicate policy;
phantom policy;
optional-material policy;
substitute approval;
UOM compatibility;
release lifecycle;
Production Version compatibility;
Work Order explosion formula;
historical snapshot rules.
15. Update AI_CONTEXT.md

Update only after implementation and verification.

Add a new canonical section containing:

Final MBOM architecture
Final schema and migrations
MBOM API routes
MES Console workflow
Optimistic concurrency
Substitute policy
Production Version validation
WO explosion rules
WMS integration
E2E AB/X result
Migration 0049 reconciliation
Remaining limitations

Correct or supersede any older contradictory sections.

Each claim must include:

Evidence status
Evidence path
Verification command/result
Known limitation

Do not classify the complete flow as IMPLEMENTED_AND_VERIFIED based only on builds.

16. Required Reports

Create or update:

process-fix/Complete-MES-MBOM-End-to-End-Workflow.md
implementation-fix/Complete-MES-MBOM-End-to-End-Workflow-Implementation.md
implementation-fix/MBOM-0049-Migration-Reconciliation.md
implementation-fix/MBOM-AB-X-E2E-Verification.md

The implementation report must include:

Previous gaps
Source audit
Architecture preserved
Backend changes
Schema changes
Concurrency changes
MES Console workflow
Substitute policy
Production Version compatibility
WO explosion
WMS integration
Migration reconciliation
Automated tests
Runtime E2E evidence
Documentation updates
AI_CONTEXT changes
Remaining limitations
17. Required Execution Order

Follow this order exactly:

1. Read current source and documentation.
2. Verify previous implementation claims.
3. Produce the completion-gap matrix.
4. Reconcile migration 0049.
5. Finalise backend invariants and API contracts.
6. Add optimistic concurrency.
7. Complete line and substitute policies.
8. Strengthen Production Version validation.
9. Complete Work Order explosion rules.
10. Complete WMS integration.
11. Implement the MES Console workflow.
12. Add product-context Production Version workflow.
13. Add automated tests.
14. Run the AB/X E2E scenario.
15. Run phantom and substitute variants.
16. Rebuild and recreate affected services.
17. Update product documentation.
18. Update AI_CONTEXT.md.
19. Write implementation and feedback reports.

Do not start documentation claims before runtime verification.

Do not modify historical Work Order snapshots.

Do not invent ambiguous migration mappings.

Do not bypass business validation only to make the demo pass.

Completion Criteria

Do not report completion unless all are proven:

MES Console provides a complete usable MBOM workflow.
Hierarchical lines can be created, edited, moved, reordered, and removed.
Released MBOMs are immutable.
New versions can be created from Released MBOMs.
Concurrent edits cannot silently overwrite each other.
Substitute CRUD and approval/rejection are complete.
Technical-group compatibility is enforced or uses an explicit approved exception.
UOM compatibility and conversion are enforced.
Production Version validates MBOM, Routing, Item Revision, Site, UOM, operations, and Work Centers.
Raw Material cannot be an output.
Issue operations belong to the selected Routing.
Work Order explosion handles scale, scrap, hierarchy, phantom, optional material, and UOM precision.
WMS receives correct material requirements.
Substitute usage is traceable through actual consumption.
Migration 0049 has row-level reconciliation evidence.
AB = A + B and X = AB + C pass end to end.
Historical Work Orders remain unchanged.
Product documents match running schema.
AI_CONTEXT.md contains only evidence-backed claims.

Final status must remain PARTIALLY_IMPLEMENTED if any required UI, substitute, WO, WMS, migration, or E2E capability is still missing.