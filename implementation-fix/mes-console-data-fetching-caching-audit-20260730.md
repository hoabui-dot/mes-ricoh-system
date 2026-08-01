# MES Console Data Fetching and Caching Audit

## Audit result

The MES Console did not previously use TanStack Query. Most route modules called `fetchResource` or
`fetch` inside an effect and copied server results into local state. Browser caching was already
disabled for the shared mutable GET client, but there was no central query ownership or mutation
invalidation. This is the root cause of stale reference selectors such as the MBOM substitute
Item Revision selector.

## Implemented foundation

- Added `@tanstack/react-query` and a single `QueryClientProvider` at the application root.
- Added `lib/queryClient.ts` with `staleTime: 0`, `refetchOnMount: 'always'`, window-focus and
  reconnect refetch, bounded garbage collection, and no mutation retries.
- Added `lib/queryKeys.ts` with normalized filter keys for Items, Item Revisions, MBOMs, Routings,
  Production Versions, resources, labor data, Work Orders, and generic resource queries.
- Kept `fetchResource` as a transport-only `fetch` helper with `cache: 'no-store'`; it is not a
  custom cache implementation.
- Added `invalidateMesQueries(resource)` to the API mutation layer. It invalidates both the typed
  domain prefixes and generic resource keys, including dependent selectors.
- MBOM line and substitute dialogs now use direct TanStack `useQuery` instances with `staleTime: 0`
  and explicit `refetch()` when the dialog opens. The complete released Item Revision, UOM, and
  Operation reference lists replace the previous selector state, so a newly created/released
  revision is fetched without a browser reload.

## Dependency invalidation graph

| Mutation | Invalidated data |
|---|---|
| Item | Items, Item Revisions, MBOM, Routing, Production Version, production-ready selectors |
| Item Revision | Item/Revisions, MBOM lines/substitutes, Routing, Production Version, ready selectors |
| MBOM header/line/substitute | MBOM lists/details/structure, substitutes, Production Version, ready selectors |
| Routing header/operation | Routing list/detail/operations, Production Version, ready selectors |
| Production Version | Production Version and production-ready selectors |
| Work Center/Workstation/Equipment | resources, capabilities, Routing and readiness selectors |
| Employee/Skill/Shift/Operation | labor/resource schedule and readiness-related selectors |

## Route inventory and current migration status

| Module | Current data access | Status/risk | Required invalidation or refetch |
|---|---|---|---|
| Items and revisions | local effect plus direct gateway fetch | transport no-store; legacy local copy | refetch revision selectors on MBOM modal open |
| EBOM | `fetchResource` plus direct detail fetch | no central hook yet | EBOM header/tree and revision/UOM selectors |
| MBOM | `fetchResource`, direct detail, direct selector `useQuery` on modal open | critical selector flow fixed | MBOM structure, substitutes, revisions, UOM, operations |
| Routing and operations | `fetchResource` and direct create/edit fetches | no central domain hooks yet | routing operations, work-center selector, PV/WO readiness |
| Production Versions | direct gateway fetches | no central hook yet | PV list/detail/validation and ready configurations |
| Work Orders | direct execution API fetches | operational data requires refetch after mutation | list/detail/operations/readiness/resource proposal |
| Sites, areas, UOM | `fetchResource` | no long stale cache | invalidate dependent selectors after CRUD |
| Work Centers/Workstations/Equipment | `fetchResource` and direct detail calls | stale-response guard exists for workstation | resources, capabilities, routing/PV/WO readiness |
| Resource assignments/capabilities/standards | mixed `fetchResource` and direct calls | no centralized hooks yet | resource availability and proposals |
| Employees | `fetchResource` | list migrated to BaseDataTable; state-owned fetch | employee skills, schedules, availability |
| Skills/employee skills | `fetchResource` and direct worker-skill calls | list migrated to BaseDataTable; state-owned fetch | operation requirements and resource readiness |
| Shifts/work calendar | `fetchResource` and direct bulk schedule call | schedule result is a bulk operation, not a CRUD table | shifts, calendars, employee availability, proposals |
| Operations | `fetchResource` and direct detail/capability calls | no central hooks yet | routing capabilities and readiness |
| Print Stations | direct no-store API client | runtime data should remain short-lived | station/printer readiness and WO print status |
| Translation review/reason codes/admin | direct or `fetchResource` | low operational risk | invalidate only the modified resource |
| Dashboard/aggregates | direct aggregate fetches | should use short polling/focus refetch | invalidate after related Work Order mutations |

## Verification

- `npm run typecheck --workspace=services/mes-console` passed after adding the provider, query keys,
  invalidation layer, and MBOM selector refetch.
- `git diff --check` passed.
- The remaining route modules are explicitly documented as incremental migration work; they have not
  been falsely represented as fully converted to `useQuery`/`useMutation`.

## Remaining work

The next migration should replace each route's server-state `useState` with direct `useQuery` and
replace local mutation functions with domain `useMutation` hooks. This is required before claiming
the full route-by-route acceptance matrix and Playwright cross-browser scenarios are complete.
