# Task — Create a Complete Vietnamese MES Console Feature Guide and Two-Production-Line Full UAT Scenario

You are working inside the existing S-Factory MES enterprise microservice repository.

All previously approved implementation phases for the two-production-line model, Resource Planning, Work Order flow, reset/seed, API verification, and browser E2E preparation are expected to be complete.

The current system is expected to support:

- one released Item Revision;
- one released MBOM;
- one released Routing;
- one released Production Version;
- multiple Production Version Line Eligibility records;
- one Primary Production Line;
- one or more Backup Production Lines;
- whole-Work-Order line selection;
- line-wide Resource Planning;
- primary-to-backup fallback;
- Work Order resource allocation;
- capacity reservation;
- allocation revalidation;
- strict Work Order approval;
- execution start guards;
- MES Console UI support;
- API integration tests;
- browser E2E tests;
- deterministic MES reset and canonical seed data.

## Primary Objective

Inspect the completed source code, MES Console route definitions, UI components, API clients, backend APIs, database migrations, seed data, tests, phase reports, AI documentation, and current runtime configuration.

Then create one complete Vietnamese document that serves as both:

1. a detailed MES Console user and feature guide; and
2. a full manual UAT test scenario for the two-production-line workflow.

The final document must explain in detail:

- every relevant MES Console feature;
- what each page is used for;
- which business object each page owns or displays;
- how each feature contributes to the complete Work Order and Resource Planning flow;
- which page must be used first;
- which records are prerequisites for later records;
- what every important field, tab, button, action, status, warning, table, modal, and detail panel means;
- how a tester should interact with each page;
- what should happen after every action;
- how each page participates in the two-line test flow;
- which backend API and business validation support each UI action;
- what evidence must be collected;
- how to diagnose a failure.

The test document itself must be written entirely in **Vietnamese**.

Do not create only a list of test cases.

The document must be detailed enough that a person who has never used the MES Console can understand the features, prepare the correct master data, execute the complete two-line Work Order flow, identify the expected outcome, and record UAT evidence without reverse-engineering the source code.

The existing two-line test prompt already requires actionable scenarios, expected results, evidence, and pass/fail criteria. This task extends that requirement with a comprehensive MES Console feature explanation and detailed screen-by-screen operating instructions. :contentReference[oaicite:0]{index=0}

---

# Required Output

Create:

```text
docs/testing/MES-CONSOLE-TWO-LINE-FULL-FEATURE-GUIDE-AND-UAT-VI.md
```

Also create or update:

```text
docs/testing/mes-console-two-line-uat-matrix.json
docs/testing/mes-console-feature-flow-matrix.json
```

The Markdown document must be written in Vietnamese.

Do not create placeholder-only content.

Do not use generic MES knowledge to fill missing implementation details.

If a screen, field, action, API, status, or feature cannot be proven from source, mark it as one of:

```text
NOT_IMPLEMENTED
PARTIALLY_IMPLEMENTED
NOT_EXPOSED_IN_UI
API_ONLY
DEPRECATED_COMPATIBILITY
DEMO_ONLY
UNKNOWN_REQUIRES_SOURCE_CONFIRMATION
REQUIRES_PRODUCT_DECISION
```

---

# Source Precedence

Use this order:

1. Running source code.
2. MES Console route configuration.
3. MES Console screen components.
4. MES Console API clients and query hooks.
5. Backend API handlers and use cases.
6. Database migrations and schemas.
7. Service manifests.
8. Docker Compose and runtime configuration.
9. Automated API integration tests.
10. Browser E2E tests.
11. Canonical reset and seed scripts.
12. Approved phase implementation reports.
13. `AI_CONTEXT.md`.
14. `UI_AI_CONTEXT.md`.
15. `AI_document/`.
16. Approved ADRs.
17. Product and business documents.

When documentation conflicts with source code, use the implemented source as current behavior and document the conflict.

Never describe planned behavior as implemented behavior without source and test evidence.

---

# Mandatory Inspection Scope

Before writing the document, inspect all MES Console routes and relevant source files.

At minimum inspect:

```text
services/mes-console/src/App.tsx
services/mes-console/src/routes/**
services/mes-console/src/components/**
services/mes-console/src/lib/**
services/mes-console/src/context/**
services/mes-console/src/i18n.ts
```

Also inspect relevant backend code for:

- MES Master Data;
- MES Execution;
- MES Traceability;
- MES Kiosk Gateway;
- Keycloak/Kong authorization;
- Resource Planning;
- Production Line;
- Production Version Line Eligibility;
- Work Order creation;
- line selection;
- candidate retrieval;
- allocation;
- revalidation;
- approval;
- start execution;
- replan/change-line;
- audit;
- outbox.

Inspect the current seed to obtain exact business codes.

Do not use placeholder entity codes when deterministic canonical seed codes exist.

---

# Required Document Structure

# Part I — Hướng dẫn tổng quan MES Console

## 1. Mục đích tài liệu

Explain in Vietnamese:

- tài liệu dùng cho ai;
- cách sử dụng tài liệu;
- sự khác nhau giữa hướng dẫn tính năng và kịch bản UAT;
- phạm vi MES Console;
- mục tiêu của kiểm thử hai line;
- điều kiện để coi dữ liệu sẵn sàng;
- điều kiện để coi Work Order sẵn sàng;
- các hệ thống tích hợp nhưng không thuộc phạm vi chính.

Explain that this document must allow a tester to:

```text
Hiểu feature
→ hiểu business object
→ hiểu dependency
→ chuẩn bị dữ liệu
→ thao tác trên UI
→ quan sát API/backend result
→ xác nhận expected behavior
→ ghi nhận evidence
→ kết luận PASS/FAIL
```

---

## 2. Bản đồ tính năng MES Console

Create a complete feature inventory of all current MES Console routes.

Use a table:

| STT | Nhóm chức năng | Tên màn hình | Route | Business object | Công dụng | Vai trò trong full flow | Quyền truy cập | Trạng thái |
|---:|---|---|---|---|---|---|---|---|

At minimum inspect whether the following screens currently exist:

### Product and production definition

- Item;
- Item Revision;
- Material Group;
- UOM;
- EBOM;
- MBOM;
- Routing;
- Routing Operation;
- Operation Catalog;
- Production Version;
- Production Version Line Eligibility.

### Factory and resource master data

- Factory/Site;
- Shopfloor;
- Production Area;
- Production Line;
- Work Center;
- Workstation;
- Equipment/Machine;
- Physical Machine Unit;
- Resource Assignment;
- Resource Capability;
- Resource Calendar;
- Shift;
- Work Calendar;
- Production Standard;
- Skill Management;
- Operation Skill Requirement;
- Employees;
- Reason Codes;
- Print Station master data.

### Work Order and execution

- Work Order list;
- Work Order creation;
- Work Order detail;
- Compute & Check;
- line selection result;
- line readiness;
- Resource Planning;
- candidate selection;
- resource allocation;
- allocation history;
- revalidation;
- approval/rejection;
- material readiness;
- print readiness;
- execution start;
- operation execution status.

### Administration

- i18n Review;
- user/profile/auth-related surfaces;
- diagnostics where exposed.

Do not include a page solely because it appears in documentation. Confirm it from route/source code.

---

## 3. Luồng nghiệp vụ tổng thể qua các màn hình

Create a full Mermaid flow showing the actual navigation and dependency order.

At minimum:

```text
Factory / Site
  → Production Area
    → Production Line
      → Work Center
        → Workstation
          → Equipment / Machine Unit
          → Machine Requirement
          → Resource Assignment
          → Capability / Calendar / Standard

Item
  → Item Revision
    → EBOM
    → MBOM
    → Routing
      → Routing Operation
    → Production Version
      → Production Version Line Eligibility

Production Version
  → Work Order
    → Line Selection
      → Compute & Check
        → Resource Candidates
          → Allocation
            → Revalidation
              → Approval
                → Start Execution
```

For every arrow explain:

- why the previous object is required;
- what reference is carried forward;
- what failure appears when the dependency is missing;
- which screen is used to verify the relationship.

---

## 4. Các khái niệm quan trọng trước khi thao tác

Explain in Vietnamese, using current implementation:

- Item versus Item Revision;
- EBOM versus MBOM;
- Routing versus Routing Operation;
- Production Version;
- Production Line;
- Primary Line versus Backup Line;
- Work Center versus Workstation;
- Machine Definition versus Physical Machine Unit;
- Machine Requirement versus Resource Assignment;
- Resource Capability;
- Resource Calendar;
- Production Standard;
- candidate;
- Resource Allocation;
- Capacity Reservation;
- snapshot;
- Compute & Check;
- approval revalidation;
- `RESOURCE_HOLD`;
- replan;
- lifecycle;
- effectivity;
- row version;
- idempotency.

For each term include:

| Khái niệm | Định nghĩa | Owner | Màn hình liên quan | Vai trò trong flow | Sai lầm thường gặp |
|---|---|---|---|---|---|

---

# Part II — Hướng dẫn chi tiết từng màn hình MES Console

## 5. Quy tắc bắt buộc cho phần mô tả màn hình

For every relevant screen, create one full section using the exact structure below.

Do not reduce a screen to one paragraph.

### Template for every screen

```markdown
## <Screen Code> — <Tên màn hình>

### 1. Mục đích màn hình

### 2. Business object được quản lý

### 3. Service và database owner

### 4. Route UI

### 5. API được gọi

### 6. Vị trí trong luồng nghiệp vụ

### 7. Điều kiện cần trước khi sử dụng màn hình

### 8. Danh sách và ý nghĩa từng cột

### 9. Bộ lọc, search, sort và pagination

### 10. Nút và thao tác trên màn hình

### 11. Form Create

### 12. Form Edit

### 13. Detail page hoặc modal

### 14. Tab và section

### 15. Ý nghĩa từng field

### 16. Field nào bắt buộc

### 17. Field nào read-only

### 18. Field nào do backend sinh

### 19. Quan hệ phụ thuộc giữa các field

### 20. Validation frontend

### 21. Validation backend

### 22. Lifecycle và effectivity

### 23. Cách tạo dữ liệu hợp lệ

### 24. Cách xác minh dữ liệu sau Save

### 25. Error/warning có thể gặp

### 26. Vai trò của màn hình trong kịch bản hai line

### 27. Các thao tác tester phải thực hiện

### 28. Expected result cho từng thao tác

### 29. Evidence cần chụp

### 30. Dữ liệu seed liên quan

### 31. Quyền truy cập

### 32. Known limitation

### 33. Checklist PASS/FAIL của màn hình
```

---

## 6. Chi tiết hành động UI

For every button, icon, action menu, modal action, and table action, document:

| Control | Vị trí | Công dụng | Điều kiện enable | API/action | Kết quả mong đợi | Tác động dữ liệu | Evidence |
|---|---|---|---|---|---|---|---|

Examples to inspect:

- Create;
- Add;
- Edit;
- View Detail;
- Delete;
- Deactivate;
- Release;
- Validate;
- Save;
- Cancel;
- Back;
- Confirm;
- Compute & Check;
- Select Candidate;
- Commit;
- Revalidate;
- Reallocate;
- Cancel Allocation;
- Approve;
- Reject;
- Start Execution;
- Retry;
- Change Line;
- Replan;
- Refresh;
- pagination;
- language selector;
- tab navigation.

Do not invent labels. Use actual labels found in current VI translations.

If an icon has no visible label, explain its tooltip and action.

---

## 7. Chi tiết field

For every important form field, include:

| Field | Ý nghĩa nghiệp vụ | Kiểu input | Bắt buộc | Nguồn options | Filter rule | Backend field | Validation | Thay đổi field này ảnh hưởng gì |
|---|---|---|---:|---|---|---|---|---|

Explain dependent field behavior.

Examples:

```text
Changing Site
  → clears Production Area
  → clears Production Line
  → clears Work Center
  → clears Workstation
  → reloads compatible options
```

Document actual behavior only.

---

## 8. Cách đọc trạng thái trên UI

Create a state dictionary.

For each status include:

- translated Vietnamese label;
- raw backend value;
- business meaning;
- which action is allowed;
- which action is blocked;
- how to move to the next state;
- failure conditions.

Cover relevant states for:

- lifecycle;
- active/inactive;
- Released/Draft/Obsolete;
- line readiness;
- candidate readiness;
- allocation;
- reservation;
- Work Order;
- approval;
- execution;
- machine status;
- Machine Unit planning eligibility;
- calendar status;
- workflow progress.

---

# Part III — Hướng dẫn các nhóm tính năng và vai trò trong full flow

## 9. Factory, Area và Production Line

Explain:

- công dụng;
- hierarchy;
- why Site/Area are required;
- how Production Line groups the execution scope;
- how Line 1 and Line 2 differ;
- how to inspect both lines;
- how to identify Primary/Backup usage;
- how Work Centers are linked;
- what happens if a line is inactive or incomplete.

Provide exact UI test steps.

---

## 10. Work Center

Explain:

- why Routing uses logical Work Center;
- how Work Centers participate in line readiness;
- required fields;
- hierarchy validation;
- how to inspect Workstations;
- how capacity and capability are represented;
- what must be checked for each operation.

Provide exact steps for both lines.

---

## 11. Workstation

Explain:

- execution point;
- difference between Create, Edit, and Detail;
- Machine Requirements;
- Assigned Machines;
- Assignment History;
- Machine Readiness;
- why requirements are not assignments;
- how Workstation affects candidate resolution.

Provide exact tester actions:

- open detail;
- verify hierarchy;
- verify line;
- verify machine requirement;
- verify assigned resource;
- verify readiness;
- capture evidence.

---

## 12. Equipment and Physical Machine Unit

Explain:

- Machine Definition;
- expected count;
- Physical Machine Units;
- serial/identity;
- planning eligibility;
- active status;
- execution status;
- maintenance;
- availability;
- assignment;
- reservation.

Explain how changing each state affects:

- line readiness;
- candidate readiness;
- allocation;
- approval.

---

## 13. Resource Assignment

Explain:

- authoritative relationship;
- effective dates;
- Work Center;
- Workstation;
- Equipment;
- Machine Unit;
- role;
- history;
- move/end action;
- how assignment affects line readiness.

Provide a detailed UI verification workflow.

---

## 14. Resource Capability

Explain:

- Operation compatibility;
- Work Center relationship;
- product-specific constraints;
- priority;
- speed factor;
- eligibility;
- how capability affects candidate scoring and blocking.

---

## 15. Resource Calendar, Shift và Work Calendar

Explain:

- date/shift availability;
- available minutes;
- capacity factor;
- holiday/planned down;
- how calendar affects line evaluation;
- how target date and Shift in WO creation use this data.

Include a step-by-step test for:

- valid calendar;
- unavailable calendar;
- invalid shift;
- expired calendar.

---

## 16. Production Standard

Explain:

- base quantity;
- setup time;
- cycle time;
- required persons;
- yield;
- efficiency;
- relation to Item Revision, Routing Operation, Work Center, and Equipment;
- how estimated duration is calculated by backend;
- how missing standard blocks readiness;
- how standard contributes to capacity.

Do not ask the tester to calculate readiness manually unless the UI exposes the exact calculation.

---

## 17. Item và Item Revision

Explain:

- stable Item identity;
- versioned revision;
- lifecycle;
- effectivity;
- base UOM;
- item type;
- material group;
- why Work Order uses a released effective revision through Production Version.

Provide detailed steps to verify the seeded product.

---

## 18. EBOM

Explain:

- engineering baseline role;
- why EBOM does not create Work Order material requirements;
- current UI fields;
- relationship to Item Revision;
- optional relationship to Production Version.

Include a check proving EBOM is not the manufacturing material authority.

---

## 19. MBOM

Explain:

- manufacturing material authority;
- component lines;
- quantity;
- derived UOM;
- issue operation;
- scrap;
- backflush;
- phantom;
- optional;
- substitutes;
- lifecycle;
- versioning.

Explain how MBOM contributes to:

- Work Order material snapshot;
- operation-specific material readiness;
- WMS staging integration.

Provide exact UI steps.

---

## 20. Routing và Routing Operation

Explain:

- Routing as technical process;
- Routing Operation sequence;
- Operation Master;
- Work Center;
- predecessor;
- timing;
- material scan;
- output label;
- skill requirement;
- quality/IoT flags where implemented;
- why Routing is shared between Line 1 and Line 2;
- why physical line resources must not create duplicate Routing.

For every seeded Routing Operation, provide:

| Sequence | Operation | Business purpose | Logical requirement | Line 1 resolution | Line 2 resolution | UAT role |
|---:|---|---|---|---|---|---|

---

## 21. Production Version

Explain:

- authoritative combination;
- Item Revision;
- MBOM;
- Routing;
- optional EBOM;
- effectivity;
- Released status;
- validation;
- Work Order authority.

Document every field and action.

---

## 22. Production Version Line Eligibility

Explain:

- why it exists;
- Primary flag;
- priority;
- efficiency factor;
- lifecycle/effectivity;
- one-primary rule;
- eligibility validation;
- readiness preview;
- how line selection uses this data.

Provide detailed tester steps to confirm:

```text
Line 1 = Primary
Line 2 = Backup
```

---

## 23. Work Order List

Explain:

- list columns;
- filters;
- statuses;
- selected line display;
- quantity;
- date;
- Production Version;
- navigation;
- actions.

Explain how to locate the test Work Order after creation.

---

## 24. Work Order Create

Explain every visible field:

- Production Version;
- quantity;
- target date;
- Shift;
- line selection mode;
- manual line if supported;
- idempotency behavior;
- submit;
- async workflow.

For each field include:

- source;
- filter;
- default;
- validation;
- business effect.

Provide detailed instructions from entering the screen through successful navigation to WO detail.

---

## 25. Work Order Creation Workflow

Explain:

- asynchronous workflow;
- progress states;
- WebSocket;
- refresh behavior;
- retry behavior;
- failure state;
- final Work Order opening.

Explain exactly what the user sees at every stage.

---

## 26. Work Order Detail

Document every current tab and section.

At minimum inspect:

- Summary;
- Product/Production Version;
- Line Selection;
- Operations;
- Material Requirements;
- Resource Planning;
- Allocation History;
- Approval;
- Execution;
- Print;
- Audit;
- other implemented tabs.

For every tab explain:

- purpose;
- data shown;
- source;
- user actions;
- role in UAT;
- evidence required.

---

## 27. Line Selection Panel

Explain:

- evaluated lines;
- Primary result;
- Backup result;
- selected line;
- fallback reason;
- blockers;
- scoring;
- line lock;
- Auto/Manual mode;
- replan status.

Provide exact interpretation examples:

```text
Primary Ready
Primary Blocked, Backup Ready
Both Blocked
Manual line rejected
Line locked after lifecycle transition
```

---

## 28. Compute & Check

Explain:

- business purpose;
- when to click;
- what backend validates;
- which statuses are refreshed;
- expected loading state;
- expected result;
- how to read failures;
- why frontend must not calculate readiness.

Provide a checklist of all expected validations:

- hierarchy;
- line;
- Work Center;
- Workstation;
- Machine Requirement;
- Resource Assignment;
- Equipment;
- Machine Unit;
- capability;
- calendar;
- Shift;
- standard;
- capacity;
- labor if implemented;
- other strict gates.

---

## 29. Resource Candidate Panel

Explain every candidate card field:

- Workstation;
- Work Center;
- Production Line;
- Equipment;
- Machine Group;
- Machine Unit;
- readiness;
- required quantity;
- assigned quantity;
- available quantity;
- duration;
- capacity;
- blocker;
- warning;
- Select/Commit button.

Explain:

- why only selected-line candidates should appear;
- Ready versus Blocked;
- advisory nature;
- how commit performs revalidation;
- how stale candidate errors are handled.

---

## 30. Resource Allocation

Explain:

- allocation action;
- request data;
- idempotency;
- row version;
- candidate reference;
- time window;
- Shift;
- resource snapshot;
- reservation;
- audit;
- outbox.

Document:

- commit;
- refresh;
- cancel;
- reallocate;
- history;
- lifecycle lock.

Provide exact UI instructions for each.

---

## 31. Revalidate Allocations

Explain:

- why revalidation is required;
- when to run;
- what may become stale;
- status change;
- next action after failure;
- relationship to approval.

---

## 32. Approval and Rejection

Explain:

- preconditions;
- strict versus demo behavior;
- allocation requirement;
- line consistency;
- material/print gates where applicable;
- approval result;
- failure result;
- rejection.

Document the exact UI action and confirmation behavior.

---

## 33. Start Execution

Explain:

- preconditions;
- allocation coverage;
- line consistency;
- predecessor readiness;
- expected queued operation;
- failure conditions;
- status transitions.

Explain what this UAT proves and what real machine execution remains outside scope.

---

# Part IV — Complete Two-Line UAT Scenario

## 34. UAT prerequisites

Document:

- Docker Compose services;
- health checks;
- canonical seed version;
- exact business codes;
- Keycloak users and roles;
- browser;
- URL;
- language;
- environment;
- prohibited production mutation.

---

## 35. Canonical test data

Create complete Vietnamese data tables using actual seed values.

Include:

- Site;
- Area;
- Line 1;
- Line 2;
- Work Centers;
- Workstations;
- Equipment;
- Machine Units;
- calendars;
- standards;
- Item;
- Item Revision;
- EBOM;
- MBOM;
- Routing;
- Routing Operations;
- Production Version;
- line eligibility;
- user roles.

---

## 36. Test execution order

Define the mandatory execution order:

```text
Step 1: Login and verify role
Step 2: Verify factory hierarchy
Step 3: Verify both Production Lines
Step 4: Verify resources for Line 1
Step 5: Verify resources for Line 2
Step 6: Verify product definition
Step 7: Verify Production Version
Step 8: Verify line eligibility
Step 9: Create WO
Step 10: Verify line selection
Step 11: Compute & Check
Step 12: Inspect every operation
Step 13: Commit every allocation
Step 14: Refresh
Step 15: Revalidate
Step 16: Approve
Step 17: Start Execution
Step 18: Logout/login
Step 19: Verify persistence
Step 20: Cleanup
```

For every step include:

- screen;
- navigation path;
- user action;
- input value;
- UI state before action;
- expected API;
- expected UI result;
- expected database effect;
- screenshot requirement;
- PASS/FAIL condition.

---

# Required Test Case Template

Every test case must use this detailed structure:

```markdown
## TC-XX — <Tên kịch bản>

### A. Mục tiêu nghiệp vụ

### B. Tính năng MES Console được kiểm tra

### C. Vai trò của các tính năng trong full flow

### D. Điều kiện tiên quyết

### E. User/role thực hiện

### F. Dữ liệu đầu vào

### G. Trạng thái hệ thống trước test

### H. Màn hình sử dụng

### I. Navigation path

### J. Ý nghĩa các control được sử dụng

### K. Các bước thao tác chi tiết

| Bước | Màn hình | Control/field | Thao tác | Dữ liệu nhập | Expected UI | Expected API/backend | Evidence |
|---:|---|---|---|---|---|---|---|

### L. Kết quả mong đợi theo business

### M. Kết quả mong đợi theo từng operation

### N. Kết quả mong đợi theo từng line

### O. Kết quả mong đợi trong Resource Planning

### P. Kết quả mong đợi sau refresh

### Q. Kết quả mong đợi sau logout/login

### R. API/network evidence

### S. Database/event evidence

### T. Error/warning dự kiến

### U. Điều kiện PASS

### V. Điều kiện FAIL

### W. Cleanup

### X. Khôi phục fixture

### Y. Ghi chú và known limitation
```

---

# Mandatory Core Scenarios

Create the following scenarios with the full template above.

## TC-01 — Xác minh toàn bộ Master Data của hai line

Must explain every screen used and every business relationship verified.

## TC-02 — Xác minh Item, Revision, EBOM, MBOM, Routing và Production Version

Must explain the purpose of each feature and how they contribute to WO creation.

## TC-03 — Xác minh Production Version Line Eligibility

Must explain Primary, Backup, priority, effectivity, and readiness.

## TC-04 — Tạo WO khi Primary Line sẵn sàng

Must include every click and field value.

## TC-05 — Compute & Check trên Primary Line

Must explain every result panel.

## TC-06 — Commit allocations cho toàn bộ operations của Primary Line

Must explain candidate fields, selection, commit, reservation, and history.

## TC-07 — Approve và Start Execution trên Primary Line

Must explain all gates.

## TC-08 — Primary Line hết capacity, fallback sang Backup Line

Must explain how capacity is prepared, how UI indicates fallback, and how all operations remain on Backup Line.

## TC-09 — Primary Machine Maintenance, fallback sang Backup Line

Must explain Machine page, status mutation fixture, line result, and restoration.

## TC-10 — Primary Line thiếu mandatory resource

Must prove no operation-level mixed fallback.

## TC-11 — Both Lines Blocked

Must explain hold state, disabled actions, blockers, and approval/start rejection.

## TC-12 — Mixed-Line allocation rejection

Must prove both UI filtering and backend protection.

## TC-13 — Stale candidate before commit

Must explain how stale UI data is detected and refreshed.

## TC-14 — Resource becomes invalid after allocation but before approval

Must explain revalidation failure.

## TC-15 — Execution start without complete valid allocations

Must verify frontend and backend guards.

## TC-16 — Cancel allocation

Must explain reservation release and audit.

## TC-17 — Reallocate resource

Must explain old/new allocation history.

## TC-18 — Replan or change line before Release

Only executable when implemented.

## TC-19 — Change line after Release but before Start

Document the actual policy.

## TC-20 — Reject line change after Start

Must preserve snapshots.

## TC-21 — Idempotency and duplicate-submit protection

Must cover Create and Commit.

## TC-22 — Concurrent Work Orders

Must cover shared capacity and backup fallback.

## TC-23 — Persistence after refresh, browser restart, logout/login

Must prove backend authority.

## TC-24 — Snapshot stability after new master-data version

Must compare old and new WO.

## TC-25 — Authorization matrix

Must use real Keycloak users.

## TC-26 — Cross-site access denial

Must explain visible UI and backend rejection.

## TC-27 — Vietnamese translation and error rendering

Must inspect all important error states.

## TC-28 — Async workflow and reconnect

Must explain WebSocket behavior.

## TC-29 — Exact cleanup and rerun

Must prove deterministic repeatability.

---

# Part V — Page-to-Flow Traceability

## 37. Feature contribution matrix

Create:

| MES Console feature | Business purpose | Required before WO? | Used during planning? | Used during execution? | Test cases | Failure impact |
|---|---|---:|---:|---:|---|---|

This section must answer:

> Tính năng này có công dụng gì và đóng góp gì vào luồng?

Examples:

```text
Resource Calendar
→ provides time-based resource availability
→ required by Compute & Check
→ missing record blocks candidate
→ tested in TC-08/TC-13

Production Standard
→ provides setup/cycle/capacity inputs
→ required for duration and capacity
→ missing record blocks readiness
→ tested in negative scenarios
```

---

## 38. Screen navigation matrix

Create:

| From screen | Action | To screen | Why the user navigates there | Data context carried |
|---|---|---|---|---|

---

## 39. Field dependency matrix

Create:

| Parent field | Dependent field | Expected reset/filter behavior | Relevant screen |
|---|---|---|---|

---

## 40. UI action-to-API matrix

Create:

| UI action | Screen | API | Method | Expected status | Persistence effect | Error codes |
|---|---|---|---|---|---|---|

Use actual APIs only.

---

## 41. UI-to-database evidence matrix

Create:

| UI state | Owning service | Table/read model | Read-only evidence |
|---|---|---|---|

Do not instruct normal users to edit databases.

---

## 42. Manual UAT to Playwright coverage

Create:

| Manual UAT | Screen flow | Existing Playwright spec | Coverage | Missing automation |
|---|---|---|---|---|

Classify:

```text
FULLY_AUTOMATED
PARTIALLY_AUTOMATED
MANUAL_ONLY
NOT_COVERED
```

---

# Part VI — Troubleshooting Guide

## 43. Common UI problems

For each problem include:

- symptom;
- possible cause;
- page to inspect;
- API to inspect;
- backend error;
- data dependency;
- recovery action;
- whether a new WO is required.

Include:

- Production Version not visible;
- Line Eligibility not visible;
- no line selected;
- no Ready candidate;
- Workstation missing;
- Machine Unit unavailable;
- calendar unavailable;
- production standard missing;
- stale candidate;
- capacity conflict;
- allocation not persisted;
- approval rejected;
- execution rejected;
- untranslated error;
- raw UUID;
- async workflow stuck;
- fallback not triggered;
- mixed-line data detected.

---

## 44. How to use browser DevTools

Explain in Vietnamese:

- open Network;
- filter requests;
- inspect request/response;
- capture trace ID;
- inspect status code;
- inspect idempotency header;
- redact token;
- export HAR when allowed;
- correlate UI action with API.

---

## 45. Evidence standards

For every critical scenario require:

```text
Environment
Git commit
Seed run ID
User role
Screen
Work Order code
Production Version code
Selected line
Screenshots
API method/path/status
Trace ID
Relevant response fields
Read-only DB evidence
Cleanup evidence
Final result
```

---

# Part VII — Acceptance Result

## 46. Severity

Classify:

- Critical;
- High;
- Medium;
- Low.

Critical scenarios must include:

- Primary selection;
- Backup fallback;
- Both blocked;
- Mixed-line rejection;
- capacity conflict;
- stale candidate;
- approval revalidation;
- execution guard;
- authorization;
- snapshot integrity.

---

## 47. Overall PASS criteria

The UAT passes only when:

- all Critical scenarios pass;
- all mandatory High scenarios pass;
- no mandatory test is skipped;
- every required MES Console feature is documented;
- every required field/action used in the flow is explained;
- no mixed-line allocation exists;
- fallback is deterministic;
- both-line blocked behavior is safe;
- UI and backend results agree;
- refresh/login persistence passes;
- authorization passes;
- cleanup passes;
- canonical seed remains valid;
- existing regression remains green.

---

## 48. Overall FAIL/BLOCKED criteria

The result is FAIL or BLOCKED when:

- a tester cannot determine how to use a required screen;
- required controls are undocumented;
- a required feature is missing from MES Console;
- UI reports Ready while backend reports Blocked;
- mixed-line allocation persists;
- fallback selects an incomplete line;
- stale resources pass approval;
- invalid allocation starts execution;
- authorization fails;
- snapshot changes unexpectedly;
- fixtures cannot be restored;
- mandatory credentials are missing;
- mandatory tests are skipped.

---

## 49. Final Vietnamese UAT report template

Provide a complete template:

```text
MES CONSOLE TWO-LINE FEATURE AND UAT FINAL REPORT
```

Include:

- environment;
- source version;
- seed version;
- tested MES Console features;
- documented screens;
- test accounts;
- declared/executed/passed/failed/blocked/skipped;
- defect list;
- screenshots;
- API evidence;
- database evidence;
- authorization result;
- cleanup result;
- missing UI capability;
- known limitations;
- final recommendation.

Use exactly one final recommendation:

```text
READY_FOR_UAT_ACCEPTANCE
READY_WITH_ACCEPTED_LIMITATIONS
NOT_READY
BLOCKED_BY_ENVIRONMENT
BLOCKED_BY_MISSING_UI_FEATURE
BLOCKED_BY_PRODUCT_DECISION
```

---

# Mandatory Documentation Quality Rules

- The generated report must be entirely in Vietnamese.
- Explain both business purpose and technical behavior.
- Explain what each feature contributes to the full flow.
- Explain every important user action.
- Explain every important field used in UAT.
- Explain every important status and warning.
- Provide exact navigation paths.
- Provide exact seeded business codes.
- Provide screenshots/evidence requirements.
- Do not assume the reader already understands MES.
- Do not invent pages, tabs, buttons, APIs, fields, or statuses.
- Do not hide features that exist but are incomplete.
- Mark API-only functionality as `API_ONLY`.
- Mark missing UI actions as `NOT_EXPOSED_IN_UI`.
- Do not describe a backend capability as a usable Console feature unless the UI exposes it.
- Do not use browser state as proof of persistence.
- Do not treat skipped coverage as passed.
- Do not weaken strict Resource Planning.
- Do not allow per-operation independent line selection.
- Do not allow mixed-line allocation.
- Do not expose tokens, passwords, or secrets.
- Do not claim physical production readiness from simulation.
- Keep every failure in the same verification cycle until fixed and retested.

---

# Required Validation Before Completing the Document

Before completion, verify:

1. Every MES Console route has been inventoried.
2. Every route relevant to the two-line flow is documented.
3. Every required screen has a purpose statement.
4. Every screen has a field/action table.
5. Every required action maps to a real API.
6. Every required UI status maps to a real backend state.
7. Every test case has exact navigation steps.
8. Every test case explains the features it exercises.
9. Every test case includes expected UI and backend results.
10. Every test case includes evidence requirements.
11. Actual canonical seed codes are used.
12. No unimplemented feature is described as available.
13. Manual UAT cases are mapped to Playwright coverage.
14. No sensitive credentials appear.
15. The document can be followed by a first-time MES Console user.

---

# Completion Report

After creating the document, provide a short English implementation report containing:

- output files;
- source files inspected;
- MES Console routes discovered;
- screens fully documented;
- fields/actions documented;
- test scenarios created;
- Critical scenario count;
- API mapping count;
- Playwright traceability summary;
- API-only features;
- missing UI features;
- unknown or unimplemented areas;
- whether the document is ready for execution;
- final document path.

Do not claim that UAT passed.

This task creates the comprehensive Vietnamese MES Console feature guide and two-line UAT scenario. Actual execution results must be recorded in a separate UAT run report.