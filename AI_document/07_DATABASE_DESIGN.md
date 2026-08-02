# Database Design

## ERD Interpretation

The ERD in `product-doc/MES-DATABASE-ERD-AND-RELATIONSHIPS.md` is the catalog reference. This document explains design intent rather than duplicating it.

## Aggregate Ownership

| Aggregate | Owner | Purpose |
|---|---|---|
| Site/Shopfloor/Area | MES Master Data | factory hierarchy |
| Item/Item Revision | MES Master Data | product identity and versioning |
| EBOM | MES Master Data | engineering baseline |
| MBOM | MES Master Data | manufacturing material structure |
| Routing | MES Master Data | process structure |
| Production Version | MES Master Data | production configuration authority |
| Resource hierarchy | MES Master Data | Work Center, Workstation, Equipment, Machine Unit, assignment |
| Work Order | MES Execution | production transaction and immutable snapshots |
| Traceability | MES Traceability | label, QR, genealogy |
| Terminal | MES Kiosk Gateway | terminal/session state |
| QMS Inspection | QMS Inspection | plan/result data |
| QMS Nonconformance | QMS Nonconformance | NCR/CAPA data |

## Table Ownership

- `md_*`: normally MES master data, except traceability `md_*` tables owned by traceability.
- `rm_*`: service-local read model tables, especially in execution/traceability.
- `wo_*`: MES execution Work Order and planning tables.
- QMS tables: owned by QMS service databases.
- Kiosk terminal tables: owned by kiosk gateway.

## Relationships

Cross-service relationships are not database foreign keys. They are represented by:

- `master_id` values from upstream events.
- business codes for display and traceability.
- JSON snapshots for historical records.
- local read model rows.

## History Strategy

History is preserved by versioning, snapshots, audit, and effectivity. Released records should not be rewritten when referenced. Resource assignments are ended with `effective_to`; Work Orders retain their own snapshots.

## Soft Delete and Deactivation

Deactivation is distinct from deletion. Inactive/obsolete records are not offered for new selections. Deletion is blocked or constrained when downstream references exist. Some cleanup scripts delete disposable fixtures only under explicit destructive guards.

## Effective Dating

Effective dating appears on item revisions, MBOM/Routing structures, resource assignments, calendars, standards, user scopes, and substitutes. A selection is valid only if active/released and current for the required timestamp.

## Versioning

Important versioning fields include lifecycle status, row version, business version, structure version, revision code, and effective intervals. MBOM structure replacement uses `expected_structure_version` to prevent lost updates.

## Audit

Execution migrations include audit/lifecycle triggers. Master data routers set `app.current_user_id` before writes. Outbox rows preserve integration side effects. Audit completeness varies by service and should be checked before compliance claims.

## Index Strategy

Observed index patterns:

- unique business codes and idempotency keys.
- lookup indexes on Work Order, operation, status, resource windows.
- partial indexes for active/committed reservation states.
- outbox pending indexes.
- genealogy lookup indexes.

## Transaction Boundaries

Transaction boundaries belong to owning service operations:

- WO creation writes header, operations, material requirements, workflow/audit, and outbox.
- Resource allocation revalidates and commits allocation/reservations atomically.
- MBOM line replacement is transactional and version guarded.
- Traceability label issue/split/consume owns label/genealogy writes.

Never split a business invariant across services with a distributed database transaction. Use events, snapshots, and retryable recovery.

## Phase 5 Two-Line Design

Status: PARTIALLY_IMPLEMENTED.

ADR-009 designs Production Line selection. Phase 6 implemented Master Data ownership:

- `md_production_line`: Site-scoped execution scope.
- `md_production_line_work_center`: line-to-Work-Center scope, not a Routing owner.
- `md_production_line_resource_scope`: line scope over existing `md_resource_assignment` rows, not a replacement assignment table.
- `md_production_version_line_eligibility`: released Production Version to primary/backup eligible lines.

Future Execution ownership remains NOT_IMPLEMENTED:

- `wo_header` selected-line snapshot and line lock fields.
- `wo_resource_allocation.planned_production_line_id` to reject mixed-line allocation.
- `wo_capacity_reservation.production_line_id` for line-scoped capacity audit.

Existing historical Work Orders must not be arbitrarily backfilled to lines. See `docs/adr/ADR-009-two-production-line-selection-and-resource-planning.md`.

Phase 7 added MES Execution line-selection persistence:

- `rm_production_line`, `rm_production_line_work_center`, and `rm_production_version_line_eligibility` are execution-owned projections of master-data line facts.
- `wo_header` snapshots selected Production Line identity, line-selection mode/status, evaluated line results, fallback reason, `ResourceHold` blockers, and line lock timestamp.
- `wo_operation` snapshots the selected line and the source Routing Work Center before resolving to the selected line Work Center.
- `wo_resource_allocation` and `wo_capacity_reservation` carry the planned Production Line.
- `wo_line_selection_audit` records initial selection and audited replan decisions.
- Database triggers reject mixed-line operation, allocation, and reservation persistence for line-aware Work Orders.
