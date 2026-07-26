# Label Template Management Audit & Refactor
## Project: Print Marking Station (Station Agent)
## Priority: High
## Goal

Refactor the entire Label Template Management module to support a real industrial MES + Print Marking environment.

The current implementation appears to only manage a small number of generic templates. Based on the production requirements and label classification provided, the system must evolve into a scalable template management platform capable of supporting different label types, printers, products, and production scenarios.

Before making any code changes, perform a complete audit of the existing implementation.

---

# Phase 1 — Audit Current Label Template Architecture

Before writing any code, inspect the entire current implementation.

Review:

- Database schema
- Entity relationships
- Seed data
- API endpoints
- Services
- Repository layer
- Label rendering engine
- ZPL template engine
- Template preview
- Printer assignment
- Print Job pipeline
- Device Simulator integration
- Kiosk UI configuration
- History module
- Template selection logic

Answer the following questions.

---

## 1. Template Storage

Verify:

- How are templates currently stored?
- Are they stored as ZPL?
- JSON?
- HTML?
- Mixed?

Determine whether the current model is extensible enough for enterprise manufacturing.

---

## 2. Template Assignment

Verify how templates are currently selected.

Questions:

Is one template used globally?

Is template selected by printer?

By station?

By product?

By workflow?

By operation?

If not, identify missing capabilities.

---

## 3. Printer Mapping

Inspect whether templates are mapped to

Printer

Station

Printer Model

Label Size

Media Type

Print Resolution (203dpi / 300dpi)

If no mapping exists,
document it as an architectural gap.

---

## 4. Template Rendering

Review

Current ZPL generation

Determine whether

Layout

Fonts

QRCode

Barcode

Dynamic Fields

Conditional Fields

Margins

Label Size

Rotation

Preview

are all generated dynamically.

Identify hardcoded values.

---

## 5. Preview Pipeline

Verify

Preview UI

↓

Template Engine

↓

Generated ZPL

↓

Rendered Preview

↓

Printed Label

Confirm that Preview and Actual Print use the exact same template.

No duplicated rendering logic.

---

## 6. Database Design

Review all template-related tables.

Determine whether they can support

Versioning

Revision

Template Status

Printer Compatibility

Media Size

Orientation

Paper Size

Default Template

Company-specific templates

Future customer templates

If not,

recommend schema improvements.

---

# Phase 2 — Target Architecture

The system should manage label templates similarly to workflow templates.

A Label Template becomes a managed production asset.

Each template contains

Metadata

↓

Rendering Definition

↓

Printer Compatibility

↓

Preview

↓

Version

↓

Deployment Status

---

# Phase 3 — Supported Label Types

Create default templates for the following industrial scenarios.

## 1. Shelf / Rack / Storage Label

Purpose

Warehouse location identification

Recommended

50 × 30 mm

QR Code or Code 128

---

## 2. Inspection / Supervisor Label

Purpose

Inspection records

Recommended

100 × 60 mm

Code128

---

## 3. Roll / Material Reel Label

Purpose

Rubber rolls

Raw material reels

Recommended

100 × 80 mm

or

120 × 80 mm

Large barcode

---

## 4. Pallet Label

Purpose

Shipping

Warehouse

Forklift scanning

Recommended

100 × 150 mm

Large QR

Large Barcode

Long scan distance

---

## 5. Parent Rubber Sheet Label

Purpose

Parent Sheet ID

Recommended

80 × 50 mm

or

100 × 60 mm

QR

---

## 6. Child Rubber Sheet Label

Purpose

Individual sheet tracking

Recommended

40 × 25 mm

or

50 × 30 mm

Small QR

---

## 7. Semi Finished Product (WIP)

Purpose

MES Tracking

Operation Tracking

Recommended

60 × 40 mm

QR

---

## 8. Material Issue Label

Purpose

Warehouse → MES

Recommended

100 × 60 mm

Barcode + QR

---

# Phase 4 — Required Metadata

Each Label Template should include

Template Code

Template Name

Description

Label Category

Paper Width

Paper Height

Orientation

Printer DPI

Supported Printer Models

Compatible Station Types

Default Font

QR Type

Barcode Type

Default Margins

Version

Revision

Status

Created Date

Updated Date

---

# Phase 5 — Printer Assignment

Templates should NOT be selected manually every print.

Instead

Printer

↓

Assigned Default Template

↓

Print Job

↓

Automatically uses template

Allow overriding only when necessary.

---

# Phase 6 — Verify Existing Seed Data

Inspect all current seeded templates.

Determine

Which templates are obsolete

Which templates are duplicated

Which templates have incorrect sizes

Which templates are hardcoded

Do not blindly append new records.

---

# Phase 7 — Generate Database Injection Script

After the audit is complete,

generate a single SQL injection script that inserts the default industrial label templates.

The script should

- be idempotent where possible
- avoid duplicate records
- preserve existing production data
- insert realistic metadata
- assign reasonable default paper sizes
- assign supported barcode types
- assign supported printer compatibility

Do NOT execute the script automatically.

Output the SQL separately for review.

---

# Phase 8 — Verification Checklist

Before implementation is considered complete, verify every item below.

## Database

- Label templates exist
- No duplicate template codes
- Version information stored
- Printer compatibility stored

---

## API

Verify endpoints

List Templates

Get Template

Preview Template

Assign Template

Default Template

Search

Filter

Version History

---

## Kiosk UI

Verify

Template Management page

Preview

Filtering

Searching

Version display

Paper size display

Printer compatibility

Default template badge

Assignment workflow

---

## Print Engine

Verify

Correct template selected

Correct ZPL generated

Correct paper size

Correct margins

Correct QR

Correct barcode

Correct font scaling

Preview matches printed output

---

## Printer Assignment

Verify

Every printer has exactly one default template

Override logic works

Template switching works

---

## History

Verify

Printed history records the

Template ID

Template Version

Printer

Station

Generated ZPL

Preview snapshot

---

## Device Simulator

Verify

Simulator can request different template IDs

Template routing behaves correctly

Generated ZPL changes according to selected template

---

# Final Deliverables

Only after all verification passes, generate:

1. Architecture review report
2. Gap analysis
3. Refactoring recommendations
4. Database schema improvements (if required)
5. SQL injection script for default label templates
6. Verification checklist with pass/fail result for every subsystem

Do not skip the audit phase. The implementation must first validate the current architecture before inserting new templates or modifying the print pipeline.