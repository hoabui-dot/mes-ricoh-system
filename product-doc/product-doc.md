# Product and Process Overview — S-Factory MOM Platform

Version: 1.2.0
Last updated: 2026-07-23
Scope: MES, WMS, and QMS product scope through Phase 3 Step 3b UI/UX hardening.

This file is the current product/process overview. The detailed entity catalogs are split into the
numbered files in this folder. Use this file to understand the business flow and current platform
status; use the catalog files for field-level schema and validation detail.

---

## 1. Business Context

S-Factory manufactures technical rubber products and rubber-metal automotive components. The MES
MVP controls the master data, work orders, traceability labels, shopfloor execution, kiosk workflow,
and planner console needed to produce parts such as `FG-WS-CM01` (automotive engine mount).

The product family includes:

- Finished goods:
  - `FG_RUBBER_METAL`
  - `FG_SEALS_ORING`
- Semi-finished goods:
  - `SFG_COMPOUND`
  - `SFG_TREATED_METAL`
- Raw materials:
  - `RM_RUBBER_BASE`
  - `RM_CHEMICALS`
  - `RM_METAL_BASE`

---

## 2. Current Implemented Product Scope

Phase 1 MES is implemented through Step 8a:

- Master Data service.
- Traceability service.
- Execution service Stage A and Stage B.
- Kiosk Gateway and Kiosk Operator UI.
- MES Console for planner/manager master data and WO workflows.
- Labor Resource Management: Employees, Shifts, Work Calendar, WorkCenter headcount.
- Platform i18n contracts and translation quality review queue for VI/EN/JA/KO.

Phase 2 WMS is implemented through Step 3:

- Warehouse master data, stock ledger, inbound/outbound workflows, and WMS Console on port `13091`.

Phase 3 QMS is implemented through Step 3b:

- Inspection plans, defect codes, characteristics, result drafts and result recording on `13110`.
- NCR, disposition, CAPA, idempotent inspection-failure consumption on `13120`.
- QMS Console React/Vite UI on `13130` with PKCE SSO, paginated lists, shared Radix controls,
  action-specific confirmations, inspection result recording, NCR disposition, and CAPA workflows.
- The real MES `OP-QC` → FAIL → `InspectionFailed.v1` → Critical NCR flow is closure-verified with
  duplicate redelivery producing no second NCR.
- The demo QMS dataset is refreshed with `npm run seed:qms:demo`: four plan lifecycle states, Attribute and
  Variable characteristics, pending/pass/fail/history results, six defect codes, four NCR states, two
  dispositions, four CAPA states, and four NCR/CAPA links. The seed is deterministic and idempotent and does
  not emit Kafka events.

Current active next phase:

- Phase 4 cross-cluster integration, load testing, security, contract, and observability hardening.

---

## 3. MES Core Production Flow

The MVP manufacturing route for `FG-WS-CM01` is:

| Seq | Operation | Name | MES Behavior |
|---:|---|---|---|
| 10 | `OP-MIX` | Luyen can cao su | Start/finish execution; material scan; issue mother batch label. |
| 20 | `OP-PREP` | Xu ly loi kim loai | Quantity confirmation; manual raw steel scan; no output label. |
| 30 | `OP-CUT` | Cat tach phoi tam me-con | Scan mother QR; call traceability split; activate child QR labels. |
| 40 | `OP-MOLD` | Ep dinh va luu hoa | Scan child QR and pallet; consume child label; issue finished output label. |
| 50 | `OP-TRIM` | Cat bavia / dinh hinh | Quantity confirmation; records good/scrap. |
| 60 | `OP-QC` | Kiem tra chat luong | PASS issues label; FAIL requires reason code and no PASS label. |

This operation table is the business authority for execution behavior. Code should remain data-driven
where possible, with operation-specific traceability calls only where the business process requires
them.

---

## 4. Representative Product Structure

Seed product:

- Item Revision: `FG-WS-CM01-R1`
- Base quantity: `100.000000`
- Base UOM: `PCS`

MBOM lines:

| Seq | Component Revision | Material | Qty | UOM | Scrap | Issue Operation | Backflush | Phantom |
|---:|---|---|---:|---|---:|---|---|---|
| 10 | `SFG-MET-CM01-R1` | Treated metal core | 100.000000 | PCS | 1.00% | `OP-MOLD` | Yes | No |
| 20 | `SFG-RUB-CM01-R1` | Rubber child blank | 102.000000 | PCS | 2.00% | `OP-MOLD` | Yes | No |
| 30 | `RM-STL-05-R1` | Raw steel blank | 101.000000 | PCS | 0.50% | `OP-PREP` | No | No |
| 40 | `RM-CHEM-BOND-R1` | Bonding chemical | 1.500000 | KG | 5.00% | `OP-PREP` | Yes | No |
| 50 | `SFG-ROLL-EPDM-R1` | EPDM parent roll | 15.500000 | M2 | 3.00% | `OP-CUT` | Yes | Yes |

`SFG-ROLL-EPDM-R1` is a phantom component. It is not treated as an independent stocked WO output in
the execution flow. At `OP-CUT`, the traceability service performs parent-child QR split and records
the genealogy.

---

## 5. Mandatory Master Data for WO Creation

A WO is valid only when the following are available and released/effective where applicable:

1. Site, Area, UOM, Reason Codes.
2. Item and Item Revision.
3. MBOM Header, MBOM Lines, and Substitute definitions when used.
4. Routing Header and Routing Operations.
5. Production Version linking Item Revision + MBOM + Routing.
6. WorkCenter, Workstation, Equipment, Resource Assignment, Resource Capability, Resource Calendar.
7. Production Standard and Work Instruction.
8. Skill definitions and operation skill requirements.
9. Labor Resource data: Employee, Employee Skills, Shift, Employee Shift Schedule.
10. Traceability Policy, Numbering Rule, QR Split Rule, Label Template for parent-child QR products.
11. Role permissions and resource scope for release/approval/operation.

Detailed catalogs:

- Foundation: `I-FOUNDATION-MASTER-DATA-CATALOG.md`
- Products and MBOM: `II-PRODUCTS-&-MBOM-CATALOG.md`
- Routing and Standards: `III-ROUTING-&-STANDARDS-CATALOG.md`
- Resources and Capabilities: `IV-RESOURCES & CAPABILITIES CATALOG.md`
- QR and Traceability: `V-QR-CATALOG.md`
- Kiosk and Security: `VI-KIOSK-&-SECURITY-CATALOG.md`
- ERD and Validation: `VII-ERD-MATRIX-&-DEV-VALIDATION.md`

---

## 6. Current System Architecture

The platform uses shared infrastructure plus independently deployed clusters:

- Platform Foundation:
  - Kafka KRaft and Schema Registry.
  - Keycloak realm `wonsealtech`.
  - Kong API Gateway.
  - OpenTelemetry Collector, Loki, Tempo, Prometheus, Grafana.
  - Shared kernels for TypeScript and Go.
  - Unified Portal.
- MES Cluster:
  - `mes-master-data-service`
  - `mes-traceability-service`
  - `mes-execution-service`
  - `mes-kiosk-gateway-service`
  - `kiosk-operator-ui`
  - `mes-console`
- WMS Cluster:
  - `wms-master-data-service`
  - `wms-inventory-service`
  - `wms-inbound-service`
  - `wms-outbound-service`
  - `wms-console`
- QMS Cluster:
  - `qms-inspection-service`
  - `qms-nonconformance-service`
  - `qms-console`

Architecture rules:

- One service owns one database.
- No cross-service database joins.
- Services communicate through Kafka events or explicit APIs.
- Outbox pattern is mandatory for meaningful state changes.
- Services trust gateway-forwarded `X-User-ID`, `X-Role-Code`, and `X-Trace-ID`.
- Keycloak is the single SSO source for browser users and kiosk operator tokens.

### 6.1 SSO User Flow

The deployed user flow is documented in [SSO User Guide — MES, WMS, and QMS](../docs/SSO-USER-GUIDE-MES-WMS-QMS.md).
The Unified Portal authenticates against the `wonsealtech` Keycloak realm with `portal-client`, reads
realm roles, and either redirects a single-app user or shows a chooser for a multi-app user. MES, WMS,
and QMS then authenticate independently with `mes-client`, `wms-client`, and `qms-client`; the shared
Keycloak browser session normally avoids a second password prompt.

Current deployed console ports are `13052` (MES), `13091` (WMS), and `13130` (QMS). WMS and QMS Kong
routes enforce bearer-token signature, expiry, client (`azp`), and role checks. MES browser SSO is live,
but its legacy Kong routes still need the equivalent bearer-token enforcement in Phase 4.

---

## 7. Current MES Service Responsibilities

| Service/App | Responsibility |
|---|---|
| `mes-master-data-service` | MES master data, release validation, labor resource data, WorkCenter headcount. |
| `mes-traceability-service` | Policies, numbering, QR split, label instances, genealogy. |
| `mes-execution-service` | WO creation/approval, operation start/confirm/abort, material consumption, WO completion. |
| `mes-kiosk-gateway-service` | Terminal login, WebSocket hub, offline server-to-terminal messages. |
| `kiosk-operator-ui` | Shopfloor tablet workflow. |
| `mes-console` | Planner/manager desktop workflow for master data, labor, MBOM, and WOs. |

---

## 8. Event Contract Overview

Master Data publishes:

- `MES.MasterData.ItemRevisionReleased.v1`
- `MES.MasterData.MBOMReleased.v1`
- `MES.MasterData.RoutingReleased.v1`
- `MES.MasterData.ProductionVersionReleased.v1`
- `MES.MasterData.ProductionStandardReleased.v1`
- `MES.MasterData.WorkCenterActivated.v1`
- `MES.MasterData.EquipmentActivated.v1`
- `MES.MasterData.EmployeeCreated.v1`
- `MES.MasterData.ShiftCreated.v1`
- `MES.MasterData.EmployeeScheduleAssigned.v1`

Traceability publishes:

- `MES.Traceability.LabelIssued.v1`
- `MES.Traceability.QRSplitPerformed.v1`
- `MES.Traceability.GenealogyRecorded.v1`

Execution publishes:

- `MES.Execution.WOCreated.v1`
- `MES.Execution.WOApproved.v1`
- `MES.Execution.OperationStarted.v1`
- `MES.Execution.OperationFinished.v1`
- `MES.Execution.MaterialConsumed.v1`
- `MES.Execution.WOCompleted.v1`

Kiosk Gateway consumes execution events to push work-center updates to terminal WebSocket clients.

Future WMS/QMS services must consume MES events through local read-models and anti-corruption mappers,
not direct MES database reads.

Current WMS services follow the same rule. WMS inventory is modeled as two echelons: central Warehouse
`Storage` locations and per-WorkCenter `WorkCenterStaging` locations. `wms-outbound-service` performs
staging-first allocation, excludes expired lots from new allocation, applies FEFO, declares typed
shortage without partial transfer, and `wms-inventory-service` decrements WorkCenter staging on
`MES.Execution.MaterialConsumed.v1`.

---

## 9. Release and Validation Rules

Release-time validation must return all errors, not only the first.

Core rules:

1. Item Revision is Released and effective.
2. MBOM has at least one valid line, no tree cycle, positive quantities, valid UOM.
3. Phantom components have complete Released child MBOM structures.
4. Routing has at least one operation, unique sequence numbers, and no predecessor cycle.
5. WorkCenter is active and belongs to the correct Site.
6. Resource Capability exists.
7. Production Standard exists for schedulable operations.
8. Resource Calendar exists.
9. Traceability Rules exist for parent-child products. This is delegated to `mes-traceability-service`.
10. Permissions and resource scope exist for release/approval/operation.

---

## 10. User-Facing Workflows

### Planner / Manager Console

Entry point: `http://100.68.50.41:13052`

Auth:

- Keycloak Authorization Code + PKCE.
- Realm: `wonsealtech`.
- Client: `mes-client`.

Workflows:

- Item, MBOM, Routing, Production Version creation and release.
- WorkCenter create/edit and headcount view.
- Employee create/edit and skill assignment.
- Shift create/edit.
- Bulk Work Calendar assignment by Month / Quarter / Year.
- WO list/create/detail.
- Compute & Check.
- Approve/Reject with role-gated UI and server-side enforcement.

### WMS Stock Flow

Entry points:

- Direct inventory API: `http://100.68.50.41:13070`
- Direct inbound API: `http://100.68.50.41:13080`
- Direct outbound API: `http://100.68.50.41:13090`
- Kong WMS APIs: `http://100.68.50.41:18000/api/wms/*` with Keycloak `wms-client` JWT.

Workflows:

- Inbound receipt confirms stock into Warehouse `Storage` only.
- Outbound material requests resolve the WorkCenter staging location and reuse existing staged balance
  before requesting a Warehouse transfer.
- Expired lots remain visible for audit but are excluded from new allocation.
- Insufficient stock returns a shortage breakdown and writes no partial transfer.
- MES material-consumption events draw down WorkCenter staging, leaving unused staged balance for later WOs.

### Shopfloor Kiosk

Entry point: `http://100.68.50.41:13051`

Auth:

- Direct Grant through `mes-kiosk-gateway-service`.

Workflows:

- Terminal login.
- WO list for terminal WorkCenter.
- Operation start/confirm/abort.
- Pessimistic confirmation for physical actions.
- WebSocket updates from Kiosk Gateway.

---

## 11. Current Gaps and Future Product Work

Completed Phase 2 backend:

- WMS Master Data.
- WMS Inventory Service with append-only stock ledger.
- WMS Inbound and Outbound services.
- MES-to-WMS stock staging integration.

Planned Phase 4:

- Cross-cluster saga integration.
- Load testing.
- Security hardening.
- Contract testing.
- Observability hardening.

Known MES follow-ups:

- Integrate labor schedules into `ComputeAndCheck`.
- Add richer multi-WorkCenter employee eligibility if needed.
- Harden Kong JWT/OIDC verification.
- Add full CI contract tests for event schemas.

QMS Console hardening follow-ups:

- Extract duplicated WMS/QMS console primitives into `libs/console-ui-shared` when the import graph can be
  migrated without deployment drift.
- Replace QMS JA/KO English fallback entries with reviewed translations; current OPEN flags are tracked in
  the MES Translation Review Queue under `qms_console_i18n_resource`.

---

## 12. Source of Truth for AI Agents

For future AI work, read in this order:

1. `AI_CONTEXT.md`
2. `process/PROJECT_WORKLOAD_PROGRESS.md`
3. This file.
4. The detailed product catalog files in this folder.
5. The implementation trace for the relevant phase.
6. The target service manifest.
7. The source code and compose files.

If this overview conflicts with source code, inspect source code and implementation records before
making changes.
