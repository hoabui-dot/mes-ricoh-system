# MBOM UOM and Parent Component Flow Audit

Date: 2026-07-30

## Root causes

The MBOM component editor did contain a UOM control, but its state was populated from the first row returned by `GET /master-data/uoms`. That endpoint also returns legacy Inactive rows, and the first row in the live response was `DEMO-EA`. The form therefore submitted an Inactive UOM and the API correctly returned `MBOM_LINE_UOM_NOT_RELEASED`.

The fix is at both boundaries: the Console keeps only `lifecycle_status = Released` UOMs and uses the first Released UOM for defaults; the master-data service validates that the submitted UOM is Released. Item Revision and issue Operation options are also restricted to usable Released records. No database UOM lifecycle was changed.

## Parent component decision

`parent_line_id` is not redundant: it represents the multi-level MBOM tree. The first component must be a root component, so the editor now shows a read-only Root component explanation when the MBOM has no persisted lines. After the first component is saved, later components may explicitly choose Root or a valid persisted parent.

The Console excludes the line being edited and disables descendant nodes as parent choices. The backend validates same-MBOM ownership and walks the ancestor chain transactionally to reject cycles. This prevents a component from becoming its own ancestor even if a client sends a crafted request.

## Validation matrix

- Header base UOM: required and Released.
- Component Item Revision: effective now and Released.
- Component line UOM: required and Released; fraction policy applies.
- Parent: empty means Root; otherwise active, same MBOM, and acyclic.
- Issue Operation: active and not Inactive/Obsolete.
- Released MBOM: immutable; create a new version.

## Verification

`services/mes-console`: `npm run build` passed.

`services/mes-master-data-service`: `npm run build` passed.

The live UOM response was inspected and confirmed to contain mixed lifecycle rows, including Inactive `DEMO-EA`; this reproduces the original default-selection defect. The correction filters that row before rendering or defaulting the component editor. Runtime container/browser verification remains a deployment step after rebuilding the MES Console and master-data service.

## Follow-up 500 correction

The Cloudflare request was traced to a second normalization bug: the editor sends an empty string for an open-ended `effective_to`, and the update SQL previously passed that string to PostgreSQL as `timestamptz`. The service now converts an empty `effective_to` to SQL `NULL` before the update. The service was rebuilt and recreated. An empty JSON payload now returns the expected `422 MBOM_LINE_REQUIRED_FIELDS`, while the former timestamp conversion path no longer produces a 500.
