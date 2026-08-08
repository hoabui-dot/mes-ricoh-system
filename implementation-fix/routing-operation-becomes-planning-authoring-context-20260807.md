# Routing Operation Becomes the Planning Authoring Context

Date: 2026-08-07

## Decision

`Routing Operation` is the user-facing owner of the Operation + Work Center
relationship and of planning values that vary by Routing. A user must not
create a second generic assignment just to make a Routing executable.

The console therefore treats these fields as one Routing Operation form:

- Operation
- Work Center
- planning source: inherit or Routing override
- reference quantity
- setup time
- cycle time
- required workers
- efficiency
- standard yield

The same Operation can now use different planning overrides in different
Routings. The override is persisted transactionally as a
`md_production_standard` row linked by `routing_operation_id`; inherited mode
does not create a duplicate standard.

## Resource Capability Boundary

The Resource Capability table and API remain for compatibility and for
resource-specific constraints such as product/equipment eligibility, priority,
speed factor, lot limits, and explicit denial. They are no longer an
Operation + Work Center authoring step in the MES Console. The old console
routes redirect to Routing, and the two menu entries are removed.

When readiness evaluates a Routing Operation, an active Routing Operation +
Work Center relationship supplies the default eligibility. An explicit
Resource Capability can still narrow or enrich that result. This prevents a
new Routing from being blocked because a user repeated the same assignment in
another page.

## Transaction and Validation

`PUT /routing-headers/:id/operations` remains the single write boundary. It:

1. validates the operation graph, Work Center site, and override values;
2. updates existing Routing Operation IDs in place;
3. creates or updates the Routing-scoped Production Standard only for an
   explicit override;
4. ends the active Routing-scoped standard when switching back to inherited;
5. preserves historical rows and worker-skill references.

Operation Catalog defaults remain reusable engineering defaults. Work Order
creation continues to snapshot resolved values and is unaffected by later
master-data changes.

## Verification Scope

- Create a Routing with two operations and confirm each row exposes planning
  source and all six planning values.
- Save one row as inherited and one as an override.
- Reload and confirm the override source and values are routing-specific.
- Confirm legacy Resource Capability and Production Standard URLs redirect to
  the Routing list.
- Confirm line eligibility and readiness accept the Routing Operation + Work
  Center relation without a duplicate generic capability assignment.

## Compatibility Note

No destructive migration removes existing capability or standard records.
Existing backend projections remain available for readiness, reporting, and
historical data. A future cleanup may archive redundant generic rows only after
production data owners approve the migration policy.
