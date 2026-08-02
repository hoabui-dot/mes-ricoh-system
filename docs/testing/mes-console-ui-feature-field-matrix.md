# MES Console UI Feature and Field Matrix

Date: 2026-08-02

## Route Matrix

| Route family | Main routes | UI status | Notes |
| --- | --- | --- | --- |
| Work orders | `/work-orders`, `/work-orders/new`, `/work-orders/:id` | Current | Creation, list, detail, approve/reject, resource planning, line replan, start execution. |
| Product definition | Items, UOMs, material groups, EBOMs, MBOMs, routings, operations, production versions | Current | Broad coverage exists; line eligibility should be more visible on production version screens. |
| Resource foundation | Factories, shopfloors, production areas, production lines, work centers, workstations, equipment/machines, assignments | Current | Resource readiness is spread across multiple screens. |
| Planning constraints | Resource capabilities, calendars, production standards, operation skill requirements | Current | Generic screens rely on backend validation. |
| Labor | Employees, shifts, work calendar | Current | Employee modal includes skill assignment controls. |
| Skills | `/master-data/skills`, `/master-data/skills/:scope` | Partial | Worker tab exists; assignment mutation is split from worker detail. |
| Print station | `/master-data/print-stations` | Partial | Third-party physical print flow skipped. |
| Legacy aliases | `/console/mes/*` | Legacy alias | Most aliases are acceptable compatibility routes; `/console/mes/skills` should be redirected. |

## Work Order Tables and Fields

| Screen | Table columns or visible fields | Gaps |
| --- | --- | --- |
| Work order list | WO, Item, Quantity, Target Date, Status, Actions | Missing selected line, line-selection status, hold/fallback badges. |
| Work order create | Expected code preview, production version selector, selected configuration summary, quantity, target date, shift, auto line mode | No gap for manual line selection; automatic line selection is intended. |
| Work order detail header | WO metadata, status actions, selected production line, line selection mode, status, fallback reason, resource hold warning | Missing complete evaluated-line comparison table. |
| Work order operations | Operation sequence, work center, production line, allocation state, candidate action | Good core coverage. |
| Resource candidates | Candidate readiness, machine group/equipment/workstation, selected line, machine unit, assignment, capability, calendar, capacity, blockers, warnings | Good core coverage; should connect blockers back to master-data links. |

## CRUD Form Field Matrix

| Feature | Create/edit fields observed | UI status |
| --- | --- | --- |
| Employee | Code, full name, site, default work center, status, hired date, selected skills and level | Partial because skill option source depends on `scope=Employee`. |
| Worker skill | Localized name, description, minimum level, lifecycle edit/deactivate | Partial because assignment mutation is read-only in worker detail. |
| Production version | Product/routing/MBOM/version setup and line eligibility data through production version flow | Partial visibility for two-line UAT. |
| Resource assignment | Resource and effectivity assignment fields | Current |
| Resource capability | Work center, operation, eligibility/status/effectivity fields | Current |
| Resource calendar | Resource type/id, shift/date/effectivity, availability/capacity fields | Current, but resource type should be constrained. |
| Production standard | Routing operation or planning context, standard time/capacity related fields | Current |
| Operation skill requirement | Operation/routing operation, worker skill, level, active/effectivity fields | Current |

## Navigation Gaps

| Route | Issue |
| --- | --- |
| `/master-data/production-areas` | Valid route but not a first-class sidebar entry. |
| `/master-data/equipment` | Valid route overlaps with `/master-data/machines`; naming should be consolidated. |
| `/console/mes/skills` | Uses a legacy generic admin screen rather than the current skill management screen. |

