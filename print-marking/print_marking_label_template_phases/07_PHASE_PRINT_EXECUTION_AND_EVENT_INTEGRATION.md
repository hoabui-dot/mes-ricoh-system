# Phase 7 Prompt — Production Print Execution, Kafka, Safe Retry, Projection, and SignalR

## Role

Integrate exact template versions into the production print workflow.

Load and obey `00_EXECUTION_RULES.md`. Continue automatically to Phase 8.

## Objective

Implement `PrintRequested` consumption, Inbox protection, exact version resolution, variable/preflight validation, compilation, render snapshots, asset sync, printer transport, result events, Job Engine updates, Projection read models, and SignalR.

## Contract

Evolve or create a versioned `PrintRequested` contract containing:

```text
event_id
print_request_id
job_id
job_attempt_id
station_id
printer_id
template_id
template_version_id
quantity
variables
correlation_id
timestamp
```

Production must use an exact version. Any legacy template-code resolution must be explicit, deterministic, and audited.

## Inbox and states

Deduplicate by consumer/event and by print request. Use states:

```text
RECEIVED
VALIDATING
COMPILING
SYNCING_ASSETS
READY_TO_SEND
SENDING
SENT
COMPLETED
FAILED
STATUS_UNKNOWN
CANCELLED
```

Persist all transitions.

## Render snapshot

Before sending, persist exact template JSON, resolved variables/assets, printer profile, compiler version, generated ZPL, checksum, and size.

## Execution flow

```text
Receive
→ Deduplicate
→ Load exact version
→ Validate active policy
→ Load printer
→ Bind variables
→ Preflight
→ Compile
→ Persist snapshot
→ Sync assets
→ Check readiness
→ Send
→ Record result
→ Write Outbox
```

## Transport and retry

Support current raw TCP 9100, existing Link-OS integration, and fake transport.

Add timeouts, cancellation, structured logs, status queries where supported, and payload byte counts without logging sensitive payloads.

Safe automatic retry is allowed only before payload send. A failure during or after send becomes `STATUS_UNKNOWN`; do not blindly reprint. Reconcile through printer status, job state, operator confirmation, Vision evidence, history, or printer counter.

## Events

Publish via Outbox on `station.print-events`, keyed by `PrintExecutionId`:

```text
PrintExecutionReceived
PrintValidationFailed
PrintCompilationCompleted
PrinterAssetsSynchronized
PrintCommandSent
PrintCompleted
PrintFailed
PrintStatusUnknown
```

## Job Engine

Consume result events with Inbox protection:

- Completed advances workflow.
- Failed applies workflow policy.
- Status unknown blocks duplicate automatic printing.

Never query `printer.db`.

## Projection and SignalR

Add print/template/asset read models using manual offset commit and Inbox deduplication.

Expose print execution/history/detail/snapshot and printer asset status endpoints with authorization.

Push:

```text
PrintExecutionUpdated
PrinterAssetStatusChanged
TemplateActivated
TemplateRetired
PrinterStatusChanged
```

On reconnect, Kiosk reloads REST state and reconciles.

## Seeds and tests

Seed successful 203/300 prints, missing variables/assets, asset sync, offline printer, memory full, duplicate event/request, failure before/during send, status unknown, safe retry, Vietnamese label, conditional QC icon, Job Engine result, Projection, and SignalR.

Test consumers, state transitions, snapshots, transport, retry classification, Outbox recovery, Job Engine behavior, Projection, reconnect, and full end-to-end event flow.

## Acceptance gate

Pass only when exact-version production printing, duplicate protection, snapshots, asset sync, safe retry, status unknown, Kafka, Job Engine, Projection, SignalR, seeds, and integration tests work.

Continue immediately to Phase 8.
