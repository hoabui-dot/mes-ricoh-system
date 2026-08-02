# MES Console Full Remediation Blueprint

Date: 2026-08-02

Run id: `2026-08-02T11-15-00Z`

Task source: `process-expand/mes-enterprise/expands/Build-the-Complete-MES-Console-Remediation-Blueprint-for-All-Eleven-MES-Phases.md`

Guardrail source: `process-expand/mes-enterprise/docs/23_PHASE_IMPLEMENTATION_GUARDRAILS.md`

Mode: discovery and design gate only. No frontend source, backend source, migrations, seed scripts, routes, or tests were modified.

Supporting evidence artifacts:

- `artifacts/mes-console-remediation-blueprint/2026-08-02T11-15-00Z/route-extract.json`
- `artifacts/mes-console-remediation-blueprint/2026-08-02T11-15-00Z/runtime-evidence.json`

## 1. Executive Readiness Assessment

| Item | Status |
| --- | --- |
| Overall MES Console alignment status | `BACKEND_READY_UI_INCOMPLETE` |
| Current backend readiness | Mostly ready for resource planning, production version, line selection, replan, allocation, approval, and execution; worker skill scope contract conflicts with seed records. |
| Current UI readiness | Incomplete. Broad route coverage exists, but table columns, diagnostics, legacy aliases, worker skill UX, and UAT evidence are incomplete. |
| Current canonical seed readiness | Not ready for UI remediation because worker skill seed identity conflicts with backend Employee-scope contracts. |
| Worker Skill readiness | `NOT_READY_SEED_OR_DOMAIN_CONFLICT` |
| Two-line Work Order readiness | Resource-hold fixture exists; primary and backup READY UAT fixtures are missing from current runtime state. |
| Route cleanup readiness | Ready for planned redirect/merge work, not ready for removal without redirect period and E2E migration. |
| E2E readiness | Partial. Phase 3, 4, 6, 8 coverage exists, but retained-page smoke, worker skill, employee skill, line eligibility, and three persistent UAT WO states are missing. |
| Critical findings | 2 |
| High findings | 12 |
| Implementation recommendation | Do not start broad UI remediation until UI-0 approval and UI-1 seed/domain correction are accepted. |

Final gate status: `NOT_READY_SEED_OR_DOMAIN_CONFLICT`

Implementation can proceed safely only after:

1. Product accepts the UX decisions in Section 22, or explicitly accepts implementation with those decisions pending.
2. Canonical worker skills are corrected to `scope=Employee`.
3. Deterministic UAT work order strategy is approved.

## 2. Complete Route and Navigation Inventory

Role access is currently Keycloak-authenticated browser access plus forwarded `X-Role-Code`. MES Console does not enforce per-route hiding by role. Backend enforcement is route-specific and strongest in execution allocation/start/approval paths.

| Route | Component | Sidebar entry | Parent navigation | Business object | API family | Role access | Current status | Final decision |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `/` | `Navigate` | No | Root | MES Console | none | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/work-orders` | `WOListScreen` | Yes | Operations | Work Order | MES Execution | Authenticated; actions backend-gated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/work-orders/new` | `WOCreateScreen` | No | Work Orders | Work Order creation workflow | MES Master Data, MES Execution | Planner/manager expected | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/work-orders/:id` | `WODetailScreen` | No | Work Orders | Work Order detail | MES Execution | Planner/manager/operator by action | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/console/mes/work-orders` | `WOListScreen` | No | Legacy console | Work Order | MES Execution | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/console/mes/work-orders/new` | `WOCreateScreen` | No | Legacy console | Work Order | MES Execution | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/console/mes/work-orders/:id` | `WODetailScreen` | No | Legacy console | Work Order | MES Execution | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/master-data/items` | `ItemsScreen` | Yes | Master Data Tier 1 | Item and Item Revision | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/uoms` | `UomManagementScreen` | Yes | Master Data Tier 1 | UOM | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP |
| `/master-data/material-groups` | `MaterialGroupManagementScreen` | Yes | Master Data Tier 1 | Material Group | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP |
| `/master-data/mboms` | `MbomScreen` | Yes | Master Data Tier 1 | MBOM | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/mboms/new` | `MbomCreateScreen` | No | MBOM | MBOM | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/mboms/:id` | `MbomScreen` | No | MBOM | MBOM detail/editor | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/routings` | `RoutingScreen` | Yes | Master Data Tier 1 | Routing | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/routings/new` | `RoutingCreateScreen` | No | Routing | Routing | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/routings/:id/edit` | `RoutingCreateScreen` | No | Routing | Routing | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/routings/:id/operations` | `RoutingOperationsScreen` | No | Routing | Routing Operation | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-versions` | `ProductionVersionScreen` | Yes | Master Data Tier 1 | Production Version | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-versions/new` | `ProductionVersionCrudScreen` | No | Production Version | Production Version | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-versions/:id/edit` | `ProductionVersionCrudScreen` | No | Production Version | Production Version | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/product-recipes` | `Navigate` | No | Legacy product definition | Product Recipe | none | Authenticated | OBSOLETE | REDIRECT |
| `/master-data/eboms` | `EbomScreen` | Yes | Master Data Tier 1 | EBOM | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/eboms/:id` | `EbomScreen` | No | EBOM | EBOM detail | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/operations` | `OperationCatalogScreen` | Yes in sidebar, route extractor missed label due markup | Master Data Tier 1 | Operation Catalog | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/operations/new` | `OperationCatalogScreen` | No | Operation Catalog | Operation | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/operations/:id` | `OperationCatalogScreen` | No | Operation Catalog | Operation | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/operations/:id/edit` | `OperationCatalogScreen` | No | Operation Catalog | Operation | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-areas` | `ResourceFoundationScreen entity=production-areas` | No | Master Data Tier 2 | Production Area | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-areas/new` | `ResourceFoundationScreen entity=production-areas` | No | Production Area | Production Area | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-areas/:id` | `ResourceFoundationScreen entity=production-areas` | No | Production Area | Production Area | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-areas/:id/edit` | `ResourceFoundationScreen entity=production-areas` | No | Production Area | Production Area | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-lines` | `ResourceFoundationScreen entity=production-lines` | Yes | Master Data Tier 2 | Production Line | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-lines/new` | `ResourceFoundationScreen entity=production-lines` | No | Production Line | Production Line | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-lines/:id` | `ResourceFoundationScreen entity=production-lines` | No | Production Line | Production Line | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-lines/:id/edit` | `ResourceFoundationScreen entity=production-lines` | No | Production Line | Production Line | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/factories` | `ResourceFoundationScreen entity=factories` | Yes | Master Data Tier 2 | Site/Factory | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP_AND_FIX |
| `/master-data/factories/new` | `ResourceFoundationScreen entity=factories` | No | Factory | Site/Factory | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP_AND_FIX |
| `/master-data/factories/:id` | `ResourceFoundationScreen entity=factories` | No | Factory | Site/Factory | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP_AND_FIX |
| `/master-data/factories/:id/edit` | `ResourceFoundationScreen entity=factories` | No | Factory | Site/Factory | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP_AND_FIX |
| `/master-data/shopfloors` | `ResourceFoundationScreen entity=shopfloors` | Yes | Master Data Tier 2 | Shopfloor | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP_AND_FIX |
| `/master-data/shopfloors/new` | `ResourceFoundationScreen entity=shopfloors` | No | Shopfloor | Shopfloor | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP_AND_FIX |
| `/master-data/shopfloors/:id` | `ResourceFoundationScreen entity=shopfloors` | No | Shopfloor | Shopfloor | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP_AND_FIX |
| `/master-data/shopfloors/:id/edit` | `ResourceFoundationScreen entity=shopfloors` | No | Shopfloor | Shopfloor | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP_AND_FIX |
| `/console/mes/items` | `ItemsScreen` | No | Legacy console | Item | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/console/mes/routings` | `RoutingScreen` | No | Legacy console | Routing | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/console/mes/production-versions` | `ProductionVersionScreen` | No | Legacy console | Production Version | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/employees` | `EmployeesScreen` | Yes | Labor | Employee and employee skill assignments | MES Master Data | Authenticated | CURRENT_BUT_MISALIGNED | KEEP_AND_FIX |
| `/shifts` | `ShiftsScreen` | Yes | Labor | Shift | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP_AND_FIX |
| `/work-calendar` | `WorkCalendarScreen` | Yes | Labor | Employee Schedule | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/console/mes/employees` | `EmployeesScreen` | No | Legacy console | Employee | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/console/mes/shifts` | `ShiftsScreen` | No | Legacy console | Shift | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/console/mes/work-calendar` | `WorkCalendarScreen` | No | Legacy console | Employee Schedule | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/console/mes/mboms` | `MbomScreen` | No | Legacy console | MBOM | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/console/mes/mboms/:id` | `MbomScreen` | No | Legacy console | MBOM | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/master-data/work-centers` | `WorkCentersScreen` | Yes | Master Data Tier 2 | Work Center | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/work-centers/new` | `ResourceFoundationScreen entity=work-centers` | No | Work Center | Work Center | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/work-centers/:id` | `ResourceFoundationScreen entity=work-centers` | No | Work Center | Work Center | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/work-centers/:id/edit` | `ResourceFoundationScreen entity=work-centers` | No | Work Center | Work Center | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/workstations` | `ResourceFoundationScreen entity=workstations` | Yes | Master Data Tier 2 | Workstation | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/workstations/new` | `ResourceFoundationScreen entity=workstations` | No | Workstation | Workstation | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/workstations/:id` | `ResourceFoundationScreen entity=workstations` | No | Workstation | Workstation | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/workstations/:id/edit` | `ResourceFoundationScreen entity=workstations` | No | Workstation | Workstation | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/print-stations` | `PrintStationsScreen` | Yes | Master Data Tier 2 | Print Station | MES Master Data, Print runtime projection | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/resource-assignments` | `ResourceFoundationScreen entity=resource-assignments` | Yes | Master Data Tier 2 | Resource Assignment | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/resource-assignments/new` | `ResourceFoundationScreen entity=resource-assignments` | No | Resource Assignment | Resource Assignment | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/resource-capabilities` | `PlanningConstraintsScreen entity=resource-capabilities` | Yes | Master Data Tier 2 | Resource Capability | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/resource-capabilities/new` | `PlanningConstraintsScreen entity=resource-capabilities` | No | Resource Capability | Resource Capability | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/resource-capabilities/:id` | `PlanningConstraintsScreen entity=resource-capabilities` | No | Resource Capability | Resource Capability | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/resource-capabilities/:id/edit` | `PlanningConstraintsScreen entity=resource-capabilities` | No | Resource Capability | Resource Capability | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/resource-calendars` | `PlanningConstraintsScreen entity=resource-calendars` | Yes | Master Data Tier 2 | Resource Calendar | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/resource-calendars/new` | `PlanningConstraintsScreen entity=resource-calendars` | No | Resource Calendar | Resource Calendar | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/resource-calendars/:id` | `PlanningConstraintsScreen entity=resource-calendars` | No | Resource Calendar | Resource Calendar | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/resource-calendars/:id/edit` | `PlanningConstraintsScreen entity=resource-calendars` | No | Resource Calendar | Resource Calendar | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/operation-skill-requirements` | `PlanningConstraintsScreen entity=operation-skill-requirements` | Yes | Master Data Tier 2 | Operation Skill Requirement | MES Master Data | Authenticated | CURRENT_BUT_MISALIGNED | KEEP_AND_FIX |
| `/master-data/operation-skill-requirements/new` | `PlanningConstraintsScreen entity=operation-skill-requirements` | No | Operation Skill Requirement | Operation Skill Requirement | MES Master Data | Authenticated | CURRENT_BUT_MISALIGNED | KEEP_AND_FIX |
| `/master-data/operation-skill-requirements/:id` | `PlanningConstraintsScreen entity=operation-skill-requirements` | No | Operation Skill Requirement | Operation Skill Requirement | MES Master Data | Authenticated | CURRENT_BUT_MISALIGNED | KEEP_AND_FIX |
| `/master-data/operation-skill-requirements/:id/edit` | `PlanningConstraintsScreen entity=operation-skill-requirements` | No | Operation Skill Requirement | Operation Skill Requirement | MES Master Data | Authenticated | CURRENT_BUT_MISALIGNED | KEEP_AND_FIX |
| `/console/mes/work-centers` | `WorkCentersScreen` | No | Legacy console | Work Center | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/console/mes/i18n-review` | `I18nReviewScreen` | Yes | Diagnostics | i18n review | Local/static | Admin/AI diagnostic expected | DIAGNOSTIC_ONLY | HIDE_FROM_NAVIGATION |
| `/master-data/equipment` | `Tier2AdminScreen resource=equipment` | No | Master Data Tier 2 | Equipment | MES Master Data | Authenticated | DUPLICATED | MERGE |
| `/master-data/equipment/new` | `ResourceFoundationScreen entity=equipment` | No | Equipment | Equipment | MES Master Data | Authenticated | DUPLICATED | MERGE |
| `/master-data/equipment/:id` | `ResourceFoundationScreen entity=equipment` | No | Equipment | Equipment | MES Master Data | Authenticated | DUPLICATED | MERGE |
| `/master-data/equipment/:id/edit` | `ResourceFoundationScreen entity=equipment` | No | Equipment | Equipment | MES Master Data | Authenticated | DUPLICATED | MERGE |
| `/master-data/machines` | `ResourceFoundationScreen entity=machines` | Yes | Master Data Tier 2 | Machine Definition / Equipment | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/machines/new` | `ResourceFoundationScreen entity=machines` | No | Machines | Machine Definition | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/machines/:id` | `ResourceFoundationScreen entity=machines` | No | Machines | Machine Definition | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/machines/:id/edit` | `ResourceFoundationScreen entity=machines` | No | Machines | Machine Definition | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/console/mes/equipment` | `Tier2AdminScreen resource=equipment` | No | Legacy console | Equipment | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/master-data/production-standards` | `PlanningConstraintsScreen entity=production-standards` | Yes | Master Data Tier 2 | Production Standard | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-standards/new` | `PlanningConstraintsScreen entity=production-standards` | No | Production Standard | Production Standard | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-standards/:id` | `PlanningConstraintsScreen entity=production-standards` | No | Production Standard | Production Standard | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/master-data/production-standards/:id/edit` | `PlanningConstraintsScreen entity=production-standards` | No | Production Standard | Production Standard | MES Master Data | Authenticated | CURRENT_BUT_INCOMPLETE | KEEP_AND_FIX |
| `/console/mes/production-standards` | `PlanningConstraintsScreen entity=production-standards` | No | Legacy console | Production Standard | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/master-data/reason-codes` | `Tier2AdminScreen resource=reason-codes` | Yes | Master Data Tier 2 | Reason Code | MES Master Data | Authenticated | CURRENT_AND_ALIGNED | KEEP |
| `/console/mes/reason-codes` | `Tier2AdminScreen resource=reason-codes` | No | Legacy console | Reason Code | MES Master Data | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/master-data/skills` | `SkillManagementScreen` | Yes | Master Data Tier 2 | Skill Definition | MES Master Data | Authenticated | CURRENT_BUT_MISALIGNED | KEEP_AND_FIX |
| `/master-data/skills/:scope` | `SkillManagementScreen` | No | Skills | Skill Definition by scope | MES Master Data | Authenticated | CURRENT_BUT_MISALIGNED | KEEP_AND_FIX |
| `/master-data/worker-skills` | `Navigate` | No | Legacy skills | Worker Skills | none | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/master-data/employee-skills` | `Navigate` | No | Legacy skills | Employee Skills | none | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/worker-skills` | `Navigate` | No | Legacy skills | Worker Skills | none | Authenticated | LEGACY_ALIAS | REDIRECT |
| `/console/mes/skills` | `Tier2AdminScreen resource=skills` | No | Legacy console | Skills | MES Master Data | Authenticated | CURRENT_BUT_MISALIGNED | REDIRECT |
| `*` | `NotFoundScreen` | No | Any | Not found | none | Authenticated | CURRENT_AND_ALIGNED | KEEP |

Routes selected for merge, redirect, deprecation, or removal:

| Current route | Replacement route | Inbound references | Sidebar references | Internal links | External bookmark risk | User role impact | E2E impact | API impact | Redirect period | Deletion gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/console/mes/work-orders*` | `/work-orders*` | Unknown external bookmarks | None | Possible old docs | Medium | None | Update legacy smoke | None | 1 release | Access logs show no use or redirect E2E passes |
| `/console/mes/items` | `/master-data/items` | Unknown | None | Low | Low | None | Update route smoke | None | 1 release | Same |
| `/console/mes/routings` | `/master-data/routings` | Unknown | None | Low | Low | None | Update route smoke | None | 1 release | Same |
| `/console/mes/production-versions` | `/master-data/production-versions` | Unknown | None | Low | Low | None | Update route smoke | None | 1 release | Same |
| `/console/mes/employees` | `/employees` | Unknown | None | Low | Low | None | Update route smoke | None | 1 release | Same |
| `/console/mes/shifts` | `/shifts` | Unknown | None | Low | Low | None | Update route smoke | None | 1 release | Same |
| `/console/mes/work-calendar` | `/work-calendar` | Unknown | None | Low | Low | None | Update route smoke | None | 1 release | Same |
| `/console/mes/mboms*` | `/master-data/mboms*` | Unknown | None | Low | Low | None | Update route smoke | None | 1 release | Same |
| `/console/mes/work-centers` | `/master-data/work-centers` | Unknown | None | Low | Low | None | Update route smoke | None | 1 release | Same |
| `/console/mes/equipment` | `/master-data/machines` | Unknown | None | Medium | Medium due terminology | None | Update machine E2E | None | 2 releases | Product confirms Machines is canonical label |
| `/console/mes/production-standards` | `/master-data/production-standards` | Unknown | None | Low | Low | None | Update route smoke | None | 1 release | Same |
| `/console/mes/reason-codes` | `/master-data/reason-codes` | Unknown | None | Low | Low | None | Update route smoke | None | 1 release | Same |
| `/console/mes/skills` | `/master-data/skills/workers` or `/master-data/skills` | Unknown | None | Medium | High because current alias bypasses worker tab semantics | None | Add regression | None | Immediate redirect | Redirect E2E and no direct Tier2 skill usage |
| `/master-data/equipment*` | `/master-data/machines*` | Unknown | None | `RouteHeader`, `ResourceHierarchy` links may point to equipment | Medium | None | Update machine E2E | None | 2 releases | Product confirms canonical naming |
| `/master-data/product-recipes` | `/master-data/production-versions` | Legacy docs | None | Low | Low | None | Existing redirect smoke | None | Keep redirect indefinitely | None |
| `/console/mes/i18n-review` | Diagnostic route or admin-only hidden route | Sidebar currently visible | Sidebar diagnostic item | Low | Low | Hide from non-admin | Update route smoke | None | N/A | Product confirms diagnostic visibility |

## 3. Eleven-Phase Traceability Matrix

| Phase | Domain/backend requirement | Migration/schema | API | Seed data | Expected MES Console capability | Current UI | E2E | Gap | Required remediation |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Baseline audit, route/API inventory, guardrails | No schema change | Inventory only | Existing | Stable route inventory and audit reports | Partial inventory now exists | None mandatory | No canonical remediation blueprint before this file | Freeze this blueprint as UI-0 gate |
| 1 | Resource planning correctness: Work Center, Workstation, Equipment, Machine Unit, Resource Assignment, Capacity Reservation separation | `md_resource_assignment`, machine unit, readiness tables | Resource readiness and allocation APIs | Base RP data | UI distinguishes requirements, assignments, allocation, capacity | Mostly present | API Phase 1, some browser | Detail/readiness scattered | Add cross-links, explicit terminology, table columns |
| 2 | Full API flow verification with strict allocation/revalidation | Execution allocation and reservation schema | Candidate, commit, reallocate, cancel, revalidate, approve, start | E2E WO data | Work Order detail supports all lifecycle actions | Present | API full flow | Incomplete disabled-state and permission UX | Standard action contracts, permission matrix |
| 3 | Browser E2E for resource planning | No new schema | Existing APIs | E2E fixtures | Browser creates WO, selects candidates, approves, starts | Present | Phase 3 spec | Page coverage narrow | Add retained-page smoke and refresh persistence |
| 4 | Production Version is sole WO production-definition authority | PV, MBOM, Routing, Revision ownership | `production-ready-versions`, creation workflow | PV seed | WO create selects only Production Version | Present | Phase 4 spec | Production version line eligibility not surfaced enough | Add PV line eligibility summary and validation panels |
| 5 | Two-line domain design and ADR | Line tables and invariants designed | Design/API target | N/A | UI must support one-WO-one-line mental model | Partial | N/A | No full diagnostic contract before this file | Implement line badges/matrix per Section 12 |
| 6 | Two-line master data: Production Line, line-work-center, line eligibility | `md_production_line`, `md_production_line_work_center`, `md_production_version_line_eligibility` | Master-data line endpoints | Two-line line/PV seed | Production Line and PV Line Eligibility screens | Partial | Phase 6 spec | Line readiness/eligibility visibility incomplete | Add line detail and PV eligibility tab |
| 7 | Line selection and line-wide resource planning | Execution line selection fields and audit | Creation, detail, replan, candidates | Two-line model | Auto line selection plus manual exact resource allocation | Present | Phase 7 API | Worker skill seed conflict causes hold; evaluated results shallow | Fix seed; extend detail diagnostics |
| 8 | MES Console two-line UX | No schema | Existing detail APIs | Browser mocks | Detail shows line fallback, hold, blockers, replan | Partial | Phase 8 mocked browser | Mocked, not current seeded READY WOs | Add persisted UAT WOs and real browser E2E |
| 9 | Full API/E2E regression after two-line integration | Existing | Existing | Existing | Regression-safe UI and APIs | Partial | Phase 9 script | Browser coverage incomplete | Full Playwright retained-page regression |
| 10 | Full reset and Won Seal Tech canonical seed | Reset/seed scripts | Seed verification APIs | Canonical seed | Console can operate deterministic canonical data | Not ready | Verification artifact passes but current DB has scope conflict | Worker skills are WorkCenter scoped | Rebuild Employee-scoped seed |
| 11 | Final enterprise verification | All above | All above | Full flow | Console proves primary, backup, and hold states | Incomplete | Final reports | Target WO is ResourceHold only | Add three UAT WOs and final report |

## 4. Screen-by-Screen Functional Contract

This section defines contracts by current screen component and route family. Detail/edit/new routes inherit the same contract unless separately listed.

### `/work-orders` — Work Order List

Business purpose: find and triage Work Orders.

Domain owner: MES Execution.

Intended users and roles: planner, production manager, executive viewer, operator viewer.

Position in flow: entry point after production version setup.

Upstream prerequisites: released production versions, shifts, seed data.

Downstream consumers: Work Order detail, resource planning, approval, execution.

Current APIs: `GET /api/mes/execution/work-orders`, `GET /api/mes/execution/work-orders/:id` for modal.

Current UI behavior: columns WO, Item, Quantity, Target Date, Status, Actions; status buttons.

Required final UI behavior: add selected line, line-selection status, primary/backup/fallback/resource-hold indicators, approval/execution state, server-backed filters.

Current defects: `BACKEND_FIELD_NOT_EXPOSED` for selected line and line-selection status; missing filters.

Final route decision: `KEEP_AND_FIX`.

Required implementation files: `WOListScreen.tsx`, `workOrderDetail.ts`, i18n, execution list API if filters missing.

Required tests: table column E2E, filter API tests, refresh persistence, role action visibility.

Acceptance criteria: list can identify READY primary, READY backup fallback, and RESOURCE_HOLD WOs without opening detail.

### `/work-orders/new` — Work Order Create

Business purpose: create WO from one released production version.

Domain owner: MES Execution, with MES Master Data production-ready versions.

Intended users and roles: planner, production manager.

Position in flow: after Production Version release.

Upstream prerequisites: production-ready version, shift, target date, quantity.

Downstream consumers: WO detail.

Current APIs: `GET /production-ready-versions`, `GET /shifts`, `GET /work-order-code-preview`, `POST /work-order-creation-workflows`, websocket workflow.

Current UI behavior: PV selector, quantity, target date, shift, auto line mode summary.

Required final UI behavior: keep automatic line selection, show line selection result clearly, link to PV eligibility and selected line readiness.

Current defects: no persisted UAT fixture strategy; no explicit blocker detail on create result.

Final route decision: `KEEP_AND_FIX`.

Required implementation files: `WOCreateScreen.tsx`, `i18n.ts`.

Required tests: PV-only authority, auto line selection result, RESOURCE_HOLD workflow result, idempotency.

Acceptance criteria: browser never independently selects MBOM/routing/line; creation result exposes selected line or hold reason.

### `/work-orders/:id` — Work Order Detail

Business purpose: inspect WO, line selection, material/compute state, resource planning, approval, and execution.

Domain owner: MES Execution.

Intended users and roles: planner, production manager, executive viewer, operator.

Position in flow: central execution planning screen.

Upstream prerequisites: created WO.

Downstream consumers: allocation, approval, start execution, kiosk.

Current APIs: detail, compute, stage materials, candidates, allocation, reallocate, cancel, revalidate, approve, reject, start, line replan.

Current UI behavior: header, selected line panel, simplified evaluated-line cards, hold warning, resource planning, compute result, labor assignments, action buttons.

Required final UI behavior: complete two-line diagnostic matrix, allocation history, line lock impact, role-based action visibility, blocker-to-master-data links.

Current defects: diagnostics incomplete; target fixture is hold-only; permission affordances partial.

Final route decision: `KEEP_AND_FIX`.

Required implementation files: `WODetailScreen.tsx`, `workOrderDetail.ts`, `errorMessages.ts`, i18n.

Required tests: primary READY, backup READY, resource hold, replan allowed/blocked, mixed-line rejection, allocation/reallocation/cancel/revalidate/approve/start, refresh persistence.

Acceptance criteria: detail proves why the backend selected or held a line without frontend recomputing readiness.

### Product Definition Screens — Items, UOMs, Material Groups, EBOM, MBOM, Routing, Operations, Production Versions

Business purpose: define product identity, engineering baseline, manufacturing material/process, and released production configuration.

Domain owner: MES Master Data.

Intended users and roles: master data admin, planner, production manager.

Position in flow: prerequisites before WO creation.

Upstream prerequisites: site, UOM, material groups, operations, work centers.

Downstream consumers: Production Version, Work Order snapshot.

Current APIs: generic master-data CRUD, MBOM-specific validation/new-version/substitute APIs, routing operations, production version validation and line eligibility APIs.

Current UI behavior: broad CRUD coverage with several specialized screens.

Required final UI behavior: enforce localized name/code display, immutable released structures, production-version ownership, line eligibility summary and tab, no EBOM manufacturing semantics.

Current defects: PV line eligibility visibility incomplete; some generic forms need stronger option filtering.

Final route decision: `KEEP_AND_FIX`; `/master-data/product-recipes` remains redirect.

Required implementation files: `ItemsScreen.tsx`, `UomManagementScreen.tsx`, `MaterialGroupManagementScreen.tsx`, `EbomScreen.tsx`, `MbomScreen.tsx`, `MbomCreateScreen.tsx`, `RoutingScreen.tsx`, `RoutingCreateScreen.tsx`, `RoutingOperationsScreen.tsx`, `OperationCatalogScreen.tsx`, `ProductionVersionScreen.tsx`, `ProductionVersionCrudScreen.tsx`.

Required tests: CRUD forms, lifecycle release, PV authority, line eligibility create/edit, validation error rendering, no UUID primary identity.

Acceptance criteria: a planner can trace Item Revision -> EBOM/MBOM/Routing -> Production Version -> line eligibility -> WO.

### Resource Foundation Screens — Factory, Shopfloor, Area, Production Line, Work Center, Workstation, Machine, Assignment

Business purpose: define site hierarchy and resource readiness foundation.

Domain owner: MES Master Data.

Intended users and roles: master data admin, planner, production manager.

Position in flow: prerequisite for routing, PV line eligibility, resource planning.

Upstream prerequisites: site/UOM/operations where relevant.

Downstream consumers: routing, line selection, resource candidates, capacity reservations.

Current APIs: generic master-data CRUD plus specialized work center headcount, workstation detail/readiness, machine units, machine groups, resource assignments.

Current UI behavior: `ResourceFoundationScreen`, `WorkCentersScreen`, `ResourceHierarchy`, machine flow.

Required final UI behavior: detail pages must separate requirements, effective assignments, line membership, capabilities, calendars, standards, readiness, and history.

Current defects: line readiness is split; equipment/machines naming duplicated; production areas hidden from sidebar.

Final route decision: keep Machines canonical; merge Equipment into Machines after product decision.

Required implementation files: `ResourceFoundationScreen.tsx`, `WorkCentersScreen.tsx`, `ResourceHierarchy.tsx`, `RouteHeader.tsx`, `Sidebar.tsx`.

Required tests: hierarchy CRUD, line membership, machine unit identity, assignment effectivity, readiness blockers, duplicate assignment rejection.

Acceptance criteria: no UI collapses Work Center, Production Line, Workstation, Equipment, Machine Unit, Resource Assignment, or WO Allocation.

### Planning Constraint Screens — Capabilities, Calendars, Production Standards, Operation Skill Requirements

Business purpose: define backend readiness dimensions consumed by candidates and line selection.

Domain owner: MES Master Data.

Intended users and roles: planner, production manager, master data admin.

Position in flow: readiness prerequisite before WO planning.

Upstream prerequisites: work centers, operations, resources, shifts, Employee-scoped worker skills.

Downstream consumers: line readiness, resource candidates, compute/check, approval.

Current APIs: generic master-data CRUD and readiness APIs.

Current UI behavior: generic `PlanningConstraintsScreen` forms.

Required final UI behavior: resource type constrained by selects, Employee-scoped skill options, effectivity clearly visible, backend blocker messages translated.

Current defects: skill scope mismatch; generic resource type input can allow invalid-looking combinations until backend rejects.

Final route decision: `KEEP_AND_FIX`.

Required implementation files: `PlanningConstraintsScreen.tsx`, `masterDataApi.ts`, i18n.

Required tests: every entity CRUD, invalid combinations, scope validation, lifecycle/effectivity.

Acceptance criteria: UI guides valid readiness data but backend remains authoritative.

### Labor Screens — Employees, Shifts, Work Calendar

Business purpose: maintain workforce, skills, and schedules used by readiness.

Domain owner: MES Master Data.

Intended users and roles: HR/admin/planner/production manager.

Position in flow: prerequisite for operation labor readiness.

Upstream prerequisites: site, work centers, Employee-scoped skills.

Downstream consumers: resource planning labor assignment and operation skill requirements.

Current APIs: employees, shifts, employee schedules, employee skills.

Current UI behavior: employee list/modal assigns skills; work calendar bulk schedules.

Required final UI behavior: Employee form loads canonical Employee-scoped worker skills, shows current assignments, qualification status, certification fields if backend supports them, and warns on expiring qualifications.

Current defects: current seed skill scope prevents UI/API consistency.

Final route decision: `KEEP_AND_FIX`.

Required implementation files: `EmployeesScreen.tsx`, `WorkCalendarScreen.tsx`, `ShiftsScreen.tsx`, i18n.

Required tests: employee create/edit, skill assignment save, schedule bulk, readiness consumption.

Acceptance criteria: Employee skill rows reference Employee-scoped skills only.

### Skill Management Screen

Business purpose: manage machine/workstation/work-center/worker skill definitions and view dependencies.

Domain owner: MES Master Data.

Intended users and roles: master data admin, production manager.

Position in flow: prerequisite for machine/resource skills and worker labor readiness.

Upstream prerequisites: skill groups where applicable.

Downstream consumers: employee skills, operation skill requirements, resource skill assignments.

Current APIs: `/skills`, `/worker-skills`, dependencies and assignments endpoints.

Current UI behavior: tabbed definitions; worker detail assignment list is read-only.

Required final UI behavior: final ownership decision from Section 9; seed scope correction; no generic legacy skill alias.

Current defects: `/console/mes/skills` legacy surface and seed scope mismatch.

Final route decision: `KEEP_AND_FIX`, redirect legacy alias.

Required implementation files: `SkillManagementScreen.tsx`, `EmployeesScreen.tsx`, `App.tsx`, `Sidebar.tsx`, i18n.

Required tests: worker definition CRUD, assignment UX, dependency check, deactivation blocked/allowed.

Acceptance criteria: same Employee-scoped worker skill identity is used by definitions, employee assignments, operation requirements, readiness, and seed.

### Print Station Screen

Business purpose: manage MES-side print station master data and runtime projection.

Domain owner: MES Master Data plus Print Station runtime projection.

Intended users and roles: admin, production manager.

Position in flow: label printing and workstation binding.

Upstream prerequisites: workstations, print station runtime.

Downstream consumers: work order print jobs, station/kiosk.

Current APIs: print-station master data and runtime projection endpoints.

Current UI behavior: screen exists; physical third-party flow skipped.

Required final UI behavior: keep separate from phase-11 line selection pass unless print runtime is in scope.

Current defects: not fully covered in UAT due user-approved third-party skip.

Final route decision: `KEEP_AND_FIX`.

Required tests: master-data smoke, binding validation; physical printer tests only when runtime is in scope.

Acceptance criteria: print gaps do not block non-print MES Console remediation when explicitly skipped.

### Diagnostic and Not Found Screens

Business purpose: i18n review and safe not-found handling.

Domain owner: MES Console.

Final route decision: hide i18n review from normal sidebar or admin-gate it; keep not-found route.

Acceptance criteria: diagnostics do not appear as production master-data functionality.

## 5. Complete Table Column Contract

Final column order by screen:

| Screen | Column label | Backend field | Business meaning | Required in final UI | Sort | Filter | Translation | Current state | Required change |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Work Order List | Work Order | `wo_code` | Business identity | Yes | Yes | Search | No | Present | Keep primary |
| Work Order List | Item | `item_code`, `item_name` | Product | Yes | Yes | Search | Localized | Present | Localized name first, code second |
| Work Order List | Quantity | `quantity`, `uom` | Planned quantity | Yes | Yes | No | UOM label | Present | Keep |
| Work Order List | Target Date | `planned_start_at` or target date | Plan date | Yes | Yes | Yes | Date locale | Present | Keep |
| Work Order List | Status | `status` | WO lifecycle | Yes | Yes | Yes | Enum | Present | Keep translated |
| Work Order List | Selected Line | `selected_production_line_code`, name | Selected execution line | Yes | Yes | Yes | Localized line name | Missing | Add |
| Work Order List | Line Selection | `line_selection_status`, `line_selection_mode` | READY/HOLD mode | Yes | Yes | Yes | Enum | Missing | Add badge |
| Work Order List | Line Result | `fallback_reason`, selected role | Primary/backup result | Yes | No | Yes | Enum | Missing | Add primary/backup/fallback badge |
| Work Order List | Approval/Execution | `status`, allocation validity | Release/start state | Yes | Yes | Yes | Enum | Partial | Add derived display from backend fields only |
| Work Order List | Actions | route/action availability | Detail/open | Yes | No | No | Label | Present | Role-aware buttons |
| Item/Revisions | Item | `name`, `code` | Product identity | Yes | Yes | Search | Localized | Present | Ensure code secondary |
| Item/Revisions | Type/Group | `item_type`, `material_group` | Product category | Yes | Yes | Yes | Enum/name | Present | Keep |
| Item/Revisions | Base UOM | `base_uom_id`, code | Measurement | Yes | Yes | Yes | UOM label | Present | Keep |
| Item/Revisions | Lifecycle/Effectivity | `lifecycle_status`, dates | Usability | Yes | Yes | Yes | Enum/date | Partial | Ensure effectivity visible |
| EBOM | Component | revision/component fields | Engineering baseline | Yes | Yes | Search | Localized | Present | Keep engineering-only terms |
| MBOM | Component | line/component fields | Manufacturing materials | Yes | Yes | Search | Localized | Present | Ensure UOM derived |
| Routing | Sequence/Operation | `sequence_no`, `operation_id` | Process flow | Yes | Yes | Search | Localized | Present | Keep |
| Routing | Work Center | `work_center_id` | Logical routing target | Yes | Yes | Yes | Localized | Present | Ensure no workstation authority |
| Production Version | Code/Name | `code`, `name` | WO production authority | Yes | Yes | Search | Localized | Present | Keep |
| Production Version | Item Revision | `item_revision_id` | Product version | Yes | Yes | Yes | Localized | Present | Keep |
| Production Version | MBOM/Routing/EBOM | references | Configuration | Yes | Yes | Search | Localized | Present | Keep |
| Production Version | Line Eligibility | line eligibility rows | Eligible lines | Yes | No | Yes | Line name/code | Partial | Add summary columns |
| Resource Foundation | Name/Code | `name`, `code` | Resource identity | Yes | Yes | Search | Localized | Present | Keep |
| Resource Foundation | Hierarchy | `site_id`, `shopfloor_id`, `area_id`, `work_center_id` | Parent context | Yes | Yes | Yes | Localized | Partial | Add where missing |
| Resource Foundation | Lifecycle/Active | `lifecycle_status`, `active_flag` | Availability | Yes | Yes | Yes | Enum | Present | Keep |
| Resource Foundation | Effectivity | `effective_from`, `effective_to` | Historical validity | Yes | Yes | Yes | Date | Partial | Add to assignments/calendars/capabilities |
| Machines | Units | `machine_unit_count`, unit status | Physical identity | Yes | No | Yes | Enum | Present | Ensure no UUID primary |
| Workstations | Machine Requirements | group/requirement fields | Required resources | Yes | No | No | Role enum | Present | Keep separate from assignments |
| Workstations | Assignments | `md_resource_assignment` | Effective resources | Yes | No | Yes | Role/status | Present | Keep history |
| Planning Constraints | Scope | resource/work center/operation/skill fields | Readiness dimension | Yes | Yes | Yes | Localized | Present | Constrain option labels |
| Employees | Employee | `name`, `code` | Worker identity | Yes | Yes | Search | Localized/string | Present | Keep |
| Employees | Work Center | `default_work_center_id` | Default labor context | Yes | Yes | Yes | Localized | Present | Keep |
| Employees | Skills | `md_employee_skill` | Qualifications | Yes | No | Yes | Skill name/code | Partial | Add visible current skill summary |
| Skills | Skill | `name`, `code` | Skill identity | Yes | Yes | Search | Localized | Present | Keep |
| Skills | Scope | `scope` | Machine/workstation/work-center/employee domain | Yes | Yes | Yes | Enum | Partial | Explicit badge |
| Skills | Assignments | `active_assignment_count` | Worker usage | Yes | Yes | No | Number | Present worker tab | Keep |

Global table requirements: localized name first, business code second, no UUID primary identity, lifecycle and effectivity visible for mutable/effective records, parent hierarchy visible for resources, selected line visible for WOs, no raw enum or `[object Object]`.

## 6. Complete CRUD Form Contract

| Screen | Mode | Field | Backend field | Input control | Required | Mutable | Option source | Dependency | Validation | Final requirement |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| Work Order Create | Create | Production Version | `production_version_id` | Combobox | Yes | Create only | `/production-ready-versions` | Planned date | Released/effective | No MBOM/routing separate selectors |
| Work Order Create | Create | Quantity | `quantity` | Numeric | Yes | Create only | User | UOM from PV | > 0, UOM precision | Show UOM |
| Work Order Create | Create | Target date/start | `target_date`/planned start | Date/time | Yes | Create only | User | Shift | valid date | Use backend workflow |
| Work Order Create | Create | Shift | `shift_id` | Select | Yes | Create only | `/shifts` by site | PV/site | shift belongs to site | Reset when PV/site changes |
| Item | Create/Edit | Name | `name` | Localized text | Yes | Yes | User | Locale | nonempty | Localized component |
| Item | Create/Edit | Code | `code` | Generated/read-only | Yes | No | Business code API | Entity type | unique | Never user-edited after create |
| Item Revision | Create/Edit | Revision/UOM/effectivity | revision fields | Text/select/date | Yes | Some immutable after release | UOM/items | Item | backend lifecycle | Show effectivity |
| EBOM | Create/Edit | Output revision | `item_revision_id` | Select | Yes | Immutable when released | Released revisions | Item | ownership | Engineering only |
| EBOM | Create/Edit | Lines | EBOM lines | Repeater | Yes for release | Yes before release | Item revisions/UOM | Output rev | quantity precision | No manufacturing fields |
| MBOM | Create/Edit | Output revision | `item_revision_id` | Select | Yes | Immutable when released | Released revisions | Item | ownership | Manufacturing authority |
| MBOM | Create/Edit | Lines/substitutes | MBOM line fields | Repeater/modal | Yes | Draft only | Item revisions/UOM | Component revision | UOM precision, substitutes | Persist replacement semantics |
| Routing | Create/Edit | Item revision/site | `item_revision_id`, `site_id` | Select | Yes | Immutable when released | Released revisions/sites | Site | ownership | Align with MBOM/PV |
| Routing Operation | Create/Edit | Operation | `operation_id` | Select | Yes | Draft | Operation catalog | Routing | active/effective | No workstation target authority |
| Routing Operation | Create/Edit | Work Center | `work_center_id` | Select | Yes | Draft | Work centers by site | Operation/site | active/effective | Reset invalid dependent fields |
| Routing Operation | Create/Edit | Worker requirements | operation skill rows | Repeater | Optional | Draft | `/worker-skills` | Operation | Employee scope | Use Employee-scoped skills only |
| Production Version | Create/Edit | Item Revision | `item_revision_id` | Select | Yes | Draft | Released revisions | Site/effectivity | ownership equality | Primary WO authority |
| Production Version | Create/Edit | MBOM/Routing/EBOM | ids | Select | MBOM/routing yes | Draft | Released compatible structures | Item revision | ownership equality | Browser cannot conflict |
| Production Version | Create/Edit | Line eligibility | eligibility rows | Table/repeater | Yes for two-line PV | Draft/released per policy | Production lines | Site/PV | primary exactly one, priorities | Add summary and validation |
| Factory/Shopfloor/Area | Create/Edit | Name/code/hierarchy/status | resource fields | Localized/select/toggle | Yes | Some | Parent resources | Hierarchy | parent active | Reset child dependencies |
| Production Line | Create/Edit | Name/code/site/area/status | line fields | Localized/select/toggle | Yes | Yes with dependency impact | Sites/areas | Site | active/effectivity | Add readiness summary |
| Work Center | Create/Edit | Name/site/shopfloor/area/type/status | fields | Localized/select/toggle | Yes | Yes with dependency impact | Hierarchy | Site | hierarchy valid | Do not create capabilities here |
| Workstation | Create/Edit | Work Center, execution mode, requirements | fields/groups | Select/repeater | Yes | Yes with history | Work centers/machines/units | Site/work center | assignment availability | Distinguish requirements vs assignments |
| Machine | Create/Edit | Name/site/work center/type/expected units | fields | Localized/select/number | Yes | Yes | Sites/work centers/skills | Site | unit identity | `machines` canonical |
| Machine Unit | Create/Edit | Asset/serial/status/planning flag | unit fields | Text/select/toggle | Yes | Yes | Machine | Machine | uniqueness | No duplicate physical identity |
| Resource Assignment | Create/Edit | Site/work center/workstation/equipment/unit/role/effectivity | fields | Select/date | Yes | End-effective | Resources | Hierarchy | overlap/role | Preserve history |
| Capability | Create/Edit | Work center/operation/resource/eligibility/effectivity | fields | Select/date | Yes | Yes | Resources/operations | Site | valid combination | Use constrained selectors |
| Calendar | Create/Edit | Resource type/id/shift/status/capacity/effectivity | fields | Select/date/number | Yes | Yes | Resources/shifts | Type | valid type and date | No free-form type |
| Production Standard | Create/Edit | Operation/routing/resource/times | fields | Select/number | Yes | Yes | Operations/resources | Routing | positive times | Show formula impact |
| Operation Skill Requirement | Create/Edit | Operation/routing operation/skill/level/persons/effectivity | fields | Select/number/date | Yes | Yes | `/worker-skills` | Operation | Employee scope | Fix seed before use |
| Employee | Create/Edit | Code/name/site/work center/status/hired date | fields | Text/select/date | Yes | Yes | Sites/work centers | Site | status | Keep |
| Employee | Create/Edit | Skills/levels | `skills` payload to `/employees/:id/skills` | Checkbox/select | Optional | Yes | Employee-scoped worker skills | Skill scope | Employee scope | Current seed blocks correctness |
| Skill | Create/Edit | Name/description/minimum level | skill fields | Localized/select | Yes | Yes | User | Scope path | duplicate/scope | Worker tab uses `/worker-skills` |

Identified field defects: `WRONG_OPTION_SOURCE` for employee skill seed/options, `BACKEND_FIELD_NOT_EXPOSED` for WO list line fields, `FIELD_NOT_HYDRATED` risk in generic Tier2 screens, `BROKEN_DEPENDENCY` risk in generic planning constraint resource type forms, `OBSOLETE_FIELD` risk for `/master-data/product-recipes`.

## 7. Detail Screens, Tabs, Panels, and Actions

| Screen | Tab/panel/action | Business purpose | API | Permission | Current status | Required final behavior |
| --- | --- | --- | --- | --- | --- | --- |
| Work Order Detail | Summary | Identity/snapshot | `GET /work-orders/:id` | View | Current | Show PV, item, quantity, status, selected line, row version |
| Work Order Detail | Line panel | One-WO-one-line proof | detail fields | View | Partial | Full matrix in Section 12 |
| Work Order Detail | Compute & Check | Capacity/labor result | `POST /compute-check` | Planner/manager | Current | Translate all blockers and labor assignments |
| Work Order Detail | Resource Planning | Exact resource commitment | candidates/allocation APIs | Planner/manager/executive per backend | Current | Keep manual per-operation allocation |
| Work Order Detail | Select Candidate | Commit exact resource | `POST /resource-allocation` | Backend `canCommitAllocation` | Current | Confirmation when replacing existing allocation |
| Work Order Detail | Cancel Allocation | End runtime commitment | `DELETE /resource-allocation` | Backend `canCommitAllocation` | Current | Preserve audit, confirm destructive action |
| Work Order Detail | Reallocate | Supersede allocation | `POST /reallocate` | Backend `canCommitAllocation` | Current | Require reason where API supports it |
| Work Order Detail | Revalidate | Re-check allocations | `POST /resource-allocations/revalidate` | Planner/manager | Current | Show per-operation invalid reasons |
| Work Order Detail | Approve/Reject | Lifecycle gate | `POST /approve`, `POST /reject` | Backend freshness/permission check | Current | Disable if missing valid allocations under strict policy |
| Work Order Detail | Start Execution | Execution gate | `POST /start-execution` | Backend | Current | Show strict blockers and print-station skip policy |
| Work Order Detail | Replan Line | Re-evaluate line before start | `POST /line-replan` | Backend status/role | Current | Require impact explanation and reason |
| Production Version | Line Eligibility tab | Define eligible primary/backup lines | PV line eligibility APIs | Master data role | Partial | Add table, edit, validation, readiness preview |
| Production Line | Detail panels | Line membership/readiness | line detail/readiness APIs | View | Partial | Show work centers, PV eligibility, blockers |
| Workstation | Detail panels | Requirements/assignments/readiness | workstation detail | View | Partial | Separate requirement, assignment, history, readiness |
| Machine | Unit panels | Physical identities | machine units APIs | Admin/planner | Current | Keep serial uniqueness and planning flag |
| Employee | Skills panel in modal | Employee qualifications | `/employees/:id/skills` | Admin/planner | Partial | Use Employee-scoped skills |
| Skill Management | Worker skill assignments | Dependency visibility/mutation | `/worker-skills/:id/assignments` | Product decision | Partial | Option A/B/C in Section 9 |
| All CRUD | Save/Release/Delete/Deactivate | Lifecycle operations | master-data CRUD | Backend validation | Mixed | Shared confirmation, errors, dependency checks |
| All screens | Refresh/Retry | Reload state | GET APIs | View | Current | Standard button, TanStack invalidation |

## 8. Permission and Resource-Scope Matrix

Actual roles found in current source/backend: Keycloak realm roles are passed to UI; `masterDataApi.ts` forwards the first role as `X-Role-Code` and defaults to `PROD_MANAGER`; execution backend allows allocation commit roles `PLANT_MANAGER`, `PROD_MANAGER`, `PLANNER`, `EXECUTIVE`. Kiosk defaults to `OPERATOR`. Seed creates `PROD_MANAGER` permission records and user site scope.

| Screen/action | Admin | Planner | Production Manager | Operator | Viewer | Executive | Cross-site user | Backend enforcement | UI enforcement |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| View MES Console routes | Yes | Yes | Yes | Yes | Unknown | Yes | Scope-dependent | Gateway/Keycloak | Login required only |
| Master data read | Yes | Yes | Yes | Limited expected | Unknown | Yes | Should filter | Master-data route/context partial | No route hiding |
| Master data create/edit | Yes | Yes | Yes | No expected | No expected | No expected | Scope-dependent | Backend validation partial | Buttons not consistently role hidden |
| Release master data | Yes | No expected | Yes | No | No | No | Scope-dependent | Role permission records exist | UI not consistently gated |
| WO create | Yes | Yes | Yes | No expected | No | Maybe read-only | Scope-dependent | Execution API context | UI not role hidden |
| Resource candidate view | Yes | Yes | Yes | Maybe | Yes | Yes | Scope-dependent | Execution context | Visible |
| Commit/reallocate/cancel allocation | Yes | Yes | Yes | No | No | Yes per current backend | Scope-dependent | `canCommitAllocation` role list | Button not fully role-aware |
| Approve/reject WO | Yes | No expected | Yes | No | No | Maybe | Scope-dependent | Approval freshness/permission check | Partial |
| Start execution | Yes | Yes | Yes | Operator maybe through kiosk | No | Maybe | Scope-dependent | Execution backend | Partial |
| Worker skill definition CRUD | Yes | Yes | Yes | No | No | No | Scope-dependent | Master-data API validation | Not role hidden |
| Employee skill assignment | Yes | Yes | Yes | No | No | No | Scope-dependent | Employee skill endpoint validates scope | Not role hidden |
| Diagnostic i18n review | Admin only | No | No | No | No | No | No | None found | Sidebar visible |

Required remediation: define actual Keycloak role names as product-owned constants, add UI affordances for disabled/hidden actions, add negative tests for forged role headers, and do not trust browser-provided roles outside Kong/gateway validation.

## 9. Worker Skill and Employee Skill Final Design

Current evidence:

- Seeded skills: `SK-WC-INSPECTION`, `SK-WC-MIX-MASTER`, `SK-WC-VULCAN-OPERATOR`, all `scope=WorkCenter`.
- APIs requiring Employee scope: `GET /worker-skills`, `POST /worker-skills`, `GET /employees/:id/skills`, `PUT /employees/:id/skills`, `POST /worker-skills/:id/assignments`, `POST /worker-skills/:id/assignments/:employeeId/end`, operation skill requirement create/update validation.
- UI: `SkillManagementScreen` worker tab uses `/worker-skills`; `EmployeesScreen` loads `/skills?scope=Employee` and saves `/employees/:id/skills`.

UX options:

| Option | Clarity | Duplicate mutation paths | Permission | Audit | Backend support | Maintenance | Testing | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Employee modal is only assignment authority; Worker Skill detail read-only | High for employee-centric updates | None | Simple | Existing employee endpoint | Supported | Low | Moderate | Recommended default |
| B. Employee modal and Worker Skill detail both mutate assignments | Medium | Yes | More complex | Supported by worker assignment endpoints | Supported | Medium/high | High | Requires explicit product acceptance |
| C. Dedicated Employee Skill Assignment screen owns relationship | High for large operations | None if employee modal becomes read-only summary | Requires new screen | Can use existing endpoints | New UI | Medium | High | Future option |

Recommended final design: Option A for UI remediation now. Worker Skill detail remains read-only for assignments but clearly links to Employee edit. This avoids two conflicting mutation paths. If production users need skill-centric bulk assignment, implement Option C later as its own route with audit-focused design.

Non-negotiable domain requirements:

- Canonical worker skills use `scope=Employee`.
- `md_employee_skill` rows reference Employee-scoped skills.
- `md_operation_skill_requirement` rows reference Employee-scoped skills.
- Seed creates valid Employee-scoped skills and assignments.
- Employee UI loads the same definitions as Worker Skills tab.
- Readiness consumes the same domain identity.

Final Employee form behavior: show employee identity fields, current skills grouped by active/inactive, Employee-scoped skill selector, level, qualification status, optional certificate/expiry fields if backend supports them, validation summary, and save through `PUT /employees/:id/skills`.

## 10. Production Line and Line Eligibility UI Contract

Final Production Line list columns: Line name/code, site, area/shopfloor, active/lifecycle, work-center count, active production-version eligibility count, current readiness summary, actions.

Final Production Line detail tabs:

| Tab | Content | API |
| --- | --- | --- |
| Overview | identity, hierarchy, lifecycle, effectivity | production line detail |
| Work Centers | `md_production_line_work_center` memberships | line work-center APIs |
| Eligibility | PVs that can use this line | production version line eligibility |
| Readiness | backend readiness summary and blockers | readiness endpoint or required new endpoint |
| Audit/History | effective changes | existing history if available; otherwise required API |

Line Eligibility belongs in Production Version Create/Edit and Production Version Detail as a dedicated tab. Production Version list must show a compact summary.

Final Line Eligibility fields: production line, role/primary flag, priority, efficiency factor, selection mode/policy, effective from/to, active flag, lifecycle. Validation: exactly one active primary per production version; priority unique among active lines; eligible line site must match production version site; line must have active work-center coverage for mandatory operations.

Required API extension: if current PV detail does not return line readiness dimensions, add a read-only readiness preview endpoint. The frontend must not compute readiness.

## 11. Work Order List Final Contract

Required final columns:

1. Work Order code
2. Item localized name and code
3. Quantity and UOM
4. Target/planned date
5. Status
6. Selected Production Line
7. Line-selection status
8. Primary/Backup result indicator
9. Fallback badge
10. Resource Hold badge
11. Approval state
12. Execution state
13. Actions

Required filters:

| Filter | Backend support | Requirement |
| --- | --- | --- |
| selected line | Unknown in current list API | Add query parameter if missing |
| line-selection status | Unknown in current list API | Add query parameter if missing |
| Resource Hold | Status filter partially supports via status | Add explicit line status filter |
| fallback used | Unknown | Add query parameter if missing |
| Work Order status | Current UI client buttons/list API status support unclear | Make server-backed |
| Production Version | Unknown | Add query parameter if missing |
| Site | Context exists | Add server-backed filter |
| Date | Existing target date field | Add server-backed range |

Do not implement browser-only filtering for authoritative production triage when API filters are absent.

## 12. Work Order Detail Final Two-Line Contract

Final screen must include:

- Summary: WO code, item, PV, quantity, status, row version, created/updated timestamps.
- Selected line: selected line name/code/id hidden, mode, status, lock state.
- Primary line: primary candidate result, blockers, dimensions.
- Backup line: backup candidate result, blockers, dimensions.
- Fallback reason: translated reason plus selected backup indicator.
- Resource Hold reason: translated reason plus blocking dimensions.
- Evaluated line results: backend-provided matrix, not frontend recomputation.
- Operation line consistency: every operation line equals selected line or explicit hold.
- Resource candidates: constrained inside selected line.
- Allocation history: committed/cancelled/superseded and audit.
- Approval/execution: strict gate status and blockers.

Complete evaluated-line matrix:

| Dimension | Primary Line | Backup Line |
| --- | --- | --- |
| Eligibility | From backend `evaluated_line_results` or required extension | Same |
| Work Centers | Backend line-work-center readiness | Same |
| Workstations | Backend readiness candidate count | Same |
| Machine Requirements | Backend blockers/warnings | Same |
| Equipment/Machine Units | Backend blockers/warnings | Same |
| Assignments | Backend blockers/warnings | Same |
| Capability | Backend readiness | Same |
| Calendar/Shift | Backend readiness | Same |
| Production Standard | Backend readiness | Same |
| Capacity | Backend capacity status | Same |
| Worker Skill/Labor | Backend labor readiness | Same |
| Final result | READY/BLOCKED/HOLD | READY/BLOCKED/HOLD |
| Selection reason | Backend `line_selection_reason`/fallback reason | Same |

Current backend detail provides `evaluated_line_results`, but current UI only renders simplified role/status/blocker cards. If `evaluated_line_results` lacks a dimension, add it to the backend response or a read-only diagnostic endpoint. Do not calculate line readiness in React.

## 13. Automatic Line Selection Versus Manual Resource Allocation

Final supported flow:

```text
automatic whole-line selection
+ manual per-operation exact resource allocation
```

This is the implemented architecture and must not be removed.

| Step | Backend owner | UI owner | User decision | Persisted state | Audit | Retry | Lifecycle lock |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Select PV/quantity/date/shift | Execution workflow with master-data read model | WO create form | Select PV and plan inputs | Workflow and WO snapshot | Workflow events | Idempotency key | Before creation |
| Evaluate production lines | Execution line selection use case | Display only | None | `wo_header` line fields and `wo_line_selection_audit` | Yes | Replan before lock | Locked after start |
| Hold if no full line feasible | Execution | Display hold | None | `RESOURCE_HOLD` | Yes | Replan after data fix | Not executable |
| Fetch resource candidates | Execution allocation service via master-data readiness/read models | Candidate panel | Choose operation to plan | None until commit | Request trace | Refresh candidates | Only if line READY |
| Commit exact resource | Execution allocation service | Candidate select | Select workstation/equipment candidate | `wo_resource_allocation`, reservations | Allocation audit | Idempotent commit | Before execution |
| Reallocate/cancel | Execution | Action buttons | Reason/confirm | Superseded/cancelled state | Audit | Yes | Policy gated |
| Approve | Execution plus master-data freshness/permission | Approve action | Comment | WO status/log | Approval log | Retry after blockers | Released |
| Start execution | Execution/kiosk gateway later | Start action | Confirm | WO status/execution | Execution events | Retry after blockers | No in-place line transfer |

## 14. Canonical Seed Requirements

Final seed contract:

| Dataset | Required minimum | Relationship |
| --- | ---: | --- |
| Sites | 1 | Released `SITE-KZ3` |
| Shopfloors/Areas | 1 shopfloor, 2 areas | Under site |
| Production Lines | 2 canonical WST lines plus optional base line | Same site |
| Work Centers | 4 per line for WST two-line UAT plus base fixtures | Mapped to lines |
| Workstations | 1 per operation per line | Under work centers |
| Equipment | 1 primary per workstation minimum | Machine definitions |
| Machine Units | 1 identified available unit per required machine | Planning eligible |
| Resource Assignments | 1 active primary per workstation/machine group | Effective on UAT date |
| Resource Capabilities | 1 matching operation/resource capability per mandatory op | Released/effective |
| Calendars | Available for all resources and shifts | UAT date |
| Shifts | `SHIFT-A` | Site-scoped |
| Production Standards | 1 per routing operation/resource context | Effective |
| Employee-scoped Worker Skills | 3 | `scope=Employee` |
| Employees | 4 | Active |
| Employee Skills | 4 | Reference Employee-scoped skills |
| Employee Schedules | 4 | Scheduled on UAT date |
| Operation Skill Requirements | 3 | Reference Employee-scoped skills |
| Items/Revisions | Existing canonical counts sufficient | Released/effective |
| EBOMs | 1 optional baseline | Same item revision |
| MBOMs | 1 canonical WST MBOM plus base | Released |
| Routings/Operations | 1 canonical WST routing with 4 ops plus base | Released |
| Production Versions | 1 WST two-line PV plus base | Released |
| Line Eligibility | Primary and backup for WST PV | Exactly one primary |
| UAT Work Orders | 3 | Primary READY, Backup fallback READY, Both Lines RESOURCE_HOLD |

UAT WOs should be generated by an idempotent UAT preparation script, not permanently inserted by the base seed, unless product explicitly wants persistent demo WOs. The script must create deterministic WOs and leave them available for browser UAT until cleanup is explicitly requested.

## 15. Legacy Page Cleanup Plan

| Current route | Replacement route | Consumer inventory | Redirect | Deprecation notice | E2E migration | Removal version | Rollback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/console/mes/skills` | `/master-data/skills/workers` | Search docs/bookmarks/logs | Immediate | Optional toast/banner | Add redirect E2E | UI+2 or later | Restore alias route |
| `/master-data/equipment*` | `/master-data/machines*` | `RouteHeader`, `ResourceHierarchy`, docs | Redirect after product decision | Banner for 2 releases | Update machine specs | UI+3 or later | Keep alias |
| `/console/mes/equipment` | `/master-data/machines` | Unknown | Redirect | Banner | Update smoke | UI+3 | Restore alias |
| `/master-data/product-recipes` | `/master-data/production-versions` | Legacy docs | Keep existing redirect | None | Smoke redirect | No removal needed | Existing |
| `/console/mes/*` aliases | Canonical routes | Unknown | Redirect | Optional | Route smoke | After access-log gate | Restore aliases |
| Generic Tier2 skills | `SkillManagementScreen` | `/console/mes/skills` | Redirect | None | Regression | Immediate | Restore only if needed |
| Duplicate Resource Planning surfaces | Work Order Detail | Search references | N/A | N/A | Work order E2E | N/A | N/A |
| Duplicate Skill surfaces | Skills tab + Employee modal | Option A | N/A | N/A | Worker/employee skill E2E | N/A | N/A |

## 16. UI Design and Component Standardization

Canonical wrappers:

| Component | Current sources | Required standard |
| --- | --- | --- |
| Data Table | `BaseDataTable`, ui table, ad hoc tables | Use `BaseDataTable` for retained list screens |
| Filters | ad hoc selects/buttons | Shared filter bar with server-backed query state |
| Pagination | `BasePagination` | Use for large master-data lists |
| Modal | `BaseModal`, `Modal`, Radix dialogs | One app modal wrapper with footer/action semantics |
| Confirmation | `Confirmation`, alert dialog | Shared destructive/high-impact confirmation |
| Detail drawer/page | `PageDetailButton`, screen-specific detail | Standard detail header, panels, actions |
| Status badge | `StatusBadge`, ad hoc spans | Shared lifecycle/status/line-selection/readiness badges |
| Readiness matrix | none complete | New backend-driven matrix component |
| Blocker list | ad hoc blocker maps | Shared translated blocker list with links |
| Warning panel | ad hoc panels | Shared warning/error panel |
| Field group | `BaseForm`, ad hoc grids | Shared field group with help/error |
| Tabs | `BaseTabs`, ad hoc buttons | Shared tab pattern |
| Empty/loading/error | `BaseStates`, `ErrorBoundaryCard` | Standard use across pages |
| Dependency panel | ad hoc skill dependencies | Shared dependency count/details |
| Audit timeline | approval log only | Shared timeline component |

Do not redesign the visual identity. Preserve dense operational enterprise MES style.

## 17. API and TypeScript Contract Changes

| Change ID | Service | API/type | Current behavior | Required behavior | Compatibility impact |
| --- | --- | --- | --- | --- | --- |
| API-001 | MES Execution | `GET /work-orders` | List lacks confirmed line filters/columns | Return selected line, line status, fallback, hold summary; support filters | Additive |
| API-002 | MES Execution | `GET /work-orders/:id` | Returns `evaluated_line_results` | Ensure structured readiness dimensions for matrix | Additive |
| API-003 | MES Master Data | Production Version detail | Line eligibility not prominent in UI | Return line eligibility with names, priority, primary, effectivity, readiness preview or separate endpoint | Additive |
| API-004 | MES Master Data | Worker skills | Employee-scope contract exists | Seed/API data must align with Employee scope | Seed/data migration impact |
| API-005 | MES Master Data | Employee skills | Validates Employee scope | Add certificate/expiry fields to UI only if response supports them | Additive if fields missing |
| API-006 | MES Master Data | Resource calendars/capabilities | Generic forms allow broad payload | Provide option metadata by resource type | Additive |
| API-007 | MES Console | TypeScript work order types | Ad hoc `any` | Define `WorkOrderHeader`, `LineEvaluationResult`, `ResourceCandidate`, `EmployeeSkill` | Frontend-only |
| API-008 | MES Console | Query keys/invalidation | Mixed direct fetch and query client | Use TanStack Query for server state and mutation invalidation | Frontend-only |
| API-009 | MES Console | Error translations | Some backend codes translated | Complete blocker/error translation map in VI/EN/JA/KO | Frontend-only |
| API-010 | MES Execution/Master Data | Permission metadata | UI cannot consistently hide actions | Optionally expose capability hints per screen/action | Additive; backend remains authoritative |

## 18. i18n Contract

Required VI, EN, JA, KO key families:

| Area | Key families |
| --- | --- |
| Pages/nav | work orders, product definition, resource foundation, planning constraints, labor, skills, diagnostics |
| Columns | all final table columns in Section 5 |
| Form fields | all CRUD fields in Section 6 |
| Status/lifecycle | Draft, Released, ResourceHold, InProgress, Completed, Closed, Inactive, Obsolete |
| Line roles | Primary, Backup, Selected, Fallback, Hold |
| Line selection | AUTO, READY, RESOURCE_HOLD, NOT_EVALUATED, line lock, line replan |
| Fallback/hold | `PRIMARY_LINE_BLOCKED`, `NO_COMPLETE_FEASIBLE_LINE`, `WO_LINE_RESOURCE_HOLD`, resource blockers |
| Readiness | Ready, Eligible, ReadyWithWarnings, Blocked, Missing, Conflict, Unknown |
| Worker skills | scope labels, assignment count, qualification, level, expiry, dependency |
| Validation | scope invalid, hierarchy invalid, stale candidate, capacity conflict, permission forbidden |
| Authorization | unauthorized, forbidden, disabled by role, cross-site blocked |
| Legacy redirects | redirect notice and deprecation copy if shown |

Required cleanup: remove raw enum rendering, avoid backend messages shown directly when a translation exists, deduplicate terminology for Machine/Equipment and Worker/Employee Skill.

## 19. Testing and Verification Plan

Static checks:

- `npm --prefix services/mes-console run typecheck`
- `npm --prefix services/mes-console run build`
- Root TypeScript/backend builds affected by API changes.

API integration:

- `npm run test:mes:resource-planning-domain:phase1`
- `npm run test:mes:resource-planning-full-flow:phase2`
- `npm run test:mes:two-line-resource-planning:phase7`
- `npm run test:mes:two-line-full-regression:phase9`
- `npm run verify:mes:canonical-seed`
- New Worker Skill API flow.
- New Employee Skill assignment flow.
- New UAT preparation script verification.

Browser E2E:

- Every retained page smoke.
- Every CRUD form create/edit/hydration.
- Table columns and filters.
- Dependent field reset.
- Lifecycle/release/deactivate/delete.
- Permission negative tests.
- Worker Skills and Employee Skills.
- Production Line and Line Eligibility.
- Primary Line READY WO.
- Backup Line fallback READY WO.
- RESOURCE_HOLD WO.
- Mixed-line rejection visible.
- Replan allowed/blocked.
- Approval and execution start.
- Refresh persistence.
- Legacy redirects.

Visual evidence: screenshots and Playwright traces for worker skill assignment, PV line eligibility, WO list, primary READY detail, backup READY detail, RESOURCE_HOLD detail, replan, allocation, approval, start.

Cleanup: exact cleanup verification for generated UAT WOs and fixtures; no mandatory test may be skipped.

## 20. Implementation Phase Plan

| Phase | Objective | Scope | Files | Migrations | Seed changes | API changes | Frontend changes | Tests | Completion gate | Rollback | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI-0 | Freeze and approve blueprint | This document | `AI_document/MES_CONSOLE_FULL_REMEDIATION_BLUEPRINT.md` | No | No | No | No | Review only | Product accepts decisions | Revise doc | None |
| UI-1 | Fix canonical seed and Worker Skill domain consistency | Employee-scope worker skills | Seed scripts, master-data validation tests | Maybe data migration if persistent env | Yes | Possibly none | Employee/skill UI after seed | Seed verify, worker skill API | Employee scoped seed passes | Restore prior seed artifact | UI-0 |
| UI-2 | Route/navigation/legacy redirect cleanup | Console routes/sidebar/header | `App.tsx`, `Sidebar.tsx`, `RouteHeader.tsx` | No | No | No | Redirects and nav | Route smoke | All redirects pass | Restore aliases | UI-0 |
| UI-3 | Shared table/form/detail standardization | Base wrappers | components/base, route screens | No | No | No | Standard lists/forms | typecheck/build/smoke | No regressions | Component fallback | UI-2 |
| UI-4 | Product definition and PV UI alignment | PV line eligibility | Production version, routing, MBOM screens | No | Maybe UAT PV | API-003 | Eligibility tab/summary | PV E2E | PV UAT passes | Hide new tab | UI-1 |
| UI-5 | Resource foundation UI alignment | Lines, work centers, workstations, machines | ResourceFoundation, WorkCenters | No | Maybe line fixtures | readiness preview if needed | Readiness panels | machine/resource E2E | Readiness visible | Toggle panels off | UI-3 |
| UI-6 | Worker Skill and Employee Skill UX | Option A implementation | SkillManagement, Employees | No | Uses UI-1 | Maybe employee fields | Employee-centric assignment | worker/employee E2E | Scope consistency proven | Revert UI only | UI-1 |
| UI-7 | WO list and two-line detail diagnostics | Work order list/detail | WOList, WODetail | No | UAT WOs script | API-001/002 | Line columns/matrix | three WO E2E | Primary/backup/hold proven | Hide new matrix | UI-4/5/6 |
| UI-8 | Resource Planning and lifecycle action alignment | Allocation/replan/approval/start | WODetail | No | UAT WOs | permission hints optional | Action states | API+browser | All lifecycle paths pass | Restore previous action layout | UI-7 |
| UI-9 | Permission, i18n, loading, error, accessibility | Global polish | i18n, components, screens | No | No | Optional permission metadata | Badges/errors/a11y | visual/regression | No raw enums/UUID primary | Revert per screen | UI-2..8 |
| UI-10 | Full regression, UAT fixtures, final report | All | docs/tests/artifacts | No | Final seed/UAT | No new | No broad changes | full suite | zero skipped mandatory tests | Restore fixtures | UI-1..9 |

## 21. Prioritized Remediation Backlog

| Priority | Issue ID | Area | Current defect | Root cause | Required change | Files/services | Seed | API | E2E |
| ---: | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |
| P0 Critical | CRIT-001 | Worker Skill seed | Worker skills scoped WorkCenter | Seed/domain mismatch | Recreate as Employee scope and relink | seed scripts, master-data DB | Yes | Maybe | Yes |
| P0 Critical | CRIT-002 | UAT WOs | Target WO only proves ResourceHold | No deterministic READY UAT WOs | Add UAT prep script with 3 WOs | scripts, execution | Yes | No | Yes |
| P1 High | HIGH-001 | Employee Skill mapping | Employee UI loads Employee scope but seed has none | Scope mismatch | Employee-scoped definitions | EmployeesScreen + seed | Yes | No | Yes |
| P1 High | HIGH-002 | Operation Skill Requirement | Must use Employee-scoped skills | Scope mismatch | Relink requirements | seed + PlanningConstraints | Yes | No | Yes |
| P1 High | HIGH-003 | WO detail | Evaluated line matrix shallow | UI not diagnostic enough | Expand backend-driven matrix | WODetail + API | No | Yes | Yes |
| P1 High | HIGH-004 | WO list | Missing line columns/filters | Backend fields not exposed in UI | Add columns and server filters | WOList + execution API | No | Yes | Yes |
| P1 High | HIGH-005 | PV eligibility | Summary not visible | UI discoverability gap | Add eligibility tab/list summary | PV screens | Maybe | Maybe | Yes |
| P1 High | HIGH-006 | Worker Skill UX | Assignment ownership ambiguous | Two possible mutation paths | Choose Option A now | SkillManagement/Employees | No | No | Yes |
| P1 High | HIGH-007 | Legacy skills route | `/console/mes/skills` uses generic Tier2 | Obsolete alias | Redirect | App routes | No | No | Yes |
| P1 High | HIGH-008 | Equipment/Machines | Duplicate naming/routes | Historical terminology | Canonicalize Machines | routes/header/docs | No | No | Yes |
| P1 High | HIGH-009 | Production Area nav | Valid route hidden | Sidebar omission | Add or intentionally hide | Sidebar | No | No | Smoke |
| P1 High | HIGH-010 | Permissions | UI not consistently role-aware | Header-only role forwarding | Add action visibility and negative tests | UI/backend tests | No | Maybe | Yes |
| P1 High | HIGH-011 | i18n/errors | Raw codes possible | Incomplete map | Complete translations | i18n/error map | No | No | Yes |
| P1 High | HIGH-012 | API typings | Heavy `any` usage | Missing contracts | Add TS types/hooks | mes-console lib/routes | No | No | typecheck |
| P2 Medium | MED-001 | Resource foundation | Readiness scattered | Generic screen | Add detail panels/links | Resource screens | No | Maybe | Yes |
| P2 Medium | MED-002 | Planning forms | Generic resource type options | Broad form | Constrained selectors | PlanningConstraints | No | Maybe | Yes |
| P2 Medium | MED-003 | Print station | Third party skipped | Scope decision | Keep out of phase gate unless in scope | PrintStations | No | Maybe | Smoke |

## 22. Product Decisions Still Required

| Decision ID | Question | Options | Technical impact | Recommended option | Blocking? |
| --- | --- | --- | --- | --- | ---: |
| DEC-001 | Which screen owns Employee Skill assignment? | Employee modal only; both Employee and Worker Skill detail; dedicated assignment screen | Impacts mutation paths and tests | Employee modal only for now | Yes |
| DEC-002 | Should Worker Skill detail allow assignment mutations? | No/read-only; yes; link to future screen | Impacts UX/API use | No for now | Yes |
| DEC-003 | Should UAT Work Orders be permanently seeded? | Permanent seed; idempotent prep script | Impacts reset cleanliness | Idempotent prep script | Yes |
| DEC-004 | Should `/equipment` or `/machines` be canonical? | Machines; Equipment; dual labels | Route/header/docs impact | Machines | Yes |
| DEC-005 | How long should legacy aliases remain? | 1 release; 2 releases; indefinite redirects | Cleanup and bookmarks | 1 release generally, 2 for equipment | Yes |
| DEC-006 | Where should line readiness be visible? | PV list only; PV detail tab; both | API and UI scope | Both summary list and detail tab | No if accepted as default |
| DEC-007 | Should exact resources remain manually committed? | Manual; automatic; hybrid | Major domain behavior | Manual per-operation allocation remains | Yes |
| DEC-008 | Should i18n review stay in sidebar? | Hide; admin-only; keep visible | Navigation clarity | Hide or admin-only | No |

## 23. Implementation Readiness Gate

| Checklist | Status |
| --- | --- |
| All routes inventoried | Complete in Section 2 and route artifact |
| All route consumers identified | Partial; external bookmarks/access logs still required |
| All screens documented | Complete by screen family with route mapping |
| All table columns defined | Complete final contract by screen family |
| All CRUD fields defined | Complete final contract by screen family |
| All backend capabilities mapped | Complete for MES Console remediation scope |
| All role permissions mapped | Partial; exact product role model needs confirmation |
| Worker Skill ownership resolved | Recommended Option A, requires product acceptance |
| Seed correction specified | Complete |
| Two-line Work Order contract specified | Complete |
| Legacy page replacement paths specified | Complete |
| API changes identified | Complete |
| E2E coverage defined | Complete |
| Product decisions resolved or explicitly accepted | Not yet |

Final status: `NOT_READY_SEED_OR_DOMAIN_CONFLICT`

Implementation must not begin as broad remediation until either:

1. The final status becomes `READY_FOR_IMPLEMENTATION` after seed/domain correction and decision acceptance; or
2. The user explicitly accepts every blocking product decision and authorizes starting with UI-1.

