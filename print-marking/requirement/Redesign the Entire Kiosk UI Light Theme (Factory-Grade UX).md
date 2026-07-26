# Redesign the Entire Kiosk UI Light Theme (Factory-Grade UX)

## Objective

Perform a complete UX/UI redesign of the Kiosk UI **Light Mode**, starting with the **Label Template Management** page and then reviewing every screen in the application.

The current Light Theme feels visually inconsistent and difficult to use in a factory environment. Although all functions exist, the interface lacks hierarchy, spacing, readability, and a clear design system.

This is an industrial kiosk application that operators interact with for long periods during production. The design should prioritize:

- Fast information recognition
- Large readable typography
- Minimal cognitive load
- Clear visual hierarchy
- Consistent interaction patterns
- Excellent accessibility
- Enterprise-level appearance

Do **NOT** simply change colors.

Redesign the UI as a complete design system.

---

# Overall Design Direction

The application should feel similar to modern enterprise products such as:

- Linear
- Atlassian
- GitHub
- Azure Portal
- Stripe Dashboard
- Notion (information density)
- Industrial HMI / MES systems

Keywords

- Clean
- Minimal
- Spacious
- Industrial
- Professional
- High readability
- Consistent

Avoid consumer-style colorful interfaces.

---

# Current Problems

The current Label Template page has many UX issues:

- Weak visual hierarchy
- Almost everything has equal visual weight
- Poor spacing
- Too many thin borders
- Very little white space
- Buttons do not have clear priority
- Action icons look crowded
- Search/filter area feels disconnected
- Table header is difficult to distinguish
- Typography is too small
- Information density is too high
- Primary actions do not stand out
- Cards and tables have almost identical background colors
- Light mode contrast is inconsistent

Review every screen and fix similar issues.

---

# Build a Complete Light Theme Design System

Create one consistent design language shared by the entire Kiosk UI.

Everything should reuse the same colors, typography, spacing, radius, shadows and interaction states.

Do not redesign individual pages independently.

---

# Color System

Adopt the following Light Theme palette consistently.

## Page Background

```
#F7F8FA
```

Never use pure white as the page background.

---

## Surface

```
#FFFFFF
```

Used for

- Cards
- Tables
- Panels
- Dialogs
- Forms

---

## Primary Brand Color

Keep the current orange identity but modernize it.

Primary

```
#F97316
```

Hover

```
#EA580C
```

Pressed

```
#C2410C
```

Light background

```
#FFF7ED
```

---

## Secondary Accent

```
#2563EB
```

Used for

- Links
- Secondary actions
- Information badges

---

## Success

```
#16A34A
```

---

## Warning

```
#D97706
```

---

## Error

```
#DC2626
```

---

## Neutral Colors

Primary text

```
#111827
```

Secondary text

```
#6B7280
```

Placeholder

```
#9CA3AF
```

Borders

```
#E5E7EB
```

Table header background

```
#F3F4F6
```

Hover

```
#F9FAFB
```

Selected row

```
#EFF6FF
```

---

# Typography

Increase readability significantly.

## Page Title

32px

Bold

---

## Section Title

22px

Semibold

---

## Card Title

18px

Semibold

---

## Table Header

14px

Semibold

Uppercase is NOT required.

---

## Body

15-16px

Regular

---

## Secondary Information

13px

Medium

---

Avoid tiny fonts.

Factory operators often stand 50–100 cm away from the display.

---

# Layout System

Use a modern spacing scale.

```
4
8
12
16
20
24
32
40
48
```

No random spacing.

Every page should follow the same spacing rhythm.

---

# Cards

Cards should have

- larger padding
- subtle shadow
- soft border
- rounded corners

Example

```
Border Radius

12px

Border

#E5E7EB

Shadow

Very subtle
```

Avoid thick borders.

---

# Tables

The current tables feel outdated.

Redesign every data table.

Requirements

- Taller rows
- Better spacing
- Sticky header
- Hover effect
- Clear active row
- Better alignment
- Better typography
- Zebra striping optional if it improves readability
- Left-align textual information
- Right-align numeric values

---

# Search & Filters

Move search and filters into one unified toolbar.

Suggested layout

```
Search

Category

Status

Date

Refresh

↓

Actions
```

Everything should align vertically.

Avoid floating controls.

---

# Buttons

Define hierarchy.

Primary

Filled Orange

Secondary

Outlined

Tertiary

Ghost

Danger

Red

Do not give every button the same visual weight.

---

# Icons

Increase icon size slightly.

Improve spacing between icons.

Every action should have a tooltip.

Frequently used actions should appear first.

Group destructive actions separately.

---

# Status Badges

Current badges are visually weak.

Redesign using

- better padding
- softer colors
- consistent height
- icon support where appropriate

Example

Published

Green

Draft

Gray

Archived

Slate

Default

Blue

---

# Forms

Increase spacing.

Better labels.

Larger inputs.

Better validation.

Consistent helper text.

---

# Dialogs

Review every modal.

Requirements

- Larger header
- Clear footer
- Better spacing
- Primary action always on the right
- Escape closes dialog
- Consistent width

---

# Navigation

Audit the left sidebar.

Improve

- spacing
- hover state
- active state
- typography
- icon alignment

Ensure the active page is immediately recognizable.

---

# Label Template Management

Redesign this page completely.

Improve

- Header
- Toolbar
- Search
- Filters
- Table
- Action buttons
- Empty state
- Loading state
- Pagination
- Status badges
- Category badges

Increase readability while reducing visual clutter.

The page should immediately communicate

- template name
- template type
- label size
- status
- printer assignment

without overwhelming the operator.

---

# Consistency Audit

Review every page in the Kiosk UI.

Examples

- Dashboard
- Production Orders
- Production History
- Alarm Center
- Device Configuration
- Network
- Diagnostics
- Label Templates
- Printer Assignment
- Traceability
- Authentication pages
- Detail dialogs
- History dialogs

Every screen must follow the same design language.

No page should feel visually different.

---

# Accessibility

Verify

- Contrast ratio
- Keyboard navigation
- Focus states
- Screen scaling
- Large touch targets
- Color blindness friendliness

Never rely on color alone to communicate status.

---

# Responsive Behavior

Optimize layouts for industrial kiosk displays.

Primary targets

- 1920×1080
- 1366×768

Avoid excessive scrolling.

Important information should remain above the fold.

---

# Implementation Requirements

- Reuse existing reusable components whenever possible.
- Refactor duplicated UI patterns into shared components.
- Build a consistent design token system.
- Do not introduce page-specific colors.
- Keep all interactions smooth and predictable.

---

# Final Verification Checklist

Before completing the redesign, verify:

- A consistent Light Theme design system has been applied across the entire Kiosk UI.
- Typography is larger and significantly easier to read.
- The color palette follows the defined standards.
- Tables, cards, forms, dialogs, navigation, and toolbars share a unified visual language.
- The Label Template Management page has been completely redesigned with improved hierarchy and usability.
- Button hierarchy is clear and consistent.
- All pages have been visually audited and updated to match the new design system.
- The interface feels like a modern enterprise MES / industrial kiosk application rather than a collection of individual pages.
- No existing functionality has been broken during the redesign.

```

```
