# MES Resource Planning Full E2E Use Cases

The authoritative Vietnamese catalog is [mes-resource-planning-use-cases.md](mes-resource-planning-use-cases.md). The expanded source requirements are `process-fix/use-case-Resource-Planning.md`.

## Executable tests

- `@smoke` and `@full`: browser Work Order creation, Compute & Check, Ready candidate selection, allocation commit, refresh persistence, and cleanup.
- API flow: Work Order A/B setup, capacity conflict, exact unit snapshots, idempotency replay, revalidation, numbering identity, and cleanup.

## Explicitly not implemented

RP-E2E-002 through RP-E2E-005 validation variants, RP-E2E-011 through RP-E2E-031 resource mutation variants, RP-E2E-043 through RP-E2E-045 tampered selection variants, RP-E2E-060 through RP-E2E-065 true stale/concurrent browser variants, RP-E2E-072 through RP-E2E-074 boundary/cancel capacity variants, RP-E2E-080 through RP-E2E-094 cancellation/execution variants, RP-E2E-100 through RP-E2E-103 authorization variants, and RP-E2E-110 through RP-E2E-117 complete UI-state variants are not marked as passed. See the improvement report for fixture and credential requirements.

## Run commands

```bash
npm run test:e2e:resource-planning:smoke
npm run test:e2e:resource-planning:numbering
npm run test:e2e:resource-planning:all
```

Mutating commands require development-only environment variables documented in `docs/testing/mes-resource-planning-browser-e2e.md`.
