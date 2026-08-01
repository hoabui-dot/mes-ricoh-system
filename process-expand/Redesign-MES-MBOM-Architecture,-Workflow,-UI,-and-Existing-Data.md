# Redesign MES MBOM Architecture, Workflow, UI, and Existing Data

## Objective

Audit the current MES MBOM implementation and refactor it into a complete manufacturing BOM model that accurately represents how finished goods and semi-finished goods are produced.

The implementation must cover:

```text
mes-master-data-service
mes-console
database migrations
seed and demo data
product documentation
AI_CONTEXT.md
implementation feedback records

The current repository already defines MBOM Header, MBOM Line, Component Substitute, and Production Version as separate concepts. MBOM lines own component quantity, UOM, scrap, phantom, issue operation, and backflush behaviour, while Production Version locks the valid Item Revision + MBOM + Routing combination for Work Order creation.

Do not start by changing UI forms. First audit the running schema, migrations, APIs, services, frontend behaviour, tests, seeds, and documentation. Running code and migrations remain the source of truth.

1. Required Domain Model

Use the following model as the target architecture.

Item
└── Item Revision
    ├── 0..N EBOM versions
    ├── 0..N MBOM versions
    └── 0..N Routing versions

Production Version
└── exactly one valid combination of:
    ├── Item Revision
    ├── MBOM
    ├── Routing
    └── Site

Important rules:

Do not enforce a database-level Item Revision -> MBOM one-to-one relationship.
One Item Revision may have multiple MBOM versions by Site, purpose, lifecycle, or manufacturing method.
For MVP behaviour, the system may restrict the number of simultaneously effective default/released MBOMs, but the schema must support multiple versions.
Do not add a duplicated MBOMType field for FinishedGood or SemiFinished.
Derive the MBOM business type from the output Item Revision:
Semi-finished Item Revision → semi-finished MBOM.
Finished-good Item Revision → finished-good MBOM.
Raw-material Item Revisions cannot be the output of an MBOM.
Production Version selects one released/effective MBOM and one released/effective Routing.
A Work Order must use the configuration selected by Production Version, not independently select arbitrary MBOM and Routing records.
2. Business Meaning

An MBOM is not only a document header.

It is the manufacturing product structure and material quantity definition used by production.

Example:

Engineering structure:

X = A + B + C

Manufacturing structure:

AB = A + B
X  = AB + C

Therefore:

EBOM describes the engineering/research structure.
MBOM describes the actual manufacturing structure.
EBOM and MBOM may look structurally similar, but they have different ownership, lifecycle, validation, and execution use cases.
MBOM is used by Production Version and Work Order explosion.
EBOM must not be used directly for Work Order material explosion.

Do not flatten semi-finished components into the finished-good MBOM if the real manufacturing process produces that semi-finished item separately.

3. Mandatory Audit Before Implementation

Inspect at least:

services/mes-master-data-service
services/mes-console
services/mes-execution-service
libs/shared-kernel
database migrations
seed scripts
process/
product-doc/
implementation/
implementation-fix/
implementation-expand/
AI_CONTEXT.md

Search for:

md_mbom_header
md_mbom_line
md_component_substitute
md_production_version
base_quantity
base_uom_id
component_revision_id
parent_line_id
production_version
item_revision
routing
MBOM
EBOM

Produce an audit table containing:

Concern
Current implementation
Target implementation
Evidence path
Required change
Migration risk
Verification method

Classify findings using the repository evidence vocabulary:

IMPLEMENTED_AND_VERIFIED
IMPLEMENTED_BUT_NOT_TESTED
PARTIALLY_IMPLEMENTED
MISSING
AMBIGUOUS
CONFLICTING_SOURCES
DEPRECATED

Do not infer that a field or workflow exists only because it appears in a product document.

4. Phase 1 — Refactor MBOM Header

The MBOM Header must represent the identity and lifecycle of a manufacturing BOM.

Required fields:

mbom_id
mbom_code
localized name: VI / EN / JA / KO
localized description: VI / EN / JA / KO
product_revision_id
site_id
mbom_version
purpose
base_quantity
base_uom_id
valid_from
valid_to
status
is_default, only if supported by the chosen design
created_at
created_by
updated_at
updated_by
released_at
released_by

Rules:

mbom_code must be unique according to the current repository naming convention.
product_revision_id is mandatory.
Output Item Revision must be FinishedGood or SemiFinished.
Output Item Revision and Site must be compatible.
base_quantity > 0.
base_uom_id must reference an active authoritative UOM.
Base UOM should normally match the output Item base UOM unless an explicit conversion rule exists.
valid_to must be after valid_from.
Released MBOM headers are immutable for core production fields.
Changes to released MBOMs require a new version.
Technical information and reference documents should be modelled as document relations or attachments, not treated as the manufacturing structure itself.

Do not remove existing fields without first determining whether they are business data, legacy metadata, or duplicated presentation fields.

5. Phase 2 — Implement MBOM Lines as the Core Structure

Each MBOM must contain a hierarchical component structure.

Required line fields:

mbom_line_id
mbom_id
parent_line_id
sequence_no
component_revision_id
quantity_per
uom_id
scrap_rate
phantom_flag
issue_operation_id
backflush_flag
optional_flag
effective_from
effective_to
notes or technical instruction reference, only if already supported

Rules:

quantity_per > 0.
Component Revision cannot equal the MBOM output Product Revision.
Component Revision must be active/released according to lifecycle policy.
A semi-finished MBOM may contain:
raw materials;
consumables, if supported by the current Item model.
A finished-good MBOM may contain:
semi-finished items;
raw materials;
consumables;
any valid combination of these.
Raw material cannot contain its own MBOM as a manufactured output.
No circular BOM hierarchy.
No recursive product dependency such as:
X -> A -> X
parent_line_id must belong to the same MBOM.
Sequence numbers must be deterministic within siblings.
UOM must come from UOM management.
Quantity precision must follow UOM rules.
Fractional quantity must be rejected when the UOM disallows fractions.
Phantom behaviour remains a line-level manufacturing relationship, not an Item-level property.
issue_operation_id, when provided, must reference an operation in a compatible Routing or be validated when the Production Version is created.

The existing product model already defines phantom as an MBOM-line relationship and requires positive quantities and valid UOMs. Preserve that rule.

6. Phase 3 — Component Substitute Model

Implement or complete the substitute material model.

Required fields:

substitute_id
mbom_line_id
substitute_revision_id
priority_no
conversion_factor
max_usage_percent
requires_approval
effective_from
effective_to
status
approval_status, if supported
approved_by, if supported
approved_at, if supported

Validation:

Substitute Revision cannot equal the original component Revision.
Substitute must not duplicate another active substitute on the same line.
Substitute Item must belong to the same technical Item Group as the original component, unless an explicit approved exception exists.
Substitute lifecycle must be valid.
Substitute UOM must be compatible with the original component UOM or have a valid conversion.
conversion_factor > 0.
max_usage_percent must be within the valid percentage range.
No circular substitute chain.
A substitute requiring approval cannot be used until approved.
Released MBOM substitute changes require a controlled version or approved lifecycle transition.

Do not implement substitute logic only in the UI. Enforce all critical rules in the backend.

7. Phase 4 — Production Version

Production Version must remain a configuration selector, not another BOM definition.

Required relationship:

Production Version
├── Product Revision
├── MBOM
├── Routing
└── Site

Validation:

Product Revision must be released/effective.
MBOM must be released/effective.
Routing must be released/effective.
MBOM output Product Revision must equal Production Version Product Revision.
Routing Product Revision must equal Production Version Product Revision.
MBOM, Routing, Product Revision, and Production Version must belong to the same Site.
Production Version must not contain component lines or duplicate MBOM data.
Default Production Version uniqueness must follow Site, Product Revision, validity, and lot-size rules.
Work Order creation must read only the selected Production Version configuration.
Work Order snapshots must preserve the chosen MBOM and Routing versions.

The existing Work Order readiness flow already expects a complete Production Version containing Item Revision, MBOM, Routing, Site, and base UOM information. Preserve and strengthen this behaviour.

8. Phase 5 — MES Backend API Redesign

Audit existing endpoints before changing routes.

Provide or update APIs for:

MBOM Header
GET    /api/mes/master-data/mboms
GET    /api/mes/master-data/mboms/:id
POST   /api/mes/master-data/mboms
PUT    /api/mes/master-data/mboms/:id
POST   /api/mes/master-data/mboms/:id/submit-review
POST   /api/mes/master-data/mboms/:id/release
POST   /api/mes/master-data/mboms/:id/obsolete
GET    /api/mes/master-data/mboms/:id/dependencies
MBOM Lines
GET    /api/mes/master-data/mboms/:id/lines
POST   /api/mes/master-data/mboms/:id/lines
PUT    /api/mes/master-data/mboms/:id/lines/:lineId
DELETE /api/mes/master-data/mboms/:id/lines/:lineId
POST   /api/mes/master-data/mboms/:id/lines/reorder
Substitutes
GET    /api/mes/master-data/mbom-lines/:lineId/substitutes
POST   /api/mes/master-data/mbom-lines/:lineId/substitutes
PUT    /api/mes/master-data/mbom-lines/:lineId/substitutes/:substituteId
DELETE /api/mes/master-data/mbom-lines/:lineId/substitutes/:substituteId
POST   /api/mes/master-data/mbom-lines/:lineId/substitutes/:substituteId/approve
Validation
POST /api/mes/master-data/mboms/:id/validate

The validation response should contain structured issues:

{
  "valid": false,
  "errors": [
    {
      "code": "MBOM_COMPONENT_CYCLE",
      "path": "lines[3].component_revision_id",
      "message": "..."
    }
  ],
  "warnings": []
}

Preserve backward compatibility where practical. If routes must change, provide a clear migration path and update all consumers atomically.

9. Phase 6 — MES Console UI

Replace the current header-only MBOM creation experience with a step-by-step workflow.

MBOM List

Display:

Localized MBOM name
MBOM code
Output Item Revision
Derived business type: Finished Good or Semi-Finished
Site
Version
Base quantity and UOM
Line count
Status
Validity
Default/effective indicator

Use the repository-wide UI rule:

localized name is primary;
business code is smaller secondary context;
never display raw UUIDs.
Create/Edit Wizard
Step 1 — Select Output Product

Select:

Item
Item Revision
Site

Filter output Item Revision to:

FinishedGood
SemiFinished

Do not allow RawMaterial as output.

Show:

Item name
Item code
Revision
Item type
Base UOM
Lifecycle status
Site
Step 2 — Header Information

Capture:

MBOM code
localized name
localized description
version
purpose
base quantity
base UOM
valid from
valid to

Base UOM must use the authoritative UOM selector.

Step 3 — Build Manufacturing Structure

Provide a tree editor for MBOM lines.

Each node must show:

Component localized name
Item code
Revision
Item type
Quantity per
UOM
Scrap
Phantom
Issue operation
Backflush
Optional

Support:

add root component;
add child component;
edit;
remove;
reorder;
expand/collapse;
searchable Item Revision selector;
validation feedback.

Do not allow selecting the output Product Revision as a component.

Step 4 — Substitute Materials

For every selected line, manage substitute materials.

Show:

Original component
Substitute component
Priority
Conversion factor
Maximum usage
Approval requirement
Effective dates
Status
Step 5 — Validation

Run backend validation and group issues by:

Header
Structure
UOM
Lifecycle
Circular dependency
Substitute
Routing compatibility
Release readiness
Step 6 — Review and Save

Show a complete summary before saving.

Step 7 — Release

Release must be a separate explicit action with confirmation.

Do not allow release when:

no lines exist;
quantity is invalid;
UOM is invalid;
a circular dependency exists;
component lifecycle is invalid;
required substitute approval is missing;
the structure does not match release rules.
10. Phase 7 — EBOM Boundary

Do not silently merge EBOM and MBOM.

During this task:

Audit whether EBOM tables, routes, APIs, or screens exist.
If EBOM is still missing, document it as a separate bounded feature.
Do not create a fake EBOM by renaming MBOM.
Do not use MBOM APIs for engineering workflows.
Update product documentation to describe:
EBOM = engineering/research structure
MBOM = manufacturing structure
Production Version = released manufacturing configuration

The current context previously recorded that no persisted EBOM aggregate existed at the time of the audit. Verify the current source again before making any claim.

11. Phase 8 — Data Migration

Create forward-only migrations.

Do not truncate master data.

Migration Preparation

Before changing data:

record row counts;
identify all existing MBOM headers;
identify orphan headers;
identify headers without Product Revision;
identify MBOM lines without valid headers;
identify invalid UOM references;
identify duplicate MBOM versions;
identify released MBOMs without lines;
identify invalid substitutes;
identify Production Versions referencing mismatched MBOMs;
identify Work Orders already snapshotting old MBOM data.

Generate a pre-migration report.

Header Migration

Map existing fields:

old MBOM code            -> mbom_code
old name                 -> localized name
old description          -> localized description
old plant                -> site_id
old base dataset qty     -> base_quantity
old UOM                  -> base_uom_id
technical information    -> retained metadata/document relation
reference document       -> attachment/document relation

Do not guess missing Product Revision relationships.

For ambiguous records:

do not auto-release;
mark as Draft or migration-review status;
write them into a reconciliation report.
Line Migration

If line data already exists:

preserve hierarchy;
preserve sequence;
map component Item Revision;
map quantity and UOM;
preserve scrap, phantom, issue operation, and backflush;
detect cycles before commit.

If current records have only header metadata and no lines:

do not invent components;
migrate the header as Draft;
classify it as incomplete;
require user completion before release.
Substitute Migration
preserve existing substitute rows;
validate original/substitute difference;
validate Item Group compatibility;
mark invalid rows for review;
do not silently delete business data.
Production Version Migration

For every Production Version:

validate Product Revision, MBOM, Routing, and Site consistency;
preserve valid relationships;
mark incompatible records invalid or requiring review;
do not repoint Production Versions automatically without deterministic evidence.
Historical Work Orders

Historical Work Orders must retain their existing snapshots.

Do not rewrite historical execution records to point to a newer MBOM.

12. Phase 9 — Work Order and Execution Compatibility

Audit:

WO creation
MBOM explosion
material requirements
WMS material request creation
operation issue mapping
quantity scaling
UOM snapshots
Production Version readiness

Required calculation:

required component quantity
=
WO requested quantity
÷ MBOM base quantity
× MBOM line quantity per
× scrap adjustment

Use decimal-safe arithmetic.

Do not use JavaScript floating-point arithmetic for backend business quantities.

Ensure:

semi-finished component lines remain semi-finished demand unless phantom rules require explosion;
raw materials are not incorrectly flattened across independent manufacturing orders;
Work Order stores snapshots of the exact released MBOM version;
WMS receives the correct component Revision, quantity, UOM, and Work Center/operation context.
13. Phase 10 — Events and Projections

Audit existing master-data events and consumers.

Publish meaningful lifecycle events through the existing outbox pattern, for example:

MES.MasterData.MBOMCreated.v1
MES.MasterData.MBOMUpdated.v1
MES.MasterData.MBOMReleased.v1
MES.MasterData.MBOMObsoleted.v1
MES.MasterData.ProductionVersionUpdated.v1

Event payloads must contain stable identity fields and sufficient business display fields, but must not duplicate the entire aggregate unnecessarily.

Update:

mes-execution-service projections
WMS projections, where required
QMS projections, where required
MES Console cache invalidation

Do not introduce cross-service database reads.

14. Phase 11 — Tests

Add tests for at least:

Header
finished-good output accepted;
semi-finished output accepted;
raw-material output rejected;
invalid Site rejected;
invalid Base UOM rejected;
duplicate version rule enforced;
released core data cannot be edited.
Lines
raw material component accepted;
semi-finished component accepted in finished-good MBOM;
output component self-reference rejected;
direct cycle rejected;
indirect cycle rejected;
invalid parent rejected;
zero/negative quantity rejected;
UOM precision enforced;
fraction rejected for integer-only UOM;
duplicate component policy verified.
Substitute
same-as-original rejected;
invalid technical group rejected without approval;
approved exception accepted;
invalid conversion factor rejected;
duplicate substitute rejected.
Production Version
matching Item Revision/MBOM/Routing/Site accepted;
mismatched Product Revision rejected;
mismatched Site rejected;
unreleased MBOM rejected;
unreleased Routing rejected;
default overlap rejected.
Migration
row counts preserved;
valid relationships preserved;
ambiguous rows reported;
no historical WO mutation;
migration is repeat-safe where applicable.
UI
wizard cannot skip required steps;
tree editor correctly renders hierarchy;
UOM selectors use authoritative UOM records;
backend validation errors map to the correct fields;
released MBOM renders read-only;
Item/Revision/MBOM/Production Version navigation works.
15. Phase 12 — Runtime Verification

Run a complete real flow.

Semi-Finished Example
Semi-finished AB
├── Raw material A: 1 PCS
└── Raw material B: 2 PCS

Create:

Item AB
Item Revision AB-R1
MBOM AB-R1
MBOM lines A and B
Routing AB
Production Version AB
Finished-Good Example
Finished product X
├── Semi-finished AB: 1 PCS
└── Raw material C: 1 PCS

Create:

Item X
Item Revision X-R1
MBOM X-R1
MBOM lines AB and C
Routing X
Production Version X
Work Order for X

Prove:

MBOM X does not incorrectly show A and B as direct components;
MBOM AB owns A and B;
Production Version X uses MBOM X;
Work Order X snapshots MBOM X;
material requirements match the selected manufacturing structure;
UOM values come from UOM management;
no browser refresh is required for newly saved data to appear.
16. Documentation Updates

Update the relevant product documents.

At minimum, update or create sections covering:

Item and Item Revision relationship
EBOM definition
MBOM Header
MBOM Line
Component Substitute
Production Version
Work Order MBOM snapshot behaviour
UOM ownership
release rules
versioning rules
migration notes

Make the following decisions explicit:

Item Revision supports 0..N MBOM versions.
MBOM business type is derived from output Item type.
MBOM Header is metadata and lifecycle.
MBOM Line is the manufacturing structure and quantity definition.
Production Version selects one MBOM and one Routing.
EBOM and MBOM are separate business concepts.
Historical Work Orders retain immutable configuration snapshots.

Do not overwrite historical design notes without marking them as superseded.

17. Update AI_CONTEXT.md

Update AI_CONTEXT.md only after implementation and verification.

Add:

final aggregate relationships;
owning service;
database schema;
API routes;
MES Console routes;
migration status;
event contracts;
Work Order compatibility;
runtime verification;
unresolved EBOM scope;
evidence status for every important claim.

Preserve the repository precedence rule that running code and migrations outrank prompt documents. The current context explicitly requires implementation claims to be backed by source and repeatable verification.

Do not mark the feature IMPLEMENTED_AND_VERIFIED based only on build success.

18. Feedback and Implementation Records

Create:

process-fix/Redesign-MBOM-Architecture-and-Workflow.md
implementation-fix/Redesign-MBOM-Architecture-and-Workflow-Implementation.md

The implementation report must include:

Initial audit findings
Architecture decisions
Schema before and after
Migration strategy
Migration row counts
Ambiguous records
Backend changes
API changes
UI changes
UOM integration
Production Version changes
WO compatibility
Events and projections
Tests executed
Runtime evidence
Known limitations
Remaining EBOM work

Also record implementation feedback:

what assumptions in the original request were correct;
what existing code contradicted the documents;
what was changed from the original design;
why Item Revision to MBOM remains 0..N;
why MBOMType was not added;
why Production Version remains the configuration selector;
any migration decisions requiring business confirmation.
19. Required Execution Order

Follow this exact order:

1. Read AI_CONTEXT.md and product documents.
2. Audit running code, schemas, migrations, APIs, UI, tests, and seeds.
3. Produce the current-state architecture report.
4. Define the target schema and invariants.
5. Add backend domain validation.
6. Create forward database migrations.
7. Migrate and reconcile existing data.
8. Update backend repositories and APIs.
9. Update events and downstream projections.
10. Redesign the MES Console MBOM workflow.
11. Update Production Version integration.
12. Verify Work Order creation and MBOM explosion.
13. Add automated tests.
14. Run real semi-finished and finished-good scenarios.
15. Update product documents.
16. Update AI_CONTEXT.md.
17. Write the implementation and feedback reports.

Do not begin UI refactoring before the backend schema and invariants are defined.

Do not migrate production-like data before generating the pre-migration reconciliation report.

Do not update AI_CONTEXT.md with unverified claims.

Completion Criteria

Do not report completion unless all of the following are proven:

MBOM creation requires an output Item Revision.
Raw material cannot be an MBOM output.
Item Revision supports multiple MBOM versions.
No duplicated MBOMType field was introduced.
MBOM Header and MBOM Lines are clearly separated.
Finished-good MBOM can consume semi-finished goods and raw materials.
Semi-finished MBOM can consume raw materials.
Substitute validation is enforced in the backend.
UOM is selected from authoritative UOM management.
Production Version validates Item Revision + MBOM + Routing + Site.
Work Order uses the Production Version configuration.
Existing data is migrated or explicitly reported as ambiguous.
Historical Work Orders are not rewritten.
MES Console supports the full step-by-step workflow.
Product documents are updated.
AI_CONTEXT.md is updated with evidence.
Automated tests and at least one real end-to-end manufacturing structure pass.