# MES Work Order Test Data Cleanup Report

Generated: 2026-07-27T16:44:28.096Z

## Audit

- Work Orders audited: 1
- Valid Work Orders retained: 0
- Invalid Work Orders deleted: 1

### Work Order classification

| WO | Status | Operations | Materials | Print jobs | Reason |
|---|---|---:|---:|---:|---|
| WO-20260727-0029 (f5813afe-1885-4bb6-a407-da30fadf7cdc) | Draft | 1 | 5 | 0 | REVIEW |

### Orphans before cleanup

```json
{
  "operation_without_header": 0,
  "material_without_header": 0,
  "session_without_operation": 0,
  "confirmation_without_operation": 0,
  "print_job_without_header": 0,
  "print_attempt_without_job": 0,
  "print_event_without_job": 0,
  "allocation_without_operation": 0,
  "reservation_without_allocation": 0,
  "idempotency_without_allocation": 0,
  "workflow_without_work_order": 0
}
```

## Cleanup summary

```json
{
  "execution_sessions": 0,
  "operation_confirmations": 0,
  "material_consumption": 0,
  "print_events": 0,
  "print_attempts": 0,
  "capacity_reservations": 0,
  "resource_allocation_audit": 0,
  "allocation_idempotency": 0,
  "print_jobs": 0,
  "resource_allocations": 0,
  "operation_labor_assignments": 0,
  "materials": 5,
  "operations": 1,
  "approval_logs": 0,
  "workflow_events": 0,
  "workflows": 0,
  "outbox_events": 1,
  "work_orders": 1,
  "orphan_execution_sessions": 0,
  "orphan_confirmations": 0,
  "orphan_material_consumption": 0,
  "orphan_print_attempts": 0,
  "orphan_print_events": 0,
  "orphan_print_jobs": 0,
  "orphan_allocations": 0,
  "orphan_reservations": 0,
  "orphan_allocation_idempotency": 0,
  "orphan_workflow_events": 0,
  "orphan_workflows": 0,
  "kiosk_outbound_messages": 0
}
```

## Final verification

```json
{
  "operation_without_header": 0,
  "material_without_header": 0,
  "session_without_operation": 0,
  "confirmation_without_operation": 0,
  "print_job_without_header": 0,
  "print_attempt_without_job": 0,
  "print_event_without_job": 0,
  "allocation_without_operation": 0,
  "reservation_without_allocation": 0,
  "idempotency_without_allocation": 0,
  "workflow_without_work_order": 0
}
```

Remaining Work Orders: 0.
Master data was not modified. Invalid Work Orders were removed child-first in a database transaction.

## Follow-up

Future Work Order tests must select a candidate from `production-ready-versions`; creation now rejects missing or empty routing snapshots before commit.