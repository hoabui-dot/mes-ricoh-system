# Kafka Communication

## Naming Convention

Topic names generally follow:

```text
<Domain>.<BoundedContext>.<EventName>.v<version>
```

Examples: `MES.Execution.WOCreated.v1`, `MES.MasterData.RoutingReleased.v1`, `QMS.Inspection.InspectionFailed.v1`.

## Topics

| Topic | Producer | Consumers | Payload summary |
|---|---|---|---|
| `MES.MasterData.ItemRevisionReleased.v2` | MES Master Data | MES Execution, Traceability, QMS Inspection | item revision identity, localized name, item type, site |
| `MES.MasterData.MBOMReleased.v2` | MES Master Data | MES Execution, Traceability | MBOM header/line context |
| `MES.MasterData.RoutingReleased.v1` | MES Master Data | MES Execution, QMS Inspection | routing header and operations |
| `MES.MasterData.ProductionVersionReleased.v1` | MES Master Data | MES Execution | production configuration |
| `MES.MasterData.ProductionStandardReleased.v1` | MES Master Data | MES Execution | standard timing/capacity |
| `MES.MasterData.WorkCenterActivated.v2` | MES Master Data | MES Execution | Work Center identity/context |
| `MES.MasterData.EquipmentActivated.v2` | MES Master Data | MES Execution | equipment identity/context |
| `MES.MasterData.ResourceAssignmentCreated.v1` | MES Master Data | Not fully enumerated | assignment/effectivity |
| `MES.MasterData.ResourceAssignmentEnded.v1` | MES Master Data | Not fully enumerated | assignment end |
| `MES.Execution.WOCreated.v1` | MES Execution | Kiosk Gateway, downstream projections | WO identity, item, quantity, site, status |
| `MES.Execution.WOApproved.v1` | MES Execution | Kiosk Gateway, downstream projections | approved WO and material requirements |
| `MES.Execution.OperationStarted.v1` | MES Execution | Kiosk Gateway, print/station projections | operation session start |
| `MES.Execution.OperationFinished.v1` | MES Execution | Kiosk Gateway, QMS Inspection | operation completion |
| `MES.Execution.MaterialConsumed.v1` | MES Execution | WMS Inventory | component consumption |
| `MES.Execution.MaterialStagingRequested.v1` | MES Execution | WMS Outbound | material staging demand |
| `MES.Execution.WOResourceAllocated.v1` | MES Execution | Not fully enumerated | committed resource allocation |
| `MES.Execution.WOResourceReallocated.v1` | MES Execution | Not fully enumerated | replacement allocation |
| `WMS.Outbound.MaterialStaged.v1` | WMS Outbound | MES Execution | material staged result |
| `WMS.Outbound.MaterialShortageDeclared.v1` | WMS Outbound | MES Execution | shortage result |
| `MES.Traceability.LabelIssued.v1` | Traceability | Not fully enumerated | label identity |
| `MES.Traceability.QRSplitPerformed.v1` | Traceability | Not fully enumerated | parent-child split |
| `MES.Traceability.GenealogyRecorded.v1` | Traceability | Not fully enumerated | genealogy edge |
| `QMS.Inspection.InspectionPlanReleased.v1` | QMS Inspection | Not fully enumerated | released plan |
| `QMS.Inspection.InspectionResultRecorded.v1` | QMS Inspection | Not fully enumerated | recorded result |
| `QMS.Inspection.InspectionFailed.v1` | QMS Inspection | QMS Nonconformance | failure needing NCR |
| `QMS.Nonconformance.NCRRaised.v1` | QMS Nonconformance | Not fully enumerated | NCR raised |
| `QMS.Nonconformance.NCRDispositioned.v1` | QMS Nonconformance | Not fully enumerated | NCR disposition |
| `QMS.Nonconformance.CAPAClosed.v1` | QMS Nonconformance | Not fully enumerated | CAPA closure |
| `station.events.printer` | Remote Printer Adapter | MES Execution printer result consumer, projection service | print results/status/heartbeats |

## Source Coverage

- MES master-data published events are declared in `services/mes-master-data-service/service.manifest.yaml` and written in `services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`.
- MES execution topics are declared in `services/mes-execution-service/service.manifest.yaml`; runtime routes and consumers live under `services/mes-execution-service/internal/infrastructure`.
- Traceability topics are declared in `services/mes-traceability-service/service.manifest.yaml`.
- QMS topics are declared in `services/qms-inspection-service/service.manifest.yaml` and `services/qms-nonconformance-service/service.manifest.yaml`.
- JSON schemas exist for selected MES topics under `infra/schemas`.

## Payloads

Schemas exist in `infra/schemas` for selected MES master-data and execution events. Other payloads are described in service manifests or code and should be schema-registered before being treated as stable contracts.

## Retry Policy

Known retry surfaces:

- outbox relay republishes pending rows.
- consumers tolerate redelivery through idempotency.
- WMS staging is retryable/manual.
- printer result consumer ignores duplicate event IDs.

Unknown: a repository-wide DLQ policy is not proven.

## Ordering

Ordering must be considered per topic/key, not globally. Consumers must not rely on unrelated topic ordering.

## Correlation IDs

HTTP requests use `X-Trace-ID`; Kafka envelopes include trace/correlation identity where supported. API clients should preserve request/correlation IDs in errors.

## Message Lifecycle

```text
business transaction -> outbox row -> relay -> Kafka topic -> consumer -> local projection/state -> offset commit
```
