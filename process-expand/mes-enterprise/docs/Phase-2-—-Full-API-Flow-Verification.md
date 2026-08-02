# Phase 2 — Build and Execute the Full MES Resource Planning API Flow

Do not implement the two-line model yet.

## Objective

Create a deterministic end-to-end API verification flow proving that one Work Order can be created from a released Production Version and prepared with all required resources for approval and execution.

## Required flow

The automated API flow must:

1. Authenticate through the supported identity path.
2. Create or reuse deterministic released Site hierarchy.
3. Create or reuse Work Center and Workstation data.
4. Create Machine Definitions and Physical Machine Units.
5. Create Machine Requirements.
6. Create effective Resource Assignments.
7. Create Resource Calendars and Shifts.
8. Create Resource Capabilities where required.
9. Create Production Standards.
10. Create Item and Item Revision.
11. Create MBOM.
12. Create Routing and Routing Operations.
13. Create Production Version.
14. Release all required master data.
15. Create a Work Order from `production_version_id`.
16. Wait for asynchronous creation workflow completion.
17. Run Compute & Check.
18. Retrieve candidates for every operation.
19. Commit one Ready candidate for every required operation.
20. Refresh and verify committed snapshots.
21. Revalidate all allocations.
22. Approve the Work Order.
23. Start execution.
24. Verify allocation, reservation, audit and outbox persistence.
25. Clean up only the exact generated Work Order IDs and disposable fixtures.

## Required scenario matrix

Run:

- normal Ready flow;
- capacity conflict;
- stale assignment before commit;
- machine maintenance before approval;
- missing calendar;
- missing standard;
- cancellation and replan;
- execution start guard;
- idempotent replay;
- unauthorized user.

## Test artifact requirements

Write machine-readable test output and a Markdown report.

Create:

- `scripts/test-mes-resource-planning-full-flow.mjs` or extend the maintained equivalent;
- `mes-system/process-expand/mes-enterprise/ai-report/phase-2/mes-resource-planning-full-api-verification-YYYYMMDD.md`.

## Safety

- Refuse production-like environments.
- Require an explicit mutation guard.
- Use deterministic namespaces.
- Never delete unrelated rows.
- Cleanup must use exact IDs.
- Report zero remaining target rows after cleanup.

## Completion gate

This phase passes only when the complete API flow succeeds and all negative scenarios return the expected stable error categories.