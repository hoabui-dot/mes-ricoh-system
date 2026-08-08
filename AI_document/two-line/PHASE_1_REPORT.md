# Phase 1 Report

## Objective

Define an executable whole-WO line readiness and fallback contract before integrating exact-resource evidence.

## Baseline findings

- Lifecycle and whole-WO lock already exist.
- Existing selection diagnostics distinguish coarse blocking dimensions from exact-allocation deferred dimensions.
- No pure contract previously defined candidate-count semantics independently of SQL.

## Implementation summary

- Added explicit readiness, selection, and dimension-policy types.
- Added a side-effect-free deterministic Primary/Backup evaluator.
- Defined one-or-more feasible candidates, mandatory operation blocking, fallback, and Resource Hold semantics.
- Documented lifecycle, dimension policy, diagnostic payload, and state transitions.

## Files changed

- `services/mes-execution-service/internal/application/usecase/line_readiness_contract.go`
- `services/mes-execution-service/internal/application/usecase/line_readiness_contract_test.go`
- `AI_document/two-line/PHASE_1_LINE_DOMAIN_CONTRACT.md`
- `AI_document/two-line/PHASE_1_REPORT.md`

## Schema/API changes

None. Contract types are internal and additive.

## Tests added or updated

- One feasible candidate is enough.
- Zero feasible candidates blocks a mandatory operation.
- One blocked mandatory operation blocks a line.
- Blocked Primary evaluates and selects Backup deterministically.
- No feasible line yields `RESOURCE_HOLD`.
- Every required readiness dimension has an explicit policy.

## Commands executed

- `gofmt -w internal/application/usecase/line_readiness_contract.go internal/application/usecase/line_readiness_contract_test.go`
- `go test ./internal/application/usecase ./internal/infrastructure/http`
- `go test ./...`

## Test and build results

- Focused use-case and HTTP tests: PASS.
- Full MES Execution test suite/build: PASS.

## Remaining risks

- The current SQL selector is not yet wired to the exact-candidate contract; that behavior belongs to later phases.
- Worker labor remains intentionally deferred until an approved blocking rule exists.

## Phase gate

PASS
