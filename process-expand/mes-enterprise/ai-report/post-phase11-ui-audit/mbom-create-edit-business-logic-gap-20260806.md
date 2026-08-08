# MBOM Create/Edit Business Logic Gap Report

**Date:** 2026-08-06  
**Scope:** MES Console `master-data/mboms/new`, MBOM detail/edit, master-data API, and required full-flow E2E  
**Decision:** **BLOCKED - STOP IMPLEMENTATION**

## 1. Requested Target

The requested target is:

1. Synchronize the outdated MBOM create form with the current MBOM edit experience.
2. Validate structure as part of saving an add/edit change; remove the separate **Validate Structure** action.
3. Do not create another MBOM version because one MBOM has only one version.
4. Add a complete MES Console E2E flow.

Implementation is stopped because the repository has conflicting domain contracts and the requested single-version lifecycle does not define what happens after Release.

## 2. Audit Findings

| Concern | Current implementation | Requested target | Classification |
|---|---|---|---|
| Create UX | `MbomCreateScreen` creates only the header and redirects to detail. Components and substitutes are added later. | Create must be synchronized with the component/substitute edit experience. | `PARTIALLY_IMPLEMENTED` |
| Header edit parity | MBOM detail does not provide an editable header form. It edits component lines and substitutes only. | “Synchronize create with edit” does not identify which header fields remain editable or derived. | `AMBIGUOUS` |
| Validation timing | Individual line save validates line fields, UOM, lifecycle, parent ownership and cycles. A separate aggregate endpoint validates the complete persisted structure. | Full structure validation should happen while saving changes; no separate validation action. | `CONFLICTING_SOURCES` |
| MBOM versioning | UI, client API, backend endpoint, schema fields, product documentation and existing data support creating a new Draft from a Released MBOM. | One MBOM has one version and no new-version workflow. | `CONFLICTING_SOURCES` |
| Released edits | Released MBOM structure is immutable. The current way to change it is a new version. | New versions are forbidden, but the allowed correction/change process after Release is unspecified. | `MISSING` |
| E2E certification | Existing product-definition tests cover MBOM indirectly; there is no complete browser E2E for create header -> add/edit component -> substitute -> save validation -> release -> persistence reload. | Full MES Console E2E is required. | `MISSING` |

## 3. Evidence

### 3.1 Create and edit are different workflows

- `MbomCreateScreen` posts only `mbom-headers` and immediately navigates to detail: `services/mes-console/src/routes/master-data/MbomCreateScreen.tsx:93-100`.
- The create form contains header fields only: `services/mes-console/src/routes/master-data/MbomCreateScreen.tsx:111-131`.
- Component and substitute editors exist only in MBOM detail: `services/mes-console/src/routes/master-data/MbomScreen.tsx:423-459`.
- The detail screen has no supported header-edit form. Its active editor changes lines and substitutes: `services/mes-console/src/routes/master-data/MbomScreen.tsx:201-245`.

The repository requirement explicitly says the persistence model must be selected as either header-first or atomic aggregate and must not remain between both models: `process-fix/Audit-and-Redesign-the-MES-Console-MBOM-Creation-UX-and-Persistence-Flow.md:61-77`.

### 3.2 Save-time validation exists, but it is not identical to aggregate validation

- Line update validates positive sequence/quantity, parent ownership, hierarchy cycle, Released/effective component revision, authoritative UOM, UOM quantity precision, operation and effective dates in the same transaction: `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts:3738-3785`.
- Generic line creation also validates required fields, quantity, scrap, effectivity, header mutability, component lifecycle and UOM before insert: `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts:4055-4080`.
- The standalone aggregate endpoint additionally validates that the MBOM contains at least one active line and scans all active sibling sequences, parents and quantities: `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts:3821-3847`.
- MES Console still exposes both **Validate Structure** and **Save Structure**: `services/mes-console/src/routes/master-data/MbomScreen.tsx:332-372` and `services/mes-console/src/routes/master-data/MbomScreen.tsx:420`.
- The current process document requires separate Add, Save Draft, Validate Structure and Release actions: `process-fix/Audit-and-Redesign-the-MES-Console-MBOM-Creation-UX-and-Persistence-Flow.md:355-370`.

Removing the standalone action is technically feasible, but the replacement transaction contract is missing. In particular, it is not defined whether deleting the last component must fail immediately, whether a temporarily incomplete Draft may be saved, and whether substitute validation must roll back the associated line change atomically.

### 3.3 Single-version policy conflicts with current source of truth

- MES Console imports and calls `createMbomNewVersion`, and shows the action for Released MBOMs: `services/mes-console/src/routes/master-data/MbomScreen.tsx:9`, `services/mes-console/src/routes/master-data/MbomScreen.tsx:374-400`, and `services/mes-console/src/routes/master-data/MbomScreen.tsx:420`.
- The client calls `POST /mbom-headers/:id/create-new-version`: `services/mes-console/src/lib/masterDataApi.ts:240-247`.
- The backend transaction copies the Released header, current lines and substitutes into a new Draft: `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts:3510-3555`.
- Product documentation states that a Released MBOM is immutable and changes use the create-new-version endpoint: `product-doc/II-PRODUCTS-&-MBOM-CATALOG.md:228-232`.
- The architecture requirement states that one Item Revision can have multiple MBOM versions and that Released changes require a new version: `process-expand/Redesign-MES-MBOM-Architecture,-Workflow,-UI,-and-Existing-Data.md:24-31` and `process-expand/Redesign-MES-MBOM-Architecture,-Workflow,-UI,-and-Existing-Data.md:169-172`.

The phrase “MBOM has only one version” also conflicts with three different counters currently used by the system:

- `version_no`: shared persisted record version.
- `business_version`: displayed/business MBOM version.
- `structure_version`: optimistic concurrency counter incremented after structure changes.

Removing all version concepts would break optimistic concurrency. Removing only business versioning is possible, but that distinction must be explicit.

### 3.4 Released lifecycle becomes undefined without new versions

The backend rejects line edits when the MBOM header is Released: `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts:3742-3745`. This is consistent with current documentation and Work Order traceability.

With a single MBOM and no version creation, one of these policies must be selected:

1. **Immutable after Release:** corrections require Obsolete + a completely new MBOM identity/code.
2. **Return to Draft:** define authorization, dependency checks, audit events and behaviour for existing Production Versions and Work Orders.
3. **Mutable Released:** define temporal history and snapshot protection; this is currently unsupported and high risk.

No repository document defines the requested replacement policy.

## 4. Decisions Required Before Implementation

| Decision | Required answer |
|---|---|
| Meaning of one version | Confirm that only business version creation is removed while `row_version`/`structure_version` remain for concurrency and audit. |
| Released MBOM correction | Choose immutable + new MBOM identity, controlled return-to-Draft, or another explicit lifecycle. |
| Create persistence model | Choose header-first on one unified screen or one atomic aggregate transaction. |
| Save-time aggregate validation | Define whether incomplete Drafts are allowed and whether line plus substitutes must save in one transaction. |
| Header edit contract | Identify editable fields after creation and fields derived from Item Revision (`site_id`, `base_uom_id`). |
| Existing data/API migration | Decide whether `business_version` and `create-new-version` are deprecated, removed, or retained only for backward compatibility. |

## 5. E2E Work Held

The full-flow E2E has not been written because assertions would encode an unresolved lifecycle and persistence contract. Once the decisions above are approved, the test should cover:

1. Open `/master-data/mboms/new` and refresh current Released Item Revisions.
2. Complete header data and add a component using the same editor contract as detail/edit.
3. Verify invalid quantity/UOM/effectivity is rejected during save.
4. Add and edit substitutes and verify transactional persistence.
5. Save, reload detail, and verify header, lines, substitutes and `structure_version` persistence.
6. Release and verify the selected post-Release policy.
7. Verify list refresh and absence of a create-new-version action if business versioning is removed.
8. Clean up deterministic test data without modifying canonical seed records.

## 6. Stop Result

No MBOM implementation, API removal, migration, deployment, or E2E test was performed in this task after detecting the business-logic conflict. Proceeding before resolving these decisions risks breaking Released immutability, Production Version dependencies, Work Order snapshots and optimistic concurrency.
