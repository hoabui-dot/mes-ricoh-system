# Production Version Ownership Flow Audit and Correction

Date: 2026-07-30

## Scope

Audited the Production Version create/edit flow after Item Revision, EBOM, MBOM,
and Routing ownership was made explicit. The correction covers the MES Console
form, master-data query filters, Production Version create/update validation, and
Item Revision effective-date mutation paths.

## Findings and corrections

1. The form previously loaded all Item Revisions, EBOMs, MBOMs, and Routings and
   filtered them locally. It now follows `Item -> eligible Released Revision ->
   ownership-scoped Released/effective EBOM, MBOM, and Routing`.
2. The form previously presented four independent selectors. It now shows Item
   and Revision selectors first, then read-only ownership summary cards. A
   single valid structure is selected automatically; multiple valid structures
   require an explicit choice. Changing Item or Revision clears derived IDs and
   stale cards.
3. The previous EBOM list endpoint ignored query filters. It now supports
   `item_revision_id`, `lifecycle_status`, and `effective_at` and returns item
   revision and line-count projection fields.
4. Generic Item Revision queries now support `item_id`, lifecycle, and
   timestamp-based effective filtering. MBOM and Routing queries support the
   same ownership/effective filtering already used by the form.
5. Production Version create/update already derived Site from MBOM/Routing. The
   validation path now also requires an optional EBOM to be Released and
   effective, in addition to the existing ownership check.
6. Creating a successor Item Revision previously updated the previous revision's
   `effective_to`; releasing a successor also did this. Both mutations were
   removed. New revisions persist `effective_to = NULL` unless the user later
   performs an explicit date update. Existing Work Order snapshots are not
   changed.

## Preserved behavior

- No schema, API identity, lifecycle state, Production Version, MBOM, Routing,
  or Work Order ownership model was replaced.
- Production Version still submits `item_revision_id`, MBOM/Routing IDs, and the
  optional EBOM baseline; Site remains backend-derived.
- Backend ownership, lifecycle, effective-date, site, and MBOM/Routing
  validation remain authoritative. Frontend filtering is only selection UX.
- Released configuration remains protected by the existing lifecycle policy.

## Verification

- `npm --prefix services/mes-console run build` passed.
- `npm --prefix services/mes-master-data-service run build` passed.
- Rebuilt `mes-console` and `mes-master-data-service` with Docker Compose.
- `/master-data/production-versions/new` returned HTTP 200.
- Scoped `item-revisions` returned only the requested Item's eligible Released
  revisions.
- Scoped `mbom-headers` and `routing-headers` returned only structures owned by
  the selected Revision and effective at the supplied UTC timestamp.
- Scoped `ebom-headers` returned an empty result for a Revision without a
  Released EBOM, proving the previous unfiltered list behavior is gone.
- `git diff --check` passed.

## Known data note

Historical `effective_to` values produced by already-applied legacy migrations
were not rewritten because their intended business dates cannot be inferred
safely. New create/release flows no longer produce automatic closures; explicit
effective dates remain user-owned.
