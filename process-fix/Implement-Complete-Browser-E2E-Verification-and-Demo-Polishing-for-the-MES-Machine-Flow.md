# Implement Complete Browser E2E Verification and Demo Polishing for the MES Machine Flow

## Role

Act as a senior MES architect, senior frontend engineer, backend integration engineer, and test automation engineer.

Inspect the running repository, current source code, API contracts, migrations, package scripts, existing test utilities, and current MES Console behavior before implementing any changes.

Do not assume that the documentation is more authoritative than the running source.

The running source, migrations, APIs, database constraints, and deployed behavior are authoritative.

Do not redesign the current Machine domain.

Preserve the established architecture:

```text
Machine Definition
  -> Physical Machine Units

Workstation
  -> Machine Requirement Groups
  -> effective Resource Assignments

Resource Assignment
  -> exact Physical Machine Unit

Work Order
  -> runtime Resource Allocation

The purpose of this task is to:

implement a complete Browser E2E verification suite for the Machine flow;
polish the Machine demo experience;
verify the Machine domain independently from Resource Planning and Work Order allocation;
produce stable scripts, reports, documentation, and repeatable demo behavior.

Do not implement APS, scoring, automatic dispatch, AI allocation, optimization, maintenance planning, OEE, or predictive maintenance.

1. Current architecture that must remain unchanged

The implementation must preserve the following domain ownership.

Machine Definition

The Machine Definition owns catalog-level data such as:

generated business code;
localized name;
Site;
optional Work Center context according to the current API;
machine category or equipment type;
manufacturer;
model;
description;
expected unit count;
default efficiency;
catalog lifecycle;
planning policy;
reusable resource skills.

A Machine Definition is not a physical machine.

It must not own:

aggregate serial number;
physical execution state;
physical assignment;
runtime reservation;
Work Order allocation;
authoritative physical availability.
Physical Machine Unit

A Physical Machine Unit represents exactly one identifiable machine.

It owns:

Machine Definition reference;
asset code;
serial number;
identification status;
lifecycle status;
execution status;
planning eligibility;
current effective assignment context;
historical assignment context.

A unit without valid physical identity must not be assignable, reservable, allocated, or executable.

Machine Requirement

A Machine Requirement answers:

What type and quantity of machine does this Workstation require?

It does not prove that a physical machine is assigned.

Resource Assignment

A Resource Assignment answers:

Which exact machine resource is currently assigned to this Workstation?

The effective relationship must remain authoritative in the current Resource Assignment model.

Assignment history must be preserved through effectivity.

Do not overwrite historical assignment rows when ending or moving an assignment.

Machine Readiness

Machine Readiness is a current master-data readiness result.

It may report:

Ready;
Warning;
Blocked.

It must explain:

required quantity;
assigned quantity;
available quantity;
blocking reasons;
warning reasons.

It is not a Work Order allocation or APS result.

2. Inspect before implementation

Before modifying code, inspect and document the current implementation of:

root package.json;
workspace package scripts;
MES Console package;
current frontend test framework;
existing Playwright, Cypress, Vitest, Jest, or other test dependencies;
Keycloak authentication flow;
Kong-exposed MES routes;
Machine list route;
Machine create/edit route;
Machine detail route;
Physical Machine Unit panel;
Workstation create/edit/detail routes;
Resource Assignment route;
Machine Readiness UI;
machine cleanup, reset, seed, and verification scripts;
current stable demo Site, Work Center, Workstation, Shift, and Machine fixtures;
existing data-testid conventions;
CI configuration;
Docker Compose service URLs;
current API error structures;
i18n keys for VI, EN, JA, and KO.

Produce an inspection summary before implementation.

The summary must identify:

what already exists;
what can be reused;
what is missing;
what is inconsistent;
what requires additive implementation;
what must not be duplicated.

Do not introduce Playwright if a complete maintained browser E2E framework already exists unless there is a clear reason and the repository conventions support it.

If no suitable Browser E2E framework exists, use Playwright.

3. Browser E2E scope

Implement Browser E2E verification for the Machine domain only.

The Machine suite must prove the following end-to-end flow:

Authenticate
  -> Open Machine list
  -> Create Machine Definition
  -> Refresh and verify persistence
  -> Open Machine detail
  -> Add identified Physical Machine Unit
  -> Refresh and verify persistence
  -> Reject duplicate serial number
  -> Configure Workstation Machine Requirement
  -> Create effective Resource Assignment
  -> Verify assigned unit on Workstation detail
  -> Verify Machine Readiness becomes Ready
  -> End or replace assignment
  -> Verify historical assignment remains visible
  -> Verify Machine Readiness becomes Blocked
  -> Verify referenced unit cannot be physically deleted
  -> Verify deactivation remains the valid alternative
  -> Clean only the current E2E fixture

Do not include Work Order candidate resolution or Work Order Resource Allocation in the Machine suite.

Those belong to a future Resource Planning suite.

4. Recommended test structure

Use the repository conventions where available.

If Playwright is introduced, use a structure similar to:

e2e/
  auth/
    auth.setup.ts

  fixtures/
    machine-test-data.ts
    mes-api.fixture.ts
    authenticated-page.fixture.ts

  pages/
    MachineListPage.ts
    MachineFormPage.ts
    MachineDetailPage.ts
    WorkstationPage.ts
    ResourceAssignmentPage.ts

  machine/
    machine-definition.spec.ts
    machine-unit.spec.ts
    machine-assignment.spec.ts
    machine-readiness.spec.ts
    machine-dependency-protection.spec.ts
    machine-flow.spec.ts

  utils/
    api-client.ts
    test-run-id.ts
    cleanup.ts
    assertions.ts

Do not create unnecessary abstraction.

Use Page Objects only for stable repeated browser interactions.

Business assertions should remain visible in the spec where practical.

5. Authentication

The platform uses the current configured SSO and Keycloak authentication.

Do not create a second login mechanism.

Implement authentication setup using the current login behavior.

Preferred behavior:

Run authentication setup once
  -> store browser authentication state
  -> reuse state across Machine tests

Requirements:

credentials come only from environment variables;
do not hardcode username or password;
do not commit authentication state;
add authentication state paths to .gitignore;
fail with a clear message when required credentials are absent;
support local and CI execution;
preserve current Keycloak redirect behavior;
do not bypass authorization unless the repository already has an approved test-only mechanism.

Suggested environment variables:

MES_E2E_BASE_URL
MES_E2E_USERNAME
MES_E2E_PASSWORD
MES_E2E_SITE_CODE
MES_E2E_WORK_CENTER_CODE
MES_E2E_WORKSTATION_CODE

Reuse existing environment naming when equivalent variables already exist.

6. Stable selectors

Audit the Machine UI and add stable selectors only where needed.

Prefer, in this order:

accessible role;
accessible label;
localized business identity;
stable data-testid.

Do not use fragile selectors based on:

DOM depth;
generated class names;
nth-child;
Tailwind classes;
translated button text alone where multiple languages make it unstable;
internal UUID values.

Add stable selectors for controls that are otherwise difficult to target.

Recommended selector contract:

machine-list
machine-create-button
machine-form
machine-name-input
machine-site-select
machine-work-center-select
machine-type-select
machine-save-button

machine-detail
machine-unit-list
machine-unit-add-button
machine-unit-form
machine-unit-asset-code-input
machine-unit-serial-input
machine-unit-execution-status
machine-unit-planning-eligible
machine-unit-save-button
machine-unit-card

workstation-machine-requirement-list
workstation-machine-requirement-add-button
workstation-machine-requirement-group
workstation-machine-requirement-save-button

resource-assignment-form
resource-assignment-machine-select
resource-assignment-unit-select
resource-assignment-effective-from
resource-assignment-save-button

machine-readiness-status
machine-readiness-reason-list
machine-assignment-history

Reuse existing test IDs when they already express the same meaning.

Do not create duplicate selector names for the same control.

7. Test data isolation

Every test run must use a unique run identifier.

Example namespace:

E2E-MACHINE-<timestamp>-<random>

Use this identifier for:

display names;
optional descriptions;
asset codes;
serial numbers;
requirement group names;
any test-owned business key where the backend permits client input.

Never reuse fixed values such as:

SERIAL-001
ASSET-001
TEST-MACHINE

because repeated runs will conflict.

Test-owned data must be identifiable and removable without affecting:

Won Seal Tech demo fixture;
unrelated Machine Definitions;
unrelated Machine Units;
Work Orders;
execution history;
audit history;
Print Stations;
printers;
production-like data.
8. Setup strategy

Use a hybrid setup strategy.

Browser-owned behavior

Perform through the UI when the purpose of the test is to verify that UI flow.

Examples:

create Machine Definition;
add Physical Machine Unit;
configure Machine Requirement;
create Resource Assignment;
inspect readiness;
attempt delete or deactivate.
API-owned prerequisites

Use APIs for prerequisites that are not the subject of the test.

Examples:

locating an existing Site;
locating an existing released Work Center;
locating an existing released Workstation;
resolving current fixture IDs;
reading the created Machine record after save;
cleanup.

Do not create a complete Site/Shopfloor/Work Center hierarchy through the browser for every Machine test.

Reuse a verified demo hierarchy.

9. Cleanup requirements

Cleanup must be safe, scoped, repeatable, and dependency-aware.

Implement cleanup using one of these approaches, in preferred order:

existing test-fixture cleanup API;
existing machine reset/cleanup script with an E2E namespace filter;
a new test-only cleanup API or script.

Cleanup must:

operate only on the current E2E run ID;
remove child rows before parent rows;
end or delete assignments according to current business rules;
remove disposable requirements created by the test;
remove disposable Machine Units;
remove disposable Machine Definitions;
verify that no E2E-owned orphan remains;
refuse unsafe environments;
never delete unrelated WST-* demo data;
never delete Work Orders or execution history;
print clear cleanup results.

If a record cannot be physically deleted due to intentionally created history, the test must clean it through the approved disposable-fixture path rather than weakening the production delete policy.

Do not add an unrestricted public cleanup endpoint.

Any test-only cleanup API must be:

disabled outside test/development environments;
guarded by an explicit environment flag;
limited to the E2E namespace;
unavailable through normal production routing.
10. Required Browser E2E test cases
Test A — Machine Definition creation and persistence

Verify:

Open Machine list
  -> Create
  -> fill valid catalog fields
  -> Save
  -> success feedback appears
  -> created record appears in list
  -> refresh browser
  -> record remains visible
  -> generated business code is visible
  -> internal UUID is not used as the primary label

Also verify that entering Create after previously editing a record starts with a clean form.

Test B — Physical Machine Unit registration

Verify:

Open Machine detail
  -> Add physical unit
  -> enter unique asset code
  -> enter unique serial number
  -> set valid lifecycle
  -> set Available execution status
  -> enable planning eligibility
  -> Save
  -> unit appears in the unit panel
  -> refresh
  -> unit remains visible

Verify that:

serial belongs to the unit, not the Machine Definition;
asset code is displayed;
identified status is displayed;
planning eligibility is displayed;
current assignment context is initially empty.
Test C — Duplicate serial protection

Create a second Physical Machine Unit using the same serial number.

Verify:

save is rejected;
no duplicate row appears;
translated validation summary is displayed;
structured backend error detail is available when provided;
the error is not rendered as a raw key or [object Object];
the first valid unit remains unchanged.
Test D — Workstation Machine Requirement

Using an existing valid Workstation:

Open Workstation edit
  -> Add Machine Requirement Group
  -> select created Machine Definition
  -> role = Primary
  -> requirement type = Required
  -> required quantity = 1
  -> Save
  -> refresh
  -> requirement remains visible

Verify that the UI does not label this requirement as an assigned machine.

Test E — Resource Assignment

Create an effective assignment from the created Physical Machine Unit to the selected Workstation.

Verify:

Site, Work Center, Workstation, Machine Definition, and Machine Unit are mutually compatible;
the exact unit is selectable;
save succeeds;
current assignment is visible;
Workstation detail displays the exact unit;
Machine detail displays assignment context;
assignment effective dates are visible.
Test F — Ready state

After the requirement and effective assignment exist, verify:

required quantity = 1
assigned quantity = 1
available quantity >= 1
status = Ready

Verify that no raw backend readiness code is displayed.

Test G — Assignment history and Blocked state

End or replace the current assignment according to the existing API policy.

Verify:

historical assignment remains visible;
the old row is not silently overwritten;
the assignment is no longer current;
readiness changes from Ready to Blocked;
blocking reason explains the missing effective assignment or unsatisfied requirement.
Test H — Dependency-aware deletion

Create the history required by the current domain and attempt to delete the Physical Machine Unit.

Verify one of the current valid UI behaviors:

Delete action is hidden or disabled after dependency impact is loaded; or
Delete action opens confirmation and the backend rejects deletion.

Verify:

translated dependency error is shown;
deactivation is offered as the valid alternative;
no destructive action executes from the first icon click;
the historical unit remains available for audit.
Test I — Form cache and refresh behavior

Verify:

list refreshes after create;
Machine detail refreshes after adding a unit;
Workstation detail refreshes after requirement save;
readiness refreshes after assignment create/end;
reopening a modal uses current backend data;
Create after Edit does not retain previous record state;
no manual browser refresh is required for normal save flows.
Test J — Pagination and empty state

Verify the current list and Physical Machine Unit panel behavior:

default page size is 10 where the shared contract applies;
supported page sizes appear according to the current Base component;
empty state is meaningful;
loading state is visible while data is fetched;
pagination does not duplicate or lose cards;
unit count summaries remain correct.
11. Demo polishing requirements

Demo polishing must improve presentation and stability without redesigning the domain.

Machine list

Ensure that the Machine list shows:

localized Machine name as primary identity;
generated business code as secondary identity;
Site;
catalog lifecycle;
expected unit count;
total physical unit count;
identified count;
pending-identification count;
assigned count;
available count;
maintenance count where supported;
out-of-service count where supported;
planning-eligible count.

Do not display aggregate expected quantity as the number of identified physical units.

Do not show raw UUIDs.

Do not imply that zero available units means the Machine Definition is empty.

Add or improve:

search;
lifecycle filter;
machine category filter;
Site filter where useful;
clear empty state;
loading skeleton;
translated status badges;
dependency-aware actions;
consistent row/card actions.
Machine create/edit form

Ensure:

Create always starts clean;
Edit loads current backend data;
code is read-only and backend-owned;
Site is actually mapped to the payload;
fields are grouped clearly into catalog information and planning policy;
serial number and execution state are absent from Machine Definition;
validation messages explain business impact;
submit is blocked while required dependent options are loading;
save success refreshes the list and detail views;
cancel does not persist unsaved state.
Machine detail

Provide a clear hierarchy:

Machine Definition summary
  -> Physical Machine Units
  -> Requirement usage
  -> Current Assignments
  -> Readiness summary
  -> Capabilities
  -> Calendars
  -> Dependency impact

Only show sections supported by current APIs.

Do not invent missing fields.

Add meaningful empty states such as:

No physical machine units registered.
Add a physical unit before this Machine Definition can provide assignable capacity.
Physical Machine Unit cards

Each card should clearly display:

asset code;
serial number;
identification status;
lifecycle;
execution status;
planning eligibility;
current Work Center;
current Workstation;
assignment role;
assignment effectivity.

The unit card must distinguish:

Identified
Pending Identification
Available
Maintenance
Out of Service
Planning Eligible
Not Planning Eligible
Assigned
Unassigned

using translated badges.

Workstation detail

Clearly separate:

Machine Requirements
Assigned Machines
Machine Readiness
Assignment History

Do not merge these concepts into one table.

Readiness must show:

status;
required quantity;
assigned quantity;
available quantity;
blocking reasons;
warnings.
User feedback

Every mutation must have:

loading state;
disabled duplicate submission;
translated success toast;
translated error toast;
structured error details when available;
current data refresh after success.

Do not use browser alert() or confirm().

Use the shared confirmation and error-detail components.

i18n

Register all new or missing labels, statuses, test-visible messages, warnings, empty states, and backend error keys for:

Vietnamese;
English;
Japanese;
Korean.

Vietnamese remains the default language.

No raw enum or untranslated key may appear during the Machine demo flow.

Demo data

Review the Won Seal Tech Machine fixture.

Ensure that demo data contains realistic and distinguishable categories such as:

material mixing machines;
cutting machines;
hydraulic presses;
compression molding machines;
trimming machines;
inspection equipment;
measurement equipment;
curing or heating equipment where applicable;
obsolete or inactive catalog examples;
identified and pending-identification units;
available, assigned, maintenance, and out-of-service examples.

Printer devices remain owned by Print Station and must not be duplicated in the Machine fixture.

Names, asset codes, serial numbers, categories, and assignments must be realistic enough for a manufacturing demo.

Do not create meaningless names such as:

Machine 1
Machine 2
Test Equipment
Example Unit
12. Playwright configuration

If Playwright is the selected framework, implement a production-quality configuration.

Requirements:

Chromium is sufficient for the current MVP;
browser tests run serially or with controlled workers when they share a demo database;
retries are enabled only in CI;
screenshots are retained on failure;
video is retained on failure;
traces are retained on failure;
HTML report is generated;
output folders are gitignored;
base URL is environment-controlled;
authentication state is reused;
action and navigation timeouts are explicit;
no arbitrary waitForTimeout() calls;
use locator assertions and network-aware waits;
tests produce readable test.step() output.

Do not hide flaky behavior by adding long sleep statements.

13. Package scripts

Audit root scripts before modifying them.

Do not remove scripts referenced by:

CI;
Docker;
workspace builds;
deployment;
documentation;
other maintained automation.

Add maintained entry points similar to:

{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:machine": "playwright test e2e/machine --project=chromium",
    "test:e2e:machine:headed": "playwright test e2e/machine --project=chromium --headed",
    "test:e2e:machine:debug": "playwright test e2e/machine --project=chromium --debug",
    "test:e2e:machine:report": "playwright show-report",
    "demo:machine:prepare": "<safe machine reset and verification command>",
    "demo:machine:verify": "<machine seed verification plus browser E2E command>"
  }
}

Reuse the current maintained commands:

machines:reset
machines:verify
test:mes:machine-flow

when they already exist and are correct.

Do not create duplicate scripts with slightly different names and identical behavior.

A preferred demo command flow is:

ALLOW_DESTRUCTIVE_SEED=true npm run machines:reset
npm run machines:verify
npm run test:e2e:machine

Optionally provide one orchestration script that calls these maintained commands in order, but do not duplicate their implementation.

14. Environment and safety

The Browser E2E suite must refuse unsafe targets.

Before mutation, verify:

base URL is configured;
target environment is not production;
required E2E credentials exist;
current Site and Workstation fixtures exist;
the test namespace is enabled;
destructive cleanup is explicitly allowed when required.

Suggested explicit guard:

ALLOW_E2E_MUTATION=true

Do not rely only on a URL substring such as localhost.

Use the current environment conventions where a stronger guard already exists.

Print the selected:

base URL;
Site;
Work Center;
Workstation;
test run ID;

before mutation, without printing secrets.

15. Reporting

Every test must use readable steps.

Example:

[START] Authenticate MES user
[PASS] Authentication state created

[START] Create Machine Definition
[PASS] Machine Definition persisted after browser refresh

[START] Register Physical Machine Unit
[PASS] Identified unit visible after refresh

[START] Verify duplicate serial rejection
[PASS] Duplicate serial rejected with translated error

[START] Assign Machine Unit to Workstation
[PASS] Effective assignment visible

[START] Verify readiness
[PASS] Workstation readiness is Ready

[START] End assignment
[PASS] History preserved and readiness became Blocked

[START] Verify dependency-aware delete
[PASS] Referenced unit cannot be physically deleted

At the end, print a summary containing:

total tests;
passed;
failed;
skipped;
run ID;
browser;
base URL;
report directory;
trace directory when failures exist;
cleanup result.

Do not claim success when cleanup or a required assertion failed.

16. Documentation

Create or update:

docs/testing/mes-machine-browser-e2e.md

Document:

purpose;
scope;
architecture under test;
prerequisites;
environment variables;
authentication;
local execution;
headed mode;
debug mode;
report viewing;
seed preparation;
cleanup behavior;
CI behavior;
troubleshooting;
expected demo flow;
what is intentionally excluded.

Also update the canonical implementation roadmap document so that Machine Flow becomes:

Machine Flow | Completed | 100%

only after all mandatory Browser E2E tests pass.

Do not mark Machine Flow complete merely because the test files exist.

17. Verification commands

Run and report the actual result of all applicable commands.

At minimum:

npm run machines:verify
npm run test:mes:machine-flow
npm run test:e2e:machine
npm run typecheck
npm run build

If the repository uses workspace-specific commands, run the correct current equivalents.

Also run the demo preparation flow in a safe development environment:

ALLOW_DESTRUCTIVE_SEED=true npm run machines:reset
npm run machines:verify
ALLOW_E2E_MUTATION=true npm run test:e2e:machine

Do not claim browser verification if the browser suite was not actually executed.

If Keycloak, Kong, MES Console, master-data service, or required infrastructure is unavailable, report exactly what was blocked.

18. Acceptance criteria

The task is complete only when all conditions below are satisfied.

Architecture
Machine Definition and Physical Machine Unit remain separate.
Requirements and assignments remain separate.
Resource Assignment remains authoritative.
Assignment history is preserved.
No competing machine-ID list is added to Workstation.
No Work Order allocation logic is incorrectly moved into Machine master data.
Browser E2E
Authentication works through current SSO.
Machine Definition can be created and persists after refresh.
Physical Machine Unit can be created and persists after refresh.
Duplicate serial is rejected.
Workstation Machine Requirement can be created.
Exact Physical Machine Unit can be assigned.
Workstation readiness becomes Ready.
Ending the assignment preserves history.
Readiness becomes Blocked.
Referenced unit cannot be physically deleted.
Cleanup is safe and successful.
Demo polishing
Machine list is clear and translated.
Create/Edit forms do not retain stale state.
Physical Unit cards clearly display identity and status.
Requirement, assignment, readiness, and history are visually separated.
Mutations refresh current data automatically.
Error messages explain business consequences.
No raw UUID, enum, key, or [object Object] appears.
Seed data is realistic and internally consistent.
Loading, empty, error, and confirmation states are polished.
Operational
root scripts are maintained and documented;
reports, screenshots, traces, and videos are generated correctly;
credentials and authentication state are not committed;
tests run repeatedly without duplicate-data conflicts;
cleanup affects only the current E2E fixture;
typecheck and build pass.
19. Required final implementation report

After implementation, provide a report with these sections:

Inspection summary
existing framework;
reused utilities;
relevant routes;
relevant APIs;
discovered gaps.
Files changed

List every created, updated, or removed file and explain why.

Browser E2E coverage

List every implemented test and its verified behavior.

Demo polishing

List every UI, i18n, seed, error-handling, loading, or navigation improvement.

Package scripts

List the final supported commands and their purpose.

Verification results

Report the real result of:

machine seed verification;
existing Machine flow verification;
Browser E2E;
typecheck;
build;
cleanup.
Remaining limitations

Clearly identify anything not verified due to unavailable infrastructure or current API limitations.

Final status

Use one of:

Machine Flow Browser E2E: COMPLETE
Machine Flow Browser E2E: PARTIALLY COMPLETE
Machine Flow Browser E2E: BLOCKED

Do not report COMPLETE unless the mandatory browser flow has run successfully against the current environment.