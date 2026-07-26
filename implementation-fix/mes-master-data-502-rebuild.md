# MES Master-Data 502 Rebuild and Filter Hotfix

Date: 2026-07-24
Status: **IMPLEMENTED_AND_VERIFIED**

## Root cause

Kong logged temporary `connection refused` 502s while the recreated master-data container was
starting. A separate persistent application failure returned 500 for filtered Routing/MBOM requests:
the generic filter builder emitted unqualified `site_id`, `item_revision_id`, and
`lifecycle_status` predicates while the joined queries also selected Site and related tables. PostgreSQL
reported `42702 column reference "site_id" is ambiguous`.

## Fix and rebuild

- Qualified all production-version, MBOM, and Routing filter predicates with their base table name.
- Rebuilt and restarted `mes-master-data-service`.
- Refreshed Kong after the container replacement so its upstream resolution was current.
- Rebuilt and restarted `mes-console` as requested.

## Verification

- Master-data service: healthy.
- MES console: HTTP `200` on port `13052`.
- MES Sites through Kong: `200`.
- MES execution Work Orders through Kong: `200`.
- Filtered Routing through Kong: `200`.
- Filtered MBOM through Kong: `200`.
- WMS/QMS unauthenticated probes: `401`, expected Kong Keycloak protection, not 502.
- Service logs show the prior ambiguity no longer occurs.

The remaining Schema Registry compatibility messages are pre-existing non-fatal warnings and are
unrelated to the gateway 502s.
