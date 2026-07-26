# Feature: Upgrade Product Label to QR Code (2D) for Won Seal Tech Manufacturing

Before implementing any changes, analyze the existing Label Template system, ZPL Generator, Print Adapter, Kiosk Dashboard, Print History, and Label Preview pipeline.

Do not simply replace the barcode.

Refactor the entire label generation flow to support enterprise label templates that accurately represent Won Seal Tech manufacturing products.

---

# Business Background
# Feature: Upgrade Product Label to QR Code (2D) for Won Seal Tech Manufacturing

Before implementing any changes, analyze the existing Label Template system, ZPL Generator, Print Adapter, Kiosk Dashboard, Print History, and Label Preview pipeline.

Do not simply replace the barcode.

Refactor the entire label generation flow to support enterprise label templates that accurately represent Won Seal Tech manufacturing products.

---

# Business Background

The MES belongs to

Won Seal Tech Co., Ltd.

The company manufactures precision industrial rubber components including

- Bearing Seals
- O-Rings
- Gaskets
- Rubber-to-Metal Bonding Parts
- Automotive Rubber Components

The printed label represents a finished production item.

It is not a shipping label.

It is not a warehouse pallet label.

It is not an internal debug label.

The label must identify a single manufactured product.

---

# New Label Specification

Replace the current barcode implementation.

Current

Code128 (1D)

↓

New

QR Code (2D)

The QR Code becomes the primary machine-readable identifier.

---

# Physical Label Size

Target media

Width

50 mm

Height

30 mm

Printer

Zebra GK420t

203 DPI

The ZPL must be generated specifically for a 50x30 mm label.

No automatic scaling.

No clipping.

No overflow.

All elements must remain inside the printable area.

---

# QR Code Content

The QR Code should encode the complete product identifier.

Example payload

{
  "serial":"SN-PO-2026-0001-000001",
  "product":"BEARING-SEAL-01",
  "revision":"Rev A",
  "batch":"BATCH-01"
}

The QR payload should be configurable in the Label Template.

Never hardcode the fields.

---

# Human Readable Information

Only essential production information should be printed.

Recommended layout

------------------------------------------------

Won Seal Tech Co., Ltd.

Bearing Seal

Product Code

BEARING-SEAL-01

Serial Number

SN-PO-2026-0001-000001

Batch

BATCH-01

Revision

Rev A

□□□□□□□□□□□□□□□□

(QR CODE)

------------------------------------------------

Avoid printing unnecessary debug information.

Do not print

Gateway IDs

MQTT IDs

Job IDs

Projection IDs

Database IDs

RabbitMQ IDs

Correlation IDs

Internal Trace IDs

---

# Label Layout

Design a professional industrial manufacturing label.

Suggested layout

Top Area

Company Name

Won Seal Tech Co., Ltd.

Second Line

Product Name

Third Line

Product Code

Fourth Line

Serial Number

Bottom Left

Batch

Revision

Bottom Right

QR Code

The QR Code should occupy approximately

35%–40%

of the label.

Fonts should remain readable after printing.

---

# Label Template System

Create a new template

Industrial Product QR Label

Version

1.0

Label Size

50 x 30 mm

Barcode Type

QR Code

Printer DPI

203

Store this template in the database.

Never hardcode the ZPL.

---

# ZPL Generator

Generate ZPL dynamically from the Label Template.

Support

QR Code

Dynamic Fields

Margins

Font Size

Alignment

Future Template Versioning

The generator must not contain product-specific logic.

---

# Kiosk Dashboard

The Dashboard currently previews only a barcode.

Replace it with a realistic label preview.

Display

50x30 Label Preview

Company Name

Product

Serial Number

Batch

Revision

QR Code

The preview should visually match the physical printed label.

---

# Print History

Each historical print record should display

Small Label Thumbnail

QR Preview

Product Code

Serial Number

Batch

Revision

Print Timestamp

Printer

Operator

Clicking a record opens

Full Label Preview

Exactly matching the printed output.

---

# Work Order Detail

Inside the Work Order Detail modal,

replace the barcode preview with the new QR label preview.

Each Production Item should display

Serial

Status

Current Operation

QR Label Preview

Print Status

Reprint Count

---

# Dashboard Synchronization

The same label must be rendered consistently across

Dashboard

↓

Work Order Detail

↓

Print History

↓

Actual Printed Label

All previews must be generated from the same Label Template.

Do not maintain separate rendering implementations.

---

# Label Rendering Engine

Create a shared rendering layer.

The same data model should generate

React Preview

↓

ZPL

↓

Print History Thumbnail

This guarantees consistency.

---

# Validation

Verify

✓ 50x30 mm layout

✓ QR Code readable

✓ Company information displayed

✓ Product information correct

✓ Serial Number correct

✓ Batch correct

✓ Revision correct

✓ No debug information

✓ No overflow

✓ No clipped text

✓ Dashboard preview matches printer

✓ Print History preview matches printer

✓ Work Order preview matches printer

✓ QR Code scans successfully

---

# Deliverables

Implement

- New Industrial Product QR Label Template
- Database seed data
- Updated ZPL Generator
- Updated Label Rendering Engine
- Updated Dashboard Preview
- Updated Work Order Preview
- Updated Print History Preview
- QR Code support
- 50x30 mm optimized layout
- Shared rendering architecture
- Unit Tests
- Integration Tests
- Documentation update

The final implementation must ensure that every finished product printed by Won Seal Tech uses a professional 50×30 mm QR label, with identical rendering across the printer, Dashboard, Work Order Detail, and Print History.
The MES belongs to

Won Seal Tech Co., Ltd.

The company manufactures precision industrial rubber components including

- Bearing Seals
- O-Rings
- Gaskets
- Rubber-to-Metal Bonding Parts
- Automotive Rubber Components

The printed label represents a finished production item.

It is not a shipping label.

It is not a warehouse pallet label.

It is not an internal debug label.

The label must identify a single manufactured product.

---

# New Label Specification

Replace the current barcode implementation.

Current

Code128 (1D)

↓

New

QR Code (2D)

The QR Code becomes the primary machine-readable identifier.

---

# Physical Label Size

Target media

Width

50 mm

Height

30 mm

Printer

Zebra GK420t

203 DPI

The ZPL must be generated specifically for a 50x30 mm label.

No automatic scaling.

No clipping.

No overflow.

All elements must remain inside the printable area.

---

# QR Code Content

The QR Code should encode the complete product identifier.

Example payload

{
  "serial":"SN-PO-2026-0001-000001",
  "product":"BEARING-SEAL-01",
  "revision":"Rev A",
  "batch":"BATCH-01"
}

The QR payload should be configurable in the Label Template.

Never hardcode the fields.

---

# Human Readable Information

Only essential production information should be printed.

Recommended layout

------------------------------------------------

Won Seal Tech Co., Ltd.

Bearing Seal

Product Code

BEARING-SEAL-01

Serial Number

SN-PO-2026-0001-000001

Batch

BATCH-01

Revision

Rev A

□□□□□□□□□□□□□□□□

(QR CODE)

------------------------------------------------

Avoid printing unnecessary debug information.

Do not print

Gateway IDs

MQTT IDs

Job IDs

Projection IDs

Database IDs

RabbitMQ IDs

Correlation IDs

Internal Trace IDs

---

# Label Layout

Design a professional industrial manufacturing label.

Suggested layout

Top Area

Company Name

Won Seal Tech Co., Ltd.

Second Line

Product Name

Third Line

Product Code

Fourth Line

Serial Number

Bottom Left

Batch

Revision

Bottom Right

QR Code

The QR Code should occupy approximately

35%–40%

of the label.

Fonts should remain readable after printing.

---

# Label Template System

Create a new template

Industrial Product QR Label

Version

1.0

Label Size

50 x 30 mm

Barcode Type

QR Code

Printer DPI

203

Store this template in the database.

Never hardcode the ZPL.

---

# ZPL Generator

Generate ZPL dynamically from the Label Template.

Support

QR Code

Dynamic Fields

Margins

Font Size

Alignment

Future Template Versioning

The generator must not contain product-specific logic.

---

# Kiosk Dashboard

The Dashboard currently previews only a barcode.

Replace it with a realistic label preview.

Display

50x30 Label Preview

Company Name

Product

Serial Number

Batch

Revision

QR Code

The preview should visually match the physical printed label.

---

# Print History

Each historical print record should display

Small Label Thumbnail

QR Preview

Product Code

Serial Number

Batch

Revision

Print Timestamp

Printer

Operator

Clicking a record opens

Full Label Preview

Exactly matching the printed output.

---

# Work Order Detail

Inside the Work Order Detail modal,

replace the barcode preview with the new QR label preview.

Each Production Item should display

Serial

Status

Current Operation

QR Label Preview

Print Status

Reprint Count

---

# Dashboard Synchronization

The same label must be rendered consistently across

Dashboard

↓

Work Order Detail

↓

Print History

↓

Actual Printed Label

All previews must be generated from the same Label Template.

Do not maintain separate rendering implementations.

---

# Label Rendering Engine

Create a shared rendering layer.

The same data model should generate

React Preview

↓

ZPL

↓

Print History Thumbnail

This guarantees consistency.

---

# Validation

Verify

✓ 50x30 mm layout

✓ QR Code readable

✓ Company information displayed

✓ Product information correct

✓ Serial Number correct

✓ Batch correct

✓ Revision correct

✓ No debug information

✓ No overflow

✓ No clipped text

✓ Dashboard preview matches printer

✓ Print History preview matches printer

✓ Work Order preview matches printer

✓ QR Code scans successfully

---

# Deliverables

Implement

- New Industrial Product QR Label Template
- Database seed data
- Updated ZPL Generator
- Updated Label Rendering Engine
- Updated Dashboard Preview
- Updated Work Order Preview
- Updated Print History Preview
- QR Code support
- 50x30 mm optimized layout
- Shared rendering architecture
- Unit Tests
- Integration Tests
- Documentation update

The final implementation must ensure that every finished product printed by Won Seal Tech uses a professional 50×30 mm QR label, with identical rendering across the printer, Dashboard, Work Order Detail, and Print History.

## Require label UI
┌──────────────────────────────────────────────┐
│ WON SEAL TECH CO., LTD.       ████████████   │
│ Bearing Seal                  █ QR CODE █    │
│ Product : BEARING-SEAL-0      ████████████   │
│ Serial  : SN-PO-2026-0001-000001             │
│ Batch   : BATCH-01     Rev : : A             │
└──────────────────────────────────────────────┘