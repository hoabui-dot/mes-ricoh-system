# Known Limitations

## Temporary Implementations

- `MES_DEMO_PRINT_ON_APPROVAL=true` is a development/demo path. It can queue print jobs during approval and must not be treated as strict production approval policy.
- `stage-materials` exists as a retryable/manual recovery compatibility surface. It is not proof of final automatic WMS material lifecycle.

## Demo-Only Features

- Won Seal Tech machine fixture uses deterministic `WST-*` namespace for demos/tests.
- Phase 10 MES reset/seed uses deterministic `WST-SEED-*` MES-owned rows. The legacy E2E WO seed still delegates to the separate WMS repository and is not part of the default Phase 10 reset contract unless `PHASE10_INCLUDE_LEGACY_E2E_SEED=true` and WMS seed environment is explicitly configured.
- QMS demo dataset is deterministic and idempotent and does not emit Kafka events.
- Offline print-station allowances are for database/UI fixture verification, not physical print proof.

## Technical Debt

- Some legacy Workstation Supported Operations/capability routes/tables may remain for compatibility.
- Existing historical data may contain older schema/snapshot assumptions.
- Error envelope and pagination conventions are not fully uniform across services.
- Some event topics are manifest/code-described but not fully schema-documented in `infra/schemas`.

## Deprecated APIs / Compatibility Surfaces

- Direct adapter HTTP APIs are management/diagnostic/manual-test surfaces, not normal production print path.
- `stage-materials` remains compatibility/manual recovery.
- Legacy resource capability/workstation operation surfaces must not become new routing authority.

## Runtime Limitations

- Physical print verification depends on remote adapter, Kafka, CUPS, physical printer, and station readiness.
- Cloudflare URLs and remote LAN addresses are runtime state.
- Container health cannot be inferred permanently from repository files.

## Missing Browser Coverage

- Viewer authorization skipped without credentials.
- Stale resource assignment/readiness mutation cases.
- Maintenance/out-of-service variants.
- Cancellation/replan.
- Execution start guards.
- Cross-site access.
- Full role matrix.

## Future Migration Areas

- Final MES/WMS material request parent/line model.
- Full MES Kong bearer enforcement parity.
- DLQ/replay strategy if not already implemented in shared kernels.
- Complete event schema coverage.
- More exhaustive WMS and QMS source-derived API documentation.
- Two Production Line master data and Production Version Line Eligibility are implemented in Phase 6. MES Execution selected-line snapshots, automatic primary-to-backup selection, `ResourceHold`, audited pre-start replan, and mixed-line persistence/execution rejection are IMPLEMENTED_AND_VERIFIED in Phase 7.
- Full rich resource-candidate generation remains delegated to the Master Data Resource Planning API. Phase 7 verifies execution-side line gating and persistence; planner-side machine-maintenance/operator/workstation candidate richness must remain covered by the resource-planning API/E2E suites.
