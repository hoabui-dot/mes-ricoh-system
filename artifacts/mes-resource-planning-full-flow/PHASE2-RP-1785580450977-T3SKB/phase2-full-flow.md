# MES Resource Planning Phase 2 Full API Verification

- Run ID: PHASE2-RP-1785580450977-T3SKB
- Status: PASS_FOR_PHASE_2
- Target date: 2026-08-03
- Artifact JSON: /home/neurosus/recoh-system/mes-system/artifacts/mes-resource-planning-full-flow/PHASE2-RP-1785580450977-T3SKB/phase2-full-flow.json
- Work Orders cleaned up: 1
- Remaining target rows: 0

## Full Flow Steps

| Step | Status | Error |
| --- | --- | --- |
| authenticate through supported trusted-gateway identity path | PASSED |  |
| reuse deterministic released master-data chain | PASSED |  |
| create Work Order from production_version_id and wait workflow | PASSED |  |
| load created Work Order routing snapshot | PASSED |  |
| run Compute and Check | PASSED |  |
| retrieve candidates and commit one Ready candidate for every operation | PASSED |  |
| repair local print-station readiness for exact allocated print workstations | PASSED |  |
| refresh committed snapshots and revalidate allocations | PASSED |  |
| approve Work Order with strict resource-allocation policy | PASSED |  |
| start execution | PASSED |  |
| verify allocation reservation audit and outbox persistence | PASSED |  |
| clean up exact generated Work Order IDs and disposable fixtures | PASSED |  |
| run required negative scenario matrix | PASSED |  |

## Negative Scenario Matrix

| Scenario | Status |
| --- | --- |
| missing Primary Machine Requirement blocks readiness | PASSED |
| insufficient physical Machine Units blocks readiness | PASSED |
| expired Resource Assignment blocks readiness | PASSED |
| Workstation in another Work Center is not a candidate | PASSED |
| Machine Unit in another Site blocks readiness | PASSED |
| Machine Unit under maintenance blocks readiness | PASSED |
| Machine Unit out of service blocks readiness | PASSED |
| Machine Unit not planning eligible blocks readiness | PASSED |
| unavailable Resource Calendar blocks readiness | PASSED |
| invalid Shift blocks readiness | PASSED |
| missing Production Standard blocks readiness | PASSED |
| stale candidate is rejected at commit | PASSED |
| simultaneous allocation conflict rejects second commit | PASSED |
| idempotent replay returns the same allocation response | PASSED |
| reused idempotency key with different request fails | PASSED |
| reallocation supersedes history and cancels old reservations | PASSED |
| allocation cancellation removes active reservations without deleting audit history | PASSED |
| approval after resource state changed fails revalidation | PASSED |
| execution start without valid allocation is rejected | PASSED |
| unauthorized role cannot commit allocation | PASSED |
