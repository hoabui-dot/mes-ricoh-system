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
npm run machines:reset
npm run machines:verify
npm run seed:qms:demo
```

## Mock Strategy

Prefer real local services for integration/E2E where feasible. Use mocks only for external runtime dependencies such as physical printers when the test objective is not physical printing.

## Test Data

Use deterministic namespaces such as `WST-*` and exact Work Order IDs for cleanup. Never broaden cleanup to unrelated production/history rows.

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
