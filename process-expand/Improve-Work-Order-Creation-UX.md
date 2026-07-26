# Improve Work Order Creation UX and Redesign Route Detail Modal

## Role

Act as a senior MES product designer, senior frontend engineer, and senior backend engineer.

Your task is to improve two UX areas in the MES Console:

1. The Work Order creation form.
2. The route-aware page detail modal.

Before changing code, inspect the current frontend, backend handlers, database migrations, repositories, numbering logic, existing Work Order records, i18n resources, shared UI components, and implementation reports.

Do not assume that Work Order code generation already exists.

The running source code, database schema, migrations, handlers, repositories, and tests are the source of truth.

---

# Part A — Improve the Work Order Creation Form

## 1. Current UX Problem

The current form requires the user to manually type a product code into a text input:

```text
Mã sản phẩm cần sản xuất

This is not appropriate for normal planner usage because the MES already has product and Item Revision master data.

Typing a code manually causes several problems:

Typing mistakes
Invalid or unreleased products
Incorrect revision selection
Poor discoverability
Users must remember technical codes
Backend validation errors that could have been prevented in the UI

Replace this free-text product code input with a searchable product selector.

2. Product Selector Requirements

Replace the current product code input with a searchable Select, Combobox, or shared application autocomplete component.

Prefer the existing shared shadcn-style select/combobox primitives.

Do not use a native HTML <select> when the product list can become large.

Field label

Use a label such as:

Sản phẩm cần sản xuất

English:

Product to manufacture
Placeholder
Chọn sản phẩm và revision đã sẵn sàng sản xuất

English:

Select a production-ready product revision
Data source

Load valid product options from the MES Master Data API.

The selector should only show product revisions that are eligible for Work Order creation, where eligibility can be proven from the existing backend contract.

At minimum, investigate whether the option must satisfy:

Item is active
Item Revision exists
Item Revision is Released
Item Revision is effective
Product Revision has a valid Production Version
Production Version is Released and effective
Production Version belongs to the selected Site
Linked MBOM is valid for Work Order creation
Linked Routing is valid for Work Order creation

Do not duplicate complex readiness rules in the frontend.

Prefer one of these backend approaches:

A dedicated production-ready product revision endpoint.
A master-data readiness endpoint.
An existing endpoint that already exposes reliable release/readiness status.

If no suitable endpoint exists, add an explicit backend endpoint rather than loading all records and incorrectly deriving readiness in the browser.

Suggested endpoint
GET /api/mes/master-data/production-ready-item-revisions

Possible query parameters:

site_id
search
limit
cursor
planned_date
quantity

Example response:

{
  "items": [
    {
      "item_id": "uuid",
      "item_code": "FG-WS-CM01",
      "item_name": {
        "vi": "Cao su chân máy ô tô",
        "en": "Automotive Engine Mount"
      },
      "item_revision_id": "uuid",
      "revision_no": "R1",
      "display_code": "FG-WS-CM01-R1",
      "base_uom_id": "uuid",
      "base_uom_code": "PCS",
      "site_id": "uuid",
      "production_version_id": "uuid",
      "production_version_code": "PV-FG-WS-CM01-R1",
      "readiness_status": "Ready"
    }
  ]
}

Adapt this contract to the actual architecture and naming conventions.

Option layout

Each option should display more than the raw product code.

Recommended layout:

FG-WS-CM01-R1
Automotive Engine Mount
PCS · Production Version PV-FG-WS-CM01-R1

The primary text should be:

Item code plus revision

The secondary text should be:

Localized product name

Optional metadata:

Base UOM
Site
Production Version
Readiness badge
Search behavior

Allow users to search by:

Item code
Revision code
Product name
Production Version code, when useful

Debounce remote search.

Support keyboard navigation.

Show loading, empty, and error states.

Empty state
Không tìm thấy sản phẩm sẵn sàng để tạo lệnh sản xuất.
Hãy kiểm tra trạng thái Item Revision, Production Version, MBOM và Routing.

English:

No production-ready products were found.
Check the Item Revision, Production Version, MBOM, and Routing release status.
Selected value

Once selected, retain the actual IDs required by the backend:

item_revision_id
item_id, if required
production_version_id, if explicitly selected or resolved
uom_id
site_id, where applicable

Do not submit only the visible product code.

Do not trust text labels as database identifiers.

3. Automatically Populate Related Fields

After selecting a product revision, populate relevant read-only information:

Product name
Revision
Base UOM
Production Version
Site, when derived
Readiness state

The quantity field should display or suffix the resolved UOM.

Example:

Requested quantity
[ 500                         ] PCS

Do not allow the user to choose an incompatible UOM unless the system has a verified UOM conversion workflow.

If changing the selected product invalidates other values, clear or recalculate them explicitly.

4. Add a Read-Only Work Order Code Field

The form must show the Work Order code that will be assigned to the new Work Order.

Add a field near the top of the form:

Mã lệnh sản xuất

English:

Work Order code

The field must be disabled or read-only.

The user must not be allowed to edit the Work Order code.

Example:

WO-202601201

Add helper text:

Mã được hệ thống tạo tự động và không thể chỉnh sửa.

English:

This code is generated automatically and cannot be changed.
5. Work Order Code Prefix

The Work Order code prefix must be fixed in source code as:

WO

Define it once as a named constant.

Example:

export const WORK_ORDER_CODE_PREFIX = "WO";

or in Go:

const WorkOrderCodePrefix = "WO"

Do not scatter the string "WO" throughout the codebase.

Do not let the browser provide or override the authoritative prefix.

The backend remains the authoritative owner of the final Work Order code.

6. Investigate Existing Work Order Code Support

Before implementing new numbering logic, inspect:

Work Order database migration
Work Order schema
Work Order repository
Work Order creation use case
Seed data
API response
Work Order list and detail UI
Tests
Existing numbering rules
Existing traceability numbering service
Any current wo_code generation function

Explicitly determine:

Whether the work_order table already contains wo_code
Whether wo_code is required
Whether it has a unique constraint
Whether the backend currently accepts it from the request
Whether it is generated server-side
Whether existing Work Orders have duplicate or null codes
Whether code generation is transaction-safe
Whether simultaneous requests can generate duplicate codes

If Work Order code support is missing, incomplete, client-generated, non-unique, or concurrency-unsafe, fix it immediately as part of this task.

Do not only add a disabled frontend input.

7. Work Order Code Generation Strategy

Use a production-safe, deterministic, concurrency-safe numbering strategy.

The exact format may follow the repository’s existing convention, but the target format should be human-readable and begin with:

WO-

Example:

WO-202601201

Because this example is ambiguous, define and document the final format explicitly.

Recommended format:

WO-{yyyyMMdd}-{sequence}

Example:

WO-20260723-0001

This is preferable because it is easy to read and avoids ambiguity.

Alternative compact format:

WO-{yyyyMMdd}{sequence}

Example:

WO-202607230001

Choose one format and use it consistently.

Do not generate codes using:

Current row count
MAX(code) + 1 without locking
Random client-side values
Timestamp alone
In-memory counters
Frontend JavaScript
Non-transactional reads followed by inserts
Recommended logic

Use a database-backed atomic sequence.

Possible implementation options:

PostgreSQL sequence
Numbering table with row-level locking
Atomic INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING
An existing numbering domain service, only if ownership is appropriate

Example conceptual numbering key:

Entity: WorkOrder
Prefix: WO
Reset frequency: Daily
Date: 2026-07-23
Current sequence: 42

Generated result:

WO-20260723-0042
Required guarantees

The generator must guarantee:

Uniqueness
Concurrency safety
Transaction safety
Stable prefix
Predictable formatting
No duplicate codes after retries
Compatibility with idempotent Work Order creation

Add a database unique constraint on wo_code if one does not exist.

The final code must be assigned by the backend during creation.

8. Preview Code Versus Final Code

The form must display a Work Order code before the user clicks Create.

However, the frontend must not incorrectly reserve or invent the final code.

Implement one of these safe strategies.

Preferred strategy — Reserve a draft code

Request a code reservation from the backend when the form is initialized or when the product becomes valid.

Suggested endpoint:

POST /api/mes/execution/work-order-code-reservations

Example response:

{
  "reservation_id": "uuid",
  "work_order_code": "WO-20260723-0042",
  "expires_at": "2026-07-23T10:30:00Z"
}

Submit the reservation ID with the create request.

The backend validates and consumes the reservation atomically.

This allows the user to see the exact final code safely.

Acceptable alternative — Preview-only code

The backend returns a clearly marked preview:

{
  "preview_code": "WO-20260723-0042",
  "is_reserved": false
}

The UI must label it appropriately:

Mã dự kiến

English:

Expected Work Order code

The final Work Order code may differ if another transaction consumes the sequence first.

Do not display a non-reserved preview as a guaranteed final code.

Do not do this

Do not generate a code in React and send it as authoritative data.

9. Work Order Create Request Contract

The create request should send stable entity identifiers.

Example:

{
  "item_revision_id": "uuid",
  "production_version_id": "uuid",
  "quantity": 500,
  "uom_id": "uuid",
  "site_id": "uuid",
  "planned_start_at": "2026-07-23T08:00:00+07:00",
  "planned_end_at": "2026-08-01T17:00:00+07:00",
  "code_reservation_id": "uuid",
  "idempotency_key": "uuid"
}

Do not require the user to type:

Item code
Item name
Revision name
Work Order code

The backend may snapshot display values as part of the Work Order, but it must resolve authoritative values from IDs.

10. Updated Work Order Form Layout

Redesign the form with clearer grouping.

Recommended desktop structure:

┌───────────────────────────────────────────────────────────┐
│ Create Work Order                                         │
│ Validate production readiness and create a Draft WO.      │
├───────────────────────────────────────────────────────────┤
│ Work Order code                                           │
│ [ WO-20260723-0042                              ] Read-only│
│ Generated automatically by the system.                    │
│                                                           │
│ Product to manufacture                                    │
│ [ Search product code, revision, or product name       ▾ ]│
│                                                           │
│ Selected configuration                                    │
│ Revision R1 · PV-FG-WS-CM01-R1 · PCS · HN01              │
│                                                           │
│ Requested quantity              Target completion date    │
│ [ 500                    ] PCS   [ 01/08/2026          ]   │
│                                                           │
│ Readiness summary                                         │
│ Item Revision  Ready                                      │
│ Production Version  Ready                                 │
│ MBOM  Ready                                               │
│ Routing  Ready                                            │
├───────────────────────────────────────────────────────────┤
│                           [ Cancel ] [ Create Work Order ] │
└───────────────────────────────────────────────────────────┘

Use the existing industrial MES design system.

Improve:

Vertical rhythm
Label hierarchy
Spacing
Read-only field distinction
Helper text readability
Focus states
Empty states
Loading states
Error states
Light and dark theme contrast

Do not make the form unnecessarily wide.

Part B — Redesign the Route Detail Modal
11. Current UX Problem

The current route detail modal displays four large sections:

How to use
Data on the screen
Important statuses
Demo notes

This is too repetitive, visually heavy, and not aligned with what users need.

The modal currently consumes too much space while providing content that overlaps between sections.

Redesign the modal so it contains only two meaningful sections:

How to use
A context-specific explanation section

Remove the generic sections:

Data on the screen
Important statuses
Demo notes

Do not keep them as separate cards.

Important warnings or limitations may still appear inline only when they are directly relevant.

12. New Detail Modal Information Architecture

Every page detail modal must contain exactly these primary sections:

Section 1 — How to use

This section explains the user actions on the current page.

It should answer:

What should the user do first?
What information must be selected or entered?
Which button performs which action?
What happens after the action?
What should the user do when validation fails?

Use short numbered steps.

Avoid large paragraphs.

Section 2 — Context-specific explanation

The content depends on the route type.

There are two main page types:

Entity creation/edit pages
Entity list/index pages

Do not show the same generic content on every page.

13. Detail Content for Entity Creation Pages

For an entity creation page, Section 2 must explain the actual process used to create that entity.

For the Work Order creation page, explain the full Work Order creation process.

Title suggestions:

Quy trình tạo lệnh sản xuất

English:

How the Work Order is created

Use a vertical process timeline with approximately 10 steps.

The content should match the real implemented workflow.

Target Work Order creation explanation:

Select a production-ready product revision.
Enter the requested quantity and target date.
Validate the request and authenticated user.
Validate Item Revision release and effectiveness.
Resolve and validate the Production Version.
Validate the linked MBOM and calculate material demand.
Validate the Routing and production operations.
Check Work Centers, production standards, capability, and scheduling readiness where supported.
Create the Draft Work Order, operations, and material requirements.
Queue the Work Order creation event for asynchronous processing.

Each step should include:

Step number
Short title
One concise explanation
Optional blocking/advisory label
Optional related entity name

Example:

06 — Validate MBOM and materials

The MES verifies the released MBOM and calculates the required
material quantity based on the requested Work Order quantity and scrap rate.

For event-only stages, use accurate wording:

10 — Queue integration event

The MES records the Work Order creation event in the transactional outbox.
Downstream services process it asynchronously.

Do not imply WMS or QMS completed any work during Draft WO creation unless the current source proves it.

The process explanation should be educational, not a live progress tracker.

The realtime progress modal after clicking Create remains a separate feature.

14. Detail Content for Entity List Pages

For list/index pages, Section 2 should explain the page controls and displayed data.

Title suggestions:

Giải thích danh sách

English:

Understanding this list

Explain:

Meaning of each important column
Available filters
Search behavior
Sort behavior
Pagination
Row-level actions
Bulk actions, if supported
Create button
Refresh button
Status badges
Detail navigation
Empty state
Permission-related disabled actions

Example for Work Order list:

WO code
Unique code assigned to each Work Order.

Product
The product and revision that the Work Order will manufacture.

Quantity
The requested production quantity and UOM.

Status
Draft, Approved, In Progress, Completed, or Cancelled.

Planned period
The planned production start and completion dates.

Then explain controls:

Search
Search by Work Order code, product code, or product name.

Status filter
Display only Work Orders in the selected lifecycle state.

Create Work Order
Open the Work Order creation form.

Open details
View the Work Order header, operations, material requirements,
readiness results, and approval history.

Do not explain an entity creation process on a simple list page unless the user navigates to the creation page.

15. Detail Modal Visual Redesign

Use a polished, readable document-style modal rather than four equal gray cards.

The current four-card layout creates unnecessary visual weight.

Recommended desktop layout:

┌──────────────────────────────────────────────────────────────┐
│ Page guide                                             Close │
│ Create Work Order                                           │
│ Learn how to use this page and how a WO is created.         │
├───────────────────────┬──────────────────────────────────────┤
│ Navigation            │ Content                              │
│                       │                                      │
│ 1. How to use         │ How to use                           │
│ 2. Creation process   │ 1. Select a product revision...     │
│                       │ 2. Enter quantity...                 │
│                       │                                      │
│                       │ How the Work Order is created         │
│                       │ 01 Validate request                  │
│                       │ 02 Validate revision                 │
│                       │ 03 Resolve Production Version        │
│                       │ ...                                  │
└───────────────────────┴──────────────────────────────────────┘

A simpler single-column layout is also acceptable if it is more consistent with the existing application.

Recommended modal dimensions:

Width: min(980px, 94vw)
Maximum height: 88vh
Sticky header
Scrollable content
Optional sticky section navigation on desktop
Full-width stacked layout on tablet/mobile
16. Detail Modal Visual Style

Use:

White or semantic surface background
Clear section dividers
Navy/slate headings
Orange accent only for active navigation or key actions
Neutral cards with subtle borders
Proper line height
Short text width
Numbered process nodes
Consistent icons
Small semantic badges where useful

Do not use:

Four large dark-gray blocks
Low-contrast paragraph text
Long bullet lists inside equally weighted cards
Excessive orange bullets
Repetitive section headings
Dense paragraphs spanning the full modal width

Recommended text hierarchy:

Modal title: 20–22 px, semibold
Section title: 16–18 px, semibold
Step title: 14–16 px, semibold
Body: 14 px with comfortable line height
Supporting metadata: 12–13 px

Use the existing design tokens rather than hard-coded colors where possible.

17. Content Architecture

Create a route-aware content definition.

Suggested type:

type PageGuideType = "create" | "list" | "detail" | "edit";

interface PageGuideDefinition {
  route: string;
  pageType: PageGuideType;
  titleKey: string;
  descriptionKey: string;
  usageSteps: GuideStep[];
  contextSection:
    | {
        type: "entity-process";
        titleKey: string;
        steps: EntityProcessStep[];
      }
    | {
        type: "list-explanation";
        titleKey: string;
        columns: ColumnExplanation[];
        controls: ControlExplanation[];
      };
}

Suggested structures:

interface GuideStep {
  id: string;
  titleKey: string;
  descriptionKey: string;
}

interface EntityProcessStep {
  id: string;
  order: number;
  titleKey: string;
  descriptionKey: string;
  severity?: "normal" | "advisory" | "blocking" | "async";
}

interface ColumnExplanation {
  columnKey: string;
  titleKey: string;
  descriptionKey: string;
}

interface ControlExplanation {
  controlKey: string;
  titleKey: string;
  descriptionKey: string;
}

Do not hard-code large JSX paragraphs directly inside route components.

Centralize page-guide content in maintainable route-aware configuration.

18. Dynamic and Accurate Content

The guide must describe actual current behavior.

Do not copy historical requirements as implemented facts.

For each route, inspect:

Current visible columns
Current filters
Current buttons
Current actions
Current entity lifecycle
Current API behavior
Current validation flow
Demo-only behavior
Known limitations

When a capability is not implemented, describe it accurately.

Example:

Capacity is currently advisory and does not automatically schedule equipment.

Do not claim:

The MES automatically assigns the optimal machine.

unless source code proves that behavior.

19. Accessibility Requirements

For both the create form and detail modal:

Correct label association
Keyboard-accessible combobox
Visible focus states
Dialog focus trap
Escape and close behavior
Screen-reader-friendly descriptions
Icons must not be the only source of meaning
Read-only Work Order code must remain selectable for copying
Disabled fields must have readable contrast
Process timeline must have semantic ordered-list structure where possible
Support reduced motion
Support light and dark themes

Prefer readOnly over disabled for the Work Order code when the user should be able to focus and copy it.

If visually disabled, preserve accessibility and copy behavior.

20. Internationalization

All new text must support:

Vietnamese
English
Japanese
Korean

Add stable translation keys.

Example:

workOrders.create.fields.productRevision
workOrders.create.fields.workOrderCode
workOrders.create.fields.workOrderCodeHelp
workOrders.create.productSelector.placeholder
workOrders.create.productSelector.empty
workOrders.create.readiness.title
pageGuide.sections.howToUse
pageGuide.sections.creationProcess
pageGuide.sections.listExplanation
pageGuide.workOrders.create.process.validateRequest
pageGuide.workOrders.create.process.validateRevision
pageGuide.workOrders.create.process.resolveProductionVersion

Do not embed Vietnamese text directly in components.

21. Validation and Error UX

Product selector errors should appear under the selector.

Examples:

Unable to load production-ready products.
This product revision is no longer released.
Refresh the list and select another revision.

Work Order code errors:

Unable to reserve a Work Order code.
Please retry before creating the Work Order.

Duplicate code database conflicts must be retried safely by the backend generator, not shown immediately as a user-fixable error.

If retries are exhausted:

The MES could not generate a unique Work Order code.
Reference: ERR-WO-CODE-GENERATION

Do not ask the user to type another code.

22. Testing Requirements
Backend tests

Add or update tests for:

Work Order code exists in schema
Work Order code is required
Work Order code is unique
Prefix is always WO
Code format is correct
Concurrent requests generate unique codes
Daily or configured sequence reset works
Idempotent request returns the same Work Order code
Failed transaction does not incorrectly consume or duplicate a code, according to the selected strategy
Product-ready endpoint excludes unreleased revisions
Product-ready endpoint excludes invalid Production Versions
Site filtering works
Search works
Pagination works
Frontend tests

Add or update tests for:

Product field is no longer a free-text input
Product selector loads options
Search filters options
Option displays item code, revision, and product name
Selected option stores IDs
UOM is populated
Work Order code is visible
Work Order code cannot be edited
Work Order code can be copied when read-only
Loading state
Empty state
API error state
Create button is disabled when required data is missing
Detail modal contains only the two primary sections
Create-page detail shows entity creation process
Work Order creation guide shows the verified process steps
List-page detail explains columns, filters, and buttons
Removed cards no longer render
VI, EN, JA, and KO keys exist
Light and dark theme readability
Keyboard navigation and focus behavior
Integration tests

Verify:

Selecting a product revision and creating a WO produces a server-generated unique code
Two simultaneous Work Order creations do not share the same code
The generated code appears in list and detail pages
Product selector does not permit an unreleased revision
Detail modal content matches the current route type
23. Migration and Existing Data

If wo_code does not exist or is nullable:

Add the column.
Backfill existing Work Orders.
Validate duplicates.
Set NOT NULL.
Add a unique index or unique constraint.
Update repository mapping.
Update API response contracts.
Update list and detail UI.

Backfill codes must be deterministic and collision-free.

Document the backfill format.

Do not silently delete or overwrite existing Work Orders.

24. Required Implementation Report

Create an implementation report using the repository’s existing report conventions.

Suggested filename:

implementation-fix/mes-work-order-create-form-and-page-guide-ux.md

Include:

UX problems
Screens reviewed
Existing Work Order code investigation
Existing schema findings
Numbering strategy
Concurrency strategy
Product selector API
Readiness filtering behavior
Form layout changes
Detail modal content model
Route-specific guide behavior
i18n changes
Database migration
Files changed
Tests
Verification commands
Screenshots or browser review status
Remaining gaps
Evidence status

Use the project evidence vocabulary.

25. Mandatory Gap Report

If any part cannot be safely implemented, do not fake it.

Create:

implementation-fix/mes-work-order-create-form-and-page-guide-gap-report.md

Use this format for every unsupported behavior:

Status: MISSING_OR_UNVERIFIED
Expected behavior: <requested behavior>
Evidence searched: <files, handlers, schemas, tests>
Gap: <what cannot be proven or safely implemented>
Recommended clarification: <specific next action>

Examples of reportable blockers:

No production-readiness endpoint
Work Order schema has no wo_code
Current code is client supplied
No database uniqueness constraint
Existing numbering is concurrency-unsafe
Product Revision and Production Version cannot be queried together
Page guide content does not have a centralized route model
Current route metadata cannot distinguish create and list screens
26. Acceptance Criteria

The task is complete only when:

Product code is no longer entered manually.
The user selects a production-ready Item Revision from a searchable selector.
Options show code, revision, and localized product name.
The frontend submits stable entity IDs.
The form displays a read-only Work Order code.
The authoritative Work Order code is generated by the backend.
The prefix is defined once as WO.
Work Order code generation is concurrency-safe.
wo_code has a database uniqueness guarantee.
Existing records are safely migrated when needed.
The generated code appears in create result, list, and detail views.
The detail modal contains only How to use and one context-specific section.
Create pages explain how the entity is created.
The Work Order create guide explains the actual approximately 10-step process.
List pages explain columns, filters, buttons, statuses, and actions.
The modal is visually polished and easy to read.
No historical or demo-only capability is described as fully implemented.
i18n, typecheck, tests, build, lint, and formatting checks pass.
An implementation report is created.
No fake numbering, fake readiness, or frontend-only validation is introduced.