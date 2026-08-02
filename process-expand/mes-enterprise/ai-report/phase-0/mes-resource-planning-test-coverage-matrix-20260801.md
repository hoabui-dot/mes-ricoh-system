# MES Resource Planning Test Coverage Matrix

Date: 2026-08-01
Phase: 0
Status: IMPLEMENTED_NOT_FULLY_VERIFIED

## Test Sources Inspected

| Test/document | Purpose |
|---|---|
| `scripts/test-mes-resource-planning-flow.mjs` | Disposable API verification for current manual resource-planning flow. |
| `e2e/resource-planning/resource-planning-flow.spec.ts` | Browser smoke/validation/authorization declarations. |
| `e2e/resource-planning/concurrency/resource-planning-concurrency.spec.ts` | Browser/API concurrency scenario. |
| `e2e/resource-planning/work-order/numbering.spec.ts` | Browser/API sequential and concurrent WO numbering. |
| `docs/testing/mes-resource-planning-e2e-matrix.md` | Existing declared/executed matrix. |
| `docs/testing/browser-e2e-coverage-matrix.md` | Existing browser coverage matrix. |
| `scripts/cleanup-mes-resource-planning-e2e.mjs` | Exact Work Order cleanup helper. |
| `scripts/reset-won-seal-tech-machines.mjs` | Deterministic machine fixture reset/verify helper. |

## Maintained Commands

Source: `package.json`.

| Command | Classification | Notes |
|---|---|---|
| `npm run test:mes:resource-planning-flow` | IMPLEMENTED_NOT_FULLY_VERIFIED | Runs API flow with `MES_ENV=development ALLOW_RESOURCE_PLANNING_MUTATION=true`. |
| `npm run test:e2e:resource-planning:smoke` | IMPLEMENTED_NOT_FULLY_VERIFIED | Browser smoke subset. |
| `npm run test:e2e:resource-planning:full` | IMPLEMENTED_NOT_FULLY_VERIFIED | Full resource-planning browser suite alias. |
| `npm run test:e2e:resource-planning:validation` | IMPLEMENTED_NOT_FULLY_VERIFIED | Validation-tagged browser tests. |
| `npm run test:e2e:resource-planning:concurrency` | IMPLEMENTED_NOT_FULLY_VERIFIED | Concurrency-tagged browser/API test. |
| `npm run test:e2e:resource-planning:authorization` | PARTIALLY_IMPLEMENTED | Viewer test declaration exists but is skipped due to missing viewer credentials. |
| `npm run test:e2e:resource-planning:numbering` | IMPLEMENTED_NOT_FULLY_VERIFIED | Numbering uniqueness. |
| `npm run test:e2e:resource-planning:all` | IMPLEMENTED_NOT_FULLY_VERIFIED | Full suite. |
| `npm run machines:reset` | IMPLEMENTED_NOT_FULLY_VERIFIED | Requires destructive guard per script behavior. |
| `npm run machines:verify` | IMPLEMENTED_NOT_FULLY_VERIFIED | Verifies deterministic machine fixture. |
| `npm run reset:seed:mes:wo` | IMPLEMENTED_NOT_FULLY_VERIFIED | Seeds complete disposable MES WO dataset. |

## Current API Flow Coverage

Source: `scripts/test-mes-resource-planning-flow.mjs`.

| Scenario | Declared | Implemented | Executed in Phase 0 | Classification | Evidence |
|---|---:|---:|---:|---|---|
| Safety guard refuses non-local/non-mutation env | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | `assertSafety()` |
| Find released Ready Production Version | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | `/production-ready-versions` call |
| Create two WOs through creation workflow | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | `createWorkOrder()` |
| Unique Work Order IDs/codes | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | script assertions |
| Candidate retrieval for every operation | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | `loadCandidates()` |
| Commit Ready candidate for every operation | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | `allocate()` loop |
| Idempotent allocation replay | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | replay assertion |
| Capacity-blocked candidate observed | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | blocked candidate probes |
| Allocation revalidation | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | `/resource-allocations/revalidate` |
| Refresh persistence | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | detail reload |
| Primary machine-unit snapshot count | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | direct execution DB query |
| Exact cleanup by WO IDs | Yes | Yes | No | IMPLEMENTED_NOT_FULLY_VERIFIED | `cleanup()` |

Phase 0 did not execute mutating tests because the phase requirement is documentation and verification inventory only.

## Browser E2E Coverage

Source: `docs/testing/mes-resource-planning-e2e-matrix.md`, `docs/testing/browser-e2e-coverage-matrix.md`, `e2e/resource-planning`.

| Case | Implemented | Executed in latest documented run | Passed | Skipped | Classification | Notes |
|---|---:|---:|---:|---:|---|---|
| Create WO from released Production Version | Yes | Yes | Yes | No | IMPLEMENTED_AND_VERIFIED | Documented latest matrix. |
| Reject invalid quantity | Yes | Yes | Yes | No | IMPLEMENTED_AND_VERIFIED | Browser validation. |
| Validate/commit/refresh allocation | Yes | Yes | Yes | No | IMPLEMENTED_AND_VERIFIED | Smoke flow. |
| Idempotent allocation replay | Yes | Yes | Yes | No | IMPLEMENTED_AND_VERIFIED | API fixture and smoke coverage. |
| Simultaneous commits for exclusive resource | Yes | Yes | Yes | No | IMPLEMENTED_AND_VERIFIED | Concurrency spec. |
| Viewer cannot commit allocation | Yes | No | No | Yes | PARTIALLY_IMPLEMENTED | Skipped because viewer credentials are not configured. |
| Sequential WO code uniqueness | Yes | Yes | Yes | No | IMPLEMENTED_AND_VERIFIED | Numbering spec. |
| Concurrent WO code uniqueness | Yes | Yes | Yes | No | IMPLEMENTED_AND_VERIFIED | Numbering spec. |
| Ready/blocked candidate and capacity behavior | Partial | Yes | Yes | No | PARTIALLY_IMPLEMENTED | Deterministic capacity coverage only. |
| Machine requirement state variants | Partial | No | No | No | PARTIALLY_IMPLEMENTED | Dedicated mutation fixtures remain. |
| Stale resource state variants | Partial | No | No | No | PARTIALLY_IMPLEMENTED | Dedicated state mutation fixtures remain. |
| Capacity boundary variants | Partial | No | No | No | PARTIALLY_IMPLEMENTED | Dedicated timing fixtures remain. |
| Cancellation/replan/execution | No | No | No | No | NOT_IMPLEMENTED | Phase 1/2+ requirement. |
| Planner/operator/cross-site authorization | Partial | No | No | No | PARTIALLY_IMPLEMENTED | Role matrix incomplete. |
| UI loading/empty/error/identity/reconnect | Partial | Partial | Partial | No | PARTIALLY_IMPLEMENTED | Smoke covers limited happy-path states. |
| Exact cleanup/safe retry behavior | Yes | Yes | Yes | No | IMPLEMENTED_AND_VERIFIED | Existing cleanup validation. |

Latest documented browser result:

```text
Machine full: 2 declared, 2 executed, 2 passed, 0 skipped.
Resource Planning full: 5 declared, 4 executed, 4 passed, 1 skipped.
Combined mandatory declarations: 7 declared, 6 executed, 6 passed, 1 skipped.
```

Important: skipped authorization is not passed coverage.

## Phase 1 Required Negative Scenario Baseline

This table classifies whether Phase 1 required negative scenarios already have proven coverage in the Phase 0 baseline.

| Required scenario | Current coverage | Classification |
|---|---|---|
| missing Primary Machine Requirement | Source checks exist; full test not proven. | PARTIALLY_IMPLEMENTED |
| insufficient physical Machine Units | Source checks exist; full test not proven. | PARTIALLY_IMPLEMENTED |
| expired Resource Assignment | Source filters by effectivity; full test not proven. | PARTIALLY_IMPLEMENTED |
| Workstation in another Work Center | Source filters by Work Center; full negative test not proven. | PARTIALLY_IMPLEMENTED |
| Machine Unit in another Site | Source checks equipment Site; unit site-specific test not proven. | PARTIALLY_IMPLEMENTED |
| Machine Unit under maintenance | Maintenance projection is unknown; execution status path exists. | UNKNOWN_REQUIRES_SOURCE_CONFIRMATION |
| Machine Unit out of service | Source checks equipment/unit availability; full test not proven. | PARTIALLY_IMPLEMENTED |
| Machine Unit not planning eligible | Source checks planning flag; full test not proven. | PARTIALLY_IMPLEMENTED |
| unavailable Resource Calendar | Source checks calendar; full test not proven. | PARTIALLY_IMPLEMENTED |
| invalid Shift | Source checks shift/site; full test not proven. | PARTIALLY_IMPLEMENTED |
| missing Production Standard | Source checks standard; full test not proven. | PARTIALLY_IMPLEMENTED |
| stale candidate | Allocation rejects stale candidate; full mutation test not proven. | PARTIALLY_IMPLEMENTED |
| simultaneous allocation conflict | Browser/API concurrency exists and documented passed. | IMPLEMENTED_AND_VERIFIED |
| idempotent replay | API flow asserts replay. | IMPLEMENTED_AND_VERIFIED |
| reused idempotency key with different request | Source rejects; test not proven. | PARTIALLY_IMPLEMENTED |
| reallocation | Source exists; test coverage not proven. | PARTIALLY_IMPLEMENTED |
| allocation cancellation | Source exists; test coverage not proven. | PARTIALLY_IMPLEMENTED |
| approval after resource state changed | Source revalidates; negative test not proven. | PARTIALLY_IMPLEMENTED |
| execution start without valid allocation | Not proven by current coverage. | PARTIALLY_IMPLEMENTED |
| unauthorized role | Source route gate exists; viewer browser test skipped. | PARTIALLY_IMPLEMENTED |

## Test Gap Summary

The current suite proves core happy path, idempotent replay, capacity conflict, numbering, refresh persistence, and exact cleanup. It does not fully prove the enterprise negative scenario matrix required for Phase 1.

Missing or incomplete:

- every machine requirement mutation variant;
- stale assignment/readiness mutation variants;
- maintenance/out-of-service variants;
- cancellation and replan browser/API coverage;
- execution start guard;
- reused idempotency key with different payload;
- complete role matrix;
- cross-site denial;
- no raw UUID/raw enum display across all resource-planning screens.

## Phase 0 Test Gate

Result: PASS_FOR_BASELINE_DOCUMENTATION.

All current tests and known gaps are listed. Phase 1 must add or repair tests before claiming current Resource Planning correctness is production-safe.
