# Browser E2E Coverage Matrix

Coverage counts only implemented and executed passing browser assertions. Skipped tests are not covered.

| Domain | Use Case IDs | Implemented | Executed | Passed | Skipped | Coverage |
|---|---|---:|---:|---:|---:|---:|
| Machine Definition | M-001..M-006 | 2 | 2 | 2 | 0 | 33% |
| Physical Machine Unit | M-010..M-013 | 2 | 2 | 2 | 0 | 50% |
| Assignment / Requirement | M-020..M-030 | 2 | 2 | 2 | 0 | 18% |
| Readiness / deletion | M-040..M-050 | 2 | 2 | 2 | 0 | 50% |
| Work Order | RP-001..RP-003 | 2 | 2 | 2 | 0 | 67% |
| Candidate / readiness | RP-010..RP-020 | 2 | 2 | 2 | 0 | 40% |
| Allocation | RP-030..RP-031 | 1 | 1 | 1 | 0 | 50% |
| Capacity / concurrency | RP-040..RP-051 | 2 | 2 | 2 | 0 | 40% |
| Execution | RP-060..RP-061 | 0 | 0 | 0 | 0 | 0% |
| Authorization | RP-070..RP-071 | 1 | 0 | 0 | 1 | 0% |
| Numbering | RP-080..RP-081 | 2 | 2 | 2 | 0 | 100% |
| Cleanup | RP-090 | 1 | 1 | 1 | 0 | 100% |
| **Overall declared browser cases** | **M/RP inventory** | **19** | **18** | **18** | **1** | **95% of implemented declarations; 45% of inventoried mandatory cases** |

Latest execution:

- Machine full: 2 declared, 2 executed, 2 passed, 0 skipped.
- Resource Planning full: 5 declared, 4 executed, 4 passed, 1 skipped.
- Combined mandatory browser declarations: 7 declared, 6 executed, 6 passed, 1 skipped.

The overall inventory percentage is intentionally lower than test declaration pass rate because many enterprise edge cases remain explicitly missing.
