# Demo Approve WO and Print on Approval

Date: 2026-07-27
Status: IMPLEMENTED_AND_RUNTIME_VERIFIED

## Scope

The temporary flag `MES_DEMO_PRINT_ON_APPROVAL=true` changes only the demo approval path. With the flag enabled, the MES approval endpoint approves the Work Order, creates a valid committed planning allocation for every operation, bypasses WMS/material staging gates, and queues print work through the existing transactional outbox and Kafka Print Station flow. With the flag disabled, the existing strict resource-allocation approval gate remains active.

The browser never calls a printer or Kafka. The browser calls MES approval only.

## Changed Behaviour

Approval now performs these actions in one MES database transaction:

1. Validate the Production Version freshness and Work Order routing snapshot.
2. Set the Work Order to `Released`.
3. Insert approval audit values:
   - `approval_mode=DEMO_PRINT_ON_APPROVAL`
   - `resource_allocation_bypassed=true`
   - `approval_policy=Demo`
   - `bypass_reason` records that material staging and strict resource validation were bypassed.
4. Create `SystemRecommended`, `Committed`, `Valid` allocation rows for all Work Order operations.
5. Create one durable print job per `PRINT_STATION` operation and one transactional outbox command per print operation.
6. Commit. The outbox relay publishes the command to Kafka and the remote Print Station/Printer Adapter handles physical printing.

No WMS staging request is made during this demo approval path. The existing `stage-materials` endpoint remains available for the strict/legacy recovery flow but is hidden from the Work Order UI while demo mode is enabled.

## Print Quantity

The queue command uses the authoritative operation planning snapshot `base_quantity`:

```text
cycles = ceil(WO quantity / base quantity)
labels_per_cycle = 1
copies_per_label = operation snapshot value, default 1
total_print_copies = cycles * copies_per_label
```

Invalid or non-positive quantity/base values return `PRINT_QUANTITY_CANNOT_BE_CALCULATED`. The Kafka batch payload includes `production_standard_base_quantity`, `calculated_cycles`, `required_labels`, `labels_per_cycle`, `copies_per_label`, `total_print_copies`, `print_job_id`, Work Order identity, operation identity, workstation, Print Station, and `demo_mode=true`.

## Idempotency

Approval of a WO that is already beyond Draft/PendingApproval returns `idempotent_replay=true` in demo mode and does not write another approval event, print job, attempt, or outbox command. Kafka/result consumers retain their existing event/idempotency protections.

## UI

`WODetailScreen` receives `demo_print_on_approval` from the MES detail API. It hides the manual material staging action in demo mode and displays a translated Print Summary per print operation with requested quantity, base quantity, cycles, label count, copies, job status, and successful copies.

## Files

- `services/mes-execution-service/internal/application/usecase/approve_work_order.go`
- `services/mes-execution-service/internal/application/usecase/dispatch_execution.go`
- `services/mes-execution-service/internal/application/usecase/dispatch_execution_test.go`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `services/mes-console/src/routes/work-orders/WODetailScreen.tsx`
- `services/mes-console/src/routes/work-orders/workOrderDetail.ts`
- `services/mes-console/src/i18n.ts`
- `infra/docker-compose.mes.yml`

## Verification

Fresh `npm run reset:seed:mes:wo` created:

- WO: `WO-20260727-0047`
- WO ID: `439594a0-e53d-40ad-99d2-3fb98be23741`
- quantity: `2 PCS`
- print operation: `OP-20260727-0114`
- production-standard base quantity: `1`
- calculated cycles: `2`
- required labels: `2`
- copies per label: `1`
- total copies: `2`

Approval response returned `Released`, `DEMO_PRINT_ON_APPROVAL`, `material_staging_bypassed=true`, `print_triggered_on_approval=true`, and `print_jobs_queued=1`.

Runtime evidence:

- 3/3 operations had `Committed + Valid` resource allocations after approval.
- Database contained exactly 1 print job, 1 print attempt, and 1 print event.
- Print job ended `Completed` with `label_count=2`, `total_copies=2`.
- MES log received `printer.batch.printed` from `Zebra-GK420t-CUPS`.
- Projection log reported `Succeeded=2 Failed=0` for `WO-20260727-0047`.
- A second approval call returned `idempotent_replay=true`; counts remained 1 job, 1 attempt, and 1 event.
- Go tests: `go test ./...` passed.
- MES Console typecheck/build passed.
- Docker images for MES execution service and MES Console rebuilt and recreated.

## Follow-up Fix: MES Success Counter

The first implementation correctly consumed the Kafka result and changed the print job to `Completed`, but the Work Order detail API did not expose the batch event's `completed_count` and `failed_job_ids`. The console therefore rendered its fallback `0 / total` even though the printer and Projection Service reported success.

The detail query now derives `successful_copies` and `failed_copies` from the persisted `wo_print_job_event` payload, with a completed/failed job fallback. The verified detail response for the latest demo WO returns `successful_copies=2`, `failed_copies=0`, and `total_copies=2`, so the UI displays `2 / 2`.

## Limitations

This is intentionally a temporary demo bypass. It does not provide inventory authorization, WMS reservation, or strict physical capacity validation. Set `MES_DEMO_PRINT_ON_APPROVAL=false` or remove the environment entry before production use.
