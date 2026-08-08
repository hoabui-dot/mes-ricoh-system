# Architecture Decisions

## ADR-001: Service-Owned Databases

Decision: each service owns its database. No cross-service joins.
Why: preserves bounded-context autonomy, audit boundaries, and independent evolution.
Evidence: `AI_CONTEXT.md`, product docs, service manifests.
Consequence: use events, APIs, snapshots, and read models for integration.

## ADR-002: Production Version as Work Order Authority

Decision: Work Order creation selects Production Version, not independent Item/MBOM/Routing values.
Why: prevents invalid technical combinations and preserves released manufacturing configuration.
Evidence: `AI_CONTEXT.md`, product docs, master-data validation routes.
Consequence: WO snapshots must derive from Production Version.

Production Version authoring selects MBOM and Routing. The backend derives `item_revision_id` from
`MBOM.item_revision_id` and `site_id` from the unique Site of Routing Work Centers. Routing is an independent
operation flow and has no Item Revision ownership column.

## ADR-003: SAP Owns EBOM; MES Owns MBOM

Decision: SAP owns EBOM when available. MES does not currently persist, manage, import, compare, or expose EBOM. MBOM remains the MES manufacturing material definition.
Why: the future SAP snapshot/comparison mechanism requires an explicit integration and retention contract; a MES-authored EBOM would create conflicting ownership.
Evidence: migration `0070_remove_mes_owned_ebom_domain` and current Master Data/Console contracts.
Consequence: Production Version and Work Orders use Item Revision, MBOM, and Routing only. A future SAP integration must introduce a separate approved snapshot model rather than restoring MES EBOM CRUD.

## ADR-004: Work Center Routing, Workstation Runtime Allocation

Decision: Routing Operation owns logical Work Center; Resource Planning selects Workstation and physical resources at WO runtime.
Why: process design should not bind permanently to a physical station/machine; runtime capacity can change.
Evidence: `AI_CONTEXT.md`, resource planning process docs, execution allocation routes.
Consequence: do not make Workstation Supported Operations the routing authority.

## ADR-005: Equipment vs Machine Unit

Decision: `md_equipment` is Machine Definition; `md_machine_unit` is physical identity.
Why: aggregate equipment capacity is not proof that a specific serial/asset is available or eligible.
Evidence: `AI_CONTEXT.md`, machine architecture process docs.
Consequence: allocations/readiness must validate physical units where required.

## ADR-006: Kafka for Production Print Transport

Decision: production print commands/results use Kafka; adapter HTTP APIs are management/diagnostic/manual-test.
Why: durable asynchronous print flow and projection-based kiosk state.
Evidence: `AI_CONTEXT.md`, print station process docs, printer result consumer.
Consequence: do not use direct adapter polling as production source of truth.

## ADR-007: Go for MES Execution

Decision: MES execution is Go.
Why: service manifest states the bounded context combines low-frequency planning and high-throughput real-time execution, so language was chosen for heaviest workload.
Evidence: `services/mes-execution-service/service.manifest.yaml`.
Consequence: follow existing Go layering and shared kernel.

## ADR-008: React/Vite Consoles

Decision: MES/WMS/QMS consoles are React + Vite.
Why: current source and canonical context state this; MES is not Remix.
Evidence: package manifests and `AI_CONTEXT.md`.
Consequence: do not introduce Remix assumptions.

## ADR-009: Two Production Line Selection and Resource Planning

Status: PARTIALLY_IMPLEMENTED.
Decision: one Work Order selects exactly one complete Production Line from Production Version Line Eligibility; Routing remains a logical process definition and is not duplicated for equivalent physical lines.
Why: preserves Production Version authority, prevents per-operation mixed-line allocation, and keeps `md_resource_assignment` as the Workstation/Equipment assignment owner.
Evidence: `docs/adr/ADR-009-two-production-line-selection-and-resource-planning.md`.
Consequence: Phase 6 added Production Line and eligibility structures additively. Phase 7 added MES Execution selected-line snapshots, `ResourceHold`, audited pre-start replan, selected-line fields on operations/allocations/reservations, and database/usecase rejection of mixed-line allocations.

## Decisions Requiring Human Input

- Complete production deployment/security hardening policy.
- Full DLQ/replay operating model.
- Final MES/WMS material request parent-line architecture.
- Rework workflow semantics.
- ERP/HR/PLM integration boundaries.
