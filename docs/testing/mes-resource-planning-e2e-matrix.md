# MES Resource Planning E2E Matrix

| Case ID | Description | Implemented | Executed | Passed | Failed | Skipped | Skip reason |
|---|---|---:|---:|---:|---:|---:|---|
| RP-E2E-001 | Create WO from released Production Version | Yes | Yes | Yes | No | No | |
| RP-E2E-003 | Reject invalid quantity | Yes | Yes | Yes | No | No | |
| RP-E2E-041/042/046 | Validate, commit, and refresh allocation | Yes | Yes | Yes | No | No | |
| RP-E2E-050 | Idempotent allocation replay | Yes | Yes | Yes | No | No | API fixture and smoke coverage |
| RP-E2E-063 | Two simultaneous commits for one exclusive resource | Yes | Yes | Yes | No | No | Real barrier and two API contexts |
| RP-E2E-101 | Viewer cannot commit allocation | Yes | No | No | No | Yes | Viewer Keycloak credentials are not configured |
| RP-E2E-130 | Sequential Work Order code uniqueness | Yes | Yes | Yes | No | No | |
| RP-E2E-131 | Concurrent Work Order code uniqueness | Yes | Yes | Yes | No | No | |
| RP-E2E-010/062/070/071 | Ready/blocked candidate and capacity behavior | Partial | Yes | Yes | No | No | Deterministic capacity coverage |
| RP-E2E-020..031 | Machine requirement state variants | Partial | No | No | No | No | Isolated mutation fixtures remain |
| RP-E2E-060..064 | Stale resource state variants | Partial | No | No | No | No | Dedicated state mutation fixtures remain |
| RP-E2E-072..074 | Capacity boundary variants | Partial | No | No | No | No | Dedicated timing fixtures remain |
| RP-E2E-080..094 | Cancellation, replan, and execution | No | No | No | No | No | Not implemented |
| RP-E2E-100/102/103 | Planner/operator/cross-site authorization | Partial | No | No | No | No | Viewer account is the only defined external prerequisite |
| RP-E2E-110..117 | UI loading, empty, error, identity, and reconnect states | Partial | Partial | Partial | No | No | Smoke covers only the executed happy-path states |
| RP-E2E-120/122/123 | Exact-ID cleanup and safe retry behavior | Yes | Yes | Yes | No | No | Cleanup output validates zero remaining WO rows |

**Latest full browser result:** Declared 5, Executed 4, Passed 4, Failed 0, Skipped 1. Skipped authorization is not counted as passed.
