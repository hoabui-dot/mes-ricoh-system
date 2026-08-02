# Phase UI-00 Role and Permission Baseline

Date: 2026-08-02

Run ID: `2026-08-02T14-22-00Z`

## Evidence

| Source | Finding |
| --- | --- |
| `services/mes-console/src/context/AuthContext.tsx` | Keycloak realm roles are read from token and stored in `user.roles`. |
| `services/mes-console/src/lib/masterDataApi.ts` | MES Console forwards first role as `X-Role-Code`, defaulting to `PROD_MANAGER`. |
| `services/mes-execution-service/internal/infrastructure/http/router.go` | Resource allocation mutation allows `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, `EXECUTIVE`; others receive `RESOURCE_ALLOCATION_FORBIDDEN`. |
| `services/mes-master-data-service/src/infrastructure/db/seed.ts` | Seed creates `PROD_MANAGER` permission/resource-scope records. |
| `UI_AI_CONTEXT.md` | Current context documents allowed mutation roles for allocation as `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, `EXECUTIVE`, but states complete Viewer/Operator/Admin matrix remains pending. |
| Playwright config/package scripts | Browser credentials use `plant.manager`. |

## Role Matrix

Classification values: `Allowed`, `Denied`, `Conditional`, `Unknown`, `UI_VISIBILITY_GAP`, `TEST_CREDENTIAL_GAP`.

| Action | ADMIN | PLANT_MANAGER | PROD_MANAGER | PLANNER | OPERATOR | VIEWER | EXECUTIVE | Evidence classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View master data | Unknown | Conditional | Conditional | Conditional | Unknown | Unknown | Unknown | `BACKEND_CURRENT_BEHAVIOR` incomplete |
| Create/edit master data | Unknown | Unknown | Conditional | Unknown | Unknown | Unknown | Unknown | `BACKEND_CURRENT_BEHAVIOR` incomplete |
| Release master data | Unknown | Unknown | Conditional | Unknown | Denied expected | Denied expected | Unknown | `UI_VISIBILITY_GAP` |
| Create Work Order | Unknown | Unknown | Conditional | Conditional | Unknown | Unknown | Unknown | `BACKEND_CURRENT_BEHAVIOR` incomplete |
| View candidates | Unknown | Allowed expected | Allowed expected | Allowed expected | Unknown | Unknown | Allowed expected | `BACKEND_CURRENT_BEHAVIOR` incomplete |
| Commit allocation | Unknown | Allowed | Allowed | Allowed | Denied | Denied expected | Allowed | `BACKEND_CURRENT_BEHAVIOR` confirmed in execution router |
| Cancel/reallocate | Unknown | Allowed | Allowed | Allowed | Denied | Denied expected | Allowed | `BACKEND_CURRENT_BEHAVIOR` confirmed in execution router |
| Approve/reject | Unknown | Unknown | Conditional | Unknown | Denied expected | Denied expected | Unknown | `BACKEND_CURRENT_BEHAVIOR` incomplete |
| Replan line | Unknown | Unknown | Conditional | Conditional | Unknown | Unknown | Unknown | `BACKEND_CURRENT_BEHAVIOR` incomplete |
| Start execution | Unknown | Unknown | Conditional | Conditional | Unknown | Unknown | Unknown | `BACKEND_CURRENT_BEHAVIOR` incomplete |
| Manage employees | Unknown | Unknown | Conditional | Unknown | Unknown | Unknown | Unknown | `UI_VISIBILITY_GAP` |
| Assign employee skills | Unknown | Unknown | Conditional | Unknown | Unknown | Unknown | Unknown | `UI_VISIBILITY_GAP` |
| View diagnostics | Admin-only target | Unknown | Currently visible via sidebar | Unknown | Unknown | Unknown | Unknown | `UI_VISIBILITY_GAP` |
| Cross-site access | Unknown | Unknown | Scope record exists for seed user | Unknown | Unknown | Unknown | Unknown | `TEST_CREDENTIAL_GAP` |

## Conclusion

The role model is sufficiently documented to start UI-01 seed/domain correction because UI-01 does not depend on route-level authorization changes. It is not sufficient for UI-10 authorization remediation. UI-10 must add real role fixtures, forged-header boundary verification, cross-site negative tests, and route/action visibility tests.

