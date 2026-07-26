# Kiosk UI Dashboard Refactor
## Project: Print Marking Station (Station Agent)
## Priority: High
## Goal

Refactor the Dashboard page to behave like a real industrial kiosk used on a factory production line.

The dashboard should **always present the latest production execution result**, instead of becoming empty after a job finishes.

The operator should immediately know:

- What production order just finished
- Whether it succeeded
- How many labels were printed
- How many failed
- When it finished
- Whether another production order has arrived

The dashboard should become a **real-time production monitoring screen**, not merely a live execution page.

---

# 1. Dashboard State Rule

Completely redesign the Dashboard state management.

Current behavior

Job finishes

↓

Dashboard becomes empty

↓

Operator loses all context

New behavior

Dashboard always displays the **latest executed Production Order**.

Only replace the dashboard when a newer Production Order starts.

Example

Production Order

PO-2026-001

Quantity

10 pcs

Execution

Completed

Dashboard should continue displaying

Production Order

PO-2026-001

Progress

10 / 10

Status

Completed

Completed Time

09:23:51

Success

10

Failed

0

Duration

15 sec

The operator should still be able to inspect the completed job until a newer job arrives.

---

# 2. Last Running Job Cache

Use Zustand as the single source of truth.

Create:

lastProductionExecutionStore

Example state

```ts
{
    productionOrder,
    workflow,
    operation,
    station,
    team,

    totalQuantity,
    completedQuantity,
    failedQuantity,

    progress,

    startTime,
    finishTime,

    duration,

    status,

    workOrderSummaries,

    latestUpdated
}
```

Behavior

When Job Started

↓

Store becomes current job

When Progress Updated

↓

Store updates immediately

When Job Completed

↓

Keep final state

Do NOT clear it.

When New Production Order Starts

↓

Replace cache.

---

# 3. Progress Bar Behavior

The progress bar should always remain at its final state after completion.

Wrong

Job Done

↓

Progress resets to 0

Correct

Job Done

↓

Progress remains

10 / 10

100%

Completed

Until another production order begins.

---

# 4. Production Summary Card

Redesign the Production Information card.

Display

Production Order

Workflow

Current Operation

Station

Assigned Team

Operator

Start Time

Finish Time

Execution Duration

Total Quantity

Completed

Failed

Remaining

Current Status

Progress Bar

Example

Production Order

PO-2026-001

Status

Completed

Progress

10 / 10

Completed

10

Failed

0

Duration

15 sec

Finished

09:23:51

This should become the primary focus of the dashboard.

---

# 5. Clicking Dashboard Opens Detail

Clicking the Production Summary card should open the same Production Detail dialog used by History.

DO NOT duplicate components.

Reuse the History Detail modal.

Create one common component.

ProductionExecutionDetailModal

Used by

Dashboard

History

Search Result

Notifications

Future pages

Only fetch different data.

Never duplicate UI.

---

# 6. Dashboard Should Use Common Components

Extract

Production Summary Card

Progress Widget

Job Status Badge

Operation Timeline

History Detail Modal

Execution Statistics

into reusable components.

Avoid duplicated layouts.

---

# 7. Remove Unnecessary Sections

Completely remove

3. Traceability

6. Camera Verification Result

These are not useful on the main Dashboard.

They already exist elsewhere.

The Dashboard should focus only on active production execution.

---

# 8. Station Activity Log

Replace current event log.

Instead of showing technical events

MQTTReceived

JobCreated

ProjectionUpdated

etc.

Show

Last 10 Production Orders.

Each row

Production Order

Product

Quantity

Completed

Failed

Finish Time

Status

Example

PO-2026-0008

Bearing Seal

100 pcs

Completed

09:12

PO-2026-0007

O-Ring

250 pcs

Completed

08:55

PO-2026-0006

Oil Seal

80 pcs

Failed (2)

08:41

Very compact.

Do NOT display verbose logs.

The dashboard is for operators.

Not developers.

---

# 9. Live Update

Dashboard must update instantly.

SignalR Event

↓

Zustand Store

↓

Dashboard

No manual refresh.

No polling.

No page reload.

---

# 10. Prevent Infinite Rendering

Review every page using

useEffect()

Search for

Repeated fetches

Infinite dependency loops

Object dependency changes

Anonymous callback dependencies

Repeated SignalR subscriptions

Multiple store updates

Fix all unstable effects.

Requirements

Every SignalR subscription

must unsubscribe correctly.

Every interval

must clear.

Every timeout

must clear.

Memoize expensive computations.

Use

useMemo

useCallback

only where appropriate.

Avoid unnecessary re-rendering.

---

# 11. Better Information Hierarchy

Current dashboard uses many similar font sizes.

The operator cannot quickly identify important information.

Refactor typography.

Recommended hierarchy

Production Order

Largest

Status

Large

Progress

Large

Completed Quantity

Medium

Station

Medium

Operator

Medium

Workflow

Small

Metadata

Small

Use stronger visual contrast.

---

# 12. Improve Spacing

Increase spacing between sections.

Avoid dense information blocks.

Recommended

Large outer padding

Larger card spacing

More whitespace

Consistent alignment

Better vertical rhythm

---

# 13. Better Progress Widget

Instead of only

0 / 10

Show

██████████

10 / 10

Completed

100%

Remaining

0

Success

10

Failed

0

Duration

15 sec

Finished

09:23:51

Everything visible at one glance.

---

# 14. Production Lifecycle

Dashboard represents exactly one Production Order.

Idle

↓

Waiting

↓

Receiving

↓

Printing

↓

Completed

↓

Keep Result

↓

New Production Order Arrives

↓

Replace Dashboard

Never clear automatically.

---

# 15. Dashboard Loading Behavior

If there has never been any execution

Display

Waiting for Production Order...

instead of empty placeholders.

If previous execution exists

Always display it.

---

# 16. Responsive Industrial Layout

Optimize for

22"

24"

27"

Industrial touch screens.

Cards should remain readable from several meters away.

Minimum font sizes

Section Titles

20~24 px

Values

18~22 px

Metadata

14~16 px

Never use overly small text.

---

# 17. UX Principles

Design the dashboard as an industrial production monitoring screen.

The operator should understand the current production state within 3 seconds.

Prioritize

Current Production

↓

Execution Result

↓

Progress

↓

Statistics

↓

Recent Production Orders

Avoid displaying developer-oriented technical events or logs on the primary dashboard.

---

# 18. Architecture Constraints

- Do not break Database-per-Service architecture.
- Do not query another service database directly.
- Dashboard data must come only from Projection Service and SignalR events.
- Zustand stores only UI state, never business persistence.
- Production Detail modal must be reused across Dashboard and History.
- Dashboard should always render the latest cached Production Order until replaced by a newer one.