# C4 Architecture

## Context Diagram

```mermaid
C4Context
  title S-Factory MOM Platform - Context
  Person(planner, "Planner / Manager", "Creates master data, Production Versions, Work Orders, allocations")
  Person(operator, "Shopfloor Operator", "Executes operations through kiosk")
  Person(quality, "Quality User", "Records inspections, NCR, CAPA")
  System_Boundary(mom, "S-Factory MOM Platform") {
    System(portal, "Portal", "SSO app entry")
    System(mes, "MES", "Manufacturing execution")
    System(wms, "WMS", "Warehouse and inventory")
    System(qms, "QMS", "Quality management")
    System(print, "Print Station", "Label printing and runtime status")
  }
  System_Ext(keycloak, "Keycloak", "Identity provider")
  System_Ext(printer, "Physical Printer", "Label output")
  Rel(planner, portal, "Uses")
  Rel(operator, mes, "Uses kiosk")
  Rel(quality, qms, "Uses")
  Rel(portal, keycloak, "Authenticates")
  Rel(mes, wms, "Material demand/status")
  Rel(mes, qms, "Inspection events")
  Rel(mes, print, "Print commands/results")
  Rel(print, printer, "Prints labels")
```

## Container Diagram

```mermaid
flowchart TB
  subgraph Browser
    Portal[Portal]
    MESUI[MES Console]
    KioskUI[Kiosk Operator UI]
    QMSUI[QMS Console]
    WMSUI[WMS Console]
  end
  subgraph Platform
    Kong[Kong]
    Keycloak[Keycloak]
    Kafka[Kafka + Schema Registry]
    Obs[OTel + Prometheus + Loki + Tempo + Grafana]
  end
  subgraph MES
    MDM[MES Master Data Service]
    EXE[MES Execution Service]
    TRC[MES Traceability Service]
    KGW[MES Kiosk Gateway]
    MDMDB[(mes_master_data_db)]
    EXEDB[(mes_execution_db)]
    TRCDB[(mes_traceability_db)]
    KGWDB[(mes_kiosk_gateway_db)]
  end
  subgraph QMS
    QI[QMS Inspection Service]
    QN[QMS Nonconformance Service]
    QIDB[(qms_inspection_db)]
    QNDB[(qms_nonconformance_db)]
  end
  subgraph PrintStation
    Projection[Projection Service]
    StationKiosk[Station Kiosk UI]
    Adapter[Remote Printer Adapter]
    Redis[(Station Redis)]
  end
  Browser --> Kong
  Browser --> Keycloak
  Kong --> MDM
  Kong --> EXE
  Kong --> TRC
  Kong --> KGW
  Kong --> QI
  Kong --> QN
  MDM --> MDMDB
  EXE --> EXEDB
  TRC --> TRCDB
  KGW --> KGWDB
  QI --> QIDB
  QN --> QNDB
  MDM <--> Kafka
  EXE <--> Kafka
  TRC <--> Kafka
  QI <--> Kafka
  QN <--> Kafka
  Projection <--> Kafka
  Adapter <--> Kafka
  Projection --> Redis
```

## Component Diagram - MES Execution

```mermaid
flowchart LR
  Router[HTTP router.go] --> UC[Application use cases]
  UC --> Domain[Domain models/rules]
  UC --> PG[(mes_execution_db)]
  UC --> MDMClient[Master Data readiness client]
  UC --> TRCClient[Traceability client]
  PG --> Outbox[Transactional outbox]
  Outbox --> Relay[Outbox relay worker]
  Relay --> Kafka[(Kafka)]
  Kafka --> Consumers[Master data, WMS, printer result consumers]
  Consumers --> PG
```

## Deployment Diagram

```mermaid
flowchart TB
  DevHost[Docker host] --> Compose[Docker Compose]
  Compose --> Platform[platform stack]
  Compose --> MES[mes stack]
  Compose --> QMS[qms stack]
  Compose --> Print[print-station stack]
  RemoteMac[Remote Mac / printer server] --> Adapter[Printer Adapter Compose]
  Platform --> Kafka[Kafka]
  Platform --> Keycloak[Keycloak]
  Platform --> Kong[Kong]
  Print --> Adapter
  Adapter --> Printer[Physical printer]
```

Status: diagrams are based on current docs, manifests, and Compose files. Runtime production network details require environment confirmation.
