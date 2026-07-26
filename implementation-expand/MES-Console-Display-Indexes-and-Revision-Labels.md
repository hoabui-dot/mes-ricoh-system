# MES Console Display Indexes and Item Revision Labels

Date: 2026-07-24
Status: Implemented and verified

## Scope

MES master-data screens previously exposed backend business sequence values directly in visual
positions. Demo routing data uses business sequences such as `10`, `20`, and `30`, while the
user-facing flow must read as positions `1`, `2`, and `3`. The same distinction applies to MBOM
hierarchy rows and their line selectors.

## Implementation

- Routing Detail renders the sorted operation position (`index + 1`) in the timeline and selected-operation panel.
- Routing operation list renders the visual row position while preserving editable business `seq` values for API writes and predecessor rules.
- Routing predecessor references are mapped from raw business sequence values to matching visual positions when the referenced operation is present.
- MBOM tree rows and line selectors render sibling positions starting at `1`; raw line sequence values remain unchanged in API and create/edit state.
- `md_item_revision` list responses include the parent Item localized `item_name` and business `item_code` through a service-side join.
- EBOM Item Revision and Component Revision selectors use the localized parent Item name, then revision name as fallback, without displaying revision codes in selector labels.

## Data contract decision

This is a presentation transformation only. Backend `seq` values remain authoritative because predecessor/dependency fields reference them and production execution may use them. No migration or data rewrite is required.

## Verification

- `npm run typecheck --workspace=mes-console`: PASS.
- `npm run build --workspace=mes-console`: PASS; existing Vite chunk-size warning remains.
- `npm run build --workspace=mes-master-data-service`: PASS.
- Docker images rebuilt for `mes-console` and `mes-master-data-service`.
- Containers recreated and checked with `docker compose ps`.
- Master-data service connected to its database, applied existing migrations, started on port 3020, and outbox relay started. Schema Registry reported the pre-existing compatibility warning for the Item Revision event schema but did not prevent startup.
