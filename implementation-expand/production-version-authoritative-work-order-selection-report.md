# Production Version Authoritative Work Order Selection

## Root Cause of `WO_ROUTING_SNAPSHOT_MISSING`

Work Order `2af7fabf-d39e-4754-af9e-627eddcc8b20` was created with five material requirements but zero `wo_operation` rows. Its Production Version pointed to Routing `RT-20260727-0001`, but the execution read model had no routing-operation rows for that Routing. The previous `CreateWorkOrder` path logged the routing-operation query problem and continued, committing an incomplete Work Order. Approval correctly rejected it because an approved Work Order must contain an immutable routing snapshot.

The source master-data record is also inconsistent: the Routing header is `Released`, its current routing-operation rows are `Draft`, and its historical release event did not contain an operation payload. This record cannot be safely repaired by approving the Work Order or inventing an execution snapshot.

## Changes

- Production Version is required in the Work Order creation workflow.
- Item Revision, MBOM, Routing, Site, and UOM are resolved from the selected Production Version.
- Legacy derived IDs are compared with the authoritative Production Version context and mismatches are rejected.
- Production Version localized identity, lot-size fields, and Work Order snapshot columns were added through migrations `0043` and `000017`.
- Existing Production Version names are backfilled and seed upsert now supplies `name_i18n`.
- Master-data event replay group was advanced to v6.
- Routing-operation query failures and empty routing snapshots now abort Work Order creation instead of committing a partial transaction.
- Released Routing validation now requires current routing operations and their underlying Operations to be Released.
- Work Order detail hydration is NULL-safe for legacy rows and exposes the new snapshot fields.
- MES Console Production Version create/edit/list/detail and Work Order selection use localized Production Version names.

## Verification

- Master-data and execution Docker images built successfully.
- Migration `0043_production_version_localized_identity` applied.
- Migration `000017_production_version_authoritative_snapshot` applied.
- Candidate API returned only valid Production Version configurations.
- The affected Work Order remains `Draft` with `0` operations; approval returned HTTP `409` with `WO_ROUTING_SNAPSHOT_MISSING`, and no state change occurred.
- Work Order detail API now returns the legacy header without blanking it when new nullable snapshot fields are absent.

## Remediation

Do not approve or manually patch this Work Order. Correct the inconsistent Routing through the normal draft-operation/release lifecycle, wait for its read-model event to project, then create a new Work Order from a Production Version returned by `production-ready-versions`.

Physical printer completion was not rerun for this approval hotfix. Existing Schema Registry compatibility warnings remain non-blocking and are unrelated to this defect.
