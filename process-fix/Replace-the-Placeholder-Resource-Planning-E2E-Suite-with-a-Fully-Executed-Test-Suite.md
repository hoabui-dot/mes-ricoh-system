# Replace the Placeholder Resource Planning E2E Suite with a Fully Executed Test Suite

## Current verified state

The current Playwright execution reports:

```text
Running 4 tests using 1 worker

PASS [@smoke] [@full]
creates a Work Order and commits every Ready resource candidate through the Console

PASS [@validation]
blocks an invalid Work Order quantity before submit

SKIPPED [@concurrency]
protects a simultaneous commit with a database barrier

SKIPPED [@authorization]
denies a viewer commit

The suite currently declares four tests, but only two tests actually execute.

Therefore, the current accurate status is:

Resource Planning Smoke E2E: PASS
Resource Planning Full Browser E2E: PARTIALLY COMPLETE

Do not report the full suite as complete.

Your task is to inspect why the concurrency and authorization tests are skipped, implement the missing tests, and expand the suite into a genuinely complete Resource Planning E2E suite.

Do not stop after changing test names or removing test.skip.

A test counts as implemented only when it performs real setup, browser/API actions, assertions, backend or database validation where required, cleanup, and has actually executed.

1. Inspect the current suite

Inspect:

e2e/resource-planning/resource-planning-flow.spec.ts

Pay special attention to the tests around the current concurrency and authorization line numbers.

Identify all uses of:

test.skip
test.fixme
test.fail
describe.skip
conditional test.skip()
environment-gated placeholders
empty test bodies
TODO-only test bodies

Inspect:

Playwright configuration;
Resource Planning fixtures;
API clients;
exact-ID cleanup helper;
database helper;
authentication setup;
available Keycloak test users;
current environment variables;
capacity-conflict API behavior;
idempotency support;
allocation database schema;
authorization policies.

Create an inspection section in:

implementation-fix/resource-planning-full-e2e-improvement-20260731.md

Report:

why each test is skipped;
what prerequisite is missing;
whether the missing prerequisite can be implemented automatically;
whether credentials or infrastructure are genuinely unavailable;
which tests are placeholders rather than real implementations.
2. Correct test reporting

At the end of every run, report:

Declared:
Executed:
Passed:
Failed:
Skipped:
Cleanup passed:

Do not count skipped tests as passed.

Use the following status rules:

COMPLETE:
All mandatory applicable tests executed and passed.
No mandatory test remains skipped.

PARTIALLY COMPLETE:
Some mandatory tests are skipped or not implemented.

BLOCKED:
A real external blocker prevents meaningful continuation.
3. Implement the concurrency test

Replace the skipped concurrency placeholder with a real test:

RP-E2E-063 — Two simultaneous commits compete for the same exclusive Machine Unit
Preconditions

Create two disposable Work Orders whose overlapping operation windows resolve to the same Ready Workstation and the same exclusive Physical Machine Unit.

Both Work Orders must independently observe the resource as Ready before either commit is sent.

Required flow
Create WO-A
Create WO-B
Compute candidates for both
Verify both initially observe the same resource as Ready
Prepare valid allocation payloads
Pause both commit clients at a synchronization barrier
Release both commits at the same time
Capture both responses
Refresh both browser views
Query active allocations
Required assertions

Exactly one commit must succeed.

The other must receive the current controlled conflict response, such as:

RESOURCE_CAPACITY_CONFLICT
RESOURCE_ALREADY_ALLOCATED
STALE_RESOURCE_READINESS

Use the actual authoritative error code.

Verify:

one and only one active allocation exists for the exclusive Machine Unit and overlapping window;
no duplicate Machine Unit snapshot exists;
the successful Work Order shows Committed;
the rejected Work Order shows a translated conflict message;
the rejected Work Order has no committed allocation;
existing allocation remains unchanged;
cleanup removes both Work Orders using exact IDs.
Real concurrency requirement

Do not implement this test using two sequential commit requests.

Use:

two independent API request contexts; or
two browser contexts; or
two database transactions;

and synchronize them using a real barrier.

A recommended pattern is:

await Promise.allSettled([
  commitClientA.commit(allocationA),
  commitClientB.commit(allocationB),
]);

Ensure both requests start only after both clients have reached the barrier.

Verify database state after both promises settle.

4. Implement the authorization test

Replace the skipped authorization placeholder with a real test:

RP-E2E-101 — Viewer cannot commit Resource Allocation

Use dedicated environment variables:

MES_E2E_VIEWER_USERNAME
MES_E2E_VIEWER_PASSWORD

Reuse current names when equivalent variables already exist.

Required browser flow
Login as Viewer
Open an existing disposable Work Order
Open Resource Planning
Inspect a Ready candidate
Attempt to locate planning mutation controls
Required browser assertions

According to the current permission policy:

Resource Planning may remain readable;
Commit action must be hidden or disabled;
Cancel/Replan actions must be hidden or disabled;
no mutation request should be sent from normal UI interaction;
no misleading success toast appears.
Required API assertion

Attempt the commit endpoint directly using the viewer authentication context.

Expect:

HTTP 403

or the authoritative access-denied status.

Verify:

no allocation was created;
no Machine Unit snapshot was created;
no Work Order state changed;
the error is translated correctly when displayed in the UI.
Missing credentials

If viewer credentials genuinely do not exist, do not fake this test.

Keep it explicitly skipped with the exact reason:

SKIPPED:
MES_E2E_VIEWER_USERNAME and MES_E2E_VIEWER_PASSWORD are not configured.

Also create a blocker or limitation entry identifying the exact Keycloak realm role and account that must be provisioned.

Do not report the authorization suite as passed.

5. Expand beyond four tests

The current four-test suite is not a complete Resource Planning E2E suite.

Implement at minimum the following mandatory cases.

Work Order
RP-E2E-001 Create Work Order from Released Production Version
RP-E2E-003 Reject zero, negative, empty, and invalid quantity
RP-E2E-005 Prevent double-submit duplication
RP-E2E-130 Sequential Work Order business-code uniqueness
RP-E2E-131 Concurrent Work Order business-code uniqueness
Candidate resolution
RP-E2E-010 Display Ready and Blocked candidates
RP-E2E-011 Meaningful empty state when no Workstations exist
RP-E2E-012 Inactive Workstation is not allocatable
RP-E2E-014 Missing Work Center blocks candidate resolution
RP-E2E-015 Workstation from another Work Center is rejected
Machine requirements
RP-E2E-020 Fully satisfied requirement is Ready
RP-E2E-021 Missing effective assignment is Blocked
RP-E2E-022 Assigned quantity below required quantity is Blocked
RP-E2E-025 Pending-identification unit is not selectable
RP-E2E-026 Non-planning-eligible unit is not selectable
RP-E2E-027 Maintenance unit is not selectable
RP-E2E-028 Out-of-service unit is not selectable
RP-E2E-030 Duplicate Machine Unit IDs are rejected
RP-E2E-031 Wrong Machine Definition unit is rejected
Allocation
RP-E2E-040 Validate selection without committing
RP-E2E-041 Commit allocation
RP-E2E-043 Reject insufficient selected units
RP-E2E-045 Direct commit of Blocked candidate is rejected
RP-E2E-046 Persist allocation after browser refresh
RP-E2E-047 Persist allocation after logout/login
Idempotency
RP-E2E-050 Replay same idempotency key without duplication
RP-E2E-051 Double-click Commit creates one allocation only
RP-E2E-052 Same idempotency key with different payload is rejected
RP-E2E-053 Recommit does not silently overwrite snapshots
Stale state and concurrency
RP-E2E-060 Ready unit becomes Maintenance before commit
RP-E2E-061 Effective assignment ends before commit
RP-E2E-062 Two Work Orders compete for one Machine Unit
RP-E2E-063 Two simultaneous commit requests
RP-E2E-064 Workstation becomes inactive before commit
Capacity
RP-E2E-070 Non-conflicting capacity allocation succeeds
RP-E2E-071 Full-overlap allocation conflicts
RP-E2E-072 Boundary non-overlap does not falsely conflict
RP-E2E-073 Partial overlap conflicts
RP-E2E-074 Cancellation releases capacity
Cancellation and execution
RP-E2E-080 Cancel committed allocation
RP-E2E-082 Replan after cancellation
RP-E2E-083 Repeat cancellation is safe
RP-E2E-090 Execution uses committed resource snapshots
RP-E2E-091 Execution without allocation is blocked
RP-E2E-092 Cancelled allocation cannot start execution
Authorization
RP-E2E-100 Planner can commit
RP-E2E-101 Viewer cannot commit
RP-E2E-102 Operator cannot replan
RP-E2E-103 Cross-Site user cannot access resources
UI and cleanup
RP-E2E-110 Correct loading states
RP-E2E-111 Meaningful empty candidate state
RP-E2E-112 All-blocked state
RP-E2E-113 Structured error rendering
RP-E2E-114 No raw enum or error keys
RP-E2E-115 No raw UUID as primary identity
RP-E2E-117 Browser refresh recovery
RP-E2E-120 Exact-ID cleanup
RP-E2E-122 Cleanup retry is safe
RP-E2E-123 Cleanup refuses business-code-only deletion
6. Work Order numbering defect

A previous verification observed two different Work Order IDs with the same business code.

The suite must include:

RP-E2E-130 Sequential Work Order code uniqueness
RP-E2E-131 Concurrent Work Order code uniqueness
RP-E2E-132 Failed transaction does not reuse committed code

Do not make these tests pass by generating codes in the frontend.

Inspect:

database constraints;
sequence or counter table;
transaction boundaries;
MAX(code) + 1 behavior;
lock behavior;
retry behavior;
multi-instance behavior.

A valid fix must be atomic and database-backed.

If the test initially fails, report it as a real product defect.

7. Suite structure

Refactor the current monolithic spec into focused files:

e2e/resource-planning/
  smoke/
  work-order/
  candidates/
  machine-requirements/
  allocation/
  concurrency/
  capacity/
  execution/
  authorization/
  ui/
  cleanup/

Keep the current happy path as @smoke.

Do not label a single happy-path test as both the entire @full suite and full coverage.

The @full command should execute all applicable Resource Planning specs.

8. Package commands

Add or correct commands:

{
  "scripts": {
    "test:e2e:resource-planning:smoke": "playwright test e2e/resource-planning --grep @smoke --project=chromium",
    "test:e2e:resource-planning:validation": "playwright test e2e/resource-planning --grep @validation --project=chromium",
    "test:e2e:resource-planning:concurrency": "playwright test e2e/resource-planning --grep @concurrency --project=chromium",
    "test:e2e:resource-planning:authorization": "playwright test e2e/resource-planning --grep @authorization --project=chromium",
    "test:e2e:resource-planning:numbering": "playwright test e2e/resource-planning --grep @numbering --project=chromium",
    "test:e2e:resource-planning:all": "playwright test e2e/resource-planning --project=chromium"
  }
}

Do not use a @full tag on only one happy-path case.

9. Cleanup verification

The current cleanup output is:

{
  "success": true,
  "work_order_id": "<uuid>"
}

Improve cleanup reporting and assertions.

Return and verify:

{
  "success": true,
  "workOrderId": "<uuid>",
  "allocationsRemoved": 3,
  "machineSnapshotsRemoved": 3,
  "operationsRemoved": 3,
  "workOrderRemoved": true,
  "remainingActiveAllocations": 0,
  "sharedFixtureRestored": true
}

Use the authoritative actual counts.

Cleanup must always use exact IDs.

Never cleanup using the Work Order business code because duplicate codes have already been observed.

A cleanup failure must cause the test run to be reported as unsuccessful.

10. Required final test matrix

Create:

docs/testing/mes-resource-planning-e2e-matrix.md

Include:

Case ID	Description	Implemented	Executed	Passed	Failed	Skipped	Skip reason

Every declared use case must appear.

Do not mark placeholder or skipped tests as implemented and passed.

11. Execution and repair

Run:

npm run test:e2e:resource-planning:smoke
npm run test:e2e:resource-planning:validation
npm run test:e2e:resource-planning:concurrency
npm run test:e2e:resource-planning:authorization
npm run test:e2e:resource-planning:numbering
npm run test:e2e:resource-planning:all

Also run:

npm run test:mes:resource-planning-flow
npm run test:mes:machine-flow
npm run test:e2e:machine
go test ./...
npm run build --workspace=mes-console
npx tsc --noEmit -p services/mes-console/tsconfig.json
git diff --check

Repair product, test, selector, fixture, and cleanup defects where safe.

Do not stop after discovering the first failing case.

12. Final report

Update:

implementation-fix/resource-planning-full-e2e-improvement-20260731.md

Include:

Declared use cases:
Implemented tests:
Executed tests:
Passed:
Failed:
Skipped:
Missing credentials:
Product defects found:
Product defects fixed:
Cleanup result:

Use this final status:

Resource Planning Full Browser E2E: COMPLETE

only when all mandatory applicable tests execute and pass.

With the current output of two passed and two skipped tests, the correct status is:

Resource Planning Full Browser E2E: PARTIALLY COMPLETE