# Temporarily Bypass Work Order Resource Allocation Approval Gate

Date: 2026-07-27

## Policy

For the current MES/Kiosk/Kafka/Print Station integration phase,
resource allocation is advisory during Work Order approval. The authoritative
configuration, snapshot, lifecycle, Production Version freshness, routing
operation, material, planning, and authorization checks remain mandatory.

The runtime Compose configuration uses:

```text
MES_RESOURCE_ALLOCATION_APPROVAL_REQUIRED=false
```

Setting it to `true` restores the previous strict allocation gate for a
controlled environment. The legacy `MES_DEMO_BYPASS_RESOURCE_ALLOCATION` flag
is no longer used by the active approval path.

## Implementation

- Approval no longer calls allocation revalidation when the advisory policy is
  active. No fake allocation, workstation, equipment, shift, reservation, or
  employee is created.
- Approval still checks the Work Order, Production Version freshness, role,
  status transition, and Routing operation snapshot through the existing
  `ApproveWorkOrder` use case.
- The handler performs a non-blocking diagnostic count of operations, valid
  committed allocations, and stale allocations.
- Approval audit records now include:
  - `approval_mode=RESOURCE_ALLOCATION_BYPASSED`
  - `resource_allocation_status` (`Valid`, `Missing`, or `Stale`)
  - `approval_policy=Advisory`
  - `resource_allocation_warning_codes`
  - `temporary_policy_version=RESOURCE_ADVISORY_V1`
  - actor and timestamp from the existing audit columns
- Migration `000019_resource_allocation_advisory_approval.up.sql` adds the audit
  metadata without rewriting historical approvals.
- Successful API responses include `RESOURCE_ALLOCATION_BYPASSED` and the
  diagnostic warning code when resources are absent/stale.
- MES Console shows a localized warning after approval and continues to show
  resource planning as `Not allocated` or `Stale`; it does not hide the gap.

## Runtime verification

- `go test ./...`: passed.
- MES Console production build: passed.
- MES Execution and Console Docker rebuild/recreate: passed.
- Migration `000019`: applied successfully.
- A controlled Draft Work Order with six operations and no allocations was
  approved as `Released` with HTTP success.
- API response contained `RESOURCE_ALLOCATION_BYPASSED` and
  `WO_OPERATION_ALLOCATION_MISSING`.
- Approval audit contained `Missing`, `Advisory`, the warning JSON, and
  `RESOURCE_ADVISORY_V1`.
- Test Work Orders, workflows, approvals, and outbox events were removed after
  verification; the execution baseline is zero Work Orders and zero creation
  workflows.

## Runtime limitations after bypass

> Superseded on 2026-07-27. This report documents a historical temporary
> policy only. The active system requires strict resource allocation and no
> longer accepts or writes bypass approval data.

Approval does not imply that generic resource planning is complete. Start,
dispatch, and physical Print Station execution must still validate their own
execution target and printer readiness. Missing generic allocation may route
demo operations to the configured shared Kiosk, while physical print operations
must still resolve Workstation/Print Station binding, printer capacity, Online
status, Kafka connectivity, and a ready printer.
