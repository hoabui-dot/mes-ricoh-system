# Phase UI-00 Product Decisions

Date: 2026-08-02

Run ID: `2026-08-02T14-22-00Z`

Status: approved for planning, but Phase UI-00 is blocked by baseline regressions.

| Decision | Final value | Evidence | Impact |
| --- | --- | --- | --- |
| DEC-001 Employee Skill assignment ownership | `EMPLOYEE_MODAL_ONLY` | `EmployeesScreen.tsx` reads `GET /employees/:id/skills` and writes `PUT /employees/:id/skills`; `SkillManagementScreen.tsx` shows worker assignments read-only. | UI-07 must keep Employee Create/Edit as only mutation authority. |
| DEC-002 Worker Skill Detail mutation | `READ_ONLY_WITH_EMPLOYEE_LINK` | Backend has `/worker-skills/:id/assignments` mutation endpoints, but current UI does not expose them; master rules forbid duplicate mutation ownership. | Worker Skill detail should show assignments/dependencies and link to employee edit. |
| DEC-003 UAT Work Order fixture strategy | `IDEMPOTENT_PREPARE_VERIFY_CLEANUP` | Canonical seed verification expects execution WOs to be absent after seed; permanent UAT WOs would violate this. | UI-02 must create scripts that prepare, verify, and clean three UAT WOs through supported APIs. |
| DEC-004 Canonical Equipment terminology and route | `MACHINES_CANONICAL` | Sidebar uses `/master-data/machines`; blueprint identifies `/master-data/equipment*` as duplicate. | UI-03 redirects Equipment aliases to Machines for two releases. |
| DEC-005 Legacy alias lifetime | `GENERAL_ALIAS_REDIRECT_PERIOD=1_RELEASE`, `EQUIPMENT_ALIAS_REDIRECT_PERIOD=2_RELEASES` | Master rules require deprecate -> redirect -> verify -> remove. | UI-03 must add redirects and E2E before physical removal. |
| DEC-006 Production Version line readiness visibility | `LIST_SUMMARY_PLUS_DETAIL_TAB` | PV is WO authority; line eligibility exists in master-data APIs; frontend must not compute readiness. | UI-05 adds list summary and detail tab, with backend-provided readiness. |
| DEC-007 Exact Resource Allocation behavior | `AUTO_LINE_MANUAL_EXACT_RESOURCES` | Execution line selection selects one line; resource candidate and allocation APIs still require manual per-operation commit. | UI-08/UI-09 must not remove manual Resource Planning. |
| DEC-008 i18n Review visibility | `DIAGNOSTIC_ADMIN_ONLY` | Sidebar currently exposes `/console/mes/i18n-review`; blueprint classifies it diagnostic. | UI-03 hides from normal navigation; UI-10 handles admin/diagnostic visibility. |

No product decision remains unresolved for UI-01. Baseline regressions still block Phase UI-00 pass status.

