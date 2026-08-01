# MES Browser E2E Use-Case Inventory

Status means browser coverage, not API-only coverage.

| ID | Domain | Browser use case | Preconditions / expected result | Status |
|---|---|---|---|---|
| M-001 | Machine Definition | Create valid definition | Released Site/Work Center; row appears after save | Implemented |
| M-002 | Machine Definition | Required-field validation | Empty form remains open and required controls are visible | Implemented |
| M-003 | Machine Definition | Edit definition | Existing values load and save without duplicate ownership | Missing |
| M-004 | Machine Definition | Deactivate/delete protection | Active references prevent unsafe deletion; lifecycle action is clear | Missing |
| M-005 | Machine Definition | Duplicate code/name/invalid data | Stable validation message and no duplicate row | Missing |
| M-006 | Machine Definition | Search/filter/sort/refresh | Results and state persist through refresh | Missing |
| M-010 | Physical Unit | Create identified unit | Asset and serial appear after save and refresh | Implemented |
| M-011 | Physical Unit | Duplicate serial | Save is rejected and only one serial remains | Implemented |
| M-012 | Physical Unit | Duplicate asset/edit/delete | Relational validation and safe deletion | Missing |
| M-013 | Physical Unit | Status transitions | Available, Maintenance, OutOfService, PendingIdentification rules | Partial |
| M-020 | Assignment | Requirement creates effective assignment | Requirement and authoritative assignment are distinct and linked | Implemented |
| M-021 | Assignment | End assignment/history | Readiness changes to Blocked and history remains visible | Implemented |
| M-022 | Assignment | Overlap/wrong Work Center/effectivity | Invalid assignment is rejected without partial write | Missing |
| M-030 | Requirement | Required quantity and duplicate requirement | Capacity and duplicate rules are shown in the form | Partial |
| M-040 | Readiness | Ready with effective available unit | UI displays Ready and assigned/available quantities | Implemented |
| M-041 | Readiness | Missing/maintenance/out-of-service/non-planning unit | UI displays Blocked with reason | Partial |
| M-050 | Machine cleanup | Dependency-aware delete and exact cleanup | History/dependencies preserved and disposable rows removed | Implemented |
| RP-001 | Work Order | Create from released Production Version | WO is created with snapshots and visible detail | Implemented |
| RP-002 | Work Order | Invalid quantity/date/shift/PV | Submit is blocked or backend returns translated validation | Partial |
| RP-003 | Work Order | Duplicate submit/idempotency | One logical workflow/WO only | Partial |
| RP-010 | Candidate | Ready candidate | Candidate shows current Work Center/Workstation/machine readiness | Implemented |
| RP-011 | Candidate | Blocked/no candidate | Meaningful blocker/empty state | Partial |
| RP-012 | Candidate | Wrong/inactive/missing Work Center or Workstation | Candidate is rejected by backend and UI | Missing |
| RP-020 | Machine readiness | Missing assignment/quantity/wrong definition | Blocked with stable reason | Partial |
| RP-030 | Allocation | Compute, validate, commit, refresh | Committed state and snapshot persist | Implemented |
| RP-031 | Allocation | Cancel/replan | Reservation released and replacement requires reason | Missing |
| RP-040 | Capacity | No overlap/full/partial/boundary overlap | Only overlapping windows conflict | Partial |
| RP-050 | Concurrency | Simultaneous commit | One commit succeeds; other receives controlled 409 | Implemented |
| RP-051 | Concurrency | Stale readiness/assignment/workstation | Commit revalidates and rejects stale state | Missing |
| RP-060 | Execution | Committed snapshot used | Start succeeds only with valid committed resource | Missing |
| RP-061 | Execution | No/cancelled allocation | Start is blocked with translated reason | Missing |
| RP-070 | Authorization | Planner mutation | Allowed | Partial |
| RP-071 | Authorization | Viewer/operator/cross-site mutation | Denied and no allocation | Partial |
| RP-080 | Numbering | Sequential uniqueness | Business codes differ | Implemented |
| RP-081 | Numbering | Concurrent uniqueness | Business codes differ under concurrent creation | Implemented |
| RP-090 | Cleanup | Exact IDs/no orphan rows/retry | Cleanup is deterministic and idempotent | Implemented |

The detailed case matrix is in `docs/testing/browser-e2e-coverage-matrix.md`.
