# Released Item Selector Audit

Date: 2026-07-30

## Result

Audited MES Console forms that select Items or Item Revisions. Business configuration forms now
construct options only from records with `lifecycle_status = Released`.

Updated:

- `EbomScreen`: Component Item and Component Revision selectors filter Released records.
- `PlanningConstraintsScreen`: Product Revision selectors for resource capabilities and production
  standards receive the Released-only option set.

Already compliant:

- `ProductionVersionCrudScreen`: Finished/Semi-Finished Items must be Released and eligible Revisions
  are requested with Released/effective filters.
- `MbomCreateScreen`: Released Item Revisions and UOMs are used for manufacturing configuration.
- `RoutingCreateScreen`: Released Item Revisions are requested and filtered for output selection.
- Work Order creation uses the backend production-readiness endpoint rather than a raw Item list.

Intentionally unchanged:

- `ItemsScreen` remains a lifecycle administration screen and must show Draft/Inactive records so
  users can create, edit, release, and deactivate master data.

## Verification

- `npm --prefix services/mes-console run build` passed.
- `git diff --check` passed.
