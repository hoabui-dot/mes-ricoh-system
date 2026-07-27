# Temporarily Bypass Work Order Resource Allocation Approval Gate

## Background

The current Work Order approval flow blocks release unless every Work Order operation has a current valid committed resource allocation.

Current blocking message:

```text
Every Work Order operation needs a current valid committed resource allocation before release.

This rule currently prevents ongoing MES, Kiosk, Kafka, Print Station, Printer Adapter, and physical-printer integration testing.

For the current development phase, resource allocation must be temporarily bypassed in the backend so that a valid Work Order can always be approved without:

committed resource allocations;
Workstation allocation;
Equipment allocation;
Shift assignment;
capacity reservation;
resource-allocation revalidation.

This is a temporary development policy. Resource allocation will be redesigned and re-enabled later.

Objective

Modify the backend approval flow so that missing, stale, or invalid Work Order resource allocations do not block approval.

A Work Order must still pass all non-resource business validations.

The temporary flow must become:

Valid Draft Work Order
→ Production Version validation
→ Routing and operation snapshot validation
→ planning snapshot validation
→ approval authorisation
→ Released

It must not require:

resource candidate selection
resource allocation
capacity reservation
Shift assignment
allocation revalidation
Required Behaviour

When approving a Work Order, bypass these errors:

WO_OPERATION_ALLOCATION_MISSING
WO_OPERATION_ALLOCATION_STALE
WO_RESOURCE_ALLOCATION_INVALID
WO_RESOURCE_CAPACITY_CONFLICT
WO_RESOURCE_ASSIGNMENT_INVALID
WO_RESOURCE_CALENDAR_UNAVAILABLE
WO_RESOURCE_SHIFT_MISSING

Do not call allocation revalidation as a mandatory approval gate.

Existing allocation rows may remain in the database, but their absence or invalidity must not prevent approval.

Validations That Must Remain

Do not turn approval into an unconditional database status update.

Approval must still validate:

Work Order exists;
Work Order status is Draft or PendingApproval;
selected Production Version exists;
Production Version is Released;
Production Version is still effective;
Production Version context matches the WO snapshot;
Routing snapshot exists;
Routing snapshot contains at least one operation;
Operation snapshots are internally valid;
MBOM and material snapshots exist where required;
required planning values exist;
predecessor graph is valid;
approval role is authorised;
request idempotency is valid;
Work Order is not already cancelled, released, in progress, or completed.

Examples of errors that must continue blocking approval:

WO_ROUTING_SNAPSHOT_MISSING
WO_OPERATION_SNAPSHOT_INVALID
WO_PRODUCTION_VERSION_NOT_RELEASED
WO_PRODUCTION_VERSION_STALE
WO_INVALID_STATUS_TRANSITION
WO_APPROVAL_FORBIDDEN
Implementation Strategy

Remove the resource-allocation requirement from the normal approval path.

Preferred temporary implementation:

approval no longer invokes allocation revalidation

or:

allocation revalidation runs only for diagnostics and warnings

If revalidation is retained, its result must be advisory and must not return HTTP 409 for approval.

Example:

allocationResult, err := allocationService.Revalidate(ctx, woID)

if err != nil || allocationResult.HasBlockingErrors {
    approvalWarnings = append(
        approvalWarnings,
        "RESOURCE_ALLOCATION_BYPASSED",
    )
}

// Continue approval.

Do not create fake allocation records to satisfy the existing rule.

Do not generate dummy Workstations, Equipment, Shifts, reservations, or employees.

Remove Dependency on the Existing Demo Flag

Audit the existing:

MES_DEMO_BYPASS_RESOURCE_ALLOCATION

The user requires the resource-allocation gate to be bypassed consistently for the current development phase.

Choose one explicit implementation:

Preferred

Remove the mandatory allocation gate from approval entirely and record the temporary policy as:

RESOURCE_ALLOCATION_POLICY=ADVISORY
Alternative

Set the backend default to bypass mode without requiring an environment override.

If a flag is retained, use:

MES_RESOURCE_ALLOCATION_APPROVAL_REQUIRED=false

with default:

false

Do not depend on a script-only environment variable.

The actual running MES Execution service must use the new default after rebuild and recreation.

Approval Audit

Every approval performed without valid allocations must record:

approval_mode = RESOURCE_ALLOCATION_BYPASSED
resource_allocation_required = false
resource_allocation_valid = true or false
resource_allocation_warning_codes
approved_by
approved_at
temporary_policy_version

The audit must clearly show whether allocations existed.

Do not falsely mark missing allocations as valid.

Recommended distinction:

allocationStatus = Missing
approvalPolicy = Advisory
approvalResult = ApprovedWithWarnings
API Response

A successful approval may return warnings:

{
  "workOrderId": "...",
  "status": "Released",
  "approved": true,
  "warnings": [
    {
      "code": "RESOURCE_ALLOCATION_BYPASSED",
      "message": "The Work Order was approved without committed resource allocations."
    }
  ]
}

The HTTP status must represent successful approval according to current API conventions.

Do not return the old allocation error after the Work Order has been released.

MES Console Changes

Update the approval UI so it does not present missing resource allocation as a blocking failure.

The Resource Planning section may still show:

Not allocated
Allocation missing
Capacity not evaluated

but approval must remain available.

After successful approval, display a warning such as:

The Work Order was approved without committed resource allocations.
Resource planning is currently advisory.

Add VI/EN/JA/KO translations.

Recommended Vietnamese:

Lệnh sản xuất đã được phê duyệt mà chưa cam kết nguồn lực.
Hoạch định nguồn lực hiện chỉ mang tính tham khảo.

Do not hide the fact that allocation is missing.

Execution Behaviour

Audit execution code for assumptions that every operation has an allocation.

After approval bypass, the following flows must tolerate null allocation data:

start execution
Kiosk dispatch
demo shared Kiosk routing
Print Station target resolution
operation start
operation completion
successor dispatch
WO completion

For normal demo operations:

missing allocation
→ route to the configured shared demo Kiosk

For physical print operations:

missing generic resource allocation
→ resolve the Workstation and Print Station from the authoritative
  WO/Routing execution snapshot and active Print Station binding

Do not allow a missing generic allocation to block the real Print Station flow when the required Print Station binding and readiness checks pass.

However, print execution must still validate:

Workstation resolved
active Print Station binding
allocated printer quantity > 0
Print Station Online
Kafka Connected
ready printer available
Database and Migration

Determine whether a migration is needed.

Possible changes:

approval policy column;
approval warning JSON;
nullable allocation references;
approval audit metadata;
execution target fallback fields.

Do not add fake committed allocations through migration.

Do not rewrite historical approvals.

Existing historical Work Orders that were correctly blocked must remain historically accurate.

Remove Hard-Coded Approval Gate

Search for all code paths containing:

Every Work Order operation needs a current valid committed resource allocation before release
WO_OPERATION_ALLOCATION_MISSING
WO_RESOURCE_ALLOCATION_INVALID
resource-allocations/revalidate
RevalidateAllocations
committed_allocation_count
operation_count

Update every active approval path.

Ensure there is no duplicate gate in:

HTTP handler;
approval service;
repository;
domain policy;
workflow engine;
Kafka command handler;
frontend pre-validation.

The backend remains authoritative.