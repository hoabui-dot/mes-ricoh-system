# Refactor Print Pipeline: Batch Label Preparation & Single Printer Dispatch

## Objective

Refactor the current printing strategy of the Print Marking Station to significantly improve throughput when processing Production Orders.

Currently, the system generates the ZPL content for each label one-by-one, then immediately sends each label individually to the printer. This causes unnecessary latency because the printer repeatedly waits for the backend to generate the next label.

Instead, the system should prepare the complete batch of labels in memory first, then send the entire batch to the printer in a single request, allowing the printer to print continuously without interruption.

This optimization must preserve the current CQRS, Event-Driven Architecture, Database-per-Service, and Projection architecture.

---

# Current Flow (Incorrect)

Example

Production Order

PO-2026-0001

Quantity: 10 pcs

Current implementation

Device Simulator

↓

Job Engine

↓

Generate Label #1

↓

Send to Printer

↓

Generate Label #2

↓

Send to Printer

↓

Generate Label #3

↓

...

↓

Generate Label #10

↓

Send to Printer

Problems

- Printer waits for backend after every label.
- ZPL generation happens serially.
- USB printer stays idle between labels.
- Total print time increases dramatically.
- CPU and printer cannot work in parallel.

This architecture does not utilize Zebra printers efficiently.

---

# New Target Flow

Device Simulator

↓

Production Order

↓

Job Engine

↓

Expand Production Order into Print Tasks

↓

Generate ALL label data in memory

↓

Generate ONE complete ZPL batch

↓

Send ONE print request

↓

Printer prints continuously

↓

Update task progress while printing

The printer should receive one continuous ZPL stream containing all labels.

Example

Production Order

10 pcs

↓

Generate

Label1

Label2

...

Label10

↓

Merge

^XA
...
^XZ

^XA
...
^XZ

...

^XA
...
^XZ

↓

One TCP / CUPS request

↓

Printer prints all labels continuously.

---

# Separate Two Different Phases

The printing pipeline should be divided into two independent phases.

## Phase 1

Preparing Print Data

Responsibilities

- Expand Production Order
- Generate serial numbers
- Generate QR payload
- Generate label variables
- Select label template
- Render complete ZPL
- Merge into one print batch

No communication with the printer occurs during this phase.

Everything is prepared in memory.

---

## Phase 2

Printing

Responsibilities

- Send complete ZPL batch
- Monitor printer progress
- Update task status
- Handle printer failures
- Handle retry logic

The printer should never wait for additional ZPL generation.

---

# Introduce a New Job Status

The current status model does not clearly indicate that the backend is preparing print data.

Introduce a dedicated state.

Recommended status

PREPARING

Meaning

"The system is generating all print payloads before sending them to the printer."

This state appears between

QUEUED

↓

PREPARING

↓

PRINTING

↓

COMPLETED

If a new status cannot be added because of compatibility constraints, reuse an existing intermediate status only if its semantics clearly match "preparing print data". Do not misuse PRINTING for work that has not yet reached the printer.

---

# Dashboard Behaviour

When a Production Order enters PREPARING

The Kiosk UI should immediately display

Status

Preparing Labels...

Progress

Preparing

Estimated quantity

10 pcs

Operator should understand that

The printer has NOT started yet.

The backend is preparing the print batch.

---

# Progress Behaviour

Example

Production Order

10 pcs

PREPARING

Preparing 10 labels

↓

PRINTING

Printer starts

↓

1 / 10

↓

2 / 10

↓

...

↓

10 / 10

↓

Completed

Do NOT show

0 / 10 Printing

while the backend is still generating ZPL.

That is misleading.

---

# ZPL Generation Strategy

Instead of

Generate

↓

Print

↓

Generate

↓

Print

Generate

ALL labels first.

Example

Memory

labels[]

↓

Render

label1.zpl

label2.zpl

...

label10.zpl

↓

Concatenate

completeBatch.zpl

↓

One printer request

---

# Label Rendering

Label generation should remain template-driven.

For every Print Task

Resolve

- Label Template
- Product
- QR payload
- Serial
- Batch
- Revision
- Company
- Material
- Production Date

Render individual label

↓

Append into final batch.

Do not duplicate rendering logic.

---

# Printer Adapter

Printer Adapter should expose a batch-print interface.

Example concept

PrintBatch(List<RenderedLabel>)

instead of

PrintSingle(RenderedLabel)

The adapter is responsible for

- Building one ZPL document
- Sending one request
- Returning printer response

Projection Service must never know how batches are printed.

---

# Memory Considerations

Do not generate an unbounded batch.

Recommended strategy

If

Quantity <= configurable batch size

Generate everything.

If

Quantity is extremely large

Example

5000 pcs

Split into configurable chunks.

Example

100 labels

↓

One ZPL batch

↓

Next 100

↓

Next batch

Chunk size must be configurable.

---

# Job Engine

Job Engine remains the orchestration service.

Responsibilities

- Receive Production Order
- Expand into Print Tasks
- Transition status
- Invoke Printer Adapter
- Publish events
- Track progress

Do not move rendering logic into Projection Service.

---

# Projection Service

Projection Service must remain read-only.

It should receive events such as

ProductionPreparing

ProductionPrinting

PrintProgressChanged

ProductionCompleted

Projection Service must never generate labels or query Job Engine databases.

---

# Event Flow

Recommended events

ProductionPreparingStarted

↓

PrintBatchPrepared

↓

PrintingStarted

↓

PrintTaskCompleted

↓

ProductionCompleted

Projection updates the read model only from these events.

---

# Failure Handling

If preparation fails

Status

FAILED

Printer must never receive partial data.

If printer communication fails

Preparation remains completed.

Printing becomes failed.

The batch may be retried without regenerating labels if the payload is still valid.

---

# Kiosk UI

Dashboard should display

Queued

Preparing

Printing

Completed

Failed

Preparing should have

- Spinner
- "Preparing Labels..."
- Quantity
- Estimated label count

Printing should display

Current

4 / 10

instead of

Preparing.

---

# Performance Goal

Compared to the current implementation

Expected improvements

- Eliminate idle time between labels.
- One printer communication instead of one request per label.
- Continuous Zebra printing.
- Higher USB throughput.
- Lower CPU idle time.
- Better operator feedback.
- More deterministic print duration.

---

# Architecture Constraints

Do NOT break

- Database per Service
- DDD
- CQRS
- Event-Driven Architecture
- Outbox Pattern
- Projection Pattern

Projection Service must never generate ZPL.

Printer Adapter owns printer communication.

Job Engine owns orchestration.

---

# Verification Checklist

Before completing the implementation, verify all of the following:

- A Production Order containing 10 labels generates all label payloads before contacting the printer.
- The printer receives one continuous ZPL batch instead of 10 independent requests.
- The dashboard shows **PREPARING** before **PRINTING**.
- Operators can clearly distinguish between "preparing labels" and "actively printing".
- Printing progress starts only after the printer begins consuming the batch.
- Projection Service remains read-only and receives state changes only through events.
- Printer Adapter supports batch printing and still supports both Device Simulator and physical Zebra printers through the same abstraction.
- Large Production Orders are automatically chunked using a configurable batch size.
- No regression is introduced to the existing CQRS, DDD, Database-per-Service, Outbox Pattern, or Event-Driven Architecture.