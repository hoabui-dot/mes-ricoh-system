# Prompt — Build the Complete MES Console Page-by-Page UAT and Ready-to-Run Work Order Certification Guide

Version: 1.0  
Mode: Final verification, UAT design, and canonical seed certification  
Target system: S-Factory MES Enterprise  
Primary output language: Vietnamese  
Prompt language: English  

---

# 1. Role

You are working inside the existing S-Factory MES enterprise repository after all MES Console remediation phases have been completed.

Act as:

- a Senior MES Solution Architect;
- a Senior MES Domain Engineer;
- a Senior Backend Engineer;
- a Senior Frontend Engineer;
- a Senior QA Automation Engineer;
- a Senior UAT Lead;
- and a production-readiness auditor.

Your task is not to write a generic QA checklist.

Your task is to inspect the current source code, current routes, current APIs, current database schema, current canonical seed, current test suites, current phase reports, and current runtime evidence, then produce one canonical Vietnamese Markdown guide that proves whether:

1. every retained MES Console page has been covered;
2. every supported use case on every page has been tested;
3. every important validation rule has been verified;
4. Work Order creation works from a fully prepared canonical seed;
5. automatic whole-line selection works;
6. Resource Planning can proceed without missing prerequisite master data;
7. exact resources can be manually committed per operation;
8. allocation revalidation, approval, and execution start work;
9. the canonical seed is deterministic, stable, and immediately usable;
10. no manual setup is required before creating the first normal Work Order after reset and seed.

Current source and runtime evidence are authoritative.

Do not invent pages, APIs, validation rules, roles, seed records, or business behavior.

---

# 2. Mandatory Source Documents

Read all relevant current documentation before producing the guide.

At minimum inspect:

```text
AI_document/REMEDIATION_MASTER_RULES.md
AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md
AI_document/MES_CONSOLE_REMEDIATION_FINAL_REPORT.md
AI_document/REPORT_TEMPLATE.md
AI_document/Phase-00/REPORT_PHASE_00.md
AI_document/Phase-01/REPORT_PHASE_01.md
AI_document/Phase-02/REPORT_PHASE_02.md
AI_document/Phase-03/REPORT_PHASE_03.md
AI_document/Phase-04/REPORT_PHASE_04.md
AI_document/Phase-05/REPORT_PHASE_05.md
AI_document/Phase-06/REPORT_PHASE_06.md
AI_document/Phase-07/REPORT_PHASE_07.md
AI_document/Phase-08/REPORT_PHASE_08.md
AI_document/Phase-09/REPORT_PHASE_09.md
AI_document/Phase-10/REPORT_PHASE_10.md
AI_CONTEXT.md
UI_AI_CONTEXT.md
```

Inspect all current supporting artifacts under:

```text
artifacts/mes-console-remediation/**
artifacts/mes-console-remediation-blueprint/**
```

Inspect all current source relevant to:

```text
services/mes-console/**
services/mes-master-data-service/**
services/mes-execution-service/**
services/mes-traceability-service/**
services/mes-kiosk-gateway/**
scripts/**
e2e/**
package.json
docker-compose*.yml
```

Use actual current paths in the repository.

Do not fail merely because one example path differs.

Search for the current implementation.

---

# 3. Exact Required Output

Create exactly one canonical Markdown document:

```text
AI_document/MES_CONSOLE_COMPLETE_UAT_AND_READY_TO_RUN_WO_CERTIFICATION.md
```

The document content must be written in Vietnamese.

Do not create multiple competing Markdown guides.

Supporting JSON, screenshots, traces, logs, and machine-readable artifacts may be created under:

```text
artifacts/mes-console-final-certification/<run-id>/
```

The Markdown file is the single human-readable source of truth.

---

# 4. Critical Distinction Between Two Validation Tracks

The final document must clearly separate these two tracks.

## Track A — Page-by-Page MES Console UAT

This track validates:

- every retained page;
- every supported use case in that page;
- every form field;
- every table;
- every filter;
- every lifecycle action;
- every validation rule;
- permission behavior;
- persistence;
- navigation;
- loading/error/empty states;
- i18n;
- accessibility.

Track A is a page and UI completeness certification.

## Track B — Ready-to-Run Canonical Seed and Work Order Full Flow

This track validates:

- a complete canonical dataset can be reset and seeded;
- no user must manually configure prerequisite master data before creating the first Work Order;
- a Work Order can be created immediately after seed;
- backend automatic line selection returns `READY`;
- the Work Order is not blocked by missing resource foundation;
- Resource Planning returns valid candidates for every mandatory operation;
- exact resources can be manually committed per operation;
- allocations can be revalidated;
- Work Order can be approved;
- execution can be started when all backend gates pass.

Track B is not the same as testing every page.

Do not merge Track A and Track B into one vague checklist.

---

# 5. Final Certification Status

The final document must end with exactly one overall status:

```text
CERTIFIED_MES_CONSOLE_AND_READY_TO_RUN_WO
```

or:

```text
NOT_CERTIFIED
```

Certification is allowed only when:

- all retained pages are inventoried;
- all mandatory page use cases have evidence;
- all mandatory validation rules have evidence;
- canonical reset and seed pass;
- immediate Work Order creation after seed passes;
- line selection returns `READY`;
- Resource Planning candidates are available for every required operation;
- exact resource allocation can be completed;
- revalidation passes;
- approval passes;
- execution start passes;
- exact cleanup passes;
- no mandatory test is skipped.

---

# 6. Phase 1 — Rebuild the Current Route and Page Inventory

Inspect the current application route declarations and navigation.

Create a complete retained-page inventory.

For every route record:

| Field | Required content |
|---|---|
| Canonical route | Current canonical path |
| Screen component | Current React component |
| Sidebar entry | Yes/No |
| Business object | Object represented by the page |
| Domain owner | MES Master Data, MES Execution, MES Console, or other |
| Intended roles | Current approved role matrix |
| Primary APIs | Current endpoints |
| Current status | Retained, redirect, diagnostic, Not Found |
| Test coverage | Existing E2E/API/unit coverage |
| Missing coverage | Exact gap |
| Final test section | Link to the scenario section in this guide |

The inventory must include all retained route families, including nested create, edit, and detail routes.

At minimum inspect the current route families for:

```text
Work Orders
Items and Item Revisions
UOMs
Material Groups
EBOMs
MBOMs
Operation Catalog
Routings and Routing Operations
Production Versions
Production Lines
Factories/Sites
Shopfloors
Production Areas
Work Centers
Workstations
Machines
Machine Units
Resource Assignments
Resource Capabilities
Resource Calendars
Production Standards
Operation Skill Requirements
Employees
Worker Skills
Shifts
Work Calendar
Print Stations
Reason Codes
Diagnostics
Not Found
Legacy redirects
```

Do not assume this list is complete.

Use the current route inventory.

The guide must state:

```text
Declared canonical routes: <count>
Retained screen families: <count>
Redirect route families: <count>
Diagnostic routes: <count>
Pages with complete UAT coverage: <count>
Pages with incomplete UAT coverage: <count>
```

---

# 7. Phase 2 — Required Page-by-Page UAT Format

Create a dedicated section for every retained page or screen family.

Use the following exact structure.

---

## `<Page Name>` — `<Canonical Route>`

### A. Business purpose

Explain:

- what the page manages;
- who uses it;
- where it sits in the MES flow;
- upstream prerequisites;
- downstream consumers.

### B. Current source authority

List:

- screen component;
- hooks;
- API client;
- TypeScript types;
- backend handler/service;
- database tables;
- seed records;
- current tests.

### C. Preconditions

List all required data and role prerequisites.

Examples:

- site exists;
- released Item Revision exists;
- released Production Version exists;
- Employee-scoped Worker Skills exist;
- user has the correct site scope.

### D. Page controls and fields

Inventory every:

- table column;
- filter;
- button;
- tab;
- modal;
- form field;
- checkbox;
- select;
- date field;
- action;
- status badge;
- warning;
- blocker;
- link.

For each control include:

| Control | Backend field/API | Required | Mutable | Visibility condition | Permission | Expected behavior |

### E. Happy-path use cases

Document every supported normal use case.

Each scenario must contain:

| Field | Required content |
|---|---|
| Scenario ID | Stable ID |
| Scenario name | Vietnamese |
| Actor/role | Approved role |
| Preconditions | Exact data state |
| Test data | Business codes, not only UUIDs |
| Steps | Numbered UI actions |
| Expected UI result | Exact expected behavior |
| Expected API result | Method, endpoint, status, relevant response fields |
| Expected database result | Persisted state or `N/A` |
| Refresh check | Expected state after browser refresh |
| Cleanup | Exact cleanup |
| Automation | Existing or required Playwright/API test |
| Evidence | Screenshot, trace, JSON, or log |

### F. Validation and negative use cases

Every page must include negative validation scenarios.

Do not write only “test required fields.”

For every validation, record:

| Validation ID | Business rule | Trigger input/state | Frontend prevention | Backend enforcement | Expected HTTP/error code | Expected Vietnamese UI message | Persisted state after failure | Automated test |
|---|---|---|---|---|---|---|---|---|

Validation categories must include, where applicable:

- required fields;
- invalid format;
- invalid number or precision;
- duplicate business code;
- duplicate active relationship;
- lifecycle restriction;
- released-record immutability;
- effectivity overlap;
- invalid parent hierarchy;
- invalid site scope;
- invalid dependent selection;
- stale row version;
- dependency prevents delete/deactivate;
- unauthorized role;
- cross-site access;
- invalid skill scope;
- invalid line eligibility;
- invalid resource candidate;
- capacity conflict;
- calendar conflict;
- missing capability;
- missing assignment;
- insufficient Worker Skill;
- Resource Hold;
- mixed-line allocation rejection.

### G. Lifecycle scenarios

When the page supports lifecycle, test:

```text
Create
View
Edit
Release
Activate
Deactivate
Create New Version
Delete
Dependency-blocked Delete
Effectivity End
Historical View
```

Use only actions supported by current source.

### H. Table and filter scenarios

Test:

- initial load;
- server pagination;
- server sorting;
- server filtering;
- search;
- filter reset;
- dependent filter reset;
- no-result state;
- refresh persistence;
- localized name and business code;
- no raw UUID;
- no raw enum;
- no `[object Object]`.

### I. Loading, error, empty, and retry

Test:

- loading;
- empty dataset;
- filtered empty;
- recoverable API error;
- forbidden;
- retry;
- mutation pending;
- double-submit prevention.

### J. Authorization

Test:

- allowed role;
- denied role;
- direct URL access;
- hidden or disabled action;
- backend denial;
- cross-site denial;
- forged role/header behavior at the trusted gateway boundary.

### K. i18n

Verify required content in:

```text
VI
EN
JA
KO
```

VI is default.

### L. Accessibility

Verify:

- keyboard access;
- visible focus;
- labelled controls;
- semantic table headers;
- modal focus;
- accessible validation summary;
- status not communicated only by color.

### M. Completion checklist

End every page section with:

```text
[ ] Happy paths passed
[ ] Validation rules passed
[ ] Lifecycle passed
[ ] Permission tests passed
[ ] Refresh persistence passed
[ ] Loading/error/empty passed
[ ] i18n passed
[ ] Accessibility passed
[ ] Cleanup passed
[ ] Automated evidence exists
```

---

# 8. Minimum Required Use Cases by Screen Family

The final guide must contain at least the following use cases when supported by current source.

## 8.1 Work Order List

Test:

- list loads;
- selected Production Line column;
- line-selection status;
- Primary/Backup result;
- fallback badge;
- Resource Hold badge;
- approval state;
- execution state;
- server filters;
- open detail;
- refresh persistence;
- three canonical UAT Work Orders are distinguishable without opening detail.

## 8.2 Work Order Create

Test:

- only Production Version is selected as production-definition authority;
- quantity;
- UOM derived from Production Version;
- planned date;
- shift;
- idempotency;
- successful Primary READY result;
- successful Backup fallback result where using the dedicated UAT fixture strategy;
- Resource Hold response;
- no independent MBOM/Routing/Line selection;
- validation for invalid or non-effective Production Version;
- no manual prerequisite configuration is required after canonical seed.

## 8.3 Work Order Detail

Test:

- summary;
- snapshot;
- selected line;
- line lock;
- Primary result;
- Backup result;
- fallback reason;
- Resource Hold reason;
- evaluated-line matrix;
- operation-line consistency;
- blocker links;
- allocation history;
- approval gate;
- execution gate;
- refresh persistence.

## 8.4 Resource Planning

Test:

- candidates load for every mandatory routing operation;
- candidates are restricted to the selected line;
- candidate readiness;
- exact resource commit;
- duplicate commit;
- stale candidate;
- reallocate;
- cancel;
- revalidate;
- invalid allocation;
- mixed-line rejection;
- row-version conflict;
- reservation cleanup;
- allocation history.

## 8.5 Work Order lifecycle

Test:

- compute/check;
- material staging when currently supported;
- approve;
- reject;
- line replan allowed;
- line replan blocked;
- replan to Backup;
- replan to Resource Hold;
- start execution;
- start blocked;
- no in-place line transfer after execution lock.

## 8.6 Product Definition

Test traceability:

```text
Item
→ Item Revision
→ EBOM
→ MBOM
→ Routing
→ Routing Operations
→ Production Version
→ Line Eligibility
→ Work Order
```

Prove the UI does not merge these concepts.

## 8.7 Production Version Line Eligibility

Test:

- one active Primary;
- one or more Backup Lines;
- unique priority;
- matching site;
- effective dates;
- active/lifecycle;
- mandatory Work Center coverage;
- readiness preview from backend;
- no frontend readiness calculation.

## 8.8 Resource Foundation

Test clear distinction between:

```text
Production Line
Work Center
Workstation
Machine Definition
Machine Unit
Resource Assignment
Resource Capability
Resource Calendar
Capacity Reservation
Work Order Allocation
```

## 8.9 Employees and Worker Skills

Test:

- Employee-scoped Worker Skill definitions;
- Employee Create/Edit is the only assignment mutation authority;
- Worker Skill Detail assignment list is read-only;
- Employee Skill level;
- duplicate assignment;
- invalid scope rejection;
- schedule;
- Operation Skill Requirement;
- labor readiness.

## 8.10 Print Stations

Test MES-side master data and binding.

Physical third-party printing may be explicitly excluded only when runtime is unavailable.

Do not mark the entire page untested merely because a physical printer is out of scope.

---

# 9. Validation Rule Coverage Map

Create one consolidated validation rule matrix after the page sections.

Required columns:

| Rule ID | Domain | Rule | Authoritative source | Affected pages | API endpoint | Error code | Positive test | Negative test | E2E evidence | Integration evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|

Group rules by:

```text
Identity and uniqueness
Lifecycle
Effectivity
Hierarchy
Production-definition compatibility
Line eligibility
Resource readiness
Worker Skill and labor
Capacity and calendar
Resource allocation
Approval
Execution start
Authorization and site scope
Concurrency and stale state
```

The final document must state:

```text
Validation rules discovered: <count>
Validation rules with positive tests: <count>
Validation rules with negative tests: <count>
Validation rules with API integration evidence: <count>
Validation rules with browser E2E evidence: <count>
Validation gaps: <count>
```

No validation may be marked covered only because a frontend required attribute exists.

Backend enforcement evidence is mandatory for business rules.

---

# 10. Ready-to-Run Canonical Seed Definition

Define exactly what “ready-to-run seed” means.

The canonical seed is certified only when, immediately after reset and seed, the user can:

1. log in;
2. open Work Order Create;
3. select one released and effective canonical Production Version;
4. enter quantity, planned date, and shift;
5. create a Work Order;
6. receive automatic line-selection status `READY`;
7. receive a selected Production Line;
8. open Resource Planning;
9. obtain at least one valid candidate for every mandatory routing operation;
10. manually commit exact resources;
11. revalidate allocations successfully;
12. approve the Work Order;
13. start execution.

The user must not need to manually create or repair any of these before the first Work Order:

```text
Site
Shopfloor
Production Area
Production Line
Line Work Center membership
Work Center
Workstation
Machine Definition
Machine Unit
Resource Assignment
Resource Capability
Resource Calendar
Shift
Production Standard
Employee
Employee-scoped Worker Skill
Employee Skill
Employee Schedule
Operation Skill Requirement
Item
Item Revision
MBOM
Routing
Routing Operation
Production Version
Production Version Line Eligibility
```

Clarify in the guide:

> “No manual prerequisite setup before Work Order creation” does not remove the approved manual per-operation exact resource allocation step after Work Order creation.

The architecture remains:

```text
automatic whole-line selection
+
manual exact resource allocation per operation
```

---

# 11. Canonical Seed Data Contract

Inspect the actual seed and document the exact current business codes.

The guide must define the minimum certified dataset.

At minimum verify:

| Dataset | Minimum expected condition |
|---|---|
| Site | One released and active canonical site |
| Shopfloor | At least one valid canonical shopfloor |
| Production Areas | Areas required by the canonical topology |
| Production Lines | Primary and Backup canonical lines |
| Line Work Center membership | Complete mandatory operation coverage on both lines |
| Work Centers | Logical routing targets for every mandatory operation |
| Workstations | At least one execution candidate per operation per line |
| Machines | Required machine definitions |
| Machine Units | Available, identified, and planning-eligible units |
| Resource Assignments | Active and effective assignments |
| Capabilities | Matching operation/resource capabilities |
| Calendars | Available for canonical date and shift |
| Shift | One active site-scoped shift |
| Production Standards | Effective standards for mandatory operations |
| Worker Skills | Employee-scoped canonical definitions |
| Employees | Active canonical employees |
| Employee Skills | Sufficient levels and valid effectivity |
| Employee Schedules | Available on canonical date and shift |
| Operation Skill Requirements | Match Employee-scoped skills |
| Item and Revision | Released and effective finished product |
| MBOM | Released and compatible |
| Routing | Released with mandatory operations |
| Production Version | Released and effective |
| Line Eligibility | Exactly one Primary and at least one Backup |
| Work Order | Not permanently required in base seed |

For each dataset document:

- table or aggregate;
- API;
- business code;
- expected count;
- lifecycle;
- effectivity;
- parent relationships;
- verification query or API;
- blocking impact when missing.

---

# 12. One-Command Seed Certification

Inspect existing package scripts.

Define or require one canonical command that performs:

```text
safe reset
→ canonical seed
→ canonical seed verification
→ ready-to-run Work Order creation
→ line-selection verification
→ candidate verification
→ exact resource allocation
→ allocation revalidation
→ approval
→ execution start
→ evidence generation
→ cleanup or approved retained test state
```

Use existing repository conventions.

A recommended command shape is:

```bash
npm run certify:mes:ready-to-run-wo
```

Do not force this exact name when the repository has a stronger convention.

The final guide must document:

- exact command;
- working directory;
- required environment;
- destructive-reset guard;
- expected duration;
- expected generated artifacts;
- expected final status;
- failure troubleshooting.

The script must fail with a non-zero exit code when any mandatory gate fails.

It must not print a success message when:

- line selection is `RESOURCE_HOLD`;
- selected line is null;
- an operation has zero candidates;
- a candidate belongs to another line;
- allocation commit fails;
- revalidation fails;
- approval fails;
- execution start fails;
- cleanup fails.

---

# 13. Ready-to-Run Work Order Certification Scenario

The final guide must include one exact end-to-end certification scenario.

Use a stable scenario ID:

```text
WO-CERT-001
```

Required flow:

## Step 1 — Verify environment

Verify:

- services healthy;
- database is the approved disposable test environment;
- gateway and authentication work;
- canonical seed version is known.

## Step 2 — Reset and seed

Run the approved guarded reset and seed.

Record:

- command;
- exit code;
- counts;
- canonical business codes;
- verification artifact.

## Step 3 — Verify all prerequisites through APIs

Verify every dataset in Section 11.

Do not rely only on direct database counts.

## Step 4 — Create Work Order

Use the public/supported Work Order creation workflow.

Input must contain only normal planning data such as:

- Production Version;
- quantity;
- planned date;
- shift;
- idempotency key where required.

Do not manually select:

- MBOM;
- Routing;
- Production Line;
- Work Center;
- Workstation;
- Machine Unit.

## Step 5 — Verify automatic line selection

Required:

```text
line_selection_mode = AUTO
line_selection_status = READY
selected_production_line != null
```

Verify:

- selected line is eligible;
- Primary/Backup role is known;
- fallback reason is null for the canonical normal-ready scenario;
- evaluated-line results are present;
- operation line consistency passes.

The normal certified seed must produce a Primary READY Work Order.

Backup fallback and Resource Hold remain separate UAT scenarios.

## Step 6 — Verify Resource Planning candidates

For every mandatory routing operation:

- call candidate API;
- receive at least one candidate;
- verify candidate belongs to selected line;
- verify candidate readiness;
- verify required Workstation/Machine Unit/Assignment/Capability/Calendar/Standard/Labor prerequisites.

The script must identify the exact blocking dimension when a candidate list is empty.

## Step 7 — Commit exact resources

Manually in UI and automatically in API certification:

- select exact candidate per operation;
- commit;
- verify reservation/allocation persistence;
- verify no mixed-line allocation;
- verify allocation history.

## Step 8 — Revalidate

Run allocation revalidation.

Required:

```text
all mandatory operations valid
no stale candidate
no missing reservation
no readiness blocker
```

## Step 9 — Approve

Approve using an authorized role.

Verify:

- strict allocation gate;
- approval log;
- Work Order status;
- persisted state after refresh.

## Step 10 — Start execution

Start execution using the supported UI/API.

Verify:

- backend gate passed;
- Work Order enters the expected execution state;
- events/outbox records exist where currently implemented;
- no in-place line transfer occurs.

## Step 11 — Cleanup or preserve evidence

State whether the certification Work Order is:

- cleaned exactly;
- cancelled using approved test cleanup;
- or retained in a dedicated disposable environment.

Do not leave resource reservations unintentionally.

---

# 14. Failure Diagnosis Matrix

Create a troubleshooting matrix for ready-to-run Work Order failures.

Required columns:

| Symptom | Likely blocking dimension | Page to inspect | API to inspect | Seed object to verify | Expected fix | Certification impact |
|---|---|---|---|---|---|---|

Include at minimum:

```text
No production-ready version
WO creation rejected
No eligible line
Primary line blocked
Both lines blocked
RESOURCE_HOLD
No Workstation candidates
No Machine Unit candidates
Missing Resource Assignment
Missing Capability
Calendar unavailable
Missing Production Standard
Insufficient capacity
Missing Employee Schedule
Missing Employee Skill
Insufficient skill level
Stale candidate
Allocation conflict
Approval blocked
Start execution blocked
Cross-site forbidden
```

---

# 15. Separate UAT Scenarios for Primary, Fallback, and Hold

The normal seed certification scenario must prove:

```text
Primary Line READY
```

The guide must also include separate UAT scenarios for:

```text
Backup Line fallback READY
Both Lines RESOURCE_HOLD
```

These scenarios may use the approved idempotent UAT fixture scripts.

Do not corrupt the normal ready-to-run seed to make fallback or hold the default state.

The default canonical seed must remain immediately usable for a normal Primary READY Work Order.

---

# 16. Automated Evidence Requirements

Run or define the exact commands for:

## Static and build

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build
```

Use current backend build/test commands.

## Maintained API integration

At minimum, where present:

```bash
npm run test:mes:resource-planning-domain:phase1
npm run test:mes:resource-planning-full-flow:phase2
npm run test:mes:two-line-resource-planning:phase7
npm run test:mes:two-line-full-regression:phase9
npm run verify:mes:canonical-seed
```

Also include current tests for:

- Worker Skills;
- Employee Skills;
- Operation Skill Requirements;
- Production Version Line Eligibility;
- UAT fixture preparation;
- ready-to-run Work Order certification;
- authorization;
- cleanup.

## Browser E2E

Require:

- every retained page smoke;
- every representative CRUD flow;
- every page validation group;
- Primary READY Work Order;
- Backup fallback Work Order;
- Resource Hold Work Order;
- Resource Planning;
- approval;
- execution start;
- refresh persistence;
- redirects;
- role-negative cases;
- VI/EN/JA/KO smoke;
- accessibility smoke.

Record exact counts:

```text
declared
executed
passed
failed
skipped
```

A skipped mandatory test is a certification failure.

---

# 17. Manual UAT Execution Order

The final document must provide a practical order for a human tester.

Use this order unless current dependencies require a better one:

```text
1. Authentication and navigation
2. Factory/Site
3. Shopfloor and Production Area
4. Production Lines
5. Work Centers
6. Workstations
7. Machines and Machine Units
8. Resource Assignments
9. Capabilities
10. Calendars
11. Production Standards
12. Worker Skills
13. Employees and Employee Skills
14. Shifts and Work Calendar
15. Items and Revisions
16. EBOM
17. MBOM
18. Operation Catalog
19. Routing and Routing Operations
20. Operation Skill Requirements
21. Production Version
22. Production Version Line Eligibility
23. Work Order Create
24. Work Order List
25. Work Order Detail
26. Resource Planning
27. Approval and Execution Start
28. Print Station master-data smoke
29. Legacy redirects
30. Authorization, i18n, and accessibility
31. Ready-to-run seed certification
32. Fallback and Resource Hold UAT
```

For each step, reference the exact page scenario IDs.

---

# 18. Coverage Summary

At the end of the document, provide these tables.

## 18.1 Page coverage

| Screen family | Use cases | Passed | Failed | Skipped | Status |
|---|---:|---:|---:|---:|---|

## 18.2 Validation coverage

| Domain | Rules | Positive covered | Negative covered | API covered | E2E covered | Gaps |
|---|---:|---:|---:|---:|---:|---:|

## 18.3 Ready-to-run seed coverage

| Gate | Expected | Evidence | Result |
|---|---|---|---|
| Reset | Safe and successful | | |
| Seed | Deterministic and successful | | |
| Seed verification | All prerequisites valid | | |
| WO create | Success | | |
| Line selection | Primary READY | | |
| Candidates | Non-empty for every mandatory operation | | |
| Allocation | Committed | | |
| Revalidation | Valid | | |
| Approval | Success | | |
| Start execution | Success | | |
| Cleanup | Exact | | |

## 18.4 Automated test summary

| Test type | Declared | Executed | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|

---

# 19. Required Gaps and Remediation Section

When any behavior is not verified, state:

- exact missing evidence;
- affected page;
- affected API;
- affected seed object;
- severity;
- whether it blocks page certification;
- whether it blocks ready-to-run Work Order certification;
- required remediation phase;
- exact test required after the fix.

Do not write vague items such as:

```text
Need more testing
UI may be incomplete
Seed should be checked
```

Use exact actionable findings.

---

# 20. Definition of Complete Page Coverage

A page is complete only when:

- its route is inventoried;
- business purpose is documented;
- all visible controls are inventoried;
- all supported use cases are listed;
- positive scenarios exist;
- negative validation scenarios exist;
- backend enforcement is evidenced;
- authorization is tested;
- persistence after refresh is tested;
- loading/error/empty are tested;
- i18n is tested;
- accessibility is tested;
- cleanup is defined;
- automated evidence exists.

A page smoke test alone is not complete page coverage.

---

# 21. Definition of Stable Canonical Seed

The seed is stable only when:

- reset is guarded;
- rerun is idempotent;
- business codes are deterministic;
- no manual SQL repair is required;
- all foreign-key relationships are valid;
- lifecycle and effectivity are valid for the certification date;
- Worker Skills use Employee scope;
- all required employees are scheduled;
- all required resource assignments are active;
- both canonical lines are complete;
- Primary Line is ready by default;
- Backup Line remains valid for fallback testing;
- Production Version is released and effective;
- exactly one Primary eligibility exists;
- all mandatory operation readiness dimensions pass;
- immediate normal Work Order creation returns `READY`;
- candidates are available for every mandatory operation;
- full flow reaches execution start;
- rerun produces the same valid result;
- cleanup leaves no leaked reservations or temporary blockers.

---

# 22. Mandatory Stop Conditions

Do not issue certification when:

- route inventory is incomplete;
- any retained page has no test section;
- important backend validations have no negative test;
- canonical seed requires manual UI setup before Work Order creation;
- normal seed creates a Work Order in `RESOURCE_HOLD`;
- selected line is null;
- any mandatory operation has zero candidates;
- candidates cross Production Lines;
- allocation cannot be completed;
- revalidation fails;
- approval fails;
- execution start fails;
- mandatory tests are skipped;
- cleanup is not exact;
- phase reports and current source disagree without resolution;
- runtime evidence is stale or mocked.

---

# 23. Required Final Conclusion

The final Vietnamese Markdown document must answer these questions explicitly:

1. Have all MES Console pages been inventoried?
2. Has every page use case been documented?
3. Has every important validation rule been tested at both UI and backend levels?
4. Are all retained routes covered by E2E?
5. Is the canonical seed deterministic and idempotent?
6. Can a normal Work Order be created immediately after seed?
7. Does the normal Work Order select the Primary Line and return `READY`?
8. Does Resource Planning provide candidates for every operation?
9. Can exact resources be committed without mixed-line allocation?
10. Can the Work Order be revalidated, approved, and started?
11. Are fallback and Resource Hold covered separately?
12. Are cleanup and rerun stable?
13. What remains unverified?
14. What is the final certification status?

End with exactly one:

```text
CERTIFIED_MES_CONSOLE_AND_READY_TO_RUN_WO
```

or:

```text
NOT_CERTIFIED
```

---

# 24. Final Response After Generating the File

Respond with:

- output file path;
- run ID;
- canonical route count;
- retained page family count;
- documented use-case count;
- validation-rule count;
- automated test totals;
- ready-to-run seed status;
- Work Order creation status;
- line-selection result;
- Resource Planning candidate result;
- allocation/revalidation/approval/start result;
- exact final certification status.

Do not claim certification without runtime and test evidence.
