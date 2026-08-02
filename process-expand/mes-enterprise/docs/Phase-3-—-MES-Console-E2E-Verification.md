# Phase 3 — Complete MES Console Resource Planning Browser E2E Coverage

Do not implement Production Line UI in this phase.

## Objective

Extend the existing Playwright MES browser suite to prove the complete current Resource Planning workflow through the real MES Console.

## Required browser flow

The browser test must:

1. Login through real Keycloak.
2. Open MES Console.
3. Create a Work Order from a released Production Version.
4. Wait for asynchronous Work Order creation.
5. Open Work Order detail.
6. Run Compute & Check.
7. Inspect every operation.
8. Open candidate selection.
9. Verify Ready and Blocked candidate rendering.
10. Commit a valid candidate for every required operation.
11. Refresh the page.
12. Verify allocations remain Committed.
13. Revalidate allocations.
14. Approve the Work Order.
15. Start execution where supported.
16. Logout and login again.
17. Verify persisted state.
18. Clean up exact created Work Order IDs.

## Required browser scenarios

Add tests for:

- normal allocation;
- blocked candidate;
- capacity conflict;
- stale candidate;
- maintenance/out-of-service resource;
- allocation cancellation;
- reallocation;
- missing required allocation;
- unauthorized Viewer;
- unauthorized Operator;
- allowed Planner/Production Manager;
- browser refresh persistence;
- cross-site access denial;
- translated error rendering;
- no raw UUID or raw backend enum displayed.

## UI rules

- Backend state is authoritative.
- React must not calculate readiness independently.
- Do not convert Blocked to Ready in frontend code.
- Use existing Base components.
- Preserve stable selectors.
- Add new stable selectors only where necessary.

## Required output

Update the maintained E2E suite and create:

`mes-system/process-expand/mes-enterprise/ai-report/phase-3/mes-resource-planning-browser-e2e-verification-YYYYMMDD.md`

Include:

- declared tests;
- executed tests;
- passed;
- failed;
- skipped;
- exact skip reasons;
- screenshots/traces for failures;
- cleanup verification.

## Completion gate

No required test may remain skipped because of missing test implementation. Environment-dependent skips must be documented and separately resolved before the phase passes.