# Feature: Support Multi-Label Layout (2-Up / 3-Up / Custom) in Label Template System

## Objective

Refactor the current label printing architecture so that the number of labels printed per batch (Single, 2-Up, 3-Up, etc.) becomes part of the **Label Template configuration**, not the Printer Adapter implementation.

The Printer Adapter should remain generic and only render templates based on metadata. It must not contain hardcoded logic for specific layouts.

---

# Current Architecture

Current flow:

Production Order
→ Job Engine
→ Printer Adapter
→ Load Label Template
→ Render ZPL
→ Send to Zebra GK420t

This architecture should remain unchanged.

The improvement is to make the Label Template capable of describing multiple print layouts.

---

# Design Principles

The Printer Adapter must never contain logic such as:

- if template == A then print 2 labels
- if template == B then print 3 labels
- if printer == Zebra then use another algorithm

Layout behavior must come entirely from template metadata.

---

# Introduce Layout Metadata

Every Label Template should contain layout metadata.

Example:

- Label Width
- Label Height
- Rows
- Columns
- Horizontal Gap
- Vertical Gap
- Print Direction

Example metadata:

Rows = 2
Columns = 1
Horizontal Gap = 2 mm
Vertical Gap = 1 mm

The rendering engine should automatically generate the correct ZPL positions for each label.

---

# Separate Physical Size From Layout

A template should have two independent concepts:

## Physical Label Size

Examples:

- 50 × 30 mm
- 100 × 60 mm
- 100 × 80 mm
- 100 × 150 mm

These describe the physical media.

---

## Print Layout

Examples:

- Single
- 2-Up Vertical
- 2-Up Horizontal
- 3-Up
- Custom

These describe how many labels are rendered inside one print batch.

Changing the layout must not require modifying the printer service.

---

# Rendering Engine

The rendering engine should:

1. Read template metadata.
2. Calculate element offsets.
3. Duplicate the label layout according to Rows × Columns.
4. Generate a single ZPL document containing all labels.
5. Send the entire ZPL batch to the printer once.

No additional printer-specific logic should be required.

---

# Label Template Management UI

Add a new "Print Layout" section.

Suggested options:

- Single
- 2 Labels
- 3 Labels
- Custom

If "Custom" is selected, display:

- Rows
- Columns
- Horizontal Gap
- Vertical Gap

The preview should update immediately after changes.

---

# Preview Engine

The preview must accurately represent:

- canvas size
- label positions
- spacing
- margins
- QR/Barcode positions
- text positions

The preview should always match the final printed output.

---

# Printer Assignment

Printer Assignment should remain independent.

Example:

Printer A
→ Warehouse Label
→ 50 × 30 mm
→ 2-Up

Printer B
→ Product Label
→ 100 × 60 mm
→ Single

Only the assigned template changes.

The Printer Adapter should automatically honor the template metadata.

---

# Internal Data Model

Refactor the template structure into clearly separated layers:

Template
→ Canvas Size
→ Layout Metadata
→ Elements
→ Data Binding
→ Printer Assignment

This separation makes the system easier to maintain and extend.

---

# Future Scalability

The implementation should support future layouts without changing backend code, including:

- 2-Up
- 3-Up
- 4-Up
- N-Up
- Landscape
- Portrait
- Continuous Labels
- Gap Labels
- Black Mark Labels

Future additions should only require creating new template metadata, not modifying the Printer Adapter.

---

# Verification Checklist

Verify that:

- Printer Adapter contains no layout-specific hardcoded logic.
- Layout is fully driven by template metadata.
- Preview matches printed output.
- Single, 2-Up, and 3-Up layouts work correctly.
- Existing templates remain backward compatible.
- Printer Assignment continues to function without changes.
- A single ZPL batch is generated and sent for all labels in the selected layout.
