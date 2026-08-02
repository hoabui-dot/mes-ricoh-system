# MES Console UI Backend Traceability Matrix

Date: 2026-08-02

## Work Order Execution

| UI action | API or backend field | UI file | Status |
| --- | --- | --- | --- |
| Create work order | `POST /api/mes/execution/work-order-creation-workflows` | `WOCreateScreen.tsx` | Current |
| Preview work order code | `GET /api/mes/execution/work-order-code-preview` | `WOCreateScreen.tsx` | Current |
| Watch creation workflow | `GET /api/mes/execution/ws/work-order-creation` | `WOCreateScreen.tsx` | Current |
| List work orders | `GET /api/mes/execution/work-orders?limit=50` | `WOListScreen.tsx` | Current |
| Work order detail | `GET /api/mes/execution/work-orders/:id` | `WODetailScreen.tsx` | Current |
| Approve/reject | `POST /work-orders/:id/approve`, `POST /work-orders/:id/reject` | `WODetailScreen.tsx` | Current |
| Stage materials | `POST /work-orders/:id/stage-materials` | `WODetailScreen.tsx` | Current |
| Compute check | `POST /work-orders/:id/compute-check` | `WODetailScreen.tsx` | Current |
| Fetch candidates | `GET /work-orders/:id/operations/:opId/resource-candidates` | `WODetailScreen.tsx` | Current |
| Commit/reallocate/cancel allocation | `POST /resource-allocation`, `POST /reallocate`, `DELETE /resource-allocation` | `WODetailScreen.tsx` | Current |
| Revalidate allocations | `POST /work-orders/:id/resource-allocations/revalidate` | `WODetailScreen.tsx` | Current |
| Start execution | `POST /work-orders/:id/start-execution` | `WODetailScreen.tsx` | Current |
| Line replan | `POST /work-orders/:id/line-replan` | `WODetailScreen.tsx` | Current |

## Line Selection Fields

| Backend field | UI exposure | Status |
| --- | --- | --- |
| `selected_production_line_id` | Used by detail and candidate planning context | Current |
| `selected_production_line_code` | Displayed on line selection panel, operations, candidates | Current |
| `selected_production_line_name_i18n` | Displayed in selected line panel | Current |
| `line_selection_mode` | Displayed on detail panel; create screen implies AUTO | Current |
| `line_selection_status` | Displayed as detail status badge and resource hold warning | Current |
| `line_selection_reason` | Not fully rendered as a detailed reason trail | Partial |
| `fallback_reason` | Displayed on detail panel | Current |
| `resource_hold_reason` | Displayed in resource hold warning | Current |
| `evaluated_line_results` | Rendered as simplified role/status/blocker cards; full diagnostic comparison is incomplete | Partial |

## Master Data and Labor

| UI action | API | Status |
| --- | --- | --- |
| Generic master-data list | `GET /api/mes/master-data/:resource` | Current |
| Generic create/update/delete/release | `POST`, `PUT`, `DELETE`, `POST /release` | Current |
| Worker skill list/create/update/delete | `/worker-skills` endpoints | Current |
| Worker skill dependencies | `/worker-skills/:id/dependencies` | Current |
| Worker skill assignment list | `/worker-skills/:id/assignments` | Current |
| Worker skill assign/end | `/worker-skills/:id/assignments`, `/worker-skills/:id/assignments/:employeeId/end` | Backend current, UI gap |
| Employee skill read/write | `/employees/:id/skills` | UI current, seed scope gap |
| Employee schedules | `/employee-schedules`, `/employee-schedules/bulk` | Current |
| Operation worker skill requirements | `/operation-skill-requirements` | Current |
| Resource readiness | `/resource-planning/readiness` | Used through execution candidate flow and planning validation | Current |
