# Phase 6 Complete-Line Feasibility Evaluator Report

Date: 2026-08-07

## Objective

Provide a reusable, side-effect-free evaluator that proves every mandatory Routing Operation has at least one feasible candidate within one Production Line.

## Baseline findings

- The existing line selector stopped at coarse Work Center/capability/standard/calendar checks.
- Workstation, Resource Assignment, machine unit, and exact candidate readiness were marked deferred even though allocation already used the authoritative Master Data readiness API.
- A Phase 1 decision contract existed, but no reusable evaluator populated its operation candidate evidence.
- Existing selection diagnostics did not include total candidates, feasible count, candidate IDs, or compact exclusion summaries.

## Implementation summary

- Added a read-only line feasibility evaluator that invokes the existing Resource Planning `Readiness` interface once per Routing Operation and Production Line.
- Reused the same `proposalCandidateReady` predicate used by resource-allocation proposals.
- Added a read-only capacity inspector boundary so Execution-owned capacity and reservation conflicts can exclude candidates without reserving resources.
- A mandatory operation is Ready when one or more candidates remain feasible; failed alternatives are summarized but do not block the operation.
- A line is Blocked only when at least one mandatory operation has zero feasible candidates.
- Added compact operation evidence: operation identity/name, Work Center, total candidates, feasible candidates, selected candidate IDs, excluded reason counts, status, and blocker codes.
- The evaluator has no allocation, reservation, Work Order update, or event publication dependency.

## Files changed

- `services/mes-execution-service/internal/application/usecase/line_readiness_contract.go`
- `services/mes-execution-service/internal/application/usecase/line_feasibility_evaluator.go`
- `services/mes-execution-service/internal/application/usecase/line_feasibility_evaluator_test.go`
- `AI_document/two-line/PHASE_6_LINE_FEASIBILITY_REPORT.md`

## Schema and API changes

- No schema migration.
- No public API change in this phase.
- The internal evaluated-line JSON contract gains additive operation diagnostic fields.

## Tests and commands

- `gofmt` on all changed Go files: PASS.
- Focused use-case and HTTP Go tests: PASS.
- Full MES Execution `go test ./...`: PASS.
- Tests cover one failed plus one ready candidate, all Workstations blocked, all machine units blocked, expired assignment, capability mismatch, calendar unavailable, capacity exhausted, reservation conflict, out-of-line exclusion, every mandatory operation feasible, one mandatory operation blocked, and read-only probe behavior.

## Remaining risks

- The production selector still uses its legacy coarse evaluation path. Phase 7 will inject the existing Resource Planning client and the Execution capacity inspector, then make this evaluator authoritative for Primary/Backup selection.
- Candidate exclusion detail is intentionally aggregated by code; it does not expose large internal readiness payloads.

## Phase gate

PASS
