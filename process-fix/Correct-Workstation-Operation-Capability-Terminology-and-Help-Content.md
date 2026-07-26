# Correct Workstation Operation Capability Terminology and Help Content

## Objective

Improve the Workstation "Supported Operations" section so it reflects the correct MES business meaning.

Do not remove any existing fields.

Keep:

- Supported Operation
- Cycle Time
- Setup Time
- Reference Quantity

The goal is to correct terminology, translations, help content, and user understanding.

---

# 1. Correct Cycle Time Business Meaning

The current implementation incorrectly treats Cycle Time as a property of the Workstation.

The correct business meaning is:

```text
Cycle Time
=
Estimated processing time required
for THIS Workstation
to execute
THIS Operation
for the specified Reference Quantity.
```

It belongs to the relationship:

```text
Workstation
+
Operation
↓
Cycle Time
```

NOT

```text
Workstation
↓
Cycle Time
```

Every supported Operation may therefore have a different Cycle Time.

Example:

```text
Workstation A

Mixing
Cycle Time = 45 sec

Molding
Cycle Time = 120 sec

Inspection
Cycle Time = 30 sec
```

Planning later uses these values to estimate execution duration.

Update every translation, label, tooltip and detail page accordingly.

---

# 2. Keep Setup Time

Do not remove Setup Time.

Define it consistently as:

```text
Preparation time required before
production of this Operation starts.
```

Typical setup activities:

- Install tooling
- Change mold
- Warm up machine
- Clean workstation
- Load fixture
- PLC initialization
- Safety inspection

Setup Time occurs once before production.

It is NOT repeated for every produced quantity.

Planning calculates:

```text
Total Duration
=
Setup Time
+
Run Time
```

Update all translations and descriptions.

---

# 3. Rename Base Quantity Translation

Do not remove this field.

Keep the business concept.

Rename:

Vietnamese

```text
Số lượng cơ sở
```

to

```text
Số lượng tham chiếu
```

English

```text
Reference Quantity
```

Use this terminology consistently across:

- Workstation
- Planning
- Production Standard
- Routing diagnostics
- Detail pages
- Help pages

Business meaning:

```text
The quantity represented
by the entered Cycle Time.

Example

Reference Quantity = 10

Cycle Time = 120 sec

↓

10 products require
approximately 120 seconds.
```

Planning automatically scales
for larger or smaller quantities.

---

# 4. Update Supported Operation Description

Replace the helper description.

Current wording incorrectly implies
the Workstation owns a generic cycle time.

Use wording equivalent to:

Vietnamese

```text
Khai báo các công đoạn mà Workstation này có thể thực hiện,
đồng thời xác định thời gian xử lý ước tính
và thời gian chuẩn bị cho từng công đoạn.
```

English

```text
Define the Operations supported by this Workstation.

Each supported Operation has its own
Cycle Time,
Setup Time,
and Reference Quantity.
```

---

# 5. Add Help Icons

Use the existing shadcn/ui + Radix Popover.

Do NOT build a custom tooltip component.

Every following field must display
a circular help icon.

Fields:

- Supported Operation
- Cycle Time
- Setup Time
- Reference Quantity

The help icon must:

- open on hover
- open on keyboard focus
- support mobile click
- be reusable
- support localization

---

# 6. Cycle Time Popover

Title

```text
Cycle Time
```

Content

```text
Estimated processing time.

This is the estimated time required
for this Workstation
to complete this Operation
for the specified Reference Quantity.

This value is used by
production planning,
capacity planning,
and scheduling.

Example

Reference Quantity = 10

Cycle Time = 120 sec

↓

10 products
require approximately
120 seconds.
```

---

# 7. Setup Time Popover

Title

```text
Setup Time
```

Content

```text
Preparation time before production.

Setup includes all preparation work
required before the Operation can begin.

Typical examples:

• Install tooling
• Change mold
• Warm up machine
• Clean workstation
• Load fixtures

Setup Time happens once
before production starts.

It is not repeated
for every produced item.
```

---

# 8. Reference Quantity Popover

Title

```text
Reference Quantity
```

Content

```text
The quantity represented
by the Cycle Time.

Cycle Time always belongs
to a specific quantity.

Example

Reference Quantity = 10

Cycle Time = 120 sec

↓

10 products
require approximately
120 seconds.

The system automatically
calculates estimated duration
for different production quantities.
```

---

# 9. Supported Operation Popover

Title

```text
Supported Operation
```

Content

```text
Operations this Workstation
is capable of executing.

Each supported Operation
stores its own planning parameters,
including:

• Cycle Time
• Setup Time
• Reference Quantity

Routing later selects
a Work Center.

Planning automatically resolves
an eligible Workstation
that supports the selected Operation.
```

---

# 10. Detail Page

Update the Workstation Detail page.

The "Supported Operations" section must explain:

```text
A Workstation may support
multiple Operations.

Each Operation has independent

• Cycle Time

• Setup Time

• Reference Quantity

These values are planning estimates
used by Routing,
Scheduling,
and Capacity Planning.
```

Do not describe Cycle Time
as belonging to the Workstation itself.

---

# 11. Workstation Help Modal

Update the Detail/Help modal.

Add a section:

```text
How Supported Operations Work
```

Explain:

```text
1. Create Operations in the Operation Catalog.

2. Add supported Operations
to a Workstation.

3. Configure
Cycle Time,
Setup Time,
and Reference Quantity
for each Operation.

4. Assign the Workstation
to one or more Work Centers.

5. Routing selects Work Centers.

6. Planning automatically resolves
an eligible Workstation
that supports the selected Operation.
```

Explain that:

- Routing never directly selects a Workstation.
- Workstation capability drives planning.
- Machine Groups execute the selected Workstation.

---

# 12. Translation Cleanup

Audit every occurrence of:

- Cycle Time
- Setup Time
- Base Quantity
- Supported Operation

across:

- Workstation
- Planning
- Routing
- Production Standard
- Detail pages
- Help pages
- Validation messages
- Popovers
- Tooltips

Use consistent business terminology everywhere.

Do not leave any legacy wording.

---

# 13. Acceptance Criteria

The implementation is complete when:

- Cycle Time is consistently defined as the estimated processing time for a specific Operation executed by a specific Workstation.
- Setup Time is consistently defined as preparation time before production starts.
- "Số lượng cơ sở" is replaced by "Số lượng tham chiếu" (Reference Quantity).
- Every Supported Operation owns its own Cycle Time, Setup Time, and Reference Quantity.
- Help icons are added for all four fields using shadcn/ui + Radix Popover.
- Workstation Detail and Help pages explain the complete planning flow.
- All translations are updated consistently in VI/EN/JA/KO.