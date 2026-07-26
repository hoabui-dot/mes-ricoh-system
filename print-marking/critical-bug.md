# Critical Bug Investigation: Wrong Label Template, Wrong Barcode Type, Incorrect Label Layout

Before changing any code, perform a complete end-to-end investigation of the barcode printing pipeline.

Do NOT immediately modify the ZPL.

First identify where the incorrect label template and barcode type originate.

The goal is to ensure that every printed label matches the business requirement for the current manufacturing process.

---

# Current Problem

The physical Zebra printer is printing labels similar to development/demo templates.

Observed issues:

- A 2D DataMatrix barcode is printed.
- Multiple unnecessary product fields are printed.
- Font size is too small.
- Layout exceeds the intended printable area.
- The printed label does not match the MES label specification.
- The label appears to use an old or incorrect template.

For the current production process, this is incorrect.

---

# Expected Business Requirement

Each production item should produce exactly one product identification label.

Each label contains only:

• Product Barcode (1D)

• Human Readable Barcode Number

No additional manufacturing information should be printed unless explicitly configured in the label template.

The label should be simple, clean, and optimized for fast scanning.

Example

------------------------------------------------

████████████████████████████

SN-PO-2026-0001-000001

------------------------------------------------

Nothing else is required for the current implementation.

---

# Step 1 — Trace the Entire Printing Pipeline

Trace every stage of the printing pipeline.

Production Order

↓

Production Item

↓

Work Order

↓

Dispatch

↓

Job Engine

↓

Print Adapter

↓

Label Template

↓

ZPL Generator

↓

CUPS

↓

Zebra Printer

Determine exactly where

DataMatrix

is introduced.

Determine where

extra product fields

are introduced.

Determine which component chooses the label template.

Do not assume the ZPL Generator is the source of the problem.

---

# Step 2 — Verify Label Template Selection

The system must support Label Templates.

Currently it appears an incorrect template is being selected.

Verify

Production Order

↓

Workflow

↓

Operation

↓

Label Template

↓

Print Job

Only the assigned template should be used.

Never use a default development template.

Never hardcode a template.

---

# Step 3 — Replace Current Template

Create a new default template named

Basic Product Barcode

Template contents

1

Code128 Barcode

2

Human Readable Barcode

Only.

Remove

Product Description

Batch

Revision

Customer

Work Order

Station

Operator

Timestamp

Trace ID

Debug Information

QR Code

DataMatrix

Logo

Everything else.

The label should contain only the product identifier.

---

# Step 4 — Barcode Type

The current implementation prints a DataMatrix.

Replace it with

Code128

The barcode value should be

Serial Number

Example

SN-PO-2026-0001-000001

Human readable text below the barcode must display exactly the same value.

---

# Step 5 — Label Size

Determine the actual printer media configuration.

Read the configured label dimensions.

Verify

Width

Height

DPI

Margins

Printable Area

The generated ZPL must exactly match the physical label dimensions.

Do not scale fonts arbitrarily.

---

# Step 6 — Generate Proper ZPL

Generate clean ZPL similar to

^XA

^PW...

^LL...

^LH0,0

^BY3,3,90

^FO40,30

^BCN,90,Y,N,N

^FDSN-PO-2026-0001-000001^FS

^XZ

Requirements

Centered

Readable

Proper quiet zone

No clipping

No overlap

Human readable text enabled.

---

# Step 7 — Preview Synchronization

The Barcode Preview inside the Dashboard must render exactly the same barcode.

The Preview and ZPL must share the same barcode value.

Never generate different barcode contents.

Preview

↓

Printed Label

must always match.

---

# Step 8 — History

Print History should display

Barcode Preview

Barcode Value

Label Template

Print Timestamp

Printer

Status

Reprint Count

The preview must match the printed label.

---

# Step 9 — Remove Hardcoded Metadata

Search the entire project for

Product Description

Industrial Part

Batch

Revision

WO

Customer

Trace ID

DataMatrix

QR

Remove any hardcoded content that belongs to old development templates.

Only render fields that are defined by the active Label Template.

---

# Step 10 — Verify Printer Configuration

Verify

Printer DPI

203 DPI

Darkness

Print Speed

Label Width

Label Height

Gap

Calibration

Ensure that the printer is not automatically scaling the label.

---

# Expected Label

The printed label should resemble the following structure

+--------------------------------------+

██████████████████████████████████

SN-PO-2026-0001-000001

+--------------------------------------+

Large barcode

Centered

Readable

Large human readable text

No unnecessary fields

No DataMatrix

No debug information

---

# Validation Checklist

Verify

✓ Correct Label Template selected

✓ No development template

✓ Code128 printed

✓ Human readable text visible

✓ Correct barcode value

✓ Proper label dimensions

✓ Dashboard preview matches printer output

✓ Print History preview matches printer output

✓ No clipped barcode

✓ No tiny fonts

✓ No DataMatrix

✓ No QR code

✓ No hardcoded metadata

✓ One Production Item produces one clean product label

---

# Deliverables

The implementation must include

- Root cause analysis document
- Correct Label Template implementation
- New Basic Product Barcode template
- Refactored Label Template selection logic
- Updated ZPL Generator
- Updated Barcode Preview
- Updated Print History Preview
- Removal of hardcoded template fields
- Unit Tests
- Integration Tests

The final result must ensure that every printed label contains only a clean 1D Code128 barcode and its corresponding human-readable serial number, perfectly aligned with the physical label size and identical to the Dashboard preview.