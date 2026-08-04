# Prompt — Diagnose and Fix Work Order Line-Evaluation Dimension Statuses and Improve UX Clarity

Version: 1.0  
Mode: Audit, implementation, regression verification, and UX remediation  
Target: S-Factory MES Enterprise  
Prompt language: English  
Required report language: Vietnamese  

---

# 1. Role

You are working inside the existing S-Factory MES enterprise repository and its current non-production runtime.

Act as a Senior MES Solution Architect, MES Domain Engineer, Backend Engineer, Frontend Engineer, Database Engineer, QA Automation Engineer, and production-readiness auditor.

Investigate why Work Order Detail currently shows:

```text
Primary Line = READY
Final Result = READY
```

while most evaluation dimensions show:

```text
Not Evaluated
Chưa đánh giá
```

Determine whether the cause is:

- frontend mapping;
- backend response contract;
- backend persistence;
- missing backend evaluation;
- stale runtime data;
- seed inconsistency;
- placeholder/i18n behavior;
- or multiple layers.

After diagnosis, implement the correct fix and improve the UX so users understand the difference between:

- Production Version readiness;
- line eligibility;
- line feasibility;
- selected-line result;
- deferred checks;
- operation resource allocation;
- capacity validation;
- approval readiness;
- execution readiness.

Do not assume the backend is correct because the final result is `READY`.

Do not assume it is wrong only because the UI shows `Not Evaluated`.

Current source, runtime API responses, database records, tests, and reproducible evidence are authoritative.

---

# 2. Required Outputs

Implement the fixes and create exactly one Vietnamese report:

```text
AI_document/MES_WO_LINE_DIMENSION_STATUS_DIAGNOSIS_AND_UX_FIX_REPORT.md
```

Create supporting artifacts under:

```text
artifacts/mes-wo-line-dimension-fix/<run-id>/
```

Required artifacts:

```text
target-work-order.json
api-response-before.json
api-response-after.json
database-evaluation-before.json
database-evaluation-after.json
backend-source-trace.json
frontend-mapping-before.json
frontend-mapping-after.json
dimension-contract.json
three-pv-dimension-evidence.json
build-results.json
api-integration-results.json
browser-e2e-results.json
cleanup-results.json
final-verdict.json
```

---

# 3. Mandatory Inspection

Read current versions of:

```text
AI_document/REMEDIATION_MASTER_RULES.md
AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md
AI_document/MES_CONSOLE_REMEDIATION_FINAL_REPORT.md
AI_document/MES_CONSOLE_COMPLETE_UAT_AND_READY_TO_RUN_WO_CERTIFICATION.md
AI_document/MES_WO_DETAIL_TWO_LINE_AUDIT_AND_THREE_PV_SEED_REPORT.md
AI_document/MES_WO_AUTO_RESOURCE_ALLOCATION_TWO_LINE_PRINT_FLOW_FIX_REPORT.md
AI_CONTEXT.md
UI_AI_CONTEXT.md
```

Read relevant reports under:

```text
AI_document/Phase-00/**
AI_document/Phase-01/**
AI_document/Phase-02/**
AI_document/Phase-03/**
AI_document/Phase-04/**
AI_document/Phase-05/**
AI_document/Phase-06/**
AI_document/Phase-07/**
AI_document/Phase-08/**
AI_document/Phase-09/**
AI_document/Phase-10/**
```

Inspect current source under actual repository paths:

```text
services/mes-console/**
services/mes-master-data-service/**
services/mes-execution-service/**
services/mes-traceability-service/**
scripts/**
e2e/**
package.json
docker-compose*.yml
```

Inspect:

- Work Order creation;
- Production Version readiness;
- Production Version Line Eligibility;
- line selection;
- line evaluation;
- line-evaluation persistence;
- Work Order Detail API;
- evaluated-line response types;
- MES Console mapping;
- i18n;
- resource proposals;
- capacity and revalidation;
- approval and execution gates;
- canonical seed;
- three UAT Production Versions;
- current integration and Playwright tests.

Search for:

```text
READY
BLOCKED
NOT_EVALUATED
NOT_APPLICABLE
DEFERRED
WARNING
UNKNOWN
RESOURCE_HOLD
PRIMARY_LINE_READY
PRIMARY_BLOCKED_BACKUP_READY
line_selection_status
line_selection_mode
selected_line_role
selection_reason
fallback_reason
evaluated_lines
dimensions
final_result
```

Search for the visible dimension labels and current Vietnamese strings.

---

# 4. Reproduce the Baseline Before Changing Code

## 4.1 Identify the Work Order

Use the current screenshot Work Order when its full ID is available.

Otherwise create a Work Order from the canonical Primary-ready Production Version.

Record:

- Work Order ID/code;
- Production Version;
- Item Revision;
- MBOM;
- Routing;
- quantity;
- planned date;
- shift;
- selected line;
- selected-line role;
- selection status;
- selection reason;
- Work Order lifecycle;
- allocation status;
- capacity state;
- approval state;
- execution state.

## 4.2 Capture browser evidence

Open Work Order Detail and record:

- every dimension label;
- every dimension status;
- final result;
- selected line;
- selection reason;
- fallback reason;
- line lock;
- gate summary;
- allocation state;
- capacity state.

Capture screenshot and Playwright trace.

## 4.3 Capture API evidence

Record the exact Work Order Detail and line-evaluation API responses.

## 4.4 Capture database evidence

Inspect persisted line-selection and evaluation records.

Determine whether the database stores:

- only selected line and final result;
- one result per evaluated line;
- one result per dimension;
- blockers;
- evaluated timestamp;
- policy version;
- fallback and selection reasons.

---

# 5. Root-Cause Classification

For every dimension, classify the current behavior as exactly one of:

```text
BACKEND_NOT_CALCULATED
BACKEND_CALCULATED_NOT_RETURNED
BACKEND_RETURNED_NOT_PERSISTED
BACKEND_PERSISTED_NOT_RETURNED
BACKEND_RETURNED_FRONTEND_MAPPING_BUG
FRONTEND_STATIC_MATRIX_WITHOUT_EVIDENCE
FRONTEND_PLACEHOLDER_BUG
I18N_KEY_BUG
DEFERRED_BY_DESIGN
NOT_APPLICABLE_BY_DESIGN
STALE_RUNTIME_RECORD
SEED_DATA_GAP
DOMAIN_EVALUATION_BUG
UNKNOWN_BLOCKER
```

Create:

| Dimension | UI | API | DB | Evaluator invoked | Classification | Correct behavior |
|---|---|---|---|---|---|---|

Required dimensions:

```text
Production Version eligibility
Work Center coverage
Workstation availability
Machine requirements
Equipment or Machine Unit availability
Resource Assignment
Capability
Calendar and Shift
Production Standard
Capacity
Worker Skill and Labor
Final Result
Selection Reason
```

---

# 6. Trace the Actual Line-Selection Policy

Trace the backend selector from entry point to final result.

Determine whether it checks:

1. Production Version released/effective.
2. Active/effective Line Eligibility.
3. Site match.
4. Primary/Backup priority.
5. Mandatory Work Center coverage.
6. Workstation availability.
7. Machine/equipment requirements.
8. Resource Assignments.
9. Capabilities.
10. Calendars and shifts.
11. Production Standards.
12. Capacity.
13. Worker Skills and labor.
14. Reservation conflicts.
15. One-line consistency.

Classify every check as:

```text
LINE_SELECTION_BLOCKING
RESOURCE_PLANNING_BLOCKING
APPROVAL_BLOCKING
EXECUTION_START_BLOCKING
WARNING_ONLY
NOT_IMPLEMENTED
```

The report must answer:

- Which dimensions are mandatory before selecting a line?
- Which checks are intentionally deferred until exact resource allocation?
- Which checks are deferred until revalidation?
- Which checks are not applicable?
- Can final line `READY` coexist with capacity `NOT_EVALUATED`?
- Can final line `READY` coexist with zero committed operation resources?
- What exactly does backend `READY` mean?

---

# 7. Implement an Explicit Dimension Status Model

Use current enums where valid.

The final contract must distinguish:

```text
READY
BLOCKED
NOT_EVALUATED
NOT_APPLICABLE
DEFERRED
WARNING
UNKNOWN
```

Each dimension result must expose:

```text
dimension_code
status
blocking
evaluation_stage
reason_code
localized_message_key
details
evaluated_at
source
```

Example only:

```json
{
  "dimension_code": "CAPACITY",
  "status": "DEFERRED",
  "blocking": false,
  "evaluation_stage": "RESOURCE_ALLOCATION_REVALIDATION",
  "reason_code": "CAPACITY_REQUIRES_EXACT_RESOURCE",
  "details": [],
  "evaluated_at": null,
  "source": "MES_EXECUTION"
}
```

Use repository naming conventions rather than copying this blindly.

---

# 8. Define the Final-Result Aggregation Rule

The backend must not return `READY` without an explainable aggregation rule.

Define:

- dimensions blocking at line-selection time;
- whether `DEFERRED` may coexist with final `READY`;
- whether `UNKNOWN` may coexist with final `READY`;
- whether generic `NOT_EVALUATED` may coexist with final `READY`;
- warning behavior;
- fallback selection;
- selection-reason generation.

Expected safety rule to validate against source:

```text
Final READY is allowed only when:
- all mandatory line-selection dimensions are READY or NOT_APPLICABLE;
- no mandatory dimension is BLOCKED, UNKNOWN, or NOT_EVALUATED;
- deferred dimensions are explicitly DEFERRED and identify a later stage.
```

Do not convert missing evidence into `DEFERRED`.

---

# 9. Backend Fix Requirements

Implement the smallest correct fix.

Possible fixes include:

## 9.1 Missing evaluators

Add evaluation for dimensions required at line-selection time.

## 9.2 API response

Return structured dimension evidence from Work Order Detail or a dedicated read-only endpoint.

## 9.3 Persistence

Persist evaluation evidence when required for audit/history:

- line;
- role;
- final result;
- dimensions;
- blockers;
- evaluated time;
- policy version;
- selection reason;
- fallback reason.

## 9.4 Historical attempts

Do not overwrite prior evaluation evidence after replan.

Create a new attempt and preserve previous attempts.

## 9.5 Compatibility

Use additive fields/endpoints.

Do not break current Work Order consumers.

---

# 10. Frontend and UX Fix Requirements

## 10.1 Remove fake matrix behavior

Do not render a fixed dimension list with `Chưa đánh giá` when the backend did not provide evidence.

Render authoritative dimensions only.

When old records have only final outcome, show one compatibility notice instead of fabricated rows:

```text
Backend chưa cung cấp dữ liệu chẩn đoán chi tiết cho lần chọn dây chuyền này.
```

## 10.2 Show distinct dimension statuses

Translate and display:

```text
Đạt
Bị chặn
Chưa đánh giá
Không áp dụng
Hoãn đến bước phân bổ nguồn lực
Cảnh báo
Không xác định
```

Do not map every null/missing value to `Chưa đánh giá`.

## 10.3 Separate readiness levels

Clearly separate:

```text
Cấu hình sản xuất
Lựa chọn dây chuyền
Khả thi của dây chuyền
Phân bổ nguồn lực theo công đoạn
Kiểm tra capacity
Phê duyệt
Sẵn sàng thực thi
```

Do not use one generic `Sẵn sàng` badge for all stages.

## 10.4 Improve the line card

Show:

- line code/name;
- Primary/Backup role;
- selected/not-selected result;
- feasibility status;
- selection reason;
- fallback reason;
- evaluation time;
- policy version when available;
- blocker count;
- deferred count;
- warning count.

## 10.5 Improve the gate summary

Render labelled gates:

| Gate | Status | Meaning | Next action |
|---|---|---|---|
| Work Order | | | |
| Line Selection | | | |
| Resource Allocation | | | |
| Capacity/Revalidation | | | |
| Approval | | | |
| Execution | | | |

Do not concatenate unrelated enums without labels.

## 10.6 Explain deferred dimensions

For example:

```text
Sẽ được đánh giá sau khi phân bổ nguồn lực cụ thể.
```

## 10.7 Recommended page hierarchy

Validate and implement when compatible:

```text
Stage 1 — Production configuration
Stage 2 — Automatic line selection
Stage 3 — Line evaluation evidence
Stage 4 — Exact resource allocation
Stage 5 — Revalidation and capacity
Stage 6 — Approval
Stage 7 — Execution
```

---

# 11. i18n Requirements

Complete VI, EN, JA, and KO for:

- dimension names;
- dimension statuses;
- selection reasons;
- fallback reasons;
- blockers;
- gate labels;
- deferred and not-applicable explanations;
- unknown/error states.

No raw translation key may be visible.

Add an automated check that fails when a dimension key is rendered as the raw key.

---

# 12. Verify the Three UAT Production Versions

## PV-01 — Primary Ready

Expected:

```text
mandatory line-selection dimensions = READY or NOT_APPLICABLE
deferred dimensions = explicitly DEFERRED
final result = READY
selected role = PRIMARY
fallback reason = null
```

## PV-02 — Primary Blocked, Backup Ready

Expected:

```text
Primary contains explicit BLOCKED dimension
Primary final = BLOCKED
Backup mandatory dimensions = READY or NOT_APPLICABLE
Backup final = READY
selected role = BACKUP
fallback reason = explicit
```

## PV-03 — Both Lines Hold

Expected:

```text
Primary final = BLOCKED
Backup final = BLOCKED
selected line = null
selection status = RESOURCE_HOLD
```

The UI must show exact blockers for both lines.

Resource allocation must be unavailable.

Approval and execution must remain blocked.

---

# 13. API Integration Tests

Add or update tests for:

- explicit status for every returned dimension;
- deferred dimensions include the later evaluation stage;
- not-applicable includes a reason;
- missing mandatory evaluator blocks final `READY`;
- mandatory `UNKNOWN` blocks final `READY`;
- warning-only behavior;
- deterministic final aggregation;
- evaluated timestamp and policy version;
- historical attempt preservation;
- PV-01;
- PV-02;
- PV-03;
- fallback reason;
- selected-line role;
- Resource Hold;
- replan creates a new evaluation attempt;
- backward compatibility.

Do not assert only `final_result = READY`.

Assert dimension evidence.

---

# 14. Browser E2E Tests

Use real backend and persisted data.

Do not mock dimension responses.

## PV-01

- Primary selected.
- Mandatory dimensions show `Đạt`.
- Deferred dimensions use the correct deferred label.
- No unexplained blanket `Chưa đánh giá`.
- Allocation/capacity remain clearly separate later gates.
- Refresh preserves evidence.

## PV-02

- Primary blocker visible.
- Backup selected.
- Fallback reason visible.
- Backup dimensions visible.
- Role and reason are clear.

## PV-03

- Both-line blockers visible.
- No selected line.
- Resource Hold visible.
- Allocation unavailable.
- Approval/start blocked.

## UX/i18n

- no raw key;
- no fake rows;
- no ambiguous generic `Sẵn sàng`;
- labelled gate summary;
- desktop and tablet viewports;
- accessibility smoke.

Capture screenshots and traces.

---

# 15. Seed Rules

Do not change the intended three-PV outcomes merely to make tests pass.

Change seed only when diagnosis proves a seed defect.

Seed remains:

- deterministic;
- idempotent;
- scenario-isolated;
- compatible with ready-to-run WO certification.

Do not use global resource disabling to manufacture a blocker.

---

# 16. Build and Regression

Run actual repository commands.

At minimum where present:

```bash
npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build

npm run test:mes:resource-planning-domain:phase1
npm run test:mes:resource-planning-full-flow:phase2
npm run test:mes:two-line-resource-planning:phase7
npm run test:mes:two-line-full-regression:phase9
npm run verify:mes:canonical-seed
npm run certify:mes:ready-to-run-wo
```

Also run:

- new dimension tests;
- Production Version eligibility tests;
- Work Order Detail API tests;
- three-PV Playwright tests;
- i18n tests;
- replan tests;
- cleanup verification.

Use actual command names and document mappings.

No mandatory test may be skipped.

---

# 17. Cleanup

Verify after tests:

```text
0 generated Work Orders
0 generated allocations
0 generated reservations
0 temporary line-evaluation mutations
0 orphan evaluation attempts
0 leaked test events
```

Preserve canonical UAT Production Versions and base seed.

Cleanup failure blocks completion.

---

# 18. Required Vietnamese Report Structure

Create:

```text
AI_document/MES_WO_LINE_DIMENSION_STATUS_DIAGNOSIS_AND_UX_FIX_REPORT.md
```

Required sections:

```text
1. Executive Summary
2. Scope
3. Sources Inspected
4. Target Work Order and Runtime
5. Baseline UI Evidence
6. Baseline API Evidence
7. Baseline Database Evidence
8. Backend Line-Selection Policy
9. Dimension-by-Dimension Root Cause
10. Final-Result Aggregation Rule
11. Backend Fixes
12. API Contract Changes
13. Persistence and Audit Changes
14. Frontend Mapping Fixes
15. UX Improvements
16. i18n Changes
17. PV-01 Evidence
18. PV-02 Evidence
19. PV-03 Evidence
20. Replan Evidence
21. Build Results
22. API Integration Results
23. Playwright Results
24. Regression Results
25. Cleanup Results
26. Known Issues
27. Risks and Compatibility
28. Final Verdict
```

Record exact:

```text
declared
executed
passed
failed
skipped
```

counts.

---

# 19. Acceptance Criteria

The implementation passes only when:

## Diagnosis

- Every visible dimension has a source-backed classification.
- The reason final `READY` coexisted with `Not Evaluated` is proven.
- The report identifies the root cause by layer.

## Backend

- Mandatory line-selection dimensions are actually evaluated.
- Deferred and not-applicable dimensions are explicit.
- Missing mandatory evidence cannot silently produce `READY`.
- Final aggregation is deterministic and tested.
- Structured evidence is available.
- Historical attempts are preserved when required.

## Frontend

- No fake matrix.
- No unexplained blanket `Chưa đánh giá`.
- No raw translation key.
- Readiness stages are distinct.
- Final line result is separated from resource/capacity/approval/execution gates.
- Gate summary is labelled.
- Selection and fallback reasons are understandable.

## Three PVs

- PV-01 is explainable Primary READY.
- PV-02 shows the exact Primary blocker and Backup READY.
- PV-03 shows blockers for both lines and Resource Hold.
- Runtime and browser evidence exist.

## Tests

- frontend typecheck/build pass;
- affected backend tests pass;
- API integration passes;
- real Playwright passes;
- three-PV regression passes;
- canonical verification passes;
- full-flow certification still passes;
- cleanup passes;
- mandatory skipped tests = 0.

---

# 20. Stop Conditions

Stop and report blocked when:

- line-selection code cannot be traced;
- API and DB contradict each other without explanation;
- final result is assigned without a traceable rule;
- required evaluators cannot be added compatibly;
- frontend would need to calculate backend readiness;
- historical evidence would be destroyed;
- three UAT PVs cannot reproduce deterministic outcomes;
- mandatory tests fail or are skipped;
- cleanup is incomplete.

Do not hide uncertainty.

---

# 21. Final Status

End the Vietnamese report with exactly one:

```text
MES_WO_LINE_DIMENSION_STATUS_FIX_COMPLETE
```

or:

```text
MES_WO_LINE_DIMENSION_STATUS_FIX_BLOCKED
```

---

# 22. Final Response

After implementation, respond with:

- report path;
- run ID;
- target Work Order;
- root cause;
- whether all mandatory dimensions were evaluated;
- which dimensions are intentionally deferred;
- backend fix;
- frontend fix;
- UX improvement;
- PV-01 result;
- PV-02 result;
- PV-03 result;
- API test totals;
- Playwright totals;
- cleanup result;
- exact final status.

Do not begin another remediation automatically.
