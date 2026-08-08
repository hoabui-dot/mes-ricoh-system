# Phase 6 Prompt — Kiosk Label Designer, Asset Library, Approval Workflow, RBAC, and Accessibility

## Role

Implement the production Kiosk Label Designer and management UI.

Load and obey `00_EXECUTION_RULES.md`. Continue automatically to Phase 7.

## Objective

Build a Vietnamese visual designer, template list/detail, asset library, variables/layers/warnings panels, preview, approval, activation, version history, printer assignment, and test-print workflow.

## Routes and screens

Implement or extend:

```text
Mẫu tem
Danh sách mẫu tem
Chi tiết mẫu tem
Thiết kế mẫu tem
Thư viện biểu tượng và hình ảnh
Phê duyệt mẫu tem
In thử
Gán mẫu tem cho máy in
Lịch sử phiên bản
```

## Designer

Use React, TypeScript, shadcn/ui, and `react-konva` or the repository-approved equivalent.

Layout:

```text
Top toolbar
Left element palette
Center millimeter canvas
Right properties
Bottom variables/layers/warnings/previews
```

Support grid, ruler, snap, guides, zoom, pan, drag, resize, rotate, copy/paste, undo/redo, z-order, lock, duplicate, delete, printable bounds, and DPI switching.

Element palette:

- Văn bản
- Mã vạch
- Mã QR
- Đường thẳng
- Khung
- Biểu tượng
- Hình ảnh

Do not allow arbitrary HTML or JavaScript.

## Properties

Implement common position, size, rotation, z-index, visibility, condition, binding, and lock settings.

Implement typed properties for text, Code 128, QR, line/box, image/icon asset, render mode, threshold, and stored/inline strategy preference.

## Variables, layers, warnings

Support schema editing, sample data, validation, enum/date options, unused/missing variable warnings, layer order, visibility/lock, click-to-select validation issues, and server-preflight results.

## Asset library

Support safe upload, search/filter, preview, checksum, variants, usage references, activation status, and printer cache status.

## Lifecycle and RBAC

Display and enforce the DRAFT-to-RETIRED workflow. Approved versions are read-only; editing creates a new version.

Suggested roles:

- Operator
- Supervisor
- Label Engineer
- Maintenance
- Super Admin

Backend remains authoritative. Use `<ConfirmDialog>` for approval, activation, retirement, raw ZPL, and test print.

## Localization and accessibility

All visible strings must be Vietnamese through centralized translation. Code/comments remain English.

Verify keyboard navigation, focus, screen-reader labels, icon plus text, contrast, 44–48 px touch targets, reduced motion, no hover-only actions, no accidental modal close, no double scroll, and no overflow with long Vietnamese text.

## Tests

Add component, state, RBAC, accessibility, and E2E tests covering create/edit, elements, variables, assets, undo/redo, 203/300 preview, validation, submit, approve with another user, test print, activate, history, and new version.

## Acceptance gate

Pass only when designer, asset library, Vietnamese localization, lifecycle, RBAC rendering, preview/test-print UI, accessibility, E2E, typecheck, and production build work without layout regressions.

Continue immediately to Phase 7.
