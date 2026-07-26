# MES Workstation and Machine Form i18n Hotfix

Date: 2026-07-24

Fixed missing translations in the shared Workstation/Machine resource form:

- Generated-code helper text now uses translated `resourceFoundation.codePreviewHelp`.
- Hardcoded `Hierarchy:` now receives the translated hierarchy label.
- Workstation hierarchy values display localized Factory, Shopfloor, and Work Center names.
- Workstation execution mode uses translated Kiosk, Manual, and Automatic options while preserving backend enum values.
- Machine execution status uses translated Available, Maintenance, and Out of service options.
- Existing machine/workstation field labels and operation/skill selectors continue to use the shared i18n keys.

Verification: MES Console build passed, root i18n static scan passed, `git diff --check` passed, and the MES Console Docker image was rebuilt and restarted on port 13052.
