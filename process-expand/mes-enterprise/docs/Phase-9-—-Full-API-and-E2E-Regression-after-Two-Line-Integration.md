# Phase 9 — Execute Full Two-Line API, Browser and Concurrency Regression

## Objective

Prove that the completed two-line implementation works end to end and did not regress existing one-line MES behavior.

## Required API scenarios

1. Primary line Ready.
2. Primary line full, backup Ready.
3. Primary machine under maintenance, backup Ready.
4. Primary calendar unavailable, backup Ready.
5. Primary missing required operation resource, backup Ready.
6. Both lines blocked.
7. Mixed-line allocation rejected.
8. Concurrent Work Orders compete for primary line capacity.
9. First Work Order consumes primary capacity; second falls back to backup.
10. Both lines reach capacity.
11. Replan before Release.
12. Audited line change after Release but before Start.
13. Line change after Start rejected.
14. Master-data eligibility changes do not rewrite existing WO snapshots.
15. New WO uses new eligibility.
16. Idempotent retry produces one Work Order and one selection decision.
17. Outbox redelivery does not duplicate downstream state.
18. Cleanup removes only generated data.

## Required browser scenarios

Mirror the important API scenarios through MES Console.

Verify:

- line selection state;
- candidate filtering;
- fallback message;
- allocation persistence;
- approval;
- execution guard;
- authorization;
- i18n;
- refresh persistence.

## Required concurrency scenarios

- two users select the same primary capacity;
- one succeeds and one receives conflict or valid fallback;
- no duplicate reservation;
- no mixed-line partial commit;
- serializable retry behavior is deterministic.

## Required regression

Run all maintained:

- machine tests;
- resource planning tests;
- Work Order tests;
- master-data tests;
- production-definition tests;
- browser E2E;
- concurrency;
- numbering;
- regression suite.

## Required report

Create:

`mes-system/process-expand/mes-enterprise/ai-report/phase-9/mes-two-line-full-regression-verification-YYYYMMDD.md`

The report must include exact commands and exact results.

## Completion gate

The phase passes only when:

- required API tests pass;
- required browser tests pass;
- no unexplained skip remains;
- database orphan checks pass;
- no mixed-line allocation is possible;
- previous one-line use cases still pass.