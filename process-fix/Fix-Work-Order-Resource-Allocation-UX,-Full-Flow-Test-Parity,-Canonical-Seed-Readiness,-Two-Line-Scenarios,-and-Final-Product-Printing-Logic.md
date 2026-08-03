Prompt — Fix Work Order Resource Allocation UX, Full-Flow Test Parity, Canonical Seed Readiness, Two-Line Scenarios, and Final Product Printing Logic

Version: 1.0Mode: Full implementation, regression verification, and remediation reportingTarget system: S-Factory MES EnterprisePrompt language: EnglishRequired implementation report language: Vietnamese

1. Role

You are working inside the existing S-Factory MES enterprise repository and its current non-production runtime.

Act as:

a Senior MES Solution Architect;

a Senior MES Domain Engineer;

a Senior Backend Engineer;

a Senior Frontend Engineer;

a Senior Database and Seed Engineer;

a Senior QA Automation Engineer;

and a production-readiness auditor.

Current source code, current API behavior, current database schema, current migrations, current canonical seed, current automated tests, and reproducible runtime evidence are authoritative.

Do not assume a previous “PASS” result is sufficient.

Do not preserve an incorrect UI or seed merely because an earlier phase report described it as complete.

Do not invent behavior.

2. Primary Objective

Fully correct the current Work Order flow so that:

the Work Order Detail page clearly separates:

production configuration readiness;

automatic Production Line selection;

line diagnostic readiness;

exact operation resource allocation;

capacity and allocation revalidation;

approval;

execution start;

Resource Planning no longer requires the user to manually open every operation and manually choose the initial candidate when a deterministic best candidate can be proposed;

the system automatically fills the recommended exact resource candidate for every mandatory operation;

the user can review and adjust the proposed candidates before final commit;

the system does not create irreversible allocations or reservations merely by displaying an automatic proposal unless the current approved business policy explicitly requires auto-commit;

the canonical seed contains enough valid resource, capacity, assignment, calendar, standard, labor, and skill data so the normal ready-to-run Work Order is not blocked;

the full-flow API test and browser UI test use the same canonical seed, the same Production Version scenario, the same date/shift assumptions, and equivalent readiness rules;

false-positive full-flow test results are eliminated;

the two-line Primary/Backup behavior is proven using three deterministic, explicitly marked Production Versions;

final-product printing is modeled only at the correct final printing/packing operation or print-trigger point, not as one print-resource card for every production operation;

all affected build, API integration, browser E2E, seed verification, cleanup, and regression tests pass;

a Vietnamese Markdown implementation report is generated.

3. Required Outputs

Implement the fixes.

Create exactly one primary implementation report:

AI_document/MES_WO_AUTO_RESOURCE_ALLOCATION_TWO_LINE_PRINT_FLOW_FIX_REPORT.md

The report content must be written in Vietnamese.

Create supporting artifacts under:

artifacts/mes-wo-resource-allocation-fix/<run-id>/

At minimum include:

baseline-runtime.json
full-flow-test-vs-ui-comparison.json
candidate-blocker-evidence.json
seed-before.json
seed-after.json
three-pv-scenario-evidence.json
auto-fill-api-evidence.json
auto-fill-ui-evidence.json
print-operation-evidence.json
api-integration-results.json
browser-e2e-results.json
cleanup-results.json
final-gate.json

Do not create multiple competing human-readable implementation reports.

4. Mandatory Source Inspection

Before changing code, inspect current versions of:

AI_document/REMEDIATION_MASTER_RULES.md
AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md
AI_document/MES_CONSOLE_REMEDIATION_FINAL_REPORT.md
AI_document/MES_CONSOLE_COMPLETE_UAT_AND_READY_TO_RUN_WO_CERTIFICATION.md
AI_document/MES_WO_DETAIL_TWO_LINE_AUDIT_AND_THREE_PV_SEED_REPORT.md
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

Inspect current source under actual repository paths for:

services/mes-console/**
services/mes-master-data-service/**
services/mes-execution-service/**
services/mes-traceability-service/**
services/mes-kiosk-gateway/**
scripts/**
e2e/**
package.json
docker-compose*.yml

Inspect:

current Work Order Detail React components;

Work Order creation flow;

Production Version readiness API;

line-selection implementation;

evaluated-line results;

resource-candidate APIs;

candidate ranking;

allocation commit/reallocate/cancel/revalidate APIs;

capacity calculations;

reservation overlap logic;

resource calendars;

machine maintenance data;

production standards;

Employee Skills and schedules;

Print Station integration;

label/print policy;

canonical seed;

full-flow certification runner;

maintained API integration tests;

Playwright tests.

Search for the exact visible strings and keys:

Hoạch định dây chuyền
Hoạch định nguồn lực
Phân bổ nguồn lực theo công đoạn
Chuẩn bị lõi kim loại
Mức sẵn sàng: Bị chặn
Thiết bị đang có đặt capacity trùng thời gian
Nguồn lực bị trùng reservation
Chưa có nguồn dữ liệu bảo trì để xác nhận
Chưa có nguồn dữ liệu hiệu chuẩn để xác nhận
Trạng thái vận hành chưa có heartbeat
Sản lượng yêu cầu
Số chu kỳ
Số tem
Số bản in

Use the current implementation, not historical assumptions.

5. Mandatory Baseline Reproduction

Before modifying anything, reproduce and record the current discrepancy.

5.1 Browser reproduction

Using the same non-production runtime and the same user-visible flow:

reset and seed using the currently approved command;

create a normal Work Order from the canonical ready-to-run Production Version;

open Work Order Detail;

open Resource Planning;

retrieve candidates for each mandatory operation;

record every candidate readiness dimension and blocker;

attempt the same selection and commit actions available in the UI;

record whether the UI is blocked.

Capture:

Work Order code and ID;

Production Version;

selected Production Line;

date and shift;

candidate API payload;

blocker codes;

capacity values;

reservation IDs;

resource statuses;

screenshots and Playwright trace.

5.2 Full-flow runner reproduction

Run the current command that previously reported the Work Order full flow as passed.

Record:

exact command;

environment variables;

reset behavior;

Production Version;

Work Order;

date and shift;

selected line;

candidates selected;

resource IDs;

capacity calculations;

reservations created;

cleanup;

final result.

5.3 Mandatory comparison

Create a field-by-field comparison:

Dimension

Browser UI flow

Full-flow runner

Same?

Root cause when different

Database









Seed version









Production Version









Routing









Selected line









Date









Shift









Quantity









Candidate endpoint









Candidate filters









Capacity policy









Existing reservations









Maintenance evidence









Calibration evidence









Heartbeat/operational status









Skill/labor checks









Cleanup state









Do not start implementation until the discrepancy is explained.

6. Eliminate False-Positive Full-Flow Tests

The current full-flow certification must not pass when the equivalent browser flow is blocked.

Investigate and fix any of these causes when present:

different Production Version
different seed
different database
different target date
different shift
different quantity
different line
test-only temporary resource mutations
test bypassing current candidate endpoint
test ignoring blocking_errors
test accepting a blocked candidate
test using stale or pre-cleanup resources
test not validating capacity conflicts
test not validating reservation overlap
test skipping maintenance/calibration/heartbeat policy
test direct database insertion
mocked browser/API response
cleanup hiding an invalid baseline

The corrected full-flow runner must:

use the same canonical ready-to-run Production Version exposed by Work Order Create;

use the same candidate APIs used by MES Console;

validate blocking_errors;

reject candidates with blocked readiness;

validate candidate line consistency;

validate capacity;

validate reservation overlap;

validate current assignment;

validate capability;

validate calendar/shift;

validate production standard;

validate labor and Worker Skills;

validate maintenance/calibration/heartbeat only when the current backend policy defines them as blocking;

commit through supported allocation APIs;

revalidate;

approve;

start execution;

fail with a non-zero exit code on any mandatory blocker.

A test that uses temporary fixture repair must clearly state that it is not validating the base canonical seed.

The canonical ready-to-run certification must validate the base seed without hidden repair.

7. Correct the Resource Allocation UX

7.1 Preserve the domain distinction

The final workflow remains:

automatic whole-line selection
→ automatic exact-resource proposal
→ user review and optional adjustment
→ explicit commit
→ backend revalidation
→ approval
→ execution start

Automatic line selection does not remove exact resource allocation.

Exact resource allocation remains operation-specific.

7.2 Automatic proposal

After the backend has selected a Production Line and the Work Order is eligible for Resource Planning, provide an automatic proposal for every mandatory operation.

The proposal must:

call the authoritative backend candidate service;

rank candidates using current backend readiness and selection policy;

choose only candidates inside the selected Production Line;

exclude blocked candidates;

exclude stale candidates;

exclude candidates with capacity or reservation conflicts;

include the reason each candidate was proposed;

include warnings that are non-blocking;

include row version or freshness token when required;

return a complete proposal result.

Preferred behavior:

open Resource Planning
→ automatically load proposals
→ prefill one recommended candidate per operation

Also provide an explicit action:

Tự động đề xuất nguồn lực

or the current product-approved translation.

7.3 Review and adjustment

The user must be able to:

view the proposed candidate;

open alternative candidates;

understand why a candidate is recommended or blocked;

change the candidate;

reset one operation to the recommended candidate;

rerun proposals;

review all operations before commit.

7.4 Commit semantics

Do not create final allocation/reservation records merely because the UI prefilled a candidate.

Use an explicit action such as:

Xác nhận và cam kết phân bổ

The user may commit:

all valid operation proposals in one action; or

a supported subset only when current lifecycle policy permits it.

The commit must remain transactional or safely compensating according to current backend design.

If one operation fails in an all-operation commit, do not leave an undocumented partial state.

Document exact current behavior and implement the safest compatible option.

7.5 Existing allocations

When allocations already exist:

do not overwrite them silently;

show current committed allocation;

show new proposal separately;

require reallocate action and confirmation;

preserve allocation history;

release superseded reservations according to current backend rules.

7.6 Resource Planning labels

Replace ambiguous naming when source supports it.

Recommended final sections:

Bước 1 — Cấu hình sản xuất
Bước 2 — Dây chuyền được backend lựa chọn
Bước 3 — Chẩn đoán khả năng đáp ứng của dây chuyền
Bước 4 — Phân bổ nguồn lực theo công đoạn
Bước 5 — Kiểm tra capacity và xác thực phân bổ
Bước 6 — Phê duyệt
Bước 7 — Bắt đầu thực thi

Do not remove the Resource Planning stage.

8. Backend Proposal Contract

Inspect current candidate and allocation APIs.

Prefer reusing existing endpoints.

When an additive endpoint is required, use repository conventions.

A possible contract to evaluate is:

POST /work-orders/:id/resource-allocation-proposals

or:

GET /work-orders/:id/resource-allocation-proposals

depending on whether proposal generation is side-effect free.

The response must be structured:

{
  "work_order_id": "...",
  "selected_production_line": {
    "id": "...",
    "code": "...",
    "name": "..."
  },
  "generated_at": "...",
  "proposal_version": "...",
  "complete": true,
  "operations": [
    {
      "operation_id": "...",
      "operation_code": "...",
      "sequence": 10,
      "recommended_candidate": {
        "candidate_id": "...",
        "workstation": {},
        "machine_unit": {},
        "equipment": {},
        "employee_or_labor": [],
        "readiness": "READY",
        "selection_reasons": [],
        "warnings": [],
        "freshness_token": "..."
      },
      "alternatives": [],
      "blocking_errors": []
    }
  ]
}

Use actual current domain types.

Do not copy this example blindly.

The proposal API must not create reservations unless current architecture explicitly requires temporary holds.

If temporary holds are used, they must:

expire;

be auditable;

be released on cancel;

be released on proposal refresh;

be cleaned on test failure.

9. Candidate Ranking Rules

Do not implement arbitrary frontend sorting.

Candidate recommendation must be backend-owned.

Inspect current ranking behavior and document it.

When current domain permits, ranking may consider:

selected-line membership;

readiness;

primary Resource Assignment;

machine unit availability;

capability match;

calendar availability;

capacity sufficiency;

reservation overlap;

production standard;

labor and Worker Skill readiness;

priority or efficiency;

stable deterministic tiebreaker.

A blocked candidate must never be prefilled as recommended.

The UI may display blocked alternatives for diagnosis, but they cannot be selected or committed unless the backend policy allows an explicit override with authorization and audit.

10. Fix Canonical Seed Resource Readiness

The screenshot indicates a candidate can be blocked by:

capacity overlap
reservation overlap
missing maintenance source
missing calibration source
missing heartbeat or operational confirmation

Inspect whether each is:

mandatory blocking rule
warning-only rule
test-only diagnostic
missing integration source
incorrect default
stale reservation
seed defect

Do not treat all warnings as blockers unless backend policy does.

10.1 Canonical ready-to-run seed

The normal ready-to-run seed must contain enough valid data for one Primary-ready Work Order.

At minimum verify:

selected Primary Line has complete Work Center coverage;

every mandatory operation has at least one Workstation;

every required machine group has a valid Machine Unit;

Resource Assignments are active and effective;

Capabilities match;

Calendars cover the certification date and shift;

Production Standards exist;

capacity is sufficient;

no stale or overlapping reservations remain;

required employees are scheduled;

Employee-scoped Worker Skills satisfy operation requirements;

required maintenance/calibration/heartbeat evidence is present when current policy makes it blocking;

no hidden setup step is required.

10.2 Reservation cleanliness

Reset and seed must leave:

zero unintended active WO reservations
zero unintended active allocations
zero stale capacity reservations

Seed verification must fail when stale reservations exist.

10.3 Deterministic dates

Do not seed only one historical calendar date.

Use current supported effectivity and calendar strategy so the certification date is deterministic and valid.

If tests use a computed date, UI and API tests must use the same date.

10.4 Seed verification

Add verification for every mandatory operation:

at least one READY candidate exists on Primary Line

The verification must report the exact blocking dimension when false.

11. Three Explicitly Marked Production Versions

Seed three deterministic UAT Production Versions that can exist simultaneously.

Use exact current naming conventions, but ensure codes and names clearly mark the scenario.

Recommended codes:

WST-UAT-PV-01-PRIMARY-READY
WST-UAT-PV-02-BACKUP-FALLBACK
WST-UAT-PV-03-BOTH-LINES-HOLD

Recommended visible markers:

[UAT-PRIMARY-READY]
[UAT-BACKUP-FALLBACK]
[UAT-BOTH-LINES-HOLD]

The Work Order Create selector must make the scenario purpose visible.

Do not mark test data only by UUID.

12. PV-01 — Primary Ready

Required behavior:

Primary Line = READY
Backup Line = eligible
Selected role = PRIMARY
Selection status = READY
Fallback reason = null
Resource proposals complete
Approval allowed after commit and revalidation
Execution start allowed

This is the normal ready-to-run certification Production Version.

No manual resource repair is allowed before creating the Work Order.

13. PV-02 — Primary Blocked, Backup Ready

Required behavior:

Primary Line = BLOCKED
Backup Line = READY
Selected role = BACKUP
Selection status = READY
Fallback reason = non-empty
Resource proposals use Backup only
Approval allowed after commit and revalidation
Execution start allowed

The Primary blocker must be deterministic and isolated to PV-02.

Do not globally disable a shared Production Line.

Use a current-domain PV-specific or Routing-specific requirement.

Possible supported mechanisms to inspect:

dedicated operation capability;

dedicated machine-group requirement;

dedicated Production Standard;

dedicated Worker Skill requirement;

dedicated Work Center coverage relationship;

another current source-supported readiness condition.

The chosen mechanism must not break PV-01.

14. PV-03 — Both Lines Hold

Required behavior:

Primary Line = BLOCKED
Backup Line = BLOCKED
Selected line = null
Selection status = RESOURCE_HOLD
Resource allocation proposal unavailable
Approval blocked
Execution start blocked

The blockers must be deterministic and isolated to PV-03.

The UI must clearly explain:

Primary blocker;

Backup blocker;

no selected line;

required master-data correction;

why allocation is unavailable.

15. Prove Two-Line Behavior

Add persisted runtime verification for all three scenarios.

Required evidence:

Scenario

Primary

Backup

Selected

Status

Candidate line

Approval

Start

PV-01

READY

eligible

Primary

READY

Primary only

Pass after allocation

Pass

PV-02

BLOCKED

READY

Backup

READY

Backup only

Pass after allocation

Pass

PV-03

BLOCKED

BLOCKED

None

RESOURCE_HOLD

None

Blocked

Blocked

Do not accept source-only proof.

Do not accept mocked UI proof.

Use:

API integration;

persisted database/audit evidence;

real Playwright browser flow.

16. Correct Print Station and Product Label Logic

16.1 Business meaning

The Print Station integration in this Work Order flow is for printing the finished-product label or product code.

It is not automatically a printing requirement for every production operation.

Do not render one Print Station allocation card for every operation unless the Routing explicitly defines a print requirement for that operation.

16.2 Correct model

Inspect current source and select the current-domain-compatible model.

Preferred models to evaluate:

Model A — Dedicated final print operation

final production or packing operation
→ product label print requirement
→ one Print Station allocation or print job context

Model B — Completion-triggered print job

final product completion
→ create print job
→ route to configured Print Station

Use the model that matches current architecture.

Do not create an unsupported new domain.

16.3 Required UI behavior

When printing belongs only to the final product step:

show Print Station only for the final print/packing operation;

do not show print candidate cards for unrelated operations;

show product label quantity;

show number of print copies;

show label template or policy when supported;

show Print Station binding;

show print-job state;

do not mix Print Station with machine candidates for unrelated operations.

16.4 Print quantity

Trace and correct:

Số tem
Số bản in

Document whether values are derived from:

Work Order quantity;

label-per-product policy;

package quantity;

copy count;

reprint count.

Do not multiply labels by every routing operation.

For quantity 2, if the policy is one product label per finished unit and one copy, expected behavior is typically:

2 labels
2 print copies

only at the final print step.

Use current source-supported policy.

16.5 Seed

Seed one valid MES-side Print Station and binding for the final print operation or completion trigger.

Physical third-party print execution may remain excluded when runtime is unavailable.

MES-side validation and UI behavior must still be testable.

17. Fix Work Order Detail Status and Quantity Presentation

Implement the root-cause report recommendations when supported by source.

At minimum fix:

ambiguous generic Sẵn sàng;

raw translation keys;

production placeholder Backend chưa lưu riêng;

unlabeled Pending · NotStarted · NotEvaluated;

confusing duplicate planning headings;

operation quantity 2 / 1;

capacity-check state;

allocation count;

next required action.

17.1 Readiness labels

Use distinct labels for distinct states.

Do not claim:

WO ready to execute

when only Production Version or line selection is ready.

17.2 Dimension matrix

Render a dimension only when backend provides authoritative evidence.

When status is absent, use a correct translated state such as:

Chưa đánh giá
Không áp dụng
Không có dữ liệu chẩn đoán

according to real semantics.

Do not display:

Backend chưa lưu riêng

to production users.

17.3 Gate summary

Render labeled gates:

Work Order
Execution
Line Selection
Resource Allocation
Capacity Check
Approval

Each gate must show:

status;

blocker;

next action.

17.4 Quantity

Replace unclear composite values such as:

2 / 1

with separately labeled fields based on actual source semantics.

For example, only when source confirms:

Sản lượng yêu cầu: 2 PCS
Sản lượng mỗi chu kỳ: 1 PCS
Số chu kỳ dự kiến: 2

Do not guess the denominator meaning.

18. API Integration Tests

Add or update API integration coverage for:

18.1 Full-flow parity

same seed as browser;

same Production Version;

same date;

same shift;

same candidate endpoint;

same blocker validation;

same allocation endpoint;

same approval/start gates.

18.2 Automatic proposal

complete proposal for PV-01;

complete proposal for PV-02 using Backup;

unavailable proposal for PV-03;

no blocked candidate recommended;

deterministic recommendation;

alternative candidates;

stale proposal rejection;

selected-line restriction;

mixed-line rejection.

18.3 Commit

commit all proposed candidates;

one-operation adjustment;

stale candidate;

duplicate commit;

reallocate;

cancel;

revalidate;

transaction/compensation behavior;

cleanup.

18.4 Capacity and reservations

sufficient capacity;

overlapping capacity block;

overlapping reservation block;

stale reservation detection;

reset removes unintended reservations;

cleanup releases test reservations.

18.5 Printing

print requirement only at the final configured operation or trigger;

no print requirement on unrelated operations;

correct label quantity;

correct copy count;

Print Station binding;

unavailable Print Station behavior;

physical runtime exclusion where approved.

18.6 Three PVs

PV-01 Primary READY;

PV-02 Primary blocked and Backup READY;

PV-03 both lines blocked;

fallback reason;

Resource Hold reason;

approval/start behavior.

19. Playwright Browser E2E

Use real backend and persisted runtime.

Do not mock candidate or Work Order responses.

19.1 PV-01

reset and seed
→ create WO from [UAT-PRIMARY-READY]
→ verify Primary selected
→ open Resource Planning
→ proposals automatically filled
→ adjust one operation
→ reset to recommendation
→ commit all
→ revalidate
→ approve
→ start execution
→ refresh after every step

19.2 PV-02

create WO from [UAT-BACKUP-FALLBACK]
→ verify Primary blocked
→ verify Backup selected
→ verify fallback reason
→ auto-fill proposals
→ verify every candidate belongs to Backup
→ commit
→ revalidate
→ approve
→ start

19.3 PV-03

create WO from [UAT-BOTH-LINES-HOLD]
→ verify no selected line
→ verify Resource Hold
→ verify Primary and Backup blockers
→ verify no auto-fill proposal
→ verify allocation unavailable
→ verify approve blocked
→ verify start blocked

19.4 Printing

open Work Order operation list
→ verify Print Station appears only for final print/packing operation or completion trigger
→ verify no print card for unrelated operations
→ verify label quantity and print copies

19.5 Status and quantity

Verify:

no raw i18n keys;

no Backend chưa lưu riêng;

no ambiguous unlabeled status chain;

quantity labels are explicit;

allocation count is correct;

capacity state is correct;

next action is clear.

Capture screenshots and traces.

20. Maintained Regression

Run actual repository commands.

At minimum where present:

npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build

npm run test:mes:resource-planning-domain:phase1
npm run test:mes:resource-planning-full-flow:phase2
npm run test:mes:two-line-resource-planning:phase7
npm run test:mes:two-line-full-regression:phase9
npm run verify:mes:canonical-seed
npm run certify:mes:ready-to-run-wo

Also run:

Worker Skill tests;

Employee Skill tests;

Product Definition tests;

resource-foundation tests;

Print Station MES-side tests;

new automatic proposal tests;

new three-PV tests;

full Playwright MES Console regression.

Use actual current command names and document mappings.

No mandatory test may be skipped.

A browser failure cannot be overridden by an API pass.

21. Exact Cleanup

After tests:

remove generated Work Orders;

cancel or remove test allocations according to approved cleanup;

release reservations;

restore temporary resource state;

preserve canonical seed records;

verify no stale capacity reservation;

verify no unintended Work Order;

verify no print-job test leak;

verify rerun is deterministic.

Cleanup failure blocks completion.

22. Mandatory Report Structure

Create:

AI_document/MES_WO_AUTO_RESOURCE_ALLOCATION_TWO_LINE_PRINT_FLOW_FIX_REPORT.md

The Vietnamese report must contain:

1. Executive Summary
2. Scope
3. Sources Inspected
4. Baseline Browser Reproduction
5. Baseline Full-Flow Runner Reproduction
6. Why the Previous Full-Flow Test Passed
7. Browser/Test Parity Root Cause
8. Resource Allocation UX Before and After
9. Automatic Proposal Contract
10. User Adjustment and Commit Behavior
11. Capacity and Reservation Fixes
12. Canonical Seed Changes
13. PV-01 Primary-Ready Scenario
14. PV-02 Backup-Fallback Scenario
15. PV-03 Both-Lines-Hold Scenario
16. Two-Line Runtime Evidence
17. Print Station and Product Label Logic
18. Work Order Detail Status Fixes
19. Operation Quantity Fix
20. Backend/API Changes
21. Frontend Changes
22. Migration Changes
23. Seed Changes
24. Tests Added or Updated
25. Static and Build Results
26. API Integration Results
27. Playwright Results
28. Regression Results
29. Cleanup Results
30. Known Issues
31. Risks and Compatibility
32. Final Gate

The report must state exact:

declared
executed
passed
failed
skipped

counts.

Do not claim success without runtime evidence.

23. Acceptance Criteria

The implementation passes only when all of the following are true:

Full-flow parity

The browser flow and certification runner use equivalent seed and rules.

The root cause of the previous false-positive or scenario mismatch is documented.

The certification runner fails when the UI-equivalent candidate is blocked.

No hidden fixture repair is required for the normal seed.

Resource allocation UX

Recommended candidates are automatically filled for every mandatory operation.

Recommendations are backend-owned.

Blocked candidates are never auto-selected.

All candidates belong to the selected Production Line.

Users can adjust recommendations.

Existing allocations are not overwritten silently.

Final commit remains explicit and auditable.

Revalidation is required before approval.

Seed

Normal ready-to-run seed creates a Primary-ready Work Order.

Every mandatory operation has at least one READY candidate.

Capacity is sufficient.

No stale reservations exist after reset.

Required maintenance/calibration/heartbeat data is present when blocking by policy.

Seed is deterministic and idempotent.

Two-line

PV-01 selects Primary.

PV-02 falls back to Backup.

PV-03 enters Resource Hold.

Three scenarios exist simultaneously.

Candidates for PV-02 come only from Backup.

PV-03 cannot allocate, approve, or start.

Printing

Finished-product printing appears only at the correct final print/packing operation or completion trigger.

Unrelated operations do not show Print Station cards.

Label quantity and print-copy calculation are correct.

MES-side Print Station binding is valid.

Physical runtime exclusion is documented when applicable.

UI clarity

Readiness states are distinct.

Raw i18n keys are absent.

Backend chưa lưu riêng is absent.

Gate statuses are labeled.

Allocation count is accurate.

Capacity status is accurate.

Quantity fields are understandable.

Tests

Frontend typecheck and build pass.

Affected backend builds pass.

API integration passes.

Real browser E2E passes.

Full-flow certification passes.

Canonical seed verification passes.

Cleanup passes.

Zero mandatory tests are skipped.

24. Stop Conditions

Stop and report BLOCKED when:

browser/test discrepancy cannot be reproduced;

the full-flow runner uses an unknown or unrelated seed;

candidate blockers cannot be traced;

automatic proposal requires frontend business logic;

commit behavior would destroy allocation history;

seed repair requires hidden manual SQL;

the three PV scenarios cannot be isolated;

Print Station semantics cannot be traced to current source;

capacity/reservation cleanup cannot be proven;

mandatory API or browser tests fail;

a mandatory test is skipped;

current source contradicts the requested business behavior and no approved migration path exists.

Do not hide a blocker.

25. Final Status

End the report with exactly one:

MES_WO_RESOURCE_ALLOCATION_FIX_COMPLETE

or:

MES_WO_RESOURCE_ALLOCATION_FIX_BLOCKED

26. Final Response

After implementation, respond with:

report path;

run ID;

browser/full-flow discrepancy root cause;

automatic proposal status;

canonical seed readiness;

PV-01 result;

PV-02 result;

PV-03 result;

Print Station logic result;

operation quantity result;

API test totals;

Playwright totals;

cleanup result;

exact final status.

Do not start another phase automatically.