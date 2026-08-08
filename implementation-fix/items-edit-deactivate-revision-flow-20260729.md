# MES Item Edit, Deactivation, and Revision Flow Audit

Date: 2026-07-29
Scope: `mes-master-data-service` and MES Console `master-data/items`

## Root causes found

1. The old generic Item update path could update `md_item` specification fields without updating the current Draft `md_item_revision`, leaving Item and Revision with different names/UOM/specification values.
2. Released Items had only a disabled Edit button in the UI. There was no visible successor-revision flow even though the backend already exposed `POST /items/:id/revisions`.
3. The backend selected a Released revision before a newer Draft revision when resolving the current revision. This could incorrectly block editing a valid Draft successor.
4. Item creation relied on the database NOT NULL constraint for missing `base_uom_id`, producing an uncontrolled database error instead of a stable business error.

## Implemented behavior

### Draft/InReview edit

`PUT /api/mes/master-data/items/:id` is now an Item-specific transaction. For a current Draft or InReview revision, specification changes update the Item compatibility columns and the current Item Revision together. Base UOM must reference a Released UOM. Item lifecycle changes do not delete or mutate revisions.

### Released revision

Specification edits on an Item whose latest revision is Released return:

```text
409 ITEM_RELEASED_SPEC_IMMUTABLE_USE_NEW_REVISION
```

The console shows **Create New Revision**. The successor form requires localized name, Released UOM, future/equal `Effective From`, and non-empty `Change Reason`. The backend rejects a successor when the current revision is not Released, rejects backdating, and links `previous_revision_id`.

Creating the successor closes the chronological predecessor's `effective_to` at the exact successor start and records both boundary changes in the same transaction. Releasing the successor removes the previous default flag and makes the successor the single Released default for the same Item and Site.

### Deactivation

Deactivation is lifecycle-only: `md_item.lifecycle_status = 'Inactive'`. It does not delete Item Revisions, MBOM, EBOM, Production Version references, Work Order snapshots, or historical data. The production-ready selector excludes inactive Items through its existing `i.lifecycle_status = 'Released'` predicate. Existing released configurations remain referentially intact for historical resolution.

## Relationship constraints

- Item `base_uom_id` must reference a Released `md_uom`.
- Item Revision `base_uom_id` must reference a Released `md_uom` on create/successor paths.
- Released Item Revisions are immutable; changes require a new revision.
- Successor revisions do not auto-create or carry forward MBOM, Routing, or Production Version bindings.
- Creating a successor closes only the chronological predecessor's effective window; no historical row is deleted. Release changes lifecycle/default ownership without recalculating the already reconciled interval.
- Item deactivation is not a cascading delete and does not rewrite existing Work Order snapshots.

## Runtime verification

Using the running service at `127.0.0.1:13020`:

1. Created `AUDIT-ITEM-20260729` with `PCS`: HTTP 201 and exactly one R1 revision.
2. Edited the Draft Item name: HTTP 200; the Draft revision name matched the updated Item name.
3. Released R1: HTTP 200.
4. Attempted direct Released specification edit: HTTP 409 `ITEM_RELEASED_SPEC_IMMUTABLE_USE_NEW_REVISION`.
5. Created R2 with future effective date and change reason: HTTP 201.
6. Released R2: HTTP 200; R1 received `effective_to = R2.effective_from`, R2 became default.
7. Deactivated the Item: HTTP 200; Item became `Inactive` and its revisions remained present.
8. Queried `production-ready-item-revisions`: HTTP 200 with zero rows for the inactive audit Item.
9. Service health became `healthy`; MES Console returned HTTP 200.

The audit Item is intentionally left inactive for traceability and does not participate in new production selection.

## Build verification

- `services/mes-master-data-service`: `npm run build` passed.
- `services/mes-console`: `npm run build` passed.
- MES service and console Docker images rebuilt and force-recreated.
- `git diff --check` passed.

## Remaining staged migration

The legacy specification columns on `md_item` remain as compatibility columns. They are still written in the synchronized Draft edit transaction, while active production read paths use Item Revision-owned values. Dropping these columns requires a separate migration after all consumers have been independently audited.
