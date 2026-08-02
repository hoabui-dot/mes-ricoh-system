# Testing Strategy

## Unit Testing

Unit tests should cover pure domain rules, helpers, mapping, numeric/UOM validation, route utilities, and idempotency logic. Existing examples include portal app resolution tests and print/device simulator tests.

## Integration Testing

Integration tests should verify service APIs against owned databases and event side effects. Important targets:

- Work Order creation snapshots.
- MBOM replacement/versioning.
- Resource allocation conflict/idempotency.
- Traceability label/split/genealogy.
- QMS failure to NCR idempotency.

## Browser E2E

Maintained MES browser suites cover machine and resource-planning flows. Current known status from `AI_CONTEXT.md`: seven declarations, six executed/passed, one skipped due to missing viewer credentials.

Commands:

```bash
npm run test:e2e:machine:smoke
npm run test:e2e:machine:all
npm run test:e2e:resource-planning:smoke
npm run test:e2e:resource-planning:all
npm run test:e2e:resource-planning:concurrency
npm run test:e2e:resource-planning:numbering
npm run test:e2e:all
npm run test:e2e:regression
npm run test:e2e:report
```

## Contract Testing

Kafka schemas exist for selected MES events in `infra/schemas`. Contract coverage is incomplete for every topic listed in manifests. Add or verify schemas before treating payloads as stable.

## Seed Strategy

Seed scripts must be deterministic and rerunnable. They must refuse destructive cleanup without explicit environment guards.

Important commands:

```bash
npm run reset:seed:mes:wo
npm run reset:seed:mes
npm run seed:mes:won-seal-tech
npm run verify:mes:seed
npm run test:mes:two-line-flow
npm run machines:reset
npm run machines:verify
npm run seed:qms:demo
```

## Mock Strategy

Prefer real local services for integration/E2E where feasible. Use mocks only for external runtime dependencies such as physical printers when the test objective is not physical printing.

## Test Data

Use deterministic namespaces such as `WST-*`, `WST-SEED-*`, and exact Work Order IDs for cleanup. Never broaden cleanup to unrelated production/history rows.

Phase 10 status: `IMPLEMENTED_AND_VERIFIED`. `reset:seed:mes` safely resets disposable MES Work Order data, resets the Won Seal Tech machine fixture, seeds a deterministic two-line Won Seal Tech production baseline, verifies create -> line selection -> Compute & Check -> resource commit -> approve, and writes `artifacts/mes-seed-verification-YYYYMMDD.json`. `verify:mes:seed` is repeatable and cleans its verification Work Order/workflow rows exactly.

## CI Verification

Unknown: complete CI pipeline policy is not proven from the focused evidence. Use repo scripts and docs/testing as current maintained entry points.

## Coverage Gaps

Not fully browser verified:

- stale assignment/workstation/readiness mutations.
- maintenance/out-of-service variants.
- cancellation/replan.
- execution start guards.
- capacity boundaries beyond current scenarios.
- logout/login persistence.
- cross-site access.
- full Viewer/Operator/Admin role matrix.

## Phase 5 Two-Line Test Targets

Status: PARTIALLY_IMPLEMENTED.

Phase 6 added `npm run test:mes:two-line-master-data:phase6` for migration/API/lifecycle/same-site/single-primary/duplicate/dependency/outbox/cleanup coverage.

Phase 7 added `npm run test:mes:two-line-resource-planning:phase7` for execution migration/API/database verification:

- primary Ready line selection;
- deterministic backup fallback;
- `ResourceHold` persistence and candidate blocking;
- database rejection of mixed-line allocation persistence;
- historical WO snapshot immutability after eligibility change;
- audited replan before execution start;
- rejection of in-place line change after execution start;
- exact cleanup verification for generated WOs and projection fixtures.

Future verification targets remain:

- Production Line and eligibility migration constraints.
- Primary-first selection and complete backup fallback.
- `RESOURCE_HOLD` when no complete line is feasible.
- Mixed-line allocation rejection at commit.
- Selected-line snapshot immutability after master-data changes.
- Pre-release line change and post-start transfer rejection.
- Browser E2E for line readiness, blockers, refresh persistence, and authorization.
