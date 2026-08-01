# UI Design System

## Design Language

The operational consoles should be quiet, dense, and work-focused. The UI is for repeated factory planning, configuration, execution, and quality tasks, not marketing.

## Base Components

Use existing shared/base components for:

- Tables.
- Modals/dialogs.
- Confirmation dialogs.
- Inputs/selects/checkboxes/tabs.
- Badges/status indicators.
- Tooltips.
- Pagination.
- Loading/empty/error states.

## Modal System

Rules:

- One shared layout.
- Bounded scrollable content.
- Footer actions with cancel/back on left and save/confirm on right.
- Destructive actions require confirmation.
- No browser `confirm()`.

## Table System

Default page size is 10. Supported larger sizes include 50 and 100 where the shared contract applies. Tables should show localized name and business code, not raw UUIDs.

## Form System

Forms must:

- hydrate latest data on edit.
- reset when switching from edit to create.
- clear dependent values when parents change.
- block save while loading required options.
- show backend validation details.
- preserve UOM numeric editing string and compact persisted display.

## Colors and Typography

Use existing Tailwind/theme tokens. Keep headings proportional to the panel/screen. Do not use oversized hero typography inside dense operational forms.

## Layout

Operational pages should support scanning and comparison. Avoid nested cards and decorative page sections. Use cards only for repeated items, modals, and genuinely framed tools.

## Responsive Rules

Text must not overlap or overflow controls. Fixed-format UI such as grids, boards, icon buttons, and counters needs stable dimensions.

## Accessibility

Use semantic controls, focusable actions, labels, status text, keyboard reachable dialogs, and non-color-only status communication.

## Localization

VI is default; EN/JA/KO are supported. Status/type/error codes must translate. Do not render `[object Object]`, raw enum keys, or untranslated backend payloads.

## Identity Display

Every entity displays localized name first and business code second. Internal UUIDs are internal technical IDs only.
