# Frontend Architecture

## Applications

- `portal/`: app chooser and SSO entry.
- `services/mes-console/`: MES planner/manager UI.
- `services/kiosk-operator-ui/`: shopfloor UI.
- `services/qms-console/`: QMS UI.
- WMS console exists in repository context but should be inspected before WMS UI changes.
- Print-station frontend exists under `print-marking/station-agent/services/.../frontend`.

## MES Console Folder Structure

- `src/App.tsx`: route table.
- `src/routes/master-data`: master-data feature screens.
- `src/routes/work-orders`: Work Order screens.
- `src/components`: shared app components.
- `src/lib`: API and helper code.
- `src/context/AuthContext.tsx`: Keycloak/auth context.
- `src/i18n.ts`: translations.

## Feature Architecture

MES Console routes are feature screens, often calling shared `masterDataApi` helpers. Work Order screens call execution APIs and show creation workflow/Compute & Check/resource allocation details.

## Base Components

Canonical UI context requires base/shared components for tables, modals/dialogs, form controls, badges, tabs, pagination, loading, empty states, confirmation, and tooltips. Avoid one-off table/modal behavior unless the feature has a proven need.

## TanStack Query Strategy

`AI_CONTEXT.md` states TanStack Query is the server-state cache. Use query keys, invalidation, stale time, and mutation states. Do not add a competing cache abstraction.

## Routing

MES Console routes include Work Orders, Items, UOM, Material Groups, MBOM, Routing, Routing Operations, Production Versions, Operation Catalog, Factories, Shopfloors, Production Areas, Work Centers, Workstations, Equipment/Machines, Print Stations, Resource Assignments, Resource Capabilities, Resource Calendars, Operation Skill Requirements, Production Standards, Reason Codes, Skill Management, Employees, Shifts, Work Calendar, and i18n Review. EBOM is SAP-owned and has no MES Console route.

QMS Console routes include dashboard, inspection results/detail, plans/detail, defect codes, NCR/detail, CAPA/detail, and not found.

## Forms

Rules:

- Create starts clean.
- Edit hydrates from latest backend state.
- Parent changes clear dependent selections.
- Save is the only persistence point.
- Replacement-semantics sections submit complete desired state.
- Structured validation details should be shown when backend returns multiple errors.

## State Management

Use React local state for form interaction and TanStack Query for server state. Auth state is in app context. Avoid using local state as a second authority for backend facts after mutation.

## Error Handling

Handle JSON, non-JSON, and empty error bodies. Do not read a `Response` body twice. Translate status/type/error codes instead of rendering raw enums or objects.

## Loading Strategy

Forms must block submission while dependent options or latest entity data are loading. Partially hydrated forms must not persist stale relationship IDs.

## i18n Architecture

VI is default; EN, JA, and KO are supported. Localized names are primary display identities. Status, type, lifecycle, role, and error codes must use translation maps.

## Theme Architecture

Existing UIs use Tailwind and shared components. Maintain restrained operational styling for enterprise workflows. Do not introduce marketing-style layouts into operational tools.

## Phase 5 Two-Line UX Design

Status: PARTIALLY_IMPLEMENTED.

ADR-009 requires the MES Console to treat backend line state as authoritative when implemented:

- Production Line list/detail/create/edit is implemented through the master-data resource screen.
- Work Order creation remains Production-Version-authoritative.
- Production Version detail shows primary/backup line eligibility.
- Work Order detail shows selected line, readiness, fallback reason, blockers, and line lock state.
- Pre-release line change requires confirmation, impact explanation, reason, mutation, invalidation, and refetch.
- The browser must not calculate readiness or select fallback independently.
## Phase 8 Two-Line UX

Status: IMPLEMENTED_AND_VERIFIED

MES Console Work Order creation and detail screens display backend-owned Production Line selection state. The UI shows Auto line selection, selected line, primary/backup evaluated results, fallback reason, `ResourceHold` blockers, line lock state, operation line scope, candidate selected-line context, and audited replan controls. The browser does not calculate line readiness; it renders persisted execution API state and posts replan reasons to the backend action.
