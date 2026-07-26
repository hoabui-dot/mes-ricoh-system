# Implement a Real-Time Work Order Creation Progress Modal in MES Console

## Role

Act as a senior product designer, senior frontend engineer, and senior backend architect working on an industrial Manufacturing Execution System.

Your task is to redesign and implement the Work Order creation experience in the MES Console so that, immediately after the user confirms creation, the UI shows the complete Work Order creation workflow as a real-time, step-by-step process.

The workflow must stream progress updates to the browser through WebSocket.

Do not implement a decorative or simulated progress indicator. Every displayed state must be driven by an actual backend workflow state, persisted workflow result, validation result, transaction result, outbox result, or explicit timeout/error state.

---

# 1. Read the Repository Before Making Changes

Before modifying code, inspect:

* `AI_CONTEXT.md`
* MES Console Work Order create screen and modal
* MES execution Work Order handlers
* Work Order use cases
* Work Order repositories and migrations
* Master Data API clients
* Circuit-breaker implementations
* Outbox implementation
* Kafka producer and event relay
* Existing WebSocket infrastructure
* MES kiosk gateway WebSocket hub
* Authentication and user identity propagation
* Existing loading, error, dialog, stepper, badge, and toast primitives
* Existing i18n conventions for VI, EN, JA, and KO
* Existing implementation reports

Use the repository source code as the primary source of truth.

Do not assume that the current implementation fully supports the desired workflow.

The current Work Order implementation is documented as partially implemented. Verify all contracts from source before making claims.

---

# 2. Business Goal

When a planner creates a Work Order, they must understand exactly what the MES is doing.

After the user completes Step 1 and clicks the final **Create Work Order** confirmation button, the modal must immediately transition to **Step 2: Creation Progress**.

Step 2 must display:

* What the system is currently validating
* Which validations passed
* Which validation failed
* What data was generated
* Which transactional records were created
* Which integration events were queued
* Whether the WebSocket is connected
* Whether the workflow completed, failed, timed out, or requires manual action

The user must never stare at a generic spinner without knowing what is happening.

The user must never receive an optimistic success state before the backend confirms the corresponding result.

---

# 3. Existing Work Order Context

The MES execution bounded context owns:

* Work Orders
* Work Order operations
* Work Order material requirements
* Work Order approval logs
* Execution sessions
* Operation confirmations
* Material consumption
* WMS staging status attached to material requirements

The existing create flow currently creates a Draft Work Order by exploding the MBOM and snapshotting the Routing.

The Work Order creation process reads or depends on:

* Item Revision
* Production Version
* MBOM
* Routing
* Routing Operations
* Production Standards
* Work Centers
* Resource capabilities
* Resource calendars
* Traceability configuration
* User permission and resource scope

Do not move domain ownership into the frontend.

The frontend displays workflow progress but does not make business decisions.

---

# 4. Required Modal Structure

Use a large responsive dialog rather than a small confirmation popup.

Recommended desktop dimensions:

* Width: approximately `min(1100px, 94vw)`
* Maximum height: approximately `90vh`
* Content area must scroll independently
* Header and footer should remain visible
* Avoid nested full-page scrolling
* On smaller screens, use nearly full-screen mode

The modal contains two main stages.

## Step 1 — Review Work Order

This is the existing form/review stage.

It should display a concise summary of:

* Product
* Item revision
* Production version
* Quantity and UOM
* Site
* Planned start
* Planned end
* Priority, if supported
* Selected or resolved production configuration

Primary action:

* `Create Work Order`

Secondary action:

* `Cancel`

After the user clicks `Create Work Order`, do not close the modal.

Lock Step 1 and transition the same modal to Step 2.

## Step 2 — Creation Progress

Step 2 is the main focus of this task.

The modal header should contain:

* Title: `Creating Work Order`
* Product code and product name
* Requested quantity
* Site
* Correlation or workflow reference
* WebSocket connection status
* Overall workflow status

Example header:

```text
Creating Work Order
FG-WS-CM01-R1 · Automotive Engine Mount · 1,000 PCS

Workflow: CR-WO-20260723-00042
Live updates connected
```

The user should be able to copy the workflow reference for troubleshooting.

---

# 5. Recommended Step 2 Layout

Use a two-column desktop layout.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Creating Work Order                         Live updates connected    │
│ FG-WS-CM01-R1 · 1,000 PCS · HN01                                 │
├──────────────────────────────────────┬───────────────────────────────┤
│                                      │                               │
│ Workflow timeline                    │ Work Order summary            │
│                                      │                               │
│ 01 Validate request                  │ Product                       │
│ 02 Resolve production version        │ Revision                      │
│ 03 Validate MBOM                     │ Production version            │
│ 04 Validate routing                  │ Planned dates                 │
│ 05 Validate resources                │ Quantity                      │
│ 06 Build operation plan              │                               │
│ 07 Build material requirements       │ Generated records             │
│ 08 Create Work Order                 │ WO operations: 6              │
│ 09 Queue integration event           │ Materials: 5                  │
│                                      │ Estimated duration            │
│                                      │ Warnings                      │
├──────────────────────────────────────┴───────────────────────────────┤
│ Workflow message / error detail                       Footer actions │
└──────────────────────────────────────────────────────────────────────┘
```

Recommended proportions:

* Left timeline: 62–68%
* Right summary panel: 32–38%

On mobile or narrow tablet widths:

* Stack the summary below the timeline
* Keep the active step visible near the top
* Do not compress status messages into unreadable rows

---

# 6. Workflow Timeline Design

Display workflow steps vertically.

Each step must include:

* Step number or status icon
* Human-readable title
* Short explanation
* Current status
* Optional elapsed duration
* Optional result summary
* Optional warning
* Optional error panel
* Optional technical details disclosure

Do not use only colors to communicate status.

Use icon, text, and visual state together.

## Supported UI statuses

Use a stable frontend state model such as:

```ts
type WorkflowStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "warning"
  | "event_queued"
  | "failed"
  | "timed_out"
  | "skipped"
  | "cancelled";
```

### Pending

Appearance:

* Neutral icon
* Muted text
* No animation
* Label: `Waiting`

### Running

Appearance:

* Animated spinner or subtle pulse
* Strong active border
* Expanded message area
* Label: `In progress`

Example:

```text
Validating production version
Checking release status, effective dates, site, and lot-size limits…
```

Avoid aggressive animation.

### Succeeded

Appearance:

* Check icon
* Success label
* Result message
* Duration when available

Example:

```text
Production version validated
PV-FG-WS-CM01-R1 is released and effective for this order.
Completed in 184 ms
```

### Warning

Use when the workflow may safely continue but the user should know about a non-blocking issue.

Example:

```text
Capacity warning
The requested period exceeds advisory capacity by 12%.
Work Order creation can continue, but planning should review the schedule.
```

Warnings must never be visually identical to failures.

### Event queued

Use this status for asynchronous downstream work when the create workflow only guarantees that an event has been safely created or written to the transactional outbox.

Do not show a green check with wording that implies the downstream service has already completed its work.

Use a distinct queued/sent icon and wording.

Example:

```text
Work Order event queued
MES.Execution.WOCreated.v1 was written to the transactional outbox.
Downstream services will process it asynchronously.
```

Another acceptable message:

```text
Material staging notification prepared
The integration event was queued successfully. Warehouse processing is not part of this creation workflow.
```

The UI may continue immediately after the backend confirms the outbox record was created.

### Failed

Appearance:

* Error icon
* Red/danger border
* Step remains expanded
* Clear business message
* Recommended correction
* Optional diagnostic section
* Retry action only when retry is safe

Example:

```text
MBOM validation failed

The selected production version references MBOM-WS-CM01-V3,
but the MBOM is not currently released.

How to resolve:
Release the MBOM or select another valid production version.
```

### Timed out

A timeout is not automatically the same as a business failure.

Example:

```text
Validation response timed out

The MES did not receive a response from Master Data within 15 seconds.
The Work Order has not been confirmed as created.

Check the connection and retry the status query.
```

The UI must determine the persisted workflow state before offering a create retry, to avoid duplicate Work Orders.

---

# 7. Recommended Workflow Steps

The exact implementation must follow the actual backend contract, but target the following user-facing sequence.

Do not create fake steps for behavior that does not exist.

## Step 1 — Validate creation request

Validate:

* Required fields
* UUID and identifier formats
* Quantity greater than zero
* UOM presence
* Site presence
* Planned start and end dates
* End date after start date
* Authenticated user
* Idempotency key
* Duplicate submission protection

Success message:

```text
Creation request accepted
The product, quantity, site, and planned dates are valid.
```

Failure examples:

* Invalid quantity
* Missing site
* Invalid production dates
* Missing authenticated user
* Duplicate request with conflicting payload

---

## Step 2 — Resolve and validate product revision

Validate:

* Item Revision exists
* Item Revision is released
* Item Revision is effective for the planned date
* Item is active
* Product belongs to the selected site where required

Success message:

```text
Product revision validated
FG-WS-CM01-R1 is released and effective for the planned production period.
```

---

## Step 3 — Resolve Production Version

Validate the selected or automatically resolved Production Version.

Check:

* Production Version exists
* Status is Released
* Effective date range includes the planned production date
* Site matches the Work Order site
* Product revision matches
* Requested quantity is within min/max lot-size boundaries
* The linked MBOM and Routing belong to the same production configuration
* Default selection is deterministic when no explicit version is supplied

Success message:

```text
Production configuration resolved
PV-FG-WS-CM01-R1 links the correct product revision, MBOM, and routing.
```

Result metadata may display:

* Production Version code
* Version
* Effective range
* Lot-size range

---

## Step 4 — Validate MBOM

Check:

* MBOM exists
* MBOM is Released and effective
* MBOM contains at least one line
* Quantities are positive
* UOM references are valid
* No circular hierarchy exists
* Phantom dependencies are valid
* Required child MBOMs are released and effective
* Issue operations exist
* Backflush configuration is valid
* Material quantities can be calculated for the requested WO quantity

Success example:

```text
MBOM validated
5 material requirements will be generated for 1,000 PCS.
```

Expandable result:

```text
Treated metal core      1,000 PCS
Rubber child blank      1,020 PCS
Raw steel blank         1,010 PCS
Bonding chemical        15 KG
EPDM parent roll        155 M²
```

Do not overload the primary timeline with a full BOM table. Put detailed records in a collapsible section or the right summary panel.

---

## Step 5 — Validate Routing

Check:

* Routing exists
* Routing is Released and effective
* At least one operation exists
* Operation sequences are unique
* Predecessors are valid
* No dependency cycle exists
* Default Work Centers are valid
* Required operations are active
* Confirmation mode and quantity reporting configuration are usable

Success example:

```text
Routing validated
6 production operations were found in the released routing.
```

Show concise operation sequence when expanded:

```text
10 Mixing
20 Metal Preparation
30 Cutting
40 Molding
50 Trimming
60 Quality Inspection
```

---

## Step 6 — Validate resources and production standards

Check actual implemented capabilities only.

Where supported, check:

* Work Center is active
* Work Center belongs to the correct site
* Resource capability contains an eligible resource
* Production Standard exists
* Setup and cycle values are positive
* Resource calendar covers the planned period
* Equipment/resource is not inactive
* Capacity advisory can be calculated

This stage may produce:

* Success
* Warning
* Failure

The severity must come from backend business rules.

Example success:

```text
Resources validated
All routing operations have an eligible Work Center and production standard.
```

Example non-blocking warning:

```text
Capacity advisory warning
The planned period has insufficient advisory capacity for operation OP-MOLD.
The Work Order can still be created as Draft.
```

Example blocking failure:

```text
Production standard missing
No effective production standard was found for OP-MOLD at WC-MOLD-01.
```

Do not let the frontend decide whether a warning is blocking.

---

## Step 7 — Calculate operation plan

Calculate and show:

* Number of generated WO operations
* Setup time
* Cycle time
* Expected duration
* Planned sequence and dependencies
* Planned quantity
* Default Work Center
* Snapshot reference where applicable

Running message:

```text
Building operation plan
Calculating setup time, cycle time, routing sequence, and planned resources…
```

Success message:

```text
Operation plan generated
6 Work Order operations were prepared with an estimated duration of 9 h 25 min.
```

---

## Step 8 — Calculate material requirements

Calculate:

* Required quantity based on requested production quantity
* Base quantity conversion
* Scrap allowance
* UOM
* Issue operation
* Backflush/manual issue mode
* Phantom behavior
* Material requirement count

Success message:

```text
Material requirements generated
5 material requirements were prepared from the released MBOM.
```

---

## Step 9 — Create Work Order transaction

This is a critical transactional step.

The backend must atomically persist the applicable records:

* Work Order header
* Work Order operations
* Work Order material requirements
* Workflow/audit metadata
* Transactional outbox record where part of the same transaction

The frontend must not show success until the database transaction commits.

Running message:

```text
Creating Work Order
Saving the Work Order, operation plan, and material requirements…
```

Success message:

```text
Draft Work Order created
WO-20260723-0042 was saved with 6 operations and 5 material requirements.
```

The right-side summary should update as soon as this result arrives:

* WO code
* WO ID, hidden under technical details unless useful
* Status: Draft
* Operation count
* Material requirement count
* Created by
* Created time

If the transaction rolls back, display:

```text
Work Order was not created
The database transaction was rolled back. No partial Work Order records were retained.
```

Only make this claim when rollback is guaranteed and verified by the backend.

---

## Step 10 — Queue Work Order event

The system publishes `MES.Execution.WOCreated.v1`.

Because this is asynchronous, distinguish between:

1. Outbox record created
2. Kafka relay published
3. Downstream consumer processed

The creation modal should only claim the level actually guaranteed by the backend.

Preferred minimum guarantee:

```text
Work Order event queued
MES.Execution.WOCreated.v1 was written to the transactional outbox.
Downstream processing will continue asynchronously.
```

When relay publication is also observed during the current workflow, the message may become:

```text
Work Order event published
MES.Execution.WOCreated.v1 was published successfully.
Downstream consumer completion is not required to finish Work Order creation.
```

Never display:

```text
WMS completed successfully
QMS completed successfully
Traceability completed successfully
```

unless those services actually send correlated completion acknowledgements and the workflow explicitly waits for them.

---

## Step 11 — Finalize workflow

Final successful state:

```text
Work Order created successfully

WO-20260723-0042 is now available as a Draft Work Order.
The production configuration, operations, and material requirements were saved.
The Work Order creation event was queued for downstream processing.
```

Primary button:

* `Open Work Order`

Secondary button:

* `Create Another`

Optional tertiary action:

* `Close`

Do not automatically close the modal immediately after success.

Let the user inspect the completed workflow.

---

# 8. Right-Side Summary Panel

The right panel should progressively populate as workflow information becomes available.

Sections:

## Request

* Product
* Revision
* Quantity
* UOM
* Site
* Planned start
* Planned end

## Resolved configuration

* Production Version
* MBOM
* Routing
* Work Centers count

## Generated plan

* Operations count
* Material requirements count
* Estimated duration
* Capacity status

## Creation result

* WO code
* WO status
* Created by
* Created at
* Event state

Use skeleton rows for values that are not available yet.

Do not display fake placeholder values.

---

# 9. WebSocket Architecture

Implement a dedicated Work Order creation progress channel.

Do not automatically reuse a kiosk-specific WebSocket contract unless its ownership and security model are appropriate for MES Console workflows.

The MES kiosk gateway currently owns the kiosk WebSocket hub and offline terminal queue. Verify whether it is architecturally correct to extend it for planner-facing MES Console workflow updates.

Preferred options, in order:

1. Add a properly owned WebSocket or Server-Sent Events endpoint to the MES execution boundary.
2. Add a dedicated workflow progress gateway if the repository architecture requires it.
3. Extend an existing shared gateway only when bounded-context ownership, authentication, authorization, routing, and scaling remain correct.

Do not make the browser connect directly to Kafka.

Do not expose internal Kafka topics to frontend clients.

---

# 10. Start Workflow Contract

The create request should return quickly with a workflow reference or establish a stream before expensive processing begins.

Possible contract:

```http
POST /api/mes/execution/work-orders/creation-workflows
Idempotency-Key: <uuid>
```

Example response:

```json
{
  "workflow_id": "crwo_01J...",
  "correlation_id": "f15c...",
  "status": "accepted",
  "stream": {
    "channel": "work-order-creation",
    "workflow_id": "crwo_01J..."
  }
}
```

Then subscribe:

```text
wss://<host>/api/mes/execution/ws/work-order-creation?workflow_id=crwo_01J...
```

Alternatively, establish the WebSocket first and send:

```json
{
  "type": "subscribe",
  "workflow_id": "crwo_01J..."
}
```

Choose the implementation that best matches the existing repository.

The workflow must be protected by authentication and authorization.

A user must not be able to subscribe to another user's workflow without permission.

---

# 11. WebSocket Event Contract

Define a stable versioned frontend contract.

Example event envelope:

```ts
interface WorkOrderCreationProgressEvent {
  event_id: string;
  event_type:
    | "workflow.started"
    | "step.started"
    | "step.succeeded"
    | "step.warning"
    | "step.event_queued"
    | "step.failed"
    | "step.timed_out"
    | "workflow.succeeded"
    | "workflow.failed"
    | "workflow.snapshot"
    | "heartbeat";
  schema_version: 1;
  workflow_id: string;
  correlation_id: string;
  sequence: number;
  occurred_at: string;
  source_service: string;
  step?: {
    id: string;
    order: number;
    title_key: string;
    status:
      | "pending"
      | "running"
      | "succeeded"
      | "warning"
      | "event_queued"
      | "failed"
      | "timed_out"
      | "skipped"
      | "cancelled";
    message_key: string;
    message_params?: Record<string, string | number>;
    started_at?: string;
    finished_at?: string;
    duration_ms?: number;
    result?: Record<string, unknown>;
    warning?: {
      code: string;
      message_key: string;
      remediation_key?: string;
    };
    error?: {
      code: string;
      message_key: string;
      message_params?: Record<string, string | number>;
      remediation_key?: string;
      retryable: boolean;
      technical_reference?: string;
    };
  };
  workflow?: {
    status:
      | "accepted"
      | "running"
      | "succeeded"
      | "failed"
      | "timed_out"
      | "cancelled";
    work_order_id?: string;
    work_order_code?: string;
  };
}
```

Requirements:

* Sequence numbers must be monotonic per workflow.
* Events must be idempotent.
* The frontend must ignore already-applied events.
* The frontend must detect sequence gaps.
* The frontend must request a workflow snapshot after reconnect or gap detection.
* Every event must include a timestamp.
* Every error must contain a stable machine-readable code.
* Localized user-facing text should be resolved in the frontend through i18n keys.
* Raw backend messages must not be the only user-facing text.
* Preserve a technical reference for logs and support.

---

# 12. Reconnect and Recovery

WebSocket disconnection must not destroy workflow visibility.

Display connection state in the modal header:

* `Connecting to live updates…`
* `Live updates connected`
* `Connection interrupted — reconnecting…`
* `Live connection unavailable`
* `Workflow status recovered`

On disconnect:

1. Do not mark the workflow as failed.
2. Continue reconnect attempts with bounded exponential backoff.
3. Show the last known workflow state.
4. Query a persisted workflow snapshot through HTTP.
5. Reconcile missing events using sequence number or latest snapshot.
6. Never restart Work Order creation automatically.
7. Never create another Work Order due only to WebSocket reconnection.

Suggested recovery endpoint:

```http
GET /api/mes/execution/work-order-creation-workflows/:workflowId
```

Example response:

```json
{
  "workflow_id": "crwo_01J...",
  "status": "running",
  "last_sequence": 8,
  "steps": [],
  "work_order": null
}
```

When the workflow already succeeded while disconnected, the recovered UI should immediately render the complete successful state.

---

# 13. Idempotency and Duplicate Protection

The final Create action must generate an idempotency key.

The key must remain stable across:

* Request retry
* HTTP timeout recovery
* WebSocket reconnect
* Browser retry after uncertain response

The backend must handle:

* Same idempotency key and same payload:

  * Return the existing workflow/result.
* Same idempotency key with a different payload:

  * Return a conflict.
* Duplicate browser clicks:

  * Do not create multiple Work Orders.

Disable the Create button immediately after submission.

Do not rely only on frontend button disabling for duplicate prevention.

---

# 14. Error UX

Errors must appear directly inside the failed workflow step.

Do not rely only on global toast notifications.

A toast may supplement the failure, but the timeline is the source of truth.

Each error panel should include:

* Human-readable title
* Human-readable explanation
* Affected entity
* Recommended action
* Retry availability
* Technical reference
* Expandable technical detail for authorized technical users

Example:

```text
Routing validation failed

Routing RT-FG-WS-CM01-V2 contains duplicate operation sequence 30.
The Work Order was not created.

Recommended action:
Correct and release a valid routing, then retry Work Order creation.

Reference: ERR-WO-ROUTING-SEQ-0042
```

Do not expose:

* Stack traces
* Database credentials
* SQL statements containing sensitive data
* Internal service secrets
* Raw network topology
* Access tokens

---

# 15. Failure Behavior and Actions

When a blocking validation fails before creation:

* Stop subsequent transactional steps
* Mark remaining steps as `Skipped`
* Clearly state that no Work Order was created
* Allow:

  * `Back to Edit`
  * `Close`
  * `Retry Validation`, only if safe

When creation transaction fails:

* Stop event publication
* Show rollback status when verified
* Do not offer `Open Work Order`
* Allow a safe retry using the same idempotency key or a backend-defined retry mechanism

When outbox creation fails:

* Treat the transactional result according to actual consistency rules
* If WO and outbox are required in one transaction, the whole creation must fail and roll back
* Do not create a WO without the required meaningful state-change outbox event

When Kafka relay publication is delayed after a committed outbox record:

* Work Order creation may complete
* Use `Event queued`, not `Downstream completed`
* Do not block indefinitely waiting for Kafka consumers

---

# 16. Footer Behavior by State

## Before submission

* Cancel
* Create Work Order

## While running

* Disable modal close through accidental outside click
* Allow deliberate `Hide and continue in background` only if workflow persistence and a recoverable notification center actually exist
* Otherwise provide `Keep open`
* Do not provide a destructive cancel button unless backend cancellation is supported safely

## Failed before creation

* Back to Edit
* Retry Validation, when safe
* Close

## Failed after uncertain transaction state

* Check Status
* Copy Reference
* Close

Do not offer direct create retry until persisted status is known.

## Succeeded

* Open Work Order
* Create Another
* Close

---

# 17. Accessibility

Implement:

* Correct dialog semantics
* Keyboard navigation
* Focus trapping
* Focus placed on the active workflow heading
* Screen-reader announcements for meaningful step changes
* `aria-live="polite"` for normal progress
* `aria-live="assertive"` for blocking failures
* Icons plus text, not color alone
* Sufficient contrast in light and dark themes
* Reduced-motion support
* Minimum click target sizes suitable for industrial desktop/tablet use

Do not announce every spinner frame or heartbeat.

---

# 18. Visual Design Direction

Follow the existing MES industrial design system:

* Deep navy for structure
* Slate surfaces
* Amber for active or attention states
* Green for verified success
* Red for blocking failures
* Blue or cyan for event queued/integration states
* High contrast
* Dense enough for professional manufacturing use
* Clear hierarchy
* No playful consumer-app illustrations
* No excessive gradients
* No confetti
* No oversized generic success graphic

Use existing shadcn-style primitives where possible.

Recommended components:

* `Dialog`
* `ScrollArea`
* `Badge`
* `Alert`
* `Collapsible`
* `Separator`
* `Tooltip`
* `Progress`, only as supplemental overall progress
* Shared status icon primitives
* Shared error panel
* Shared skeleton

An overall progress bar may be included, but the vertical workflow timeline remains the primary status representation.

Do not calculate misleading percentages when step weights are unknown.

A label such as `7 of 10 steps completed` is preferable to a fake `70%` if durations vary significantly.

---

# 19. Frontend State Management

Create a dedicated workflow reducer or state machine.

Do not scatter WebSocket event handling across individual components.

Suggested structure:

```text
features/work-orders/create/
  CreateWorkOrderDialog.tsx
  WorkOrderReviewStep.tsx
  WorkOrderCreationProgressStep.tsx
  WorkOrderCreationTimeline.tsx
  WorkOrderCreationStepRow.tsx
  WorkOrderCreationSummary.tsx
  WorkOrderCreationErrorPanel.tsx
  useWorkOrderCreationWorkflow.ts
  workOrderCreationReducer.ts
  workOrderCreation.types.ts
  workOrderCreation.i18n.ts
```

Adapt the paths to the actual project structure.

The state machine should support:

```text
review
→ submitting
→ connecting
→ running
→ succeeded

review
→ submitting
→ connecting
→ running
→ failed

running
→ disconnected
→ recovering
→ running/succeeded/failed
```

The modal must not reset to Step 1 due to a component re-render.

---

# 20. Backend Workflow Persistence

WebSocket messages alone are insufficient.

Persist enough workflow state to support:

* Reconnect
* Browser refresh
* HTTP recovery
* Troubleshooting
* Duplicate protection
* Final-state reconciliation

Use an existing workflow/audit mechanism if one exists.

Otherwise design the minimum necessary persistence, such as:

* Workflow ID
* Correlation ID
* User ID
* Idempotency key
* Request hash
* Current status
* Current step
* Last sequence number
* Step results
* Error code
* Work Order ID
* Created timestamp
* Updated timestamp
* Expiry/retention policy

Do not create a large generic orchestration framework unless justified.

---

# 21. Transaction and Event Semantics

Preserve the platform’s outbox requirement.

Meaningful transactional Work Order state changes must use the transactional outbox.

At minimum, ensure:

```text
Create WO header
+ Create WO operations
+ Create material requirements
+ Create WOCreated outbox record
= one consistent transactional boundary
```

If current source code uses a different verified transaction boundary, document it and preserve correctness.

For event-only stages:

* Wait only until the outbox/event record is safely created.
* Display `Queued for asynchronous processing`.
* Continue the modal workflow.
* Do not wait for unrelated downstream consumer success.
* Do not represent an emitted event as completed warehouse, quality, or traceability work.

---

# 22. Observability

Add structured logs with:

* Workflow ID
* Correlation ID
* Trace ID
* User ID
* Work Order ID, when created
* Step ID
* Step status
* Duration
* Error code

Add metrics where the current observability stack supports them:

* Work Order creation workflow count
* Success count
* Failure count by step
* Duration by step
* Total duration
* Reconnect count
* WebSocket active sessions
* Event queue failure count

Propagate trace context across:

* HTTP create request
* Internal workflow
* Master Data calls
* Database transaction
* Outbox
* WebSocket progress events

Do not log access tokens or sensitive payloads.

---

# 23. Internationalization

All user-facing strings must support:

* Vietnamese
* English
* Japanese
* Korean

Use translation keys and parameterized messages.

Do not stream final English sentences from the backend as the only display source.

Preferred backend payload:

```json
{
  "message_key": "workOrders.creation.steps.mbom.success",
  "message_params": {
    "materialCount": 5,
    "quantity": 1000,
    "uom": "PCS"
  }
}
```

The frontend resolves localized text.

Error codes must remain stable across locales.

---

# 24. Testing Requirements

Add tests for at least the following.

## Frontend

* Modal moves from Step 1 to Step 2 without closing
* Correct rendering for every status
* Events are applied in sequence
* Duplicate events are ignored
* Sequence gaps trigger snapshot recovery
* WebSocket reconnect does not submit another create request
* Failure appears inside the correct step
* Remaining steps become skipped after blocking failure
* Event queued state does not imply downstream completion
* Success buttons appear only after final success
* Closing and reopening or route recovery restores workflow when supported
* i18n keys exist
* Light and dark theme readability
* Keyboard and screen-reader behavior

## Backend

* Valid workflow creates one WO
* Invalid Item Revision fails at the correct step
* Invalid Production Version fails at the correct step
* Invalid MBOM fails at the correct step
* Invalid Routing fails at the correct step
* Missing resource/standard returns the correct severity
* Duplicate idempotency request does not create another WO
* Database rollback leaves no partial WO
* Outbox failure follows transactional consistency rules
* WebSocket subscriber authorization
* Reconnect snapshot returns the latest state
* Progress event sequence is monotonic
* Stable error codes are returned
* Circuit-breaker failures map to dependency errors
* Timeout is not reported as a false business validation failure

## Integration

* Create request to final UI success
* Create request to validation failure
* Create request with WebSocket disconnect and recovery
* Create request with delayed outbox relay
* Multiple simultaneous workflows do not leak updates between users
* Kafka/downstream unavailability does not create false completion claims

---

# 25. Acceptance Criteria

The implementation is accepted only when all of the following are true:

1. Clicking `Create Work Order` keeps the modal open and transitions to Step 2.
2. Step 2 displays a real workflow timeline.
3. Progress is delivered in real time through WebSocket or an explicitly approved equivalent.
4. Every displayed workflow result is backend-driven.
5. Errors appear directly in the corresponding step.
6. Blocking failure stops subsequent business steps.
7. Async event stages use `Event queued` or equivalent wording.
8. The UI never implies downstream processing has completed without evidence.
9. Reconnect does not create duplicate Work Orders.
10. Workflow state can be recovered after WebSocket interruption.
11. The WO database transaction does not leave partial records.
12. The `WOCreated` event follows the transactional outbox policy.
13. The final state provides `Open Work Order`.
14. Existing MES Console light/dark theme and i18n conventions remain intact.
15. Typecheck, tests, build, lint, and formatting checks pass.
16. No demo fallback is silently treated as production-ready validation.
17. No raw backend error string is used as the sole user-facing error.
18. The implementation record documents all verified behavior and remaining gaps.

---

# 26. Mandatory Investigation Before Implementation

Explicitly determine and document:

* Whether Work Order creation is currently synchronous
* Whether create, operation explosion, and material explosion are in one database transaction
* Whether `MES.Execution.WOCreated.v1` is created in the same transaction
* Whether Work Order creation has an idempotency mechanism
* Whether workflow progress is currently persisted
* Whether MES Console has any WebSocket client infrastructure
* Whether the kiosk gateway can securely and correctly serve MES Console clients
* Whether a new execution-owned WebSocket endpoint is required
* Whether the current API can expose each required step
* Which validations currently exist
* Which validations are documented intent only
* Which validations are missing
* Which errors have stable machine-readable codes
* Which stages are blocking versus advisory
* Which events only require outbox creation
* Which downstream acknowledgements, if any, actually exist

Do not hide missing functionality behind frontend animation.

---

# 27. Required Documentation

After implementation, create a Markdown implementation report under the repository’s established implementation-report location.

Suggested filename:

```text
implementation/mes-work-order-creation-realtime-progress.md
```

The report must include:

* Goal
* Previous behavior
* New user flow
* UI layout
* Workflow steps
* Status definitions
* Backend architecture
* WebSocket contract
* HTTP recovery contract
* Idempotency behavior
* Transaction boundaries
* Outbox semantics
* Error-code mapping
* Files changed
* Database changes
* API changes
* Event changes
* Security considerations
* Tests added
* Verification commands and results
* Screenshots or screenshot-review status
* Known limitations
* Evidence status for every important claim

Use the project’s evidence vocabulary:

* `IMPLEMENTED_AND_VERIFIED`
* `IMPLEMENTED_BUT_NOT_TESTED`
* `PARTIALLY_IMPLEMENTED`
* `DOCUMENTED_INTENT_ONLY`
* `PLANNED`
* `MISSING`
* `AMBIGUOUS`
* `CONFLICTING_SOURCES`
* `DEPRECATED`
* `DEMO_ONLY`

---

# 28. Mandatory Failure Report When Full Implementation Is Not Possible

If the requested behavior cannot be implemented safely or completely, do not silently deliver a mocked UI, fake WebSocket stream, hard-coded timers, or simulated successful steps.

Instead, create a Markdown feedback report.

Suggested filename:

```text
implementation-fix/mes-work-order-creation-realtime-progress-gap-report.md
```

The report must clearly explain:

## Requested behavior

Describe the requested Step 2 modal, real-time workflow, WebSocket updates, error-at-step behavior, and event-queued behavior.

## Current implementation evidence

List the exact source files, handlers, services, migrations, APIs, WebSocket components, and tests inspected.

## What is currently possible

List behavior that can be implemented safely with current architecture.

## What is not currently possible

For each gap, include:

```text
Status: MISSING_OR_UNVERIFIED
Expected behavior: <requested behavior>
Evidence searched: <paths, handlers, migrations, tests, runtime checks>
Gap: <what cannot be proven or implemented safely>
Recommended clarification: <specific architectural decision or required prerequisite>
```

## Architectural blockers

Examples:

* No execution-owned WebSocket endpoint
* Existing WebSocket gateway is kiosk-specific
* No persisted workflow model
* No idempotency contract
* Create handler is one opaque synchronous transaction
* Individual validations do not emit observable progress
* No stable error-code taxonomy
* Outbox state is not queryable
* Authentication cannot securely scope subscriptions
* No reconnect/snapshot mechanism
* Required transaction boundary cannot be proven

## Recommended implementation phases

Provide a concrete phased plan, for example:

### Phase A — Backend workflow observability

* Define workflow model
* Add workflow ID
* Add step-state persistence
* Add stable error codes
* Add idempotency

### Phase B — Realtime transport

* Add authenticated WebSocket endpoint
* Add workflow subscription authorization
* Add sequence and snapshot recovery

### Phase C — MES Console UX

* Add Step 2 progress modal
* Add timeline
* Add inline errors
* Add reconnect handling

### Phase D — Verification and hardening

* Integration tests
* Load tests
* Security tests
* Failure injection
* Browser review

## Risk assessment

Describe risks of implementing only the UI without the backend workflow contract.

## Final recommendation

State the smallest safe next step.

Do not claim completion when only the visual layout is implemented.

---

# 29. Prohibited Implementations

Do not:

* Use `setTimeout` to fake progress
* Randomly mark steps complete
* Infer backend progress from elapsed time
* Display all steps as successful after the final API returns without evidence
* Connect the browser directly to Kafka
* Reuse kiosk WebSocket authentication without verifying MES Console authorization
* Store access tokens in insecure locations
* expose another user’s workflow
* retry create automatically after an uncertain HTTP timeout
* show downstream WMS/QMS/Traceability completion when only an event was queued
* use one generic `Something went wrong` message for all failures
* leave the user with a permanent spinner
* close the modal automatically after success
* swallow backend errors
* bypass circuit breakers
* query another service’s database
* mark the feature `IMPLEMENTED_AND_VERIFIED` without repeatable verification

---

# 30. Expected Final Delivery

Deliver:

1. The implemented real-time Work Order creation workflow, when feasible.
2. Updated MES Console Step 1 and Step 2 modal.
3. Backend workflow progress contract.
4. Authenticated WebSocket streaming.
5. HTTP snapshot/recovery support.
6. Idempotency and duplicate protection.
7. Inline validation and transaction errors.
8. Correct asynchronous `event queued` semantics.
9. Automated tests.
10. Implementation report.

When full implementation is not feasible, deliver:

1. No fake implementation.
2. A detailed Markdown gap report.
3. Evidence-backed blockers.
4. A phased implementation recommendation.
5. A clear list of required architectural decisions.
