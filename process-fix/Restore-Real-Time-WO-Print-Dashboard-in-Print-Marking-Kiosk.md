# Restore Real-Time WO Print Dashboard in Print Marking Kiosk

Audit and fix the complete realtime flow for MES Work Orders that contain print operations.

## Current Issue

MES successfully sends a batch/list of label codes for one WO print operation, and the physical print flow may continue, but the Kiosk Dashboard no longer updates in realtime.

Possible causes include:

```text
MES Kafka event
→ Projection Service Kafka consumer
→ projection database update
→ SignalR broadcast
→ Kiosk subscription/state update

The current dashboard also displays outdated fields that no longer match the latest MES WO and print-job contracts.

Required Work
Trace the full runtime path from MES to Kiosk:
Kafka topic and event type;
consumer group and bindings;
consumed payload;
projection handler;
projection database row;
SignalR event;
Kiosk handler and state store.
Verify Projection Service is connected to Kafka and consumes the latest MES events for:
WO approved/released;
print operation dispatched;
batch print job created;
label list/count received;
printing started;
labels printed/failed;
print job completed/failed;
WO operation completed;
WO completed.
Update old event mappings and DTOs. Ensure the current MES event envelope and field names are supported.
After every successful projection update, broadcast the correct SignalR event.
Verify Kiosk:
connects and reconnects automatically;
subscribes to the correct hub and event names;
deduplicates repeated events;
updates the active WO without page refresh;
refetches the current projection after reconnect.
Dashboard Redesign

Remove obsolete fields and display the latest WO print data:

WO code and status
Product name and code
Current print operation
Workstation
Print Station
Selected printer
WO requested quantity
Required label quantity
Total label-code count
Queued labels
Printed labels
Failed labels
Remaining labels
Print job ID/status
Batch/chunk progress
Last Kafka event time
Last printer result time
Kafka status
Projection status
SignalR status
Printer readiness

Show a compact product summary only. Move full Product Detail into a modal opened through a visible detail icon.

Projection Service must remain the source of truth. The Kiosk must not calculate WO or print status independently.

Runtime Verification

Run one real WO containing a print operation and prove, without refreshing the browser:

WO Released
→ print job appears
→ label count appears
→ Queued
→ Printing
→ printed/failed counts change
→ operation completes
→ WO status updates

Capture:

MES Kafka event IDs;
topic and consumer group;
Projection records before/after;
SignalR event names and payloads;
Kiosk state updates;
end-to-end latency.
Final Report

Report:

exact cause of lost realtime updates;
missing or outdated Kafka mappings;
Projection consumer changes;
database/read-model changes;
SignalR changes;
Kiosk handlers and cache/store changes;
dashboard fields removed and added;
one complete realtime WO print timeline.

Do not report completion if the Kiosk still requires manual refresh or if physical printing succeeds while the dashboard remains stale.