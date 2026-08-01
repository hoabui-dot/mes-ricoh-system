# AI_CONTEXT.md - Canonical Full Context

This document is the compact, current context for AI agents working in this repository. It describes
architecture, ownership, business rules, integration boundaries, development conventions, and verified
operational entry points. The running source, migrations, and service contracts are authoritative when this
document conflicts with an older process prompt.

## 1. System overview

S-Factory MOM Platform is a manufacturing operations platform with MES, WMS, QMS, Portal, and a separate
Print Station deployment. The main user-facing systems are:

- Portal: entry point and SSO navigation.
- MES Console: master data, production configuration, Work Order planning, and execution supervision.
- WMS Console: warehouse, inventory, outbound material requests, and staging.
- QMS Console: inspection, nonconformance, disposition, and CAPA workflows.
- Print Station Kiosk: station operations, printer/template management, and real-time print status.

The platform is deployed with Docker Compose. Kong is the API gateway. Keycloak is the browser SSO provider.
Kafka is the active asynchronous integration transport. PostgreSQL is used by service-owned databases; Redis
is used only where the owning service configuration requires it. A service must not read another service's
database directly.

The repository contains TypeScript, Go, and .NET services. The MES Console is a React + Vite application,
not a Remix application. WMS and QMS consoles are also React + Vite applications.

## 2. Service and database boundaries

Each service owns its schema and persistence. Cross-service relationships are represented by IDs, business
codes, snapshots, projections, events, or explicit APIs; they are not cross-database PostgreSQL foreign keys.

### Platform foundation

- `infra/docker-compose.platform.yml`: Kafka KRaft, Schema Registry, Keycloak, Kong, and observability.
- Keycloak provides the configured realm and browser tokens. Do not create a second login implementation.
- Kong owns externally exposed API routing, CORS, authentication forwarding, and service path mapping.

### MES services

- `mes-master-data-service`: authoritative `md_*` definitions, lifecycle, effectivity, production
  configuration, resource hierarchy, print-station master data, and master-data outbox.
- `mes-execution-service`: Work Orders, immutable production snapshots, planning/resource allocations,
  execution sessions, operation confirmations, material projections, print jobs, and execution outbox.
- `mes-traceability-service`: QR/traceability policies, numbering, genealogy, and traceability events.
- `mes-kiosk-gateway-service`: authenticated MES kiosk-facing APIs and station-facing coordination.
- `mes-console`: browser client for MES master data and Work Order workflows.
- `kiosk-operator-ui`: MES kiosk/operator client.

MES master data and MES execution use separate PostgreSQL databases. Execution read models are populated from
released master-data events and execution events; execution does not join the master-data database.

### WMS services

- `wms-master-data-service`: warehouses, zones, locations, bins, and warehouse configuration.
- `wms-inventory-service`: inventory ledger, lots, balances, reservations, and stock availability.
- `wms-inbound-service`: inbound receipts and receiving flows.
- `wms-outbound-service`: outbound/material-request and staging workflows.
- `wms-console`: warehouse user interface.

WMS inventory is the authority for stock sufficiency. MES may send material demand and consume WMS status
events, but must not calculate WMS stock from MES data or query WMS tables.

### QMS services

- `qms-inspection-service`: inspection plans, characteristics, inspections, and results.
- `qms-nonconformance-service`: defects, NCR, disposition, CAPA, and inspection-failure handling.
- `qms-console`: QMS user interface.

### Print Station

The Print Station control plane runs from `infra/docker-compose.print-station.yml` and contains the station
projection service, kiosk UI, and station Redis. The physical Printer Adapter is independently deployed on
the printer/Mac server. It is not a service dependency in the main Compose stack.

The station control plane communicates with the remote adapter through Kafka. The adapter's HTTP endpoints are
for health, management, diagnostics, template operations, and explicitly manual test operations; they are not
the normal MES production print transport. The remote adapter must not be reintroduced as a local Compose
container merely to make the kiosk appear connected.

## 3. Core domain ownership

### Factory and resource hierarchy

```text
Site
  -> Shopfloor / Production Area
    -> Work Center
      -> Workstation
        -> Machine Requirement Groups
        -> effective Resource Assignments
Equipment
  -> physical Machine Units
Work Order Operation
  -> committed runtime Resource Allocation
```

The three resource concepts are different:

- Machine Requirement: what a Workstation needs, including type, role, required quantity, optionality, and
  optional pinned physical units.
- Resource Assignment: which active/effective Equipment, Machine Group, or Machine Unit is assigned to a
  Workstation. `md_resource_assignment` is authoritative for this effective relationship.
- Work Order Resource Allocation: which available resource is committed to one WO operation and time window.

There must not be a second authoritative machine-ID list on the Workstation. Workstation authoring may manage
requirements and assignments, but the UI must distinguish them and APIs must persist them through their owning
tables. Historical assignments are ended rather than overwritten.

`md_equipment` is a Machine Definition, not a physical inventory record. `md_machine_unit` owns one physical
identity per machine: asset code, unique serial when identified, lifecycle status, execution status, and planning
eligibility. Aggregate Equipment quantity is expected capacity only. A unit with `PendingIdentification` or without
planning eligibility must not be treated as available for Workstation assignment, reservation, Work Order allocation,
or execution. Unit identity and assignment history are additive/effective-dated; do not duplicate physical identity
on Equipment or rewrite historical Work Order snapshots.

Workstation and equipment readiness validates the complete chain: routing Work Center candidate, machine requirement,
effective assignment, equipment/machine unit, capability, calendar, operational state, and capacity. Required
or primary machine gaps block readiness. Optional supporting gaps are warnings only where current policy allows.
The backend, not frontend filtering, is authoritative for site, hierarchy, role, effectivity, and duplicate
physical-unit validation.

The MES Console Workstation UI reflects this lifecycle: Create shows Basic Information, Machine Requirements, and
an initial-assignment-after-save explanation only; it does not show current assignments or readiness before the row
exists. Edit shows current effective assignments from `md_resource_assignment`. Detail shows requirements, effective
assignments, assignment history, and a master-data Machine Readiness summary with Ready/Warning/Blocked status,
required/assigned/available quantities, and blocking reasons. This summary does not replace Work Order Resource
Planning capacity validation.

The Won Seal Tech demo machine fixture is owned by `scripts/reset-won-seal-tech-machines.mjs` and uses only the
deterministic `WST-*` namespace. It creates 19 Equipment definitions, 40 Physical Machine Units, 17 Machine Groups,
37 effective Resource Assignments, and 51 current-date Resource Calendar rows against existing released
Workstations, Shifts, and Operation codes. It must not duplicate printer ownership from Print Station. Cleanup is
child-first and refuses production or destructive execution without `ALLOW_DESTRUCTIVE_SEED=true`; it preserves
unrelated Work Orders, execution history, audit, genealogy, and Print Station data. Verify with
`npm run machines:verify` after `ALLOW_DESTRUCTIVE_SEED=true npm run machines:reset`.

Routing Operation owns the logical Work Center only. Resource Planning evaluates active/effective Workstations
under that Work Center, scores their requirements, assignments, capabilities, calendars, and capacity, and then
commits the selected Workstation and physical resources for the WO operation. The old Workstation Supported
Operations/capability relationship is not the authoring authority for routing assignment. Its legacy table/API
may remain for compatibility or historical data until all consumers are proven migrated; do not use it to create
a competing routing target. Runtime allocation remains separate and is not removed by the routing change.

### Shared catalogs

- `md_site`, `md_shopfloor`, and `md_production_area` own factory hierarchy.
- `md_uom` owns UOM code, localized name, precision, and fractional policy.
- `md_material_group` owns reusable material classification. It is distinct from Item Type (`FG`, `SFG`, `RM`)
  and from skill groups.
- `md_operation` owns the reusable operation catalog.
- `md_work_center`, `md_workstation`, `md_equipment`, `md_machine_unit`, resource capabilities, calendars,
  skills, employees, shifts, and production standards own their respective catalogs.

Business codes and localized names are user-facing identities. UUIDs are internal IDs and must not be shown as
primary labels in the consoles.

## 4. Product definition and Production Version

### Item and Item Revision

`md_item` owns the stable product/item identity, Item Type, localized names, material group, and base UOM.
`md_item_revision` owns a version of that item, site scope, base UOM, lifecycle, and independent effective
dates. A revision's UOM is authoritative for downstream structures that derive their UOM from the component
revision.

Forms that consume product configuration must filter to Released and currently effective Item Revisions. When
there is one valid revision, the UI may auto-select it and display it read-only; with multiple valid revisions,
the UI must offer a filtered selector. Backend ownership and lifecycle validation still applies.

### EBOM

EBOM is an engineering aggregate owned by one output Item Revision. In the current UI it is a flat component
list: component Item, component Revision, derived read-only UOM, quantity, sequence, and remove/add actions.
There is no manufacturing parent/substitute/issue-operation concept in EBOM authoring. The current schema may
retain historical parent-line fields, but they must not be presented as manufacturing behavior.

EBOM does not participate in material explosion, capacity planning, material staging, backflush, operation
execution, substitutes, scrap, phantom, production standards, or WO readiness. A Production Version may retain
an optional EBOM reference as an engineering baseline when policy requires it. A Work Order may snapshot the
EBOM identity/version for audit, but must never copy EBOM lines into WO material requirements.

### MBOM

MBOM is the manufacturing material definition owned by the output Item Revision. It contains manufacturing
component lines, quantities, derived UOM, optional issue-operation mapping, and manufacturing attributes such
as scrap, backflush, phantom, optional, and substitutes where configured.

One MBOM line may have many substitute rows. Substitute changes in the draft editor are client-side until the
structure is submitted; a successful save replaces the desired draft structure transactionally. Draft MBOMs can
be deleted when dependency rules permit. Released MBOMs are immutable; create a new version/revision according
to the lifecycle policy.

MBOM line UOM is derived from the component Item Revision base UOM and is view-only in the MES Console. Numeric
input must use the component UOM precision/fraction policy and must not preserve meaningless trailing zeros in
display.

### Routing and Production Version

`md_routing_header` is owned by the same output Item Revision as the MBOM. `md_routing_operation` defines
sequence, Operation, logical Work Center, optional nullable legacy workstation compatibility data, predecessors, scheduling, overlap/transfer,
queue/move times, milestone, confirmation, material scan, and output-label requirements.

Routing operations must use an active/effective Work Center in the Routing Site. Candidate Workstations are resolved
and validated by Resource Planning; they must belong to that Work Center and Site. Released Routing structures are
immutable when referenced by released production configuration, Work Orders, or other dependent records.

Production Version is the authoritative production configuration selected by a Work Order. It combines a
matching Item Revision with a Released/effective MBOM and Routing, and may include an optional compatible EBOM
baseline. Ownership must satisfy:

```text
ProductionVersion.item_revision_id
  = MBOM.item_revision_id
  = Routing.item_revision_id
  = EBOM.item_revision_id (when EBOM is selected)
```

The Production Version, not an Item ID, MBOM code, or Routing code supplied independently by the browser, is the
authoritative Work Order selection. Production Version code is backend-generated and unique.

## 5. Routing and resource-planning model

Routing is the default process definition; runtime planning is a separate decision. For each WO operation,
Compute & Check resolves the Routing Work Center's candidate Workstations, current resource requirements, capabilities,
calendars, shifts, production standards, labor, and machine availability. It produces resource candidates and
planning snapshots. A user or approved policy commits valid allocations to the WO operation.

The effective planning chain is:

```text
Production Version
  -> Routing Operation
    -> Work Center
      -> candidate Workstations
        -> machine requirements and resource assignments
        -> capability/calendar/operational availability
          -> WO resource allocation and capacity reservation
```

A default routing Workstation is not proof that a physical machine is available. A machine requirement is not
proof that an assignment exists. An assigned Equipment aggregate is not proof that a required physical unit is
available. Duplicate use of a physical unit is rejected when the effective capacity window conflicts.

Stable validation categories include `WORKSTATION_MACHINE_REQUIREMENT_UNSATISFIED`,
`WORKSTATION_PRIMARY_MACHINE_MISSING`, `WORKSTATION_MACHINE_QUANTITY_INSUFFICIENT`,
`RESOURCE_ASSIGNMENT_NOT_EFFECTIVE`, `MACHINE_UNIT_UNAVAILABLE`, and
`MACHINE_UNIT_ALREADY_RESERVED`; reuse an existing equivalent key rather than inventing duplicates.

## 6. Work Order and execution model

Work Order creation uses only `production_version_id` plus requested quantity, site/derived context, target
date, and required planning inputs. The backend resolves the Production Version, validates its released
configuration, and creates immutable snapshots. A Work Order snapshot normally includes:

- Production Version identity and configuration codes.
- Routing and routing-operation snapshots, including the logical Work Center. The selected runtime Workstation and
  physical resources are recorded in the committed Work Order Resource Allocation snapshot.
- MBOM/material requirement snapshots, including issue-operation mapping and derived UOM.
- Planning/resource snapshots and later committed allocation records.
- Execution metadata, audit, material projection, and print-job references where applicable.

The snapshot is the execution authority. Later master-data edits must not silently rewrite an existing Work
Order. A Work Order cannot be approved or executed when required snapshots, operation mappings, planning values,
or committed resource allocations are invalid under the active strict policy.

The normal strict lifecycle is Draft -> Compute & Check -> resource proposal/commit -> Approved/Released ->
operation execution -> completion/cancellation according to the execution state machine. Execution validates
predecessors, current resource allocation, operation-specific material readiness, quality/traceability rules,
and print-station readiness where required.

Material readiness is operation-specific. An operation with no required material is `NotRequired` and must not
wait for material for another operation. An operation with mandatory material waits for its own approved/staged
lines according to the active WMS policy. Frontend readiness is informational; the execution backend is
authoritative.

Print operations use durable `wo_print_job`, attempts, and events. Label quantity is derived from the WO quantity,
production-standard base quantity, labels per cycle, and copies per label; invalid or missing base quantity must
not be silently guessed. Print commands are written transactionally to the execution outbox and sent through
Kafka. Kafka result events update the print job and corresponding WO operation idempotently.

The current Compose development configuration contains the explicit temporary
`MES_DEMO_PRINT_ON_APPROVAL=true` flag. When enabled, approval can auto-prepare planning and queue demo print
jobs without the normal material gate. This is a temporary demo surface, not the strict production rule. Code
and documentation must preserve a clear distinction between demo mode and strict mode; do not weaken strict
validation to make a seed pass.

## 7. Integration and event rules

Kafka is the active event transport. Services use durable outbox records for meaningful state transitions and
idempotent consumers keyed by event/correlation/business identity. Consumers must acknowledge/commit only after
safe persistence and must tolerate redelivery, reconnect, and temporary dependency failure.

Important current event boundaries include:

- Master-data release/change events -> MES execution read models.
- Work Order approval, execution, material, and print events -> execution and downstream projections.
- Print commands on the station command topic and printer results/heartbeats/status on the station printer-event
  topic. The current source uses `station.events.printer` for printer result/runtime consumption.
- WMS material-demand/status events or explicit integration APIs, depending on the current WMS flow; MES must
  persist correlation and local projection state rather than read WMS tables.
- QMS inspection failure events -> nonconformance handling.

Print Station flow:

```text
MES Work Order / print job
  -> execution outbox
  -> Kafka command
  -> remote Printer Adapter
  -> physical printer
  -> Kafka printed/failed/status/heartbeat event
  -> station Projection Service and MES execution consumer
  -> SignalR
  -> Kiosk UI
```

The Kiosk must use Projection Service as the dashboard source of truth and must not poll the remote adapter for
continuous status. Initial lists, template management, and diagnostics may use their documented HTTP APIs.
SignalR clients reconnect, refetch current state after reconnect, and deduplicate event IDs.

The remote adapter is configured through environment variables for Kafka broker, credentials/security, printer
driver/CUPS endpoint, and connection identity. Do not hardcode broker credentials, Mac IPs, printer passwords,
Cloudflare URLs, or local adapter URLs in source. The standalone adapter Compose file is the deployment source
for the remote server; its local adapter/UI services may use localhost only when both run on that same remote
host.

## 8. Lifecycle, effectivity, immutability, and migration rules

- Draft records may be edited or deleted only when dependency and lifecycle rules permit.
- Released/effective records are immutable when referenced by Production Versions, Work Orders, execution,
  inventory, or audit history. Create a new revision/version instead of mutating history.
- Effective-dated records are ended with `effective_to`; do not overwrite historical rows or auto-close another
  Item Revision's interval without an explicit valid ownership operation.
- Deactivation is distinct from deletion. A deactivated record must not be offered as a new selectable option;
  reactivation is allowed only where the domain lifecycle supports it.
- Backend validation is authoritative for lifecycle, effectivity, ownership, same-site hierarchy, UOM rules,
  dependency-aware delete, and concurrency. UI filtering and translated labels are not validation.
- Migrations are forward-only. Never rewrite an applied migration. Prefer additive/deprecation-first changes,
  backfill only when relationships are unambiguous, preserve audit/history, and remove legacy tables or indexes
  only after all consumers and deployment compatibility are proven.
- Cleanup scripts may remove disposable development fixtures only after an explicit environment guard, pre-cleanup
  audit, dependency-ordered transaction, post-cleanup orphan checks, and clear refusal for production-like data.
- Seed data must use current APIs/schema and must be rerunnable. It must not weaken readiness validation or
  create ownerless EBOM/MBOM/Routing/Production Version records.

## 9. Frontend and API conventions

MES Console conventions:

- React + Vite, React Router, TypeScript, Tailwind CSS, shadcn/Radix primitives, Lucide icons, and i18n.
- VI is the default language; EN, JA, and KO are supported by the shared i18n conventions.
- TanStack Query is the server-state cache. Feature code should use query keys, invalidation, stale-time, and
  mutation states rather than introducing a competing custom query/cache abstraction.
- `BaseModal`, `BaseDataTable`, and other Base components hide TanStack Table/Radix details from business pages.
  Use Base components for tables, modal/dialog, form controls, badges, tabs, pagination, loading, empty states,
  confirmation, and tooltips. Preserve existing wrapper props when migrating a feature.
- A modal has one shared layout, centered placement unless a deliberate panel is required, bounded scrollable
  content, and footer actions with cancel/back on the left and save/confirm on the right. Destructive actions use
  the shared confirmation component, never browser `confirm()`.
- Table default page size is 10 with supported 50 and 100 options where the shared table contract applies.
- Display localized name first and business code second. Do not expose internal UUIDs as labels.
- Status/type/error codes are translated at the client using the existing i18n/error mapping. Never render raw
  keys, `[object Object]`, or untranslated enum values. Validation toasts show translated summary and provide
  detail for structured backend validation failures.
- Numeric editors use the shared UOM precision/fraction rules and normalized display formatting. Integer values
  must not be shown as artificial `.000000` values.
- Forms must clear dependent selections when their parent changes, hydrate from current API data, and refresh
  effective options when entering or reopening a form. Mutations invalidate related TanStack Query keys.
- API clients must handle non-JSON/empty error bodies safely, preserve correlation/request IDs, and not read a
  Response body twice. CORS headers must allow required request headers such as idempotency keys.

MES API paths are normally exposed behind Kong under `/api/mes/...`; service-local URLs are deployment details.
Use backend-generated business codes for Items/Revisions, MBOM/Routing/Production Version, Work Orders, and
material requisitions where the owning service provides numbering. Do not make a client preview authoritative.

## 10. Testing, seed, and verification commands

Root package scripts intentionally expose only the maintained operational entry points:

```bash
# Complete disposable MES fixture
npm run reset:seed:mes:wo

# Build and runtime operations
npm run build:printer-adapter:images
npm run build:printer-adapter:both
npm run rebuild:mes
npm run rebuild:print-station
npm run cloudflare:urls
npm run test:mes:machine-flow
npm run test:mes:resource-planning-flow
npm run test:e2e:resource-planning
npm run machines:reset
npm run machines:verify
```

The complete MES WO seed command owns the current cleanup/seed workflow. It audits disposable Work Orders and
orphans, cleans dependent execution rows in FK order, seeds a coherent Item/Revision/EBOM/MBOM/Routing/Production
Version plus resource/calendar/standard data, creates a Draft WO, and writes verification artifacts. It must
refuse unsafe environments. If the remote Print Station is offline, strict seed verification stops; setting
`ALLOW_PRINT_STATION_OFFLINE=true` is only for database/UI fixture verification and is not proof of physical
printing.

Resource Planning verification is owned by `scripts/test-mes-resource-planning-flow.mjs` and
`e2e/resource-planning/resource-planning-flow.spec.ts`. The API flow creates disposable Work Orders from a
released Production Version, resolves backend Ready candidates, commits sequentially with idempotency keys,
verifies revalidation and persistence, observes a capacity-blocked candidate, and cleans only created Work Order
IDs. The browser flow uses real Keycloak login and MES Console, creates a Work Order, runs Compute & Check, commits
every Ready operation candidate, refreshes, and verifies allocations remain Committed. Resource readiness and
allocation remain backend authoritative; UI selectors are observability aids only.

Relevant canonical references:

- [`product-doc/MES-DATABASE-ERD-AND-RELATIONSHIPS.md`](product-doc/MES-DATABASE-ERD-AND-RELATIONSHIPS.md)
- [`product-doc/product-doc.md`](product-doc/product-doc.md)
- [`implementation-fix/mes-wo-reset-seed-verification-20260731.md`](implementation-fix/mes-wo-reset-seed-verification-20260731.md)
- [`implementation-fix/work-center-workstation-machine-ownership-audit-20260731.md`](implementation-fix/work-center-workstation-machine-ownership-audit-20260731.md)
- [`docs/demo/won-seal-tech-machine-seed.md`](docs/demo/won-seal-tech-machine-seed.md)
- [`docs/SSO-USER-GUIDE-MES-WMS-QMS.md`](docs/SSO-USER-GUIDE-MES-WMS-QMS.md)


## 11. Current known limitations and deprecated compatibility surfaces

- Physical-print verification depends on the remote Mac/Printer Adapter, Kafka reachability, CUPS, the real
  printer, and an online/ready Print Station. A database seed can be valid while physical-print readiness is
  unavailable.
- `MES_DEMO_PRINT_ON_APPROVAL` remains enabled in the current development Compose configuration. It is an
  explicit temporary demo path and must not be treated as the strict production approval policy.
- `POST /api/mes/execution/work-orders/{id}/stage-materials` remains in the execution API and existing test
  scripts. It is a compatibility/manual recovery surface, not proof that the desired automatic material-demand
  lifecycle is complete. Audit its use before making it the primary UI action.
- Legacy Workstation Supported Operations/capability persistence and routes may remain for compatibility and
  historical rows. Routing Operation's Work Center is the authoring relationship; Resource Planning owns runtime
  Workstation selection.
- Some print/template management and station diagnostics APIs remain HTTP management surfaces even though normal
  production printing is Kafka-driven. Do not use those APIs as a second production command path.
- Existing historical data may contain schemas or snapshots from older model versions. Do not repair a released
  Work Order in place; use the cleanup/seed guardrails for disposable development fixtures and preserve history
  otherwise.
- Cloudflare tunnel addresses, remote Mac LAN addresses, printer availability, and container health are runtime
  deployment state, not durable application configuration. Read them from the current deployment environment.
- If an active product/process document requests behavior that is absent from the running source, report the gap
 and implement through a reviewed migration/API change; do not record the requested behavior as current fact.
## 12. Current Resource Planning and Browser E2E Context

This is the current verified Resource Planning context. Master Data owns effective Work Centers, Workstations,
Machine Definitions, Physical Machine Units, Machine Requirements, `md_resource_assignment`, capabilities,
calendars, standards, shifts, and product configuration. `mes-execution-service` owns Work Order lifecycle,
candidate resolution, `wo_resource_allocation`, `wo_capacity_reservation`, allocation audit/idempotency, committed
snapshots, approval revalidation, and execution guards. WMS owns inventory truth and material fulfilment; QMS owns
inspection/nonconformance; Traceability owns labels, genealogy, and label operations.

The authoritative planning flow is:

```text
Released Production Version
  -> asynchronous Work Order creation workflow
  -> immutable Routing/MBOM/planning snapshots
  -> Compute & Check
  -> candidates under the Routing Work Center
  -> machine requirement/assignment/capability/calendar/standard checks
  -> current capacity reservation view
  -> planner selects Ready candidate
  -> transactional revalidation and allocation commit
  -> Workstation/Equipment/Machine Unit snapshot + reservation + audit + outbox
  -> approval revalidation
  -> execution uses committed snapshots
```

`GET /resource-candidates` is advisory. `POST /resource-allocation` revalidates the candidate in a serializable
transaction with a resource lock. `md_resource_assignment` is never modified by Work Order allocation. A committed
allocation preserves Workstation, Equipment, primary/supporting Machine Unit, Work Center, shift, time window,
readiness snapshot, and standard context. Exclusive overlapping reservations cannot coexist; the losing request
returns HTTP 409 `RESOURCE_CAPACITY_CONFLICT`, including PostgreSQL serialization conflict `SQLSTATE 40001`.

Allocation replay with the same user/key/request hash returns the existing result. A different payload with the same
key is rejected. Reallocation supersedes the current row and cancels active reservations while retaining history.
Allocation create, reallocate, and cancel allow `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, and `EXECUTIVE`; other
roles receive HTTP 403 `RESOURCE_ALLOCATION_FORBIDDEN`.

Current Resource Planning APIs:

- `POST /api/mes/execution/work-order-creation-workflows`
- `GET /api/mes/execution/work-order-creation-workflows/{id}`
- `GET /api/mes/execution/work-orders/{id}`
- `POST /api/mes/execution/work-orders/{id}/compute-check`
- `GET /api/mes/execution/work-orders/{id}/operations/{opId}/resource-candidates`
- `POST /api/mes/execution/work-orders/{id}/operations/{opId}/resource-allocation`
- `DELETE /api/mes/execution/work-orders/{id}/operations/{opId}/resource-allocation`
- `POST /api/mes/execution/work-orders/{id}/resource-allocations/revalidate`
- `POST /api/mes/execution/work-orders/{id}/approve`
- `POST /api/mes/execution/work-orders/{id}/start-execution`

### Current Browser E2E status

The maintained browser suite has seven declarations: two Machine tests and five Resource Planning tests. Latest
verified result: `7 declared, 6 executed, 6 passed, 0 failed, 1 skipped`. The skipped case is Viewer authorization
because `MES_E2E_VIEWER_USERNAME` and `MES_E2E_VIEWER_PASSWORD` are not configured; skipped tests are not coverage.

Verified browser flows include Machine Definition/Physical Unit/Requirement/Assignment/Readiness, Work Order creation
from a released Production Version, Compute & Check, candidate commit and refresh persistence, idempotency, capacity
conflict under simultaneous commits, sequential/concurrent Work Order numbering, and exact multi-WO cleanup.

Not fully browser-verified: stale assignment/Workstation/readiness mutations, maintenance/out-of-service variants,
cancellation/replan, execution start guards, capacity boundaries, logout/login persistence, cross-site access, and
the complete Viewer/Operator/Admin role matrix.

Required commands:

```text
npm run test:e2e:machine:smoke
npm run test:e2e:machine:all
npm run test:e2e:resource-planning:smoke
npm run test:e2e:resource-planning:all
npm run test:e2e:resource-planning:concurrency
npm run test:e2e:resource-planning:numbering
npm run test:e2e:all
npm run test:e2e:regression
npm run test:e2e:report
```

Mutation tests require runtime `MES_E2E_USERNAME`, `MES_E2E_PASSWORD`, `ALLOW_E2E_MUTATION=true`,
`MES_MASTER_DATA_DATABASE_URL`, and `MES_EXECUTION_DATABASE_URL`. Cleanup uses exact Work Order UUIDs and must
report zero remaining target rows. Credentials are never stored in the repository.

Canonical current references:

- `implementation-fix/resource-planning-design-verification-20260731.md`
- `implementation-fix/resource-planning-full-e2e-improvement-20260731.md`
- `implementation-fix/e2e-audit-20260731.md`
- `docs/testing/browser-e2e-usecase-inventory.md`
- `docs/testing/browser-e2e-coverage-matrix.md`

Resource Planning is implemented for the current manual planner scope but is not fully browser verified. Do not
describe it as complete until the documented stale-state, cancellation/replan, execution, and authorization cases
are implemented and executed.
