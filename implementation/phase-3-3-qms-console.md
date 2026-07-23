# Implementation Trace: Phase 3 Step 3 QMS Console

Date: 2026-07-23
Status: Completed

## Delivered

## UI/UX Hardening Audit

Audit performed against `services/wms-console`, `implementation/wms-console-selectbase-crud-confirmation.md`,
and `implementation/wms-console-datatable-pagination-status-i18n.md` before remediation:

1. **Component primitives:** QMS had Radix-backed `SelectBase`, Dialog, and table primitives, but
   `Topbar.tsx` contained a native `<select>` language control. No native table or dialog was found outside
   the UI primitive folder. The control is replaced below and all new mutation confirmation uses Radix AlertDialog.
2. **Pagination:** Plans, defect codes, results, NCR, and CAPA all used the shared `DataTable` with local
   default 10-row pagination and 10/50/100 options. The gap was URL persistence; `q`, `page`, and `pageSize`
   are now synchronized with the current route query string.
3. **Confirmation:** Result submit, NCR disposition, CAPA create/link, verify, and close previously called
   the API directly. Plan release was not exposed as a detail action, and defect-code mutation UI was not
   exposed. Each available mutation now has an action-specific AlertDialog with pessimistic loading/error
   handling; plan detail now exposes release behind confirmation.
4. **Theme:** QMS already defined the required navy/slate/amber/status token values in `index.css` and
   applied navy navigation plus amber active/primary actions. The audit retained those exact WMS token values
   and wired the confirmation/status surfaces to the semantic tokens.
5. **i18n governance:** JA/KO were English fallback dictionaries with no tracked quality flag. A QMS console
   fallback registration script now inserts stable OPEN flags into the existing MES `i18n_data_quality_flag`
   review queue, using the same `mes-console` review workflow. The fallback remains intentional until those
   translations are supplied.

Remediation notes: the optional `libs/console-ui-shared` extraction was deferred because WMS and QMS already
have identical local primitive APIs and extracting them would require changing the deployed WMS import graph;
the copied QMS primitives remain a documented anti-drift follow-up.

## Hardening Verification

- `npm run typecheck --workspace=services/qms-console` passed after the remediation.
- `npm run build --workspace=services/qms-console` passed; Vite retains the existing single-bundle size
  warning but produces a deployable build.
- `npm run i18n:register:qms-console` registered two OPEN flags in the live MES review queue; the database
  check returned `ja|1` and `ko|1` for `qms_console_i18n_resource`.
- Audit scan found no native `<select>`, `<button>`, `<dialog>`, or checkbox controls outside QMS UI
  primitives; the only native `<table>` is the implementation inside `components/ui/table.tsx`.
- The final Docker rebuild completed and restarted `qms-console` on `13130` with the hardened bundle.

## Demo Data

The full console use-case dataset is seeded by `scripts/seed-qms-demo.ts`, documented in
`implementation/qms-demo-seed-data.md`. It provides four plan states, Attribute/Variable characteristics,
pending/pass/fail results, six defect codes, four NCR states, dispositions, four CAPA states, and four
NCR/CAPA links. The seed is idempotent and was run twice successfully.

- Added `services/qms-console` as a React + Vite + Tailwind + shadcn-style console, served by nginx on
  host port `13130` and using the existing Keycloak `qms-client` with PKCE.
- Added an idempotent Keycloak initialization promise, Vietnamese default locale, English locale, and
  Japanese/Korean fallback coverage through the shared i18n package.
- Added the authenticated shell, sidebar, locale switcher, route error boundary, 404 page, dashboard,
  inspection plans, defect codes, pending result queue, result recording, NCR detail/disposition, and
  CAPA create/link/verify/close actions.
- Result recording supports Attribute pass/fail and Variable numeric values. Variable values are evaluated
  against server-owned specs; failed recording automatically exposes the NCR workflow and the API remains
  pessimistic, submitting only after the operator action.
- NCR severity is visually differentiated for Critical/Major/Minor and the UI preserves the automatic
  severity explanation. CAPA verification is disabled for the owner, and closure is disabled until
  Verified by the service contract.
- Added the QMS console service to `infra/docker-compose.qms.yml` with build args for Keycloak and Kong.

## Closure verification

- `npm run typecheck --workspace=services/qms-console` passed.
- `npm run build --workspace=services/qms-console` passed.
- Full QMS Compose topology is running: console `13130`, inspection `13110`, nonconformance `13120`,
  and both owned databases healthy.
- The UI result-detail API now returns plan characteristics for empty drafts, allowing the recording form
  to render and submit every mandatory characteristic rather than showing a false empty state.
- Real operator and duplicate-delivery evidence is recorded in
  `implementation/phase-3-2-qms-nonconformance-service.md`.

## Known boundary

Japanese and Korean currently use the shared English fallback dictionary where QMS-specific translations
have not yet been supplied. The service contracts and locale switcher support all four required locales.
