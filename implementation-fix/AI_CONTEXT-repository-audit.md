# AI_CONTEXT Repository Audit

Date: 2026-07-23
Scope: verification pass for `implementation-fix/Transform-AI_CONTEXT.md`
Status: `IMPLEMENTED_AND_VERIFIED` for the inspection work below; this is an evidence log, not a product-completion claim.

## Purpose

This temporary audit records the repository evidence used to transform `AI_CONTEXT.md`. It separates running behavior from product intent, planned work, demo behavior, and unverified claims. The transform document requires this audit before the context is expanded.

## Repository areas inspected

| Area | Evidence inspected | Result |
|---|---|---|
| Runtime topology | `infra/docker-compose.platform.yml`, `infra/docker-compose.yml`, service Dockerfiles and manifests | MES, WMS, QMS, Portal, Kiosk, Keycloak, Kong, PostgreSQL, Kafka, Schema Registry, and observability topology is documented in `AI_CONTEXT.md`; runtime verification is recorded there. |
| Product and process | `product-doc/`, `process/`, `process-fix/`, `implementation/`, `implementation-fix/` | Product intent, phase workload, closure records, SSO procedure, circuit-breaker audit, UI audit, and seed records were compared. |
| Frontend applications | `services/portal`, `services/mes-console`, `services/wms-console`, `services/qms-console`, `services/mes-kiosk` source routes and shared UI components | Active route and shared-component patterns were inventoried. Actual API usage is more authoritative than menu labels. |
| MES master data | `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`, use cases, migrations, seeds | Generic resource CRUD plus lifecycle endpoints and resource-specific endpoints were verified. |
| MES execution | `services/mes-execution-service/internal/infrastructure/http/router.go`, `internal/application/usecase/`, `internal/domain/`, migrations | Work Order creation, Compute and Check, approval/rejection, WMS staging, operation start/confirm/abort, material consumption, and outbox writes were traced. |
| MES traceability | traceability service handlers, migrations, client calls, and implementation records | Label/genealogy paths and synchronous execution dependency were identified; unverified branches remain marked as gaps. |
| WMS | WMS master-data, inventory, inbound, outbound source and migrations | Inventory ledger/balance, inbound receipt, outbound allocation/picking/staging/dispatch, FEFO, idempotency, and dependency hardening were checked at source level. |
| QMS | inspection and nonconformance routers, migrations, consumers, outbox relay | Inspection, failure event consumption, NCR/disposition, and CAPA lifecycle handlers were checked. Cross-cluster effects are not assumed where no consumer/producer was found. |
| Persistence | service migrations and schema SQL containing table, key, index, check, trigger, and outbox definitions | Entity ownership and constraints were sampled and mapped; exhaustive column-level catalog remains a documentation workload where source enumeration is incomplete. |
| Integration | event envelope/outbox/publisher/consumer code, HTTP clients, circuit-breaker implementation, Kong configuration | Synchronous calls and event-driven boundaries were distinguished. Kafka and cross-service fallback behavior is documented only where code proves it. |
| Tests and verification | repository test/spec files, build scripts, Docker compose status/log checks, contract probes | Build/runtime evidence is recorded. Missing route-level, authorization, concurrency, and failure tests are explicitly listed as gaps. |

## Confirmed Work Order evidence

- Router: `services/mes-execution-service/internal/infrastructure/http/router.go` exposes `POST /api/mes/execution/work-orders`, `GET` list/detail, `POST compute-check`, `approve`, `reject`, `stage-materials`, and operation `start`, `confirm`, `abort`, `consumption`.
- Creation sequence: `DetermineDemand` validates demand shape, `CheckMasterDataReadiness` checks prerequisites, and `CreateWorkOrder` writes `wo_header`, `wo_operation`, `wo_material_requirement`, approval/audit data, and a WOCreated outbox record.
- Compute and Check currently computes routing operation timing from persisted work-order operations. It does not prove finite-capacity scheduling, labor certification, live equipment availability, or complete material availability enforcement.
- Approval is a transaction in the execution service and calls the WMS outbound client for material reservation/check behavior. Material staging is a separate retryable action and records `NotChecked`, `Staged`, or `Shortage` plus JSON detail.
- Operation start changes the Work Order/operation to `InProgress`, creates an execution session, and writes an outbox event. Confirm validates the operation/session/quantities, records confirmations and consumption, calls traceability synchronously for label/genealogy behavior where configured, marks the operation finished, and writes events.
- Completion logic exists in `complete_work_order.go`; the source must be treated as an operation-completion path, not proof that every UI workflow exposes a separate complete command.
- Handlers use forwarded `X-User-ID` and `X-Role-Code` headers with system/operator defaults. This is a documented security risk unless Kong/auth middleware is proven to validate and overwrite these headers before exposure.

## Confirmed gaps and unproven behavior

| Gap | Classification | Consequence |
|---|---|---|
| Work Order route does not expose a dedicated determine-demand endpoint | `IMPLEMENTED_BUT_NOT_SEPARATED` | Demand determination is embedded in create; external orchestration cannot call it independently. |
| Finite-capacity scheduling | `MISSING` or `UNPROVEN` | Compute and Check must not be described as a scheduler. |
| Labor skill/certification/attendance/double-booking enforcement | `UNPROVEN` | Treat labor master data as informational unless a handler proves a guard. |
| Full live equipment/resource availability | `UNPROVEN` | Resource tables alone do not establish runtime enforcement. |
| Cross-cluster QMS effects on MES/WMS | `PARTIALLY_IMPLEMENTED` | QMS failure/NCR flow is present, but future MES/WMS consequences must be marked planned unless a consumer is found. |
| Offline kiosk queue | `PLANNED` or `MISSING` | Do not describe offline execution as delivered. |
| Complete route-specific scan/quantity rules for `FG-WS-CM01-R1` | `PARTIALLY_IMPLEMENTED` | The representative route is seed/demo evidence; each operation’s complete rule set needs handler/test proof. |
| Exhaustive endpoint authorization matrix | `IMPLEMENTED_BUT_NOT_TESTED` | Source role checks and gateway assumptions are documented; full negative authorization coverage is missing. |
| Exhaustive database column catalog | `PARTIALLY_IMPLEMENTED` | The context includes bounded-context/entity maps; remaining tables require generated catalog work. |

## Required context changes from this audit

1. Add explicit evidence statuses to feature, API, state, event, and flow entries.
2. Add an exceptional-depth Work Order contract with endpoints, payloads, guards, transactions, side effects, errors, retry/idempotency, and gaps.
3. Add active page, API/resource, entity, event, role, business-rule, and recovery atlases without inventing missing behavior.
4. Add readable Mermaid diagrams with `IMPLEMENTED`, `PARTIAL`, `PLANNED`, `MISSING`, `SYNC`, and `ASYNC` annotations.
5. Keep recommendations in a separate section and update the workload tracker with this documentation step.

## Audit conclusion

`AI_CONTEXT.md` was materially incomplete against the transform specification. The existing context is useful as an operational summary, but it is not yet an exhaustive AI knowledge base. This audit is the baseline for the next expansion and preserves the distinction between repository evidence and desired product behavior.
