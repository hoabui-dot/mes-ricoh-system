# Feature Refactor: Separate Media Profile from Label Template (Support Multi-Across Label Rolls)

## Objective

Refactor the current Label Template architecture to correctly model industrial label printing.

The previous implementation incorrectly treated **2-Up / 3-Up** as a template rendering layout.

This is **not the actual business requirement**.

The real requirement is to support **different physical label rolls** (media), where each roll contains one or more labels across its width.

The Label Template should continue describing **only one label**, while a new **Media Profile** should describe how many labels exist across a physical roll.

The Printer Adapter must remain generic and should never contain hardcoded logic for 1-label, 2-label, or 3-label rolls.

---

# Background

Current architecture:

Production Order

↓

Job Engine

↓

Printer Adapter

↓

Load Label Template

↓

Generate ZPL

↓

Printer

The overall architecture remains unchanged.

Only the Label Template subsystem and rendering pipeline should be refactored.

---

# Problem Statement

The previous implementation introduced concepts like:

- Rows
- Columns
- 2-Up
- 3-Up
- Custom Layout

inside the Label Template.

This is incorrect.

Those concepts describe **multiple labels inside one canvas**, not the actual physical label media.

Our production environment does **not** print multiple stacked labels inside one template.

Instead, we use different physical label rolls.

Example:

## Roll Type A

One label per feed.

```text
+-------------+
|   Label     |
+-------------+
```

---

## Roll Type B

Two labels printed side-by-side on the same roll.

```text
+-------------+-------------+
|   Label A   |   Label B   |
+-------------+-------------+
```

The printer advances the media once, producing two labels.

---

## Roll Type C

Three labels printed side-by-side.

```text
+-------------+-------------+-------------+
|   Label A   |   Label B   |   Label C   |
+-------------+-------------+-------------+
```

This is a **physical media characteristic**, not a template characteristic.

---

# New Architecture

Separate the printing model into two independent concepts.

## 1. Media Profile (Physical Roll)

This describes the physical label stock.

Example fields:

- Name
- Description
- Roll Width
- Roll Height
- Single Label Width
- Single Label Height
- Labels Across
- Horizontal Gap
- Feed Direction
- Printable Area
- Margin Left
- Margin Right
- Margin Top
- Margin Bottom

Example:

```text
Media Profile

Name:
50x30 Roll (2 Across)

Roll Width:
102 mm

Roll Height:
30 mm

Single Label Width:
50 mm

Single Label Height:
30 mm

Labels Across:
2

Horizontal Gap:
2 mm
```

---

## 2. Label Template

The Label Template should describe only **one label**.

It contains:

- QR Code
- Barcode
- Text
- Logo
- Dynamic Fields
- Bindings
- Fonts
- Positions

It should never know whether the printer uses a 1-across, 2-across, or 3-across roll.

---

# Rendering Pipeline

The rendering engine should become:

Production Order

↓

Job Engine

↓

Load Assigned Template

↓

Load Assigned Media Profile

↓

Batch Renderer

↓

Generate One ZPL

↓

Printer

The renderer combines:

- Label Template
- Media Profile
- Print Data

to produce the final output.

---

# Batch Rendering

Example:

Production Order requires:

10 labels

Printer is assigned:

Media Profile

Labels Across = 2

The renderer should generate:

Batch 1

Label 1

Label 2

↓

Batch 2

Label 3

Label 4

↓

Batch 3

Label 5

Label 6

...

Each batch generates **one ZPL document**.

The printer receives:

5 ZPL batches

instead of

10 independent print commands.

This significantly improves throughput.

---

# Printer Adapter Responsibilities

The Printer Adapter must never contain logic such as:

```csharp
if (TwoAcross)
```

or

```csharp
if (ThreeAcross)
```

or

```csharp
if (TemplateType == ...)
```

Instead:

1. Load Media Profile.
2. Read Labels Across.
3. Calculate X offsets.
4. Duplicate the same label horizontally.
5. Generate one ZPL batch.

The adapter remains completely generic.

---

# Batch Renderer Responsibilities

Create a dedicated Batch Renderer responsible for:

- Splitting Production Orders into print batches
- Reading Media Profile metadata
- Calculating X offsets
- Applying horizontal spacing
- Rendering multiple label instances
- Producing a single ZPL document per batch

This logic must not be embedded inside printer drivers.

---

# Label Template Management

Refactor the management UI.

Remove:

- Rows
- Columns
- 2-Up
- 3-Up
- Custom Layout

The Label Template editor should only edit one label.

Example:

QR

Product Name

Lot Number

Serial

Date

Logo

Fonts

Bindings

Nothing related to media layout belongs here.

---

# New Media Profile Management Module

Introduce a new management module:

Media Profiles

Each profile contains:

- Profile Name
- Description
- Roll Width
- Roll Height
- Single Label Width
- Single Label Height
- Labels Across
- Horizontal Gap
- Feed Direction
- Printable Area
- Default DPI
- Supported Printer Models

CRUD operations:

- Create
- Edit
- Delete
- Clone
- Preview

---

# Printer Assignment

Printer assignment becomes:

Printer

↓

Media Profile

↓

Label Template

Example:

Printer A

↓

50x30 Roll (2 Across)

↓

Product Label

Printer B

↓

100x60 Roll (Single)

↓

Warehouse Label

Printer C

↓

100x30 Roll (3 Across)

↓

Traceability Label

Changing the roll should only require selecting another Media Profile.

No backend code changes.

---

# Preview Engine

The preview must combine:

Label Template

-

Media Profile

The preview should display the actual physical roll.

Example:

Single:

```text
+-------------+
|   Label     |
+-------------+
```

2 Across:

```text
+-------------+-------------+
|   Label     |   Label     |
+-------------+-------------+
```

3 Across:

```text
+-------------+-------------+-------------+
|   Label     |   Label     |   Label     |
+-------------+-------------+-------------+
```

The preview must match the printed result exactly.

---

# Database Changes

Introduce a new entity:

MediaProfile

Suggested fields:

- Id
- Name
- Description
- RollWidth
- RollHeight
- LabelWidth
- LabelHeight
- LabelsAcross
- HorizontalGap
- FeedDirection
- MarginLeft
- MarginRight
- MarginTop
- MarginBottom
- Dpi
- IsDefault
- CreatedAt
- UpdatedAt

Update LabelTemplate:

Remove layout-related fields.

Store only:

- Template Content
- Elements
- Bindings
- Version
- Metadata

Update Printer:

Add:

AssignedMediaProfileId

Update Printer Assignment UI accordingly.

---

# Future Scalability

This architecture should support:

- 1-across rolls
- 2-across rolls
- 3-across rolls
- 4-across rolls
- N-across rolls

without modifying:

- Printer Adapter
- Label Template
- Rendering Engine

Only new Media Profiles should be required.

---

# Backward Compatibility

Existing templates must continue to work.

Migration strategy:

1. Create a default Media Profile for every existing template.
2. Automatically assign printers to the default profile.
3. Preserve all existing template content.
4. Ensure no production interruption.

---

# Verification Checklist

Before closing the implementation, verify:

- Label Template no longer stores media layout information.
- Media Profile is introduced as an independent domain model.
- Printer Assignment references Media Profile.
- Batch Renderer renders labels according to Labels Across.
- Printer Adapter contains zero hardcoded layout logic.
- Preview correctly displays the physical roll layout.
- Existing templates remain functional.
- Existing printers continue to print without modification.
- One ZPL document is generated per print batch.
- Production Orders with large quantities are automatically grouped according to the selected Media Profile.
- The architecture is scalable for future N-across label rolls without further backend refactoring.
