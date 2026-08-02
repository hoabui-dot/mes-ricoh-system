Phase UI-00 — Product Decision Approval and Implementation Readiness Gate

Version: 1.0Status: DRAFT_FOR_EXECUTIONTarget system: S-Factory MES EnterprisePrimary scope: MES Console remediation after the completed eleven MES implementation phasesRule source: AI_document/REMEDIATION_MASTER_RULES.mdBlueprint source: AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md

1. Role

You are working inside the existing S-Factory MES enterprise microservice repository.

Act as:

a Senior Enterprise Architect;

a Senior MES Domain Engineer;

a Senior Frontend Architect;

a Senior Backend Engineer;

a Senior QA Automation Engineer;

and a cautious implementation gatekeeper.

This phase is not a feature implementation phase.

This phase exists to convert the current remediation blueprint from:

NOT_READY_SEED_OR_DOMAIN_CONFLICT

into an approved, evidence-backed implementation contract.

Do not begin broad MES Console remediation in this phase.

2. Objective

The objective of Phase UI-00 is to:

re-read and validate the complete MES Console remediation blueprint;

verify that the eight blocking product decisions are still correct against the current source code and runtime;

resolve or formally record each product decision;

confirm the exact scope and ordering of Phases UI-01 through UI-10;

confirm the authoritative role and permission model required by later UI phases;

confirm the canonical Worker Skill ownership model;

confirm the canonical UAT Work Order fixture strategy;

establish a clean build, API integration, and browser E2E baseline;

produce one Phase UI-00 report;

update the blueprint readiness status only when all blocking decisions are resolved.

The desired final result of this phase is:

READY_FOR_UI_01

This status authorizes only Phase UI-01.

It does not authorize implementing all later UI phases at once.

3. Mandatory Inputs

Read all of the following before making any decision:

AI_document/REMEDIATION_MASTER_RULES.md
AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md
AI_CONTEXT.md
UI_AI_CONTEXT.md
process-expand/mes-enterprise/**
implementation-fix/**
docs/testing/**
artifacts/mes-console-remediation-blueprint/**

Inspect the current repository source relevant to:

services/mes-console/src/App.tsx
services/mes-console/src/components/Sidebar.tsx
services/mes-console/src/routes/**
services/mes-console/src/components/**
services/mes-console/src/lib/**
services/mes-console/src/hooks/**
services/mes-console/src/context/**
services/mes-console/src/i18n.ts
services/mes-console/package.json

Inspect the current backend source relevant to:

authentication and authorization;

role forwarding;

site/resource scope;

Worker Skill;

Employee Skill;

Operation Skill Requirement;

Production Line;

Production Version Line Eligibility;

line selection;

evaluated line results;

Resource Hold;

line replan;

Resource Planning;

allocation;

approval;

execution start;

canonical reset and seed;

UAT fixture creation and cleanup.

Inspect current tests:

e2e/**
scripts/test-*.mjs
scripts/verify-*.mjs
scripts/reset-*.mjs
scripts/seed-*.mjs
package.json

Do not rely only on historical reports.

Current source, migrations, seed scripts, and tests are authoritative.

4. Strict Scope

Phase UI-00 may:

inspect source code;

inspect database schema and current runtime data in read-only mode;

inspect Docker Compose configuration;

execute existing build, API integration, and browser E2E commands;

inspect Keycloak realm roles and current route authorization;

inspect generated artifacts;

update documentation created specifically for Phase UI-00;

update the readiness section of the remediation blueprint after decisions are approved;

create decision records under the approved documentation path.

Phase UI-00 must not:

modify MES Console source;

modify backend source;

modify migrations;

modify canonical seed scripts;

modify database data;

modify routes;

remove or redirect pages;

add UI fields;

change API contracts;

change authorization behavior;

create new production features;

disable or skip failing tests;

rewrite previous phase reports.

If a source defect is discovered, record it as a blocker or backlog item.

Do not fix it in this phase.

5. Required Product Decisions

Resolve every decision below.

Do not leave a blocking decision implicit.

For each decision, provide:

source evidence;

alternatives;

selected option;

rationale;

impact;

migration or compatibility concerns;

test impact;

owner;

whether it blocks UI-01 or a later phase.

DEC-001 — Employee Skill Assignment Ownership

Question:

Which MES Console screen owns assignment of Worker Skills to Employees?

Options:

Option A — Employee modal is the only mutation authority

Employee Create/Edit
→ assign, update, or remove Employee Skill records

Worker Skill Detail
→ read-only assignment list
→ link to Employee edit

Option B — Both Employee modal and Worker Skill Detail mutate assignments

Option C — A dedicated Employee Skill Assignment screen owns the relationship

Recommended decision:

OPTION_A

Required rationale:

avoids duplicate mutation paths;

matches employee-centric maintenance;

uses the existing PUT /employees/:id/skills contract;

keeps Worker Skill Detail focused on definitions and dependency visibility;

allows a future dedicated bulk assignment screen without conflicting ownership.

Required final decision value:

EMPLOYEE_MODAL_ONLY

DEC-002 — Worker Skill Detail Mutation

Question:

Should Worker Skill Detail allow assign/end Employee Skill mutations?

Recommended decision:

READ_ONLY_ASSIGNMENT_LIST

Expected behavior:

display current assignments;

display dependency counts;

provide navigation to the Employee edit flow;

do not expose duplicate assign/end mutation actions in the current remediation;

retain backend endpoints for compatibility and future bulk tooling unless separately deprecated.

Required final decision value:

READ_ONLY_WITH_EMPLOYEE_LINK

DEC-003 — UAT Work Order Fixture Strategy

Question:

How should the three required two-line UAT Work Orders be created?

Required states:

PRIMARY_LINE_READY
BACKUP_LINE_FALLBACK_READY
BOTH_LINES_RESOURCE_HOLD

Options:

permanently store the Work Orders in canonical seed;

create them using an idempotent UAT preparation script;

manually create them before each UAT session.

Recommended decision:

IDEMPOTENT_UAT_PREPARATION_SCRIPT

Required characteristics:

creates Work Orders through supported APIs/workflows;

does not insert directly into execution tables;

creates deterministic business codes or stores generated IDs in an artifact;

can be rerun safely;

performs exact cleanup;

restores all temporary resource mutations;

preserves canonical seed readiness;

verifies each expected line-selection state.

Required final decision value:

IDEMPOTENT_PREPARE_VERIFY_CLEANUP

DEC-004 — Canonical Equipment Terminology and Route

Question:

Should the MES Console canonical term and route be Machines or Equipment?

Recommended decision:

MACHINES

Canonical route:

/master-data/machines

Legacy compatibility:

/master-data/equipment*
/console/mes/equipment

must redirect to the Machines route during the deprecation period.

Required final decision value:

MACHINES_CANONICAL

Confirm that this decision does not collapse:

Machine Definition;

Physical Machine Unit;

Equipment identity;

Workstation;

Resource Assignment.

Terminology cleanup must preserve domain distinctions.

DEC-005 — Legacy Alias Lifetime

Question:

How long should legacy MES Console aliases remain before physical removal?

Recommended policy:

ONE_RELEASE_REDIRECT

Exception:

Equipment/Machines aliases remain for TWO_RELEASES

Required behavior:

redirect immediately;

preserve route parameters;

update internal links;

update E2E tests;

monitor access logs where available;

remove physical alias only after the deprecation gate passes.

Required final decision values:

GENERAL_ALIAS_REDIRECT_PERIOD = 1_RELEASE
EQUIPMENT_ALIAS_REDIRECT_PERIOD = 2_RELEASES

DEC-006 — Production Version Line Readiness Visibility

Question:

Where should Production Version Line Eligibility and readiness be visible?

Recommended decision:

LIST_SUMMARY_AND_DETAIL_TAB

Expected final UI:

Production Version list

eligible line count;

Primary Line;

Backup Line count;

compact readiness/validation status.

Production Version detail

complete Line Eligibility tab;

Primary/Backup;

priority;

efficiency factor;

effectivity;

lifecycle;

validation;

readiness preview from backend.

Required final decision value:

LIST_SUMMARY_PLUS_DETAIL_TAB

The frontend must not calculate line readiness.

DEC-007 — Exact Resource Allocation Behavior

Question:

After automatic whole-line selection, should exact operation resources be committed manually or automatically?

Required decision:

AUTOMATIC_LINE_SELECTION
PLUS
MANUAL_PER_OPERATION_EXACT_RESOURCE_ALLOCATION

This means:

backend evaluates all eligible Production Lines;

backend selects exactly one complete line;

MES Console displays the selected line and evaluation result;

Resource Planning returns candidates only within the selected line;

planner commits exact Workstation, Equipment, Machine Unit, or Machine Group candidates per operation;

backend revalidates and reserves resources transactionally.

Do not remove the manual Resource Planning UI.

Do not implement automatic exact allocation in this remediation program.

Required final decision value:

AUTO_LINE_MANUAL_EXACT_RESOURCES

DEC-008 — i18n Review Route Visibility

Question:

Should the i18n review screen remain visible in the normal MES Console sidebar?

Recommended decision:

HIDE_FROM_NORMAL_SIDEBAR

Allowed behavior:

retain route for diagnostics;

expose only to Admin/diagnostic users when role enforcement is implemented;

do not present it as production master data.

Required final decision value:

DIAGNOSTIC_ADMIN_ONLY

6. Required Role and Permission Decision Record

The current blueprint contains incomplete role assumptions.

Phase UI-00 must create an authoritative role matrix for later phases.

Inspect:

Keycloak realm roles;

Kong/gateway validation;

forwarded role headers;

backend permission checks;

site/resource scope;

current seed permission records;

current browser users;

current Playwright credentials.

Do not invent roles.

At minimum resolve the actual behavior for roles equivalent to:

ADMIN
PLANT_MANAGER
PROD_MANAGER
PLANNER
OPERATOR
VIEWER
EXECUTIVE

For each role, determine:

Action

Allowed

Denied

Conditional

Evidence

View master data









Create/edit master data









Release master data









Create Work Order









View candidates









Commit allocation









Cancel/reallocate









Approve/reject









Replan line









Start execution









Manage employees









Assign employee skills









View diagnostics









Cross-site access









Classify every unresolved rule as:

REQUIRES_PRODUCT_DECISION
BACKEND_CURRENT_BEHAVIOR
SECURITY_DEFECT
UI_VISIBILITY_GAP
TEST_CREDENTIAL_GAP

Role uncertainty does not block UI-01 seed correction.

It does block the later authorization remediation phase.

7. Required Worker Skill Domain Confirmation

Confirm the following domain contract from source and schema:

Worker Skill Definition
scope = Employee

Confirm:

GET /worker-skills filters Employee-scoped skills;

POST /worker-skills creates Employee-scoped skills;

PUT /employees/:id/skills validates Employee scope;

Worker Skill assignment endpoints validate Employee scope;

Operation Skill Requirement validates Employee-scoped Worker Skill;

readiness consumes the same skill identity.

Inspect current canonical seed and current database records.

Produce an exact mismatch inventory:

Record type

Business code

Current scope/reference

Required scope/reference

Impact

Do not correct data in Phase UI-00.

Produce the exact correction specification for UI-01.

The specification must include:

final business codes;

whether existing codes are renamed or replaced;

Employee Skill relinking;

Operation Skill Requirement relinking;

compatibility treatment for old WorkCenter-scoped records;

reset/reseed requirement;

verification queries;

API integration tests;

browser E2E tests.

8. Required UAT Work Order Strategy Confirmation

Confirm the required UAT Work Order states:

UAT-WO-PRIMARY

Expected:

line_selection_mode = AUTO
line_selection_status = READY
selected line = Primary Line
fallback reason = null

UAT-WO-FALLBACK

Expected:

line_selection_mode = AUTO
line_selection_status = READY
selected line = Backup Line
fallback reason != null
Primary Line result = BLOCKED
Backup Line result = READY

UAT-WO-HOLD

Expected:

line_selection_mode = AUTO
line_selection_status = RESOURCE_HOLD
selected line = null
resource hold reason != null

Determine:

which canonical Production Version is used;

which Primary and Backup Line codes are used;

which operation count is expected;

which temporary resource mutation produces fallback;

which temporary mutations produce Resource Hold;

how exact cleanup works;

how fixture restoration is verified;

how Work Orders are exposed to browser E2E;

how generated IDs are written to artifacts;

whether the existing target Work Order remains useful as the hold fixture.

Do not create these records in Phase UI-00.

Create the approved fixture contract for UI-02.

9. Implementation Phase Confirmation

Validate and approve the following execution order.

UI-01 — Worker Skill Domain and Canonical Seed Correction

Scope:

Employee-scoped Worker Skills;

Employee Skill relinking;

Operation Skill Requirement relinking;

seed correction;

reset/reseed;

Worker Skill API tests;

Employee Skill API tests;

labor readiness tests.

UI-02 — Deterministic Two-Line UAT Fixtures

Scope:

prepare script;

verify script;

cleanup script;

Primary READY;

Backup fallback READY;

Resource Hold;

API and browser fixture evidence.

UI-03 — Route, Navigation, and Legacy Redirect Cleanup

Scope:

redirects;

sidebar cleanup;

/console/mes/skills;

Equipment to Machines;

Production Area navigation;

i18n review visibility.

UI-04 — Shared UI Components and Server-State Standardization

Scope:

tables;

filters;

pagination;

modal;

confirmation;

states;

badges;

blocker list;

readiness matrix foundation;

TanStack Query normalization.

UI-05 — Product Definition and Production Version UI Alignment

Scope:

Item/Revision;

EBOM;

MBOM;

Routing/Operations;

Production Version;

Line Eligibility;

readiness preview.

UI-06 — Resource Foundation and Planning Constraints UI Alignment

Scope:

Production Line;

Work Center;

Workstation;

Machines/Machine Units;

Resource Assignments;

Capabilities;

Calendars;

Production Standards;

hierarchy and readiness cross-links.

UI-07 — Labor, Worker Skill, and Employee Skill UX

Scope:

Employee modal;

Worker Skill definitions;

read-only assignment list;

skill summary;

schedules;

Operation Skill Requirements;

readiness display.

UI-08 — Work Order List and Two-Line Detail Diagnostics

Scope:

Work Order list columns and server filters;

selected line;

fallback;

hold;

evaluated-line matrix;

blocker links;

allocation history;

lifecycle states.

UI-09 — Resource Planning and Lifecycle Action Alignment

Scope:

candidates;

allocation;

cancel;

reallocate;

revalidate;

approve/reject;

replan;

start execution;

disabled/hidden states;

confirmations;

stale state handling.

UI-10 — Authorization, i18n, Accessibility, Regression, and UAT

Scope:

role-aware UI;

cross-site visibility;

VI/EN/JA/KO;

error translations;

loading/empty/error;

accessibility;

retained-page smoke;

complete Playwright regression;

final UAT evidence;

final report.

If the current blueprint defines a different numbering, reconcile it explicitly and select one canonical numbering scheme.

Do not allow duplicate phase names or ambiguous ownership.

10. Required Baseline Verification

Even though Phase UI-00 is documentation-focused, establish a clean technical baseline.

Use the approved disposable development/test environment.

Do not run destructive commands without required guards.

10.1 Static and Build Verification

Run applicable commands such as:

npm --prefix services/mes-console run typecheck
npm --prefix services/mes-console run build

Run affected backend baseline checks:

go test ./...
npm run typecheck

Use the actual repository commands and working directories.

Record:

command;

working directory;

start/end time;

exit code;

pass/fail;

relevant warnings.

10.2 API Integration Baseline

Run the maintained MES API suites required to prove the repository baseline before UI remediation.

At minimum, where available:

npm run test:mes:resource-planning-domain:phase1
npm run test:mes:resource-planning-full-flow:phase2
npm run test:mes:two-line-resource-planning:phase7
npm run test:mes:two-line-full-regression:phase9
npm run verify:mes:canonical-seed

If a suite cannot run because the current seed conflict is expected to block it:

do not mark it as passed;

record the exact failure;

classify it as EXPECTED_BASELINE_BLOCKER only when supported by evidence;

preserve artifacts;

map it to UI-01.

No failure may be hidden.

10.3 Browser E2E Baseline

Run existing maintained browser suites relevant to:

MES Console login;

current Work Order list/detail;

current Resource Planning;

current two-line UI;

Employee screen;

Skill screen;

route aliases;

current navigation.

Use real Keycloak login where the existing suite requires it.

At minimum record:

declared
executed
passed
failed
skipped

A skipped test is not passed coverage.

Missing credentials must be recorded as a blocker.

Do not modify tests in Phase UI-00.

11. Required Documentation Deliverables

Create:

AI_document/Phase-00/REPORT_PHASE_00.md

Create a decision record:

AI_document/Phase-00/PHASE_00_PRODUCT_DECISIONS.md

Create a role evidence record:

AI_document/Phase-00/PHASE_00_ROLE_PERMISSION_BASELINE.md

Create machine-readable evidence:

artifacts/mes-console-remediation/phase-00/<run-id>/
  decisions.json
  role-matrix.json
  source-evidence.json
  build-results.json
  api-integration-results.json
  browser-e2e-results.json
  readiness-gate.json

The canonical decision and conclusion must also be summarized in REPORT_PHASE_00.md.

Do not create multiple conflicting sources of truth.

12. Required Blueprint Update

After decisions are approved, update only the relevant readiness and decision sections of:

AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md

The blueprint must clearly show:

each decision value;

approval status;

approval date;

evidence source;

remaining blockers;

canonical phase numbering;

next authorized phase.

The blueprint status after Phase UI-00 must be one of:

READY_FOR_UI_01
BLOCKED_BY_UNRESOLVED_PRODUCT_DECISION
BLOCKED_BY_MISSING_ROLE_EVIDENCE
BLOCKED_BY_RUNTIME
BLOCKED_BY_BASELINE_REGRESSION

Do not set:

READY_FOR_IMPLEMENTATION

for the entire remediation program yet.

The Worker Skill seed/domain conflict still belongs to UI-01.

13. Phase Report Structure

REPORT_PHASE_00.md must contain:

1. Executive Summary

2. Scope

3. Sources Inspected

4. Runtime Environment

5. Product Decisions

Include all DEC-001 through DEC-008.

6. Role and Permission Findings

7. Worker Skill Domain Confirmation

8. UAT Fixture Strategy

9. Canonical Remediation Phase Order

10. Baseline Build Results

11. API Integration Baseline Results

12. Browser E2E Baseline Results

13. Existing Failures and Expected Blockers

14. Risks

15. Required UI-01 Inputs

16. Blueprint Updates

17. Final Gate

Use exact result counts:

declared
executed
passed
failed
skipped

Use exact source paths.

Do not claim tests were run without command evidence.

14. Acceptance Criteria

Phase UI-00 passes only when all of the following are true:

REMEDIATION_MASTER_RULES.md was read and applied;

the remediation blueprint was revalidated;

all eight product decisions have explicit values;

Worker Skill ownership is approved;

Employee Skill mutation ownership is approved;

exact-resource allocation behavior is approved;

UAT fixture strategy is approved;

canonical Machines terminology is approved;

legacy alias policy is approved;

line-readiness visibility is approved;

i18n diagnostic visibility is approved;

the current role model is documented with source evidence;

unresolved role items are assigned to a later phase;

Worker Skill seed correction requirements are complete;

the three UAT Work Order contracts are complete;

the canonical UI-01 through UI-10 order is approved;

static/build baseline results are recorded;

API integration baseline results are recorded;

browser E2E baseline results are recorded;

no source code or seed data was modified;

Phase UI-00 report was created;

the blueprint was updated consistently;

the final gate is READY_FOR_UI_01.

15. Failure Conditions

Phase UI-00 is blocked when:

any blocking decision remains unresolved;

Worker Skill ownership remains ambiguous;

exact-resource allocation behavior remains ambiguous;

the UAT fixture strategy is not approved;

source evidence contradicts the recommended decision and no resolution exists;

the role model cannot be determined sufficiently for later planning;

baseline tests reveal an unrelated critical regression;

the test environment cannot be trusted;

the blueprint and report disagree;

source code was modified during this phase.

Do not bypass a failure.

16. Mandatory Rules

Do not implement UI remediation.

Do not fix seed data.

Do not create UAT Work Orders.

Do not edit migrations.

Do not remove routes.

Do not change backend APIs.

Do not weaken tests.

Do not convert test failures into skips.

Do not infer roles from UI labels alone.

Do not trust browser-provided role headers outside the gateway boundary.

Do not approve duplicate Employee Skill mutation ownership.

Do not remove manual Resource Planning.

Do not allow frontend line-readiness calculation.

Do not expose secrets in artifacts.

Do not claim full implementation readiness from a decision-only phase.

17. Completion Response

After completing Phase UI-00, respond with a concise implementation summary containing:

output files;

run ID;

decisions approved;

unresolved decisions;

Worker Skill conclusion;

UAT fixture strategy;

role-matrix status;

build baseline;

API integration baseline;

browser E2E baseline;

blueprint status;

next authorized phase.

The final response must state exactly one:

PHASE_UI_00_PASSED_READY_FOR_UI_01

or:

PHASE_UI_00_BLOCKED

Do not begin UI-01 in the same AI execution unless explicitly requested in a new instruction.