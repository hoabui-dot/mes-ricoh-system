# MES Work Order Batch Print E2E Completion

Date: 2026-07-27

## Requirement

Verify the production path from a MES Work Order to the remote Print Station
and physical printer, with a hard safety limit of three physical label copies.

## Root cause fixed

The previous batch print reached the remote printer and emitted
`printer.batch.printed`, but MES logged:

```text
operator does not exist: text = uuid
```

`PrinterResultConsumer` compared the string correlation value directly with
the UUID `command_event_id` column in an `OR` query. PostgreSQL inferred an
incompatible parameter type and the result event was discarded before MES
could update the print job and operation.

The lookup now compares UUID columns using `::text`, while retaining the
`job_code` fallback. This supports command-event ID, print-job ID, and job code
without unsafe UUID parsing.

## Script completion changes

`scripts/test-mes-wo-batch-print.mjs` now:

- refuses any full print request over `MAX_PHYSICAL_LABELS` (default `3`);
- validates authoritative `units_per_label`, `label_count`, and
  `print_copies`;
- completes executable predecessor operations;
- waits for `printer.batch.printed` and MES result processing;
- completes executable operations after the print operation;
- passes only when every WO operation is `Finished` and the WO is
  `Completed`;
- can be rerun against a completed WO without creating a duplicate print job.

## Runtime execution

The test dataset reset/seed created:

- WO: `WO-20260727-0043`
- WO ID: `15249d4b-cc05-41aa-bae8-9a5214ed93a8`
- Requested quantity: `2 PCS`
- Units per label: `1`
- Label count: `2`
- Copies per label: `1`
- Physical print copies: `2` (within limit `3`)
- Printer: `Zebra-GK420t-CUPS`
- Print job: `b7f62e13-5bfe-4a56-b30a-f148d3cb225c`
- Command event: `7f06d65b-b5f0-4373-8adf-037e6265ea24`
- Result event: `evt-batch-printed-1a1dd4467c6145af8d56bb392b72927b`

Command used:

```bash
WO_ID=15249d4b-cc05-41aa-bae8-9a5214ed93a8 \
MAX_PHYSICAL_LABELS=3 WAIT_SECONDS=180 \
npm run test:mes:wo:batch-print
```

## Evidence

The successful event path was:

```text
MES durable print job/outbox
-> Kafka command.printer.print.batch
-> Print Station
-> remote Printer Adapter
-> Zebra-GK420t-CUPS
-> Kafka printer.batch.printed
-> MES PrinterResultConsumer
-> MES operation Finished
-> Work Order Completed
```

Observed logs:

- MES received `printer.batch.printed`, `success=true`, printer
  `Zebra-GK420t-CUPS`.
- Projection Service received the same event and recorded `Succeeded=2
  Failed=0` for `WO-20260727-0043`.
- MES detail showed the print operation `Finished/Completed`.
- Database verification showed exactly `1` print job, `1` attempt, and `1`
  result event for this job; status was `Completed` and WO status was
  `Completed`.
- Re-running the verification script passed without adding another attempt or
  event.

## Verification commands

```bash
go test ./internal/infrastructure/events ./internal/application/usecase
npm run test:mes:wo:batch-print
```

The MES execution service was rebuilt and recreated before the successful run.

## Seed correction and rerun

The seed script now validates every newly created `wo_operation` before
reporting success. It requires a non-empty planning snapshot and validates:

- setup time `>= 0`;
- cycle time `> 0`;
- efficiency factor `> 0`;
- base quantity `> 0`;
- standard yield `> 0` and `<= 1`.

The reset/seed command was rerun and created `WO-20260727-0044`. The seed
reported `operation_count=3` and `invalid_count=0`. Compute Check and all three
resource-candidate calls were then executed through Kong, matching the MES
Console route, and returned HTTP 200.

The full physical-print test was rerun on this new WO:

- Print job: `2ec3a838-bb39-48c5-8a3d-e021a80b41dc`.
- Requested and completed copies: `2`.
- Printer result: `success=true`, `Succeeded=2`, `Failed=0`.
- MES WO status: `Completed`.
- Database counts: one print job, one attempt, one result event.

This confirms the current seed is usable for direct MES Console actions and the
full production print path.
