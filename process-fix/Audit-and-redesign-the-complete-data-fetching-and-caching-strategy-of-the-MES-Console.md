Audit and redesign the complete data-fetching and caching strategy of the MES Console.

## Problem

The MES Console currently has stale-data problems across CRUD workflows.

A reproducible example is:

1. Create or update an Item.
2. Create a new Item Revision for that Item.
3. Open the MBOM Edit screen.
4. Add a substitute material for an existing primary MBOM component.
5. The newly created Item Revision does not appear in the substitute revision selector.

The MBOM UI is still using an older cached Item Revision list.

This proves that the current caching strategy is unsuitable for operational CRUD and manufacturing master data. Users must see successful changes immediately in every dependent screen without manually refreshing the browser.

This is not only an Item/MBOM issue. Treat it as a codebase-wide cache consistency and query dependency problem.

## Required initial audit

Before changing code:

1. Read `AI_CONTEXT.md`.
2. Inspect the current source code under `services/mes-console`.
3. Inspect the API clients, query providers, hooks, screens, modal lifecycle, local state and query-key usage.
4. Search for:
   - TanStack Query configuration
   - QueryClient defaults
   - `staleTime`
   - `gcTime` or `cacheTime`
   - `initialData`
   - `placeholderData`
   - `keepPreviousData`
   - `refetchOnMount`
   - `refetchOnWindowFocus`
   - `invalidateQueries`
   - `refetchQueries`
   - local copies of server data in `useState`
   - fetch calls using browser cache
   - Axios/fetch wrappers
   - Nginx or Kong cache headers
   - selectors that fetch only on initial mount
   - dialogs that remain mounted after closing
5. Do not trust documentation over running source code.
6. Produce an inventory of every active MES Console route and its query/mutation dependencies before implementation.

## Primary design rule

Server data must have one authoritative owner.

TanStack Query should own remote server state. Do not copy query results into persistent component state unless the state is an intentional editable form draft.

A successful CRUD mutation must immediately update or invalidate every affected query.

Do not use a long global stale time for all MES data.

## Data freshness classification

Classify every query into one of these categories:

### A. Operational CRUD and manufacturing configuration

Examples:

- Items
- Item Revisions
- EBOMs
- MBOM headers
- MBOM lines
- Component substitutes
- Routings
- Routing operations
- Production Versions
- Work Centers
- Workstations
- Equipment
- Machine Groups
- Resource assignments
- Resource capabilities
- Production Standards
- Employees
- Skills
- Employee skills
- Shifts
- Work calendars
- Work Orders
- Work Order operations
- Material requirements
- Readiness and resource proposals

Default policy:

```ts
staleTime: 0
refetchOnMount: "always"
refetchOnWindowFocus: true

Do not show stale data after a successful mutation.

B. Reference selectors

Examples:

Item Revision selector in MBOM
Substitute Item Revision selector
Product Revision selector in Routing
Released MBOM and Routing selectors in Production Version
Site, UOM, Operation, Work Center and Skill selectors

These may use a very short stale time, but they must refetch whenever a create/edit modal opens and must be invalidated by related mutations.

A newly created or released entity must immediately appear in every relevant selector.

C. Dashboard and aggregate queries

These may use short caching or polling, but every related mutation must invalidate the aggregate.

D. Static or immutable data

Only static documentation, locale resources, enum definitions and immutable historical snapshots may use long-lived caching.

Central query-key architecture

Create a single typed query-key factory.

Example:

mesQueryKeys.items.all
mesQueryKeys.items.lists()
mesQueryKeys.items.list(filters)
mesQueryKeys.items.detail(itemId)

mesQueryKeys.itemRevisions.all
mesQueryKeys.itemRevisions.byItem(itemId)
mesQueryKeys.itemRevisions.detail(revisionId)
mesQueryKeys.itemRevisions.selector(filters)
mesQueryKeys.itemRevisions.released(filters)

mesQueryKeys.mboms.all
mesQueryKeys.mboms.lists()
mesQueryKeys.mboms.detail(mbomId)
mesQueryKeys.mboms.lines(mbomId)
mesQueryKeys.mboms.substitutes(lineId)
mesQueryKeys.mboms.validation(mbomId)
mesQueryKeys.mboms.referenceData()

mesQueryKeys.productionReadyConfigurations.all

No screen may define arbitrary string query keys.

Normalize filter objects so logically equivalent requests use the same key.

Every server-side filter, search term, site, status, page, page size, sort value and effective date must be represented in the query key.

Domain mutation hooks

Create reusable domain mutation hooks instead of implementing mutations and invalidation separately inside pages.

Examples:

useCreateItem()
useUpdateItem()
useCreateItemRevision()
useReleaseItemRevision()
useCreateMbom()
useReplaceMbomLines()
useCreateSubstitute()
useApproveSubstitute()
useCreateRouting()
useReleaseRouting()
useCreateProductionVersion()
useUpdateWorkCenter()
useReplaceWorkstationCapabilities()
useCreateWorkOrder()
useApproveWorkOrder()

Each hook must own:

API mutation
loading/error state
cache update
query invalidation
optional optimistic update
rollback if optimistic update is used
stable error mapping

Business pages must not manually reproduce invalidation rules.

Required dependency graph

Implement and document a cache dependency graph.

At minimum:

Item mutation

Invalidate:

Item lists and detail
Item Revision selectors when relevant
Production-ready configuration queries
Item Revision create/update/release

Invalidate:

Item Revision lists
Item detail
MBOM component selectors
MBOM substitute selectors
Routing product-revision selectors
Production Version selectors and validation
Work Order production-ready configuration selector
MBOM header/line mutation

Invalidate:

MBOM list
MBOM detail
MBOM lines
MBOM validation
Production Version references and validation
Production-ready configuration selector
Work Order creation reference data
Substitute mutation

Invalidate:

Substitute list for the MBOM line
MBOM lines
MBOM detail
MBOM validation
Routing mutation

Invalidate:

Routing list/detail/operations
Production Version references and validation
Production-ready configuration selector
Work Order creation reference data
Production Version mutation

Invalidate:

Production Version list/detail/validation
Production-ready configuration selector
Work Order creation reference data
Work Center, Workstation, Equipment or Capability mutation

Invalidate:

Resource lists and details
Resource availability
Routing reference data
Production Standards where relevant
Production Version readiness
Production-ready configurations
Work Order readiness and resource proposals
Employee, Skill, Shift or Calendar mutation

Invalidate:

The directly modified resource
Employee skill and schedule queries
Calendar and availability queries
Work Order readiness
Capacity and resource proposal queries
Work Order mutation

Invalidate:

Work Order lists
Work Order detail
Operations
Material requirements
Readiness
Resource proposal
Related dashboard aggregates
MBOM-specific fix

The Item Revision selector used for primary and substitute materials must not rely on a list fetched when the application or page first mounted.

When the MBOM Create/Edit or Substitute modal opens:

Refetch eligible Item Revisions.
Refetch current MBOM detail and lines.
Refetch current UOM and Operation reference data.
Do not use a stale table-row snapshot as the edit source.
Do not persist selector options in local state.
Do not merge new server results into old form data.
Replace the complete server-derived reference list.
Preserve only intentional unsaved user form input.

After creating or releasing an Item Revision, the new revision must appear in an already-open or newly-opened MBOM selector without a browser refresh.

Add an integration test for this exact flow.

Modal lifecycle

Many forms are opened inside reusable modals.

Create a consistent feature-level refresh-on-open contract:

const handleBeforeOpen = async () => {
  await Promise.all([
    queryClient.refetchQueries({
      queryKey: mesQueryKeys.itemRevisions.selector(),
    }),
    queryClient.refetchQueries({
      queryKey: mesQueryKeys.uoms.released(),
    }),
  ]);
};

The common BaseModal must remain domain-agnostic. It may expose lifecycle callbacks such as onBeforeOpen, but MES query keys and business refresh logic belong to feature hooks.

Do not put MES-specific query logic inside BaseModal.

Detail and edit screens

Never use table row data as the authoritative source for a detail or edit form.

A row may be used for immediate navigation or placeholder display, but the screen/modal must fetch:

queryKey: resource.detail(id)

Use the returned detail response as the authoritative form hydration source.

For edit forms:

reset state when the entity ID changes
prevent responses from an older request from overwriting a newer route/entity
use AbortController or a monotonically increasing request generation
do not merge a new entity response with the previous entity form
disable Save until required hydration has completed
display an error instead of silently falling back to stale cached availability data

Preserve the existing Workstation stale-response protection and apply the same principle to other complex forms.

Optimistic update policy

Use optimistic updates only for simple and reversible changes.

Do not optimistically claim success for:

release/approval actions
MBOM structure replacement
substitute approval
Production Version validation
Work Order approval
resource allocation
effective-dated capability replacement

For these workflows:

wait for backend success
apply authoritative response data
invalidate dependent queries
await critical refetches
then close the modal or show success
HTTP caching

Audit browser, fetch, nginx and Kong caching.

Authenticated CRUD endpoints should return:

Cache-Control: no-store

or, where appropriate:

Cache-Control: private, no-cache, must-revalidate

The frontend API wrapper should not allow browser HTTP caching for mutable MES resources.

However, HTTP no-store does not replace TanStack Query invalidation. Both layers must be correct.

Pagination and previous data

placeholderData or keepPreviousData may be used for paginated tables to prevent visual flashing, but:

old data must be visibly marked as fetching when parameters change
it must never populate edit selectors for a different filter/site/date
mutation invalidation must refresh the current page
newly created records should either be inserted into the correct cache page or trigger a list refetch
deleted records must disappear immediately from the current page
page count must be reconciled after deletion
Real-time and cross-module updates

Do not introduce WebSocket complexity for ordinary same-client CRUD freshness.

Correct mutation invalidation is the first requirement.

For changes created by another browser or user, define a later-compatible strategy:

refetch on window focus
short polling for operational pages
optional Server-Sent Events or WebSocket invalidation events
invalidate query keys when a domain-change event is received

Do not use WebSocket as a substitute for correct local mutation handling.

Required module-by-module audit

Audit and document every active MES Console module, including at minimum:

Items and Item Revisions
EBOM
MBOM headers, lines and substitutes
Routings and Routing Operations
Production Versions
Work Order list
Work Order create
Work Order detail
Work Order readiness, compute/check and resource proposal
Sites and production areas
UOM and conversions
Operations
Work Centers
Workstations
Equipment and Machine Groups
Resource assignments and capabilities
Production Standards
Employees
Skills and employee skills
Shifts
Employee schedules
Work calendars
Reason codes
Translation Review Queue
Dashboard and aggregate counters
any other active route found in App.tsx or the route configuration

For every page, produce a table containing:

Page/module	Query keys	Mutation hooks	Current stale-data risk	Direct dependencies	Queries to invalidate	Refetch-on-open requirements	Recommended stale time	Tests

Do not claim the audit is complete until every active route has been mapped.

Tests

Add automated tests for at least these scenarios:

Create Item Revision, then open MBOM substitute selector; the new revision appears.
Release Item Revision; Production Version selector and production-ready selector refresh.
Update MBOM lines; MBOM detail, validation and structure version refresh.
Add/remove/approve a substitute; the substitute list refreshes immediately.
Release Routing; Production Version and Work Order readiness selectors refresh.
Update Work Center capability; Routing and Work Order readiness refresh.
Update Work Calendar; resource proposal no longer displays the old availability.
Create Work Order; the list immediately shows the new Work Order.
Approve or reject Work Order; list and detail show the authoritative status.
Delete an entity on the last row of a page; pagination moves to a valid page.
Switch rapidly between two edit routes; the older response cannot overwrite the newer form.
Reopen a modal after a related mutation; it does not reuse stale selector options.
Two browser sessions: after refocus or configured polling, the second session sees the first session's change.

Use MSW/unit tests for hook behavior and Playwright for critical cross-page flows.

Verification

After implementation:

Run MES Console typecheck.
Run production build.
Run unit and integration tests.
Run Playwright for critical CRUD flows.
Rebuild and recreate the MES Console container.
Verify API cache headers.
Verify the exact Item Revision -> MBOM substitute scenario in the browser.
Verify that no manual browser refresh is required.
Check React Query Devtools or instrumentation to confirm the correct queries were invalidated and refetched.
Run git diff --check.
Deliverables
A complete current-state caching audit.
Route-by-route query dependency matrix.
Central typed query-key factory.
Shared domain mutation hooks.
Correct invalidation graph.
Modal refresh-on-open behavior.
Removal of stale server-data copies from component state.
Correct HTTP cache-control behavior.
Automated regression tests.
An implementation report under implementation-fix/.
An update to AI_CONTEXT.md containing only behavior that was actually implemented and verified.
Acceptance criteria

The work is accepted only when:

A newly created Item Revision appears immediately in MBOM primary and substitute selectors.
No browser reload is required after successful CRUD operations.
Detail and edit pages do not rely on stale table row snapshots.
Every mutation has an explicit, documented invalidation set.
Query keys are centralized and typed.
Mutable MES data does not use an unsafe global long stale time.
Existing business validation and backend ownership remain unchanged.
Base UI components remain domain-agnostic.
All affected typechecks, builds and regression tests pass.