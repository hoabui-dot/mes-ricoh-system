# Implement WO Operation Quantities and Automatic Batch Print Dispatch

Audit and implement the Work Order print-operation flow.

## Objective

When a Work Order is created and approved:

1. Calculate how much work every WO operation must perform.
2. Calculate how many labels each print operation must print.
3. Display these quantities on the WO detail page.
4. Create one complete batch print command and send it to the Print Station through Kafka.

## Quantity Rules

For every WO operation, display:

- WO requested quantity;
- Production Standard base quantity;
- calculated operation cycle count;
- expected good quantity;
- label count when the operation requires printing.

Use:

```text
operation_cycle_count =
    WO requested quantity / Production Standard base quantity

Use decimal-safe calculation and define the required rounding policy.

Do not create duplicate Routing Operation rows. One WO keeps one snapshot row per Routing Operation; only its calculated workload is scaled.

Label Quantity Rule

Do not assume that Production Standard base quantity is always the number of products represented by one label.

Add or resolve an explicit print policy:

units_per_label
label_quantity_method
copies_per_label

Default calculation:

label_count = ceil(WO requested quantity / units_per_label)
total_print_copies = label_count * copies_per_label

If units_per_label does not exist yet, a temporary fallback to Production Standard base quantity is allowed only with:

LABEL_QUANTITY_STANDARD_BASE_FALLBACK

and must be shown as a warning.

Block print dispatch when no authoritative label quantity can be resolved.

WO UI

For every operation show:

operation name/code
requested output quantity
Production Standard base quantity
calculated cycle count
requires label printing
units per label
label count
print copies
print status

Example:

Print Label
WO quantity: 100 PCS
Base quantity: 1 PCS
Units per label: 1 PCS
Labels required: 100
Print status: Ready
Batch Print Command

When a print operation becomes executable, create one durable print job and publish one Kafka batch command containing:

{
  "event_id": "...",
  "work_order_id": "...",
  "work_order_code": "...",
  "operation_id": "...",
  "operation_code": "...",
  "production_version_id": "...",
  "item_revision_id": "...",
  "requested_quantity": "100",
  "units_per_label": "1",
  "label_count": 100,
  "copies_per_label": 1,
  "total_print_copies": 100,
  "label_template_id": "...",
  "label_template_version": "...",
  "workstation_id": "...",
  "print_station_id": "...",
  "printer_selection_policy": "...",
  "labels": [
    {
      "sequence": 1,
      "quantity": "1",
      "payload": {}
    }
  ]
}

For large quantities, do not create an unsafe oversized Kafka message. Support either:

deterministic label-range generation by the Printer Adapter; or
chunked print commands with batch number, chunk index, and total chunks.
Reliability

The flow must be:

WO operation ready
→ durable MES print job
→ transactional outbox
→ Kafka batch command
→ Print Station
→ Printer Adapter
→ result event
→ MES operation update

Requirements:

idempotent by print job and event ID;
duplicate Kafka delivery must not print twice;
retry must reuse the same logical print job;
partial batch success must be recorded;
operation finishes only after the required print quantity succeeds;
no browser-to-printer call.
Validation

Verify these cases:

WO quantity 100, units per label 1 → 100 labels.
WO quantity 100, units per label 10 → 10 labels.
WO quantity 105, units per label 10 → 11 labels.
Multiple print operations calculate independently.
Duplicate Kafka command does not cause duplicate physical printing.
WO UI shows calculated operation and label quantities.
Printer result updates the correct WO operation.
Final Report

Report:

existing quantity source;
added print-policy fields;
calculation and rounding rules;
WO UI changes;
generated print command example;
Kafka topic;
print job ID;
requested label count;
successful/failed label count;
idempotency evidence;
final WO operation status.

Do not report completion if label count is inferred only from a translated operation name or if Production Standard base quantity is used without an explicit documented fallback.