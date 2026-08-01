# Enterprise MES Browser E2E Audit & Coverage Expansion

## Objective

Perform a complete audit of the existing Browser E2E suites for both **Machine Flow** and **Resource Planning**.

Do not assume the current implementation is complete simply because tests pass.

Your goal is to verify business coverage, identify missing scenarios, implement all missing Browser E2E tests, execute them, and produce a complete enterprise-grade E2E suite.

The objective is **business use case coverage**, not simply increasing the number of Playwright tests.

---

# Overall Principles

Before changing any code:

1. Inspect the existing implementation.
2. Understand the domain model.
3. Understand the ownership boundaries.
4. Build a complete business use-case inventory.
5. Compare existing E2E coverage against the inventory.
6. Implement missing tests.
7. Execute all Browser E2E.
8. Produce coverage reports.

Never redesign the business architecture.

Never change ownership boundaries.

Never bypass existing APIs.

Never replace Browser E2E with API-only verification.

---

# Step 1 — Audit Current E2E Suite

Inspect the repository.

Audit:

- Playwright configuration
- test folders
- fixtures
- authentication
- cleanup helpers
- selectors
- page objects
- helper utilities
- package scripts
- CI integration

Inspect all current tests under:

```text
e2e/
```

Generate:

```
implementation-fix/e2e-audit-20260731.md
```

The report must contain:

- Current folder structure
- Existing test count
- Existing browser coverage
- Missing browser coverage
- Duplicate tests
- Placeholder tests
- Skipped tests
- TODO tests
- Weak assertions
- Missing cleanup
- Missing validation
- Missing concurrency verification
- Missing authorization verification

---

# Step 2 — Build Business Use Case Inventory

Do NOT immediately implement tests.

Instead, build a complete business inventory.

Create:

```
docs/testing/browser-e2e-usecase-inventory.md
```

For every business use case include:

- ID
- Domain
- Description
- Preconditions
- Browser flow
- Expected result
- Validation
- Edge cases
- Current implementation status

Use this status:

```
Implemented
Missing
Partially Implemented
Not Applicable
```

---

# Step 3 — Machine Flow Browser E2E Inventory

Create the complete Machine Flow inventory.

Minimum domains:

```
Machine Definition
```

- Create
- Edit
- Delete
- Deactivate
- Duplicate code
- Duplicate name
- Invalid data
- Required fields
- Search
- Filter
- Pagination
- Sorting

---

```
Physical Machine Unit
```

- Create
- Edit
- Delete
- Duplicate serial
- Duplicate asset
- Planning eligibility
- Status transitions
- Maintenance
- Out of service

---

```
Machine Assignment
```

- Assign
- End assignment
- Overlapping assignment
- Missing assignment
- Invalid workstation
- Invalid effective period

---

```
Machine Requirement
```

- Create
- Edit
- Delete
- Required quantity
- Wrong Machine Definition
- Duplicate requirement

---

```
Readiness
```

- Ready
- Blocked
- Missing requirement
- Missing assignment
- Missing planning eligible unit
- Maintenance unit
- Out-of-service unit

---

```
Deletion Protection
```

- Referenced Machine
- Referenced Unit
- Assignment history
- Soft delete
- Hard delete protection

---

```
Browser UI
```

- Loading
- Empty state
- Error state
- Refresh persistence
- Toast messages
- Validation rendering

---

# Step 4 — Resource Planning Browser E2E Inventory

Create the complete Resource Planning inventory.

Minimum domains:

---

## Work Order

- Create
- Edit
- Delete
- Duplicate submit
- Invalid quantity
- Invalid Production Version
- Invalid Shift
- Invalid date
- Numbering uniqueness
- Concurrent numbering

---

## Candidate Resolution

- Ready candidate
- Blocked candidate
- No candidate
- Wrong Work Center
- Inactive Workstation
- Missing Workstation
- Missing Calendar
- Missing Shift
- Missing Machine Requirement

---

## Machine Readiness

- Fully Ready
- Missing assignment
- Maintenance
- Out of service
- Non planning eligible
- Pending identification
- Wrong Machine Definition
- Wrong quantity

---

## Allocation

- Validate
- Commit
- Cancel
- Replan
- Refresh persistence
- Logout/Login persistence
- Snapshot persistence
- Snapshot integrity

---

## Capacity

- No overlap
- Full overlap
- Partial overlap
- Boundary overlap
- Released capacity
- Capacity conflict

---

## Concurrency

- Simultaneous commit
- Stale readiness
- Stale assignment
- Stale workstation
- Stale candidate
- Lost update

---

## Execution

- Execution uses committed snapshot
- Execution blocked without allocation
- Cancelled allocation cannot execute

---

## Authorization

Planner

Viewer

Operator

Admin

Cross-site access

Role changes

---

## Browser UI

Loading

Empty

Blocked

Validation

Translated errors

Refresh

Search

Filter

Pagination

Sorting

---

## Cleanup

Exact ID cleanup

Retry cleanup

Shared fixture restore

No orphan allocations

No orphan snapshots

---

# Step 5 — Build E2E Folder Structure

Refactor the Browser E2E suite into:

```text
e2e/

    common/
        auth/
        fixtures/
        pages/
        helpers/
        cleanup/
        api/
        selectors/

    machine/

        definition/
        unit/
        assignment/
        requirement/
        readiness/
        deletion/
        ui/

    resource-planning/

        work-order/
        candidate/
        readiness/
        allocation/
        capacity/
        concurrency/
        execution/
        authorization/
        ui/
        cleanup/

    regression/

        smoke/
        full/
```

Every folder should contain focused specs.

Do not create a single monolithic spec.

---

# Step 6 — Implement Missing Browser E2E

Implement every missing Browser E2E case.

Rules:

- Use real browser interaction.
- Use existing APIs only for setup and cleanup.
- Never bypass UI for business actions.
- Verify UI.
- Verify API response.
- Verify database state when required.
- Verify cleanup.

Every Browser E2E must include:

Preconditions

Browser actions

Assertions

Database verification (where applicable)

Cleanup

---

# Step 7 — Browser Validation Rules

Every Browser E2E must validate:

UI

Backend

Persistence

Database

Cleanup

No test should only click buttons.

Assertions must verify business behavior.

---

# Step 8 — Browser Cleanup

Cleanup must:

- use exact IDs
- remove allocations
- remove snapshots
- remove Work Orders
- remove Machine Units
- restore shared fixtures

Cleanup failure must fail the test.

---

# Step 9 — Browser Coverage Matrix

Generate:

```
docs/testing/browser-e2e-coverage-matrix.md
```

Columns:

| Domain | Use Case ID | Description | Implemented | Executed | Passed | Failed | Skipped | Coverage |

Calculate:

Coverage per domain

Coverage overall

Do NOT count skipped tests as covered.

---

# Step 10 — Package Scripts

Organize scripts:

```json
{
  "scripts": {
    "test:e2e:machine:smoke": "...",
    "test:e2e:machine:all": "...",
    "test:e2e:resource-planning:smoke": "...",
    "test:e2e:resource-planning:all": "...",
    "test:e2e:all": "...",
    "test:e2e:regression": "...",
    "test:e2e:report": "..."
  }
}
```

---

# Step 11 — Execute Complete Browser Suite

Run:

```
Machine Smoke

Machine Full

Resource Planning Smoke

Resource Planning Full

Regression Suite
```

Repair every failing test until the suite stabilizes.

Do not stop after the first failure.

---

# Step 12 — Generate Final Report

Generate:

```
implementation-fix/browser-e2e-final-report-20260731.md
```

Include:

- Audit summary
- Existing tests
- Newly implemented tests
- Machine coverage
- Resource Planning coverage
- Browser coverage percentage
- Remaining gaps
- Blockers
- Product defects discovered
- Product defects fixed
- Cleanup verification
- Execution summary

Final statistics:

```
Declared Tests

Executed Tests

Passed

Failed

Skipped

Coverage %
```

Do not report "Complete" unless every mandatory business use case has either:

- been implemented and executed successfully, or
- been explicitly marked Not Applicable with justification.

The goal is to produce an enterprise-grade Browser E2E suite that validates the complete Machine Flow and Resource Planning domains through real browser interactions, with measurable business coverage rather than a minimal smoke-test collection.