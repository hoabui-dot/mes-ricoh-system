# MES Console Worker Skill Gap Report

Date: 2026-08-02

## Current Implementation

Worker skill management is implemented as a tab in `/master-data/skills/workers`. Employee skill assignment is also implemented in the `/employees` create/edit modal.

| Area | Current behavior |
| --- | --- |
| Worker skill definitions | List, create, edit, deactivate through `/worker-skills`. |
| Worker skill dependency check | Reads `/worker-skills/:id/dependencies`. |
| Worker skill assignment visibility | Worker skill detail modal lists assignments from `/worker-skills/:id/assignments`. |
| Worker skill assignment mutation | Backend supports it, but worker skill detail UI does not expose assign/end actions. |
| Employee skill assignment | Employee modal reads `employees/:id/skills` and writes `PUT /employees/:id/skills`. |

## Critical Seed Scope Gap

Current database values:

| Skill | Scope |
| --- | --- |
| `SK-WC-INSPECTION` | `WorkCenter` |
| `SK-WC-MIX-MASTER` | `WorkCenter` |
| `SK-WC-VULCAN-OPERATOR` | `WorkCenter` |

But these APIs require Employee-scoped skills:

| API | Scope rule |
| --- | --- |
| `GET /worker-skills` | Returns `md_skill.scope='Employee'`. |
| `POST /worker-skills` | Creates `scope='Employee'`. |
| `PUT /employees/:id/skills` | Validates every skill as `scope='Employee'`. |
| `POST /worker-skills/:id/assignments` | Validates the skill as `scope='Employee'`. |
| Operation skill requirement create/update | Validates worker skill IDs as `scope='Employee'`. |

The current seed has employee skill assignment rows using `WorkCenter`-scoped skills. That is not aligned with the API contract and can make the UI appear empty or fail when saving employee skills.

## Required Fix Backlog

1. Create Employee-scoped worker skills for `SK-WC-MIX-MASTER`, `SK-WC-VULCAN-OPERATOR`, and `SK-WC-INSPECTION`, or rename codes to remove WorkCenter-only semantics.
2. Relink `md_employee_skill` rows to Employee-scoped skill IDs.
3. Relink `md_operation_skill_requirement` rows to Employee-scoped skill IDs.
4. Ensure `/master-data/skills/workers` lists the canonical seed skills.
5. Ensure `/employees` modal lists the same canonical worker skills and can save assignments.
6. Either add assign/end actions to the worker skill detail modal or document Employee modal as the only assignment owner.

