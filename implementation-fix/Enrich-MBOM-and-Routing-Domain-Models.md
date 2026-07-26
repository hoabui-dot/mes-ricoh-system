# Enrich MBOM and Routing Domain Models and Redesign Their Creation UX

## Role

Act as a senior MES domain architect, database engineer, backend engineer, and product designer.

The current MBOM and Routing screens expose an underlying domain-model weakness, not only a frontend formatting issue.

MBOM and Routing records currently appear to be represented mainly by technical codes, revisions, site references, quantities, and statuses. As a result:

- Users cannot understand the business purpose of an MBOM or Routing.
- Select options contain mostly codes.
- The current inline create forms have unclear or missing field labels.
- Users cannot tell what each select or numeric input represents.
- MBOM and Routing list pages lack meaningful localized names and descriptions.
- Routing operations show technical operation codes without enough explanation of what the manufacturing step actually does.
- The UI has no sufficient business metadata to display instead of IDs or codes.

Investigate the database and current source code first, then improve the domain data model, migrate existing data, update APIs, and redesign the MES Console UX.

Do not solve this by inventing frontend-only labels from IDs or concatenating codes.

---

# 1. Audit the Existing Implementation

Inspect the real current implementation of:

- `MD_MBOM_HEADER`
- `MD_MBOM_LINE`
- `MD_ROUTING_HEADER`
- `MD_ROUTING_OPERATION`
- `MD_OPERATION`
- Production Version references
- Database migrations
- Drizzle schemas
- Validation schemas
- Repositories
- Generic and dedicated API handlers
- Release validation
- Outbox events
- Seed data
- MES Console MBOM and Routing screens
- Select option contracts
- Work Order readiness endpoint
- Work Order creation summary
- i18n and LocalizedText conventions

Explicitly document:

- Current database columns
- Current required and optional fields
- Which fields contain LocalizedText
- Which APIs return only codes or IDs
- Which data is missing from existing records
- Which forms are inline quick-create forms
- Which release/event contracts would be affected by adding fields
- Whether released records are immutable
- Whether existing seed and production-like records need backfilling

The running schema, migrations, handlers, repositories, and tests are the source of truth.

---

# 2. Domain Modeling Principle

An MBOM or Routing is not merely a technical code.

Every master-data entity intended for planners, engineers, supervisors, or administrators must have a clear business identity:

```text
Business code
+ Localized name
+ Localized description
+ Version
+ Product and site context
+ Lifecycle status
+ Effective dates
+ Ownership and audit metadata

Codes remain important identifiers, but codes alone are not sufficient UI content.

The UI should allow a user to answer immediately:

What is this MBOM or Routing?
Which product does it belong to?
What is it used for?
Which version is this?
Where is it effective?
Is it standard, alternate, prototype, or rework?
Who owns or maintains it?
Why was it changed?
Is it ready for production?
3. Enrich the MBOM Header Model

Review the exact existing schema before choosing final column names.

At minimum, add or confirm support for the following business fields.

interface MBOMHeader {
  mbomId: string;
  mbomCode: string;

  name: LocalizedText;
  description?: LocalizedText;

  productRevisionId: string;
  siteId: string;

  version: string;
  purpose?: "Standard" | "Alternate" | "Prototype" | "Rework";

  baseQuantity: Decimal;
  baseUomId: string;

  validFrom: string;
  validTo?: string;

  status: "Draft" | "InReview" | "Released" | "Obsolete";

  changeReason?: LocalizedText;
  engineeringNote?: LocalizedText;
  referenceDocument?: string;

  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt: string;
  releasedBy?: string;
  releasedAt?: string;

  rowVersion?: number;
}

The exact fields must align with current repository conventions.

Required localized fields

At minimum:

name
description

Use the existing LocalizedText JSONB structure and supported languages:

Vietnamese
English
Japanese
Korean

Example:

{
  "vi": "Định mức vật tư chân máy ô tô",
  "en": "Automotive Engine Mount Manufacturing BOM",
  "ja": "自動車エンジンマウント製造BOM",
  "ko": "자동차 엔진 마운트 제조 BOM"
}

Do not store UI translation keys as business master data.

Business names belong in the database as localized domain data.

4. Enrich the MBOM Line Model Where Necessary

Audit whether MBOM lines have enough metadata for engineering and user comprehension.

Preserve the existing relationship behavior:

Component revision
Quantity per
UOM
Scrap rate
Phantom flag
Issue operation
Backflush
Optional material
Parent-child structure
Effective dates

Consider adding only genuinely useful metadata, such as:

Line note / material usage instruction
Substitution note
Engineering remark
Consumption method explanation

Prefer a localized line note only when there is a demonstrated business need.

Do not duplicate component names inside MBOM lines if they can be reliably joined from Item Revision master data.

5. Enrich the Routing Header Model

At minimum, add or confirm:

interface RoutingHeader {
  routingId: string;
  routingCode: string;

  name: LocalizedText;
  description?: LocalizedText;

  productRevisionId: string;
  siteId: string;

  version: string;
  routingType: "Standard" | "Alternate" | "Rework";

  productionPurpose?: LocalizedText;
  engineeringNote?: LocalizedText;
  changeReason?: LocalizedText;
  referenceDocument?: string;

  validFrom: string;
  validTo?: string;

  status: "Draft" | "InReview" | "Released" | "Obsolete";

  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt: string;
  releasedBy?: string;
  releasedAt?: string;

  rowVersion?: number;
}

Example localized data:

{
  "name": {
    "vi": "Quy trình sản xuất chân máy ô tô tiêu chuẩn",
    "en": "Standard Automotive Engine Mount Routing",
    "ja": "標準自動車エンジンマウント工程",
    "ko": "표준 자동차 엔진 마운트 공정"
  },
  "description": {
    "vi": "Quy trình từ luyện cao su đến kiểm tra chất lượng thành phẩm.",
    "en": "Production route from rubber mixing through final quality inspection.",
    "ja": "ゴム混練から最終品質検査までの製造工程。",
    "ko": "고무 혼련부터 최종 품질 검사까지의 생산 공정입니다."
  }
}
6. Enrich Operation Business Information

The Routing screen must not show only operation codes such as:

OP-MIX
OP-PREP
OP-CUT

The Operation catalog should provide enough information to explain what each manufacturing step represents.

Audit and add or confirm fields such as:

interface Operation {
  operationId: string;
  operationCode: string;

  name: LocalizedText;
  description?: LocalizedText;

  operationType: "Production" | "Inspection" | "Packing" | "Handling";

  confirmationMode: "StartFinish" | "QuantityOnly" | "Auto";
  quantityReporting: "GoodOnly" | "GoodScrap";

  requiresMaterialScan: boolean;
  requiresOutputLabel: boolean;
  allowPartialCompletion: boolean;

  operatorInstructionSummary?: LocalizedText;
  qualityRequirementSummary?: LocalizedText;

  status: "Active" | "Inactive";
}

The domain catalog already defines OperationName, operation type, confirmation behavior, scan requirement, output-label behavior, and partial-completion behavior. Preserve these semantics and enrich only what is actually missing.

Example UI label:

OP-MIX — Rubber Mixing
Start/finish confirmation · Material scan required · Output label required

Not:

OP-MIX
7. Migration Strategy

Create forward-only database migrations.

Do not edit previously applied migrations.

The migration must:

Add new columns safely as nullable or with temporary defaults.
Backfill existing records.
Validate backfilled data.
Apply required constraints only after successful backfill.
Add indexes where search or filtering requires them.
Preserve primary keys and existing foreign keys.
Preserve Work Order and Production Version references.
Avoid rewriting released entity identity.
Provide a rollback migration if the repository convention supports it.

Possible PostgreSQL fields:

name JSONB
description JSONB
change_reason JSONB
engineering_note JSONB
reference_document TEXT
purpose VARCHAR(...)
created_by UUID/TEXT
updated_by UUID/TEXT
released_by UUID/TEXT
released_at TIMESTAMPTZ
row_version INTEGER NOT NULL DEFAULT 1

Use actual project naming conventions.

8. Existing Data Backfill

Inspect all current MBOM, Routing, and Operation records before generating data.

Do not fill all records with generic names such as:

MBOM name
Routing name
Default routing

Use existing relationships and domain context to produce meaningful backfill values.

For example:

MBOM-FG-WS-CM01-R1

may become:

{
  "name": {
    "vi": "Định mức sản xuất chân máy ô tô R1",
    "en": "Automotive Engine Mount Manufacturing BOM R1",
    "ja": "自動車エンジンマウント製造BOM R1",
    "ko": "자동차 엔진 마운트 제조 BOM R1"
  }
}

A routing containing OP-MIX, OP-PREP, OP-CUT, OP-MOLD, OP-TRIM, and OP-QC may receive a description based on that verified sequence. The representative process is mixing, metal preparation, cutting, molding, trimming, and quality inspection.

Backfill sources may include:

Related Item localized name
Item Revision
MBOM or Routing code
Existing site
Existing operation sequence
Seed documentation
Existing implementation data

Mark values generated from verified seed/domain data distinctly from values inferred only from codes.

Do not invent product meaning when the repository does not provide evidence.

For records without enough information, use a controlled migration fallback such as:

{
  "vi": "<existing code>",
  "en": "<existing code>",
  "ja": "<existing code>",
  "ko": "<existing code>"
}

and register them for translation/data-quality review.

Do not claim such fallback data is fully localized.

9. Data Structure After Migration

After the migration, provide examples of the actual updated records.

Example MBOM response:

{
  "mbom_id": "uuid",
  "mbom_code": "MBOM-FG-WS-CM01-R1",
  "name": {
    "vi": "Định mức sản xuất chân máy ô tô R1",
    "en": "Automotive Engine Mount Manufacturing BOM R1",
    "ja": "...",
    "ko": "..."
  },
  "description": {
    "vi": "Định mức vật tư tiêu chuẩn cho sản phẩm chân máy ô tô.",
    "en": "Standard manufacturing material structure for the automotive engine mount.",
    "ja": "...",
    "ko": "..."
  },
  "product_revision": {
    "id": "uuid",
    "display_code": "FG-WS-CM01-R1",
    "item_name": {
      "vi": "Cao su chân máy ô tô",
      "en": "Automotive Engine Mount"
    }
  },
  "site": {
    "id": "uuid",
    "code": "SITE-KZ3",
    "name": {
      "vi": "Nhà máy KZ3",
      "en": "KZ3 Plant"
    }
  },
  "version": "R1",
  "purpose": "Standard",
  "base_quantity": 100,
  "base_uom": {
    "id": "uuid",
    "code": "PCS",
    "name": {
      "vi": "Cái",
      "en": "Pieces"
    }
  },
  "status": "Released",
  "valid_from": "2026-01-01T00:00:00Z",
  "valid_to": null
}

Example Routing response:

{
  "routing_id": "uuid",
  "routing_code": "RT-FG-WS-CM01-R1",
  "name": {
    "vi": "Quy trình sản xuất chân máy ô tô R1",
    "en": "Automotive Engine Mount Production Routing R1"
  },
  "description": {
    "vi": "Quy trình tiêu chuẩn từ luyện cao su đến kiểm tra chất lượng.",
    "en": "Standard route from rubber mixing through final quality inspection."
  },
  "product_revision": {
    "id": "uuid",
    "display_code": "FG-WS-CM01-R1",
    "item_name": {
      "vi": "Cao su chân máy ô tô",
      "en": "Automotive Engine Mount"
    }
  },
  "site": {
    "id": "uuid",
    "code": "SITE-KZ3",
    "name": {
      "vi": "Nhà máy KZ3",
      "en": "KZ3 Plant"
    }
  },
  "routing_type": "Standard",
  "version": "R1",
  "status": "Released",
  "operations": [
    {
      "sequence": 10,
      "operation": {
        "id": "uuid",
        "code": "OP-MIX",
        "name": {
          "vi": "Luyện cán cao su",
          "en": "Rubber Mixing"
        },
        "description": {
          "vi": "Chuẩn bị hỗn hợp cao su và tạo nhãn mẻ mẹ.",
          "en": "Prepare the rubber compound and issue the mother batch label."
        }
      },
      "work_center": {
        "id": "uuid",
        "code": "WC-MIX-01",
        "name": {
          "vi": "Trạm luyện cao su",
          "en": "Rubber Mixing Work Center"
        }
      },
      "confirmation_mode": "StartFinish",
      "requires_material_scan": true,
      "requires_output_label": true
    }
  ]
}

These examples are conceptual. Match the actual API conventions.

10. Replace Inline Quick-Create Forms

The existing MBOM screen contains an unlabeled inline form in the list toolbar.

This form is too complex and important to remain as a row of unexplained inputs.

Remove MBOM and Routing entity creation from the list toolbar.

Use the list-page Create button only for navigation.

Required routes:

/master-data/mboms/new
/master-data/routings/new

Use child routes within the corresponding master-data route structure.

Suggested route hierarchy:

/master-data/mboms
/master-data/mboms/new
/master-data/mboms/:mbomId
/master-data/mboms/:mbomId/edit
/master-data/mboms/:mbomId/lines

/master-data/routings
/master-data/routings/new
/master-data/routings/:routingId
/master-data/routings/:routingId/edit
/master-data/routings/:routingId/operations

Do not use a small modal for the full creation process unless the existing application convention strongly requires it.

These entities contain enough engineering information to justify dedicated pages.

11. MBOM Creation Page UX

Create a clearly labeled, multi-section form.

Recommended sections:

Basic information
MBOM code
Localized name
Localized description
Product Revision
Site
Version
Purpose/type
Quantity basis
Base quantity
Base UOM
Validity and lifecycle
Valid from
Valid to
Initial status
Change reason
Engineering metadata
Engineering note
Reference document

Use explicit labels and helper text for every field.

Example:

Product Revision
Select the finished or semi-finished product revision produced by this MBOM.
Base Quantity
The output quantity used as the basis for all component quantities.

The form should initially create the MBOM header as Draft.

After successful creation, navigate to:

/master-data/mboms/:id/lines

where the user can build the material tree.

Do not try to create a complete engineering MBOM from one toolbar row.

12. Routing Creation Page UX

Recommended sections:

Basic information
Routing code
Localized name
Localized description
Product Revision
Site
Version
Routing type
Validity
Valid from
Valid to
Engineering context
Production purpose
Change reason
Engineering note
Reference document

After creating the Draft routing header, navigate to:

/master-data/routings/:id/operations

The operation editor should show:

Sequence
Operation code
Localized operation name
Localized operation description
Default Work Center code and localized name
Scheduling mode
Predecessors
Queue time
Move time
Overlap
Transfer batch
Milestone
Confirmation behavior
Material-scan requirement
Output-label requirement

The user must understand what every operation does without decoding a technical code.

13. Localized Field Editor

Use a reusable LocalizedText editor.

Recommended UX:

Name
[ VI ] [ EN ] [ JA ] [ KO ]

Vietnamese name
[                                          ]

English name
[                                          ]

Possible behavior:

Active application language first
Other languages in tabs or collapsible fields
Show translation completeness
Require at least Vietnamese or the configured primary business language
Apply documented fallback behavior
Do not silently copy English into Japanese and Korean and mark them complete

Reuse existing i18n/localized-data conventions.

14. List Page Redesign
MBOM list columns

Display:

MBOM code
Localized MBOM name
Product code and localized product name
Version
Site code and localized site name
Base quantity and UOM
Purpose
Status
Validity
Actions

Do not show only:

MBOM code | R1 | 100 PCS | Released
Routing list columns

Display:

Routing code
Localized Routing name
Product and Revision
Site
Routing type
Number of operations
Status
Validity
Actions

Use responsive column prioritization rather than removing business meaning.

15. Select and Reference Display Rules

All selects must show a clear business label.

Examples:

FG-WS-CM01-R1 — Automotive Engine Mount
MBOM-FG-WS-CM01-R1 — Automotive Engine Mount Manufacturing BOM
RT-FG-WS-CM01-R1 — Standard Engine Mount Production Routing
OP-MOLD — Molding and Vulcanization
WC-MOLD-01 — Molding Line 1

Internal IDs remain option values but must not be visible.

16. API Contract Updates

Update list, detail, create, update, readiness, and Production Version contracts as necessary.

Return both:

Stable ID
Human-readable business display data

Do not require the frontend to issue one request per table row.

Prefer enriched response objects or efficient joined display projections.

Ensure Work Order readiness now returns:

MBOM ID + code + localized name
Routing ID + code + localized name
Production Version ID + code

The frontend should never fall back to UUID display.

The current implementation policy already states that normal business UI should show business identity rather than database IDs; preserve and extend this rule.

17. Event Compatibility

Inspect current release events:

MES.MasterData.MBOMReleased.v2
MES.MasterData.RoutingReleased.v1

Determine whether new localized fields and metadata must be included.

Do not silently break existing consumers.

Choose one of:

Add optional backward-compatible fields
Introduce a new event schema version
Keep events unchanged when consumers do not need the new fields

Update:

Schema Registry definitions
Producers
Consumers
Local read models
Contract tests

Record the compatibility decision.

18. Validation Rules

Add server-side validation for new fields.

At minimum:

Code remains unique according to current scope.
Localized name has a required primary language.
Localized values have valid structure.
Description length is bounded.
Version is present.
Product Revision and Site are valid.
Valid-to is after valid-from.
Released records satisfy all existing structural checks.
Released core engineering data is not edited directly.
Revision or versioning workflow is used for released changes.
Routing contains at least one operation before release.
MBOM contains at least one line before release.
Routing operation sequences are unique.
Routing dependencies contain no cycles.
MBOM hierarchy contains no cycles.

Preserve existing domain rules. The current catalog requires released MBOMs to contain lines and released Routings to contain operations.

19. Backward Compatibility

Existing:

Work Orders
Production Versions
MBOM lines
Routing operations
Read models
Events
Historical references

must remain valid.

Do not replace IDs.

Do not recreate records with new IDs merely to add names.

Do not rewrite Work Order snapshots unless explicitly required and proven safe.

Existing released entities should remain released unless a data-quality failure makes them invalid. In that case, report the issue rather than silently altering lifecycle state.

20. Testing Requirements

Add tests for:

Migration
New columns are created.
Existing records are preserved.
Existing foreign keys remain valid.
Backfill produces valid LocalizedText.
Constraints can be applied.
Migration is idempotent according to project tooling.
No Product Version references are broken.
Backend
MBOM create/update accepts localized metadata.
Routing create/update accepts localized metadata.
List and detail APIs return display fields.
Operation APIs return localized operation information.
Primary-language name validation works.
Release validation still works.
Existing records remain readable.
Event schemas remain compatible.
Work Order readiness returns MBOM and Routing business identity.
Frontend
MBOM Create button navigates to /master-data/mboms/new.
Routing Create button navigates to /master-data/routings/new.
All form fields have labels and helper text.
Localized text editor works.
Select options show code plus localized name.
No internal IDs appear.
List pages show localized names and product context.
Routing operations explain the process step.
Loading, empty, validation, and API-error states work.
VI/EN/JA/KO display and fallback work.
Light and dark themes remain readable.
Keyboard navigation and focus states work.
Integration
Create Draft MBOM header, add lines, validate, and release.
Create Draft Routing header, add operations, validate, and release.
Link both through Production Version.
Production-ready Work Order selector shows their names.
Create a Work Order from the migrated configuration.
Existing Work Orders remain accessible.
21. Required Runtime Verification

After implementation:

Run database migrations.
Query old MBOM and Routing records directly.
Confirm old IDs and relationships remain unchanged.
Confirm new localized fields contain valid data.
Call list and detail endpoints.
Open MBOM and Routing list pages.
Create one new Draft MBOM.
Create one new Draft Routing.
Add representative lines/operations.
Verify Production Version references.
Verify Work Order readiness display.
Build and test affected services.
Rebuild/recreate affected Docker services.
Inspect service logs.
Perform browser review in VI and EN at minimum.

Do not mark the task verified based only on TypeScript compilation.

22. Implementation Report

Create:

implementation-fix/mes-mbom-routing-domain-model-and-ux-enrichment.md

Include:

Root cause
Previous database structures
New database structures
Migration files
Backfill rules
Before/after record examples
API contract changes
Event compatibility decision
New routes
Form redesign
List redesign
Localized data strategy
Existing-data verification
Files changed
Tests and commands
Browser verification
Remaining translation/data-quality gaps
Evidence status for every major claim

If any requested field or behavior cannot be safely implemented, create a gap report instead of using fake display data.

23. Acceptance Criteria

The work is complete only when:

MBOM and Routing are meaningful business entities, not code-only records.
Both support localized names and descriptions.
Existing records are migrated safely.
Existing IDs and relationships remain unchanged.
New records use the enriched structure.
MBOM and Routing creation use dedicated child routes.
Inline unlabeled create rows are removed.
Every form input has a label and explanation.
Selects show code plus localized business name.
Routing operations show what each manufacturing step means.
List pages display business context, not only technical codes.
Work Order readiness displays MBOM and Routing code/name, never UUIDs.
API and event contracts remain compatible or are explicitly versioned.
Released data lifecycle rules remain intact.
Database migrations, backend tests, frontend builds, integration tests, and browser verification pass.
The implementation report includes the final updated data structure and verified old-data migration results.