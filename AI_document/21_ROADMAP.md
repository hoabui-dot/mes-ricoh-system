# Roadmap

## Completed / Implemented

Implemented according to current docs/source evidence:

- MES master data service.
- MES traceability service.
- MES execution Stage A and Stage B endpoints.
- MES kiosk gateway and kiosk/operator UI.
- MES Console master data and Work Order workflows.
- Labor Resource Management: employees, shifts, work calendar, Work Center headcount.
- WMS phase through warehouse master data, stock ledger, inbound/outbound, WMS Console.
- QMS phase through inspection plans/results, NCR, disposition, CAPA, QMS Console.
- Portal SSO app entry.
- Resource Planning current manual planner scope.
- Print Station Kafka-based runtime integration in current architecture.

## In Progress / Partially Implemented

- Resource Planning browser verification breadth.
- MES/WMS automatic material lifecycle.
- Full MES Kong bearer enforcement parity with WMS/QMS.
- Event schema coverage for every topic.
- Full authorization matrix and negative browser tests.
- Print Station physical verification in runtime-dependent environments.

## Planned / Future Work

- Phase 4 cross-cluster integration, load testing, security, contract, and observability hardening.
- Complete stale-state, maintenance, cancellation/replan, execution start guard, and role matrix E2E cases.
- Final WMS material request parent/line model.
- DLQ/replay operational policy if absent.
- ERP/HR/PLM integration if required by product.
- Rework workflow definition and implementation.

## Deprecated / Compatibility

- Legacy Workstation Supported Operations/capability as routing authority.
- Direct print adapter HTTP production path.
- `stage-materials` as primary material lifecycle action.
- Demo print-on-approval as production behavior.

## Future Architecture Direction

Keep bounded contexts strict, expand contract/event/schema coverage, improve gateway security consistency, and make browser E2E cover the real operator/planner risk matrix before declaring flows complete.
