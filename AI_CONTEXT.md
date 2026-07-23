# AI_CONTEXT.md - Canonical Full Context for AI Agents

Last updated: 2026-07-23
Repository: `/home/neurosus/mes-system`
Project: Won Seal Tech MOM Platform - MES / WMS / QMS
Audience: AI agents, engineers, architects, and maintainers continuing this codebase.

This is the first file to read before making changes in this repository. It consolidates:

- Product demand and domain catalogs from `product-doc/`.
- Current workload, roadmap, and process prompts from `process/`.
- Strategy and tech-stack decisions.
- Current implementation reports from `implementation/` and `implementation-fix/`.
- Runtime topology, services, ports, event contracts, and engineering rules.

This document is intentionally long. It is designed to let a new AI agent understand the system without
needing to rediscover the whole repository from scratch.

## 0. Source Of Truth Rules

Do not treat any single prompt as current truth by itself.

Use this precedence order:

1. Running source code, service manifests, Docker Compose files, migrations, and tests.
2. Implementation records in `implementation/` and `implementation-fix/`.
3. Current progress tracker: `process/PROJECT_WORKLOAD_PROGRESS.md`.
4. This `AI_CONTEXT.md`.
5. Product catalogs in `product-doc/`.
6. Historical process prompts in `process/` and `process-fix/`.

Prompt files describe intended work at a point in time. Implementation records and source code describe
what actually exists. Some product/process docs are deliberately historical and may still mention
obsolete scaffolding such as the old Hello World validator. The Hello World service has been
decommissioned and removed from active code/runtime.

## 1. Current Executive Summary

Won Seal Tech manufactures technical rubber products and rubber-metal automotive components. The MOM
platform is being built as three independent but integrated clusters:

- MES: Manufacturing execution, master data, traceability, work orders, kiosk, and planning console.
- WMS: Warehouse master data, inventory ledger, inbound receipt, outbound staging, and the implemented WMS console.
- QMS: Inspection plans/results and NCR/CAPA case management are implemented, with the QMS Console deployed on port 13130.

Current implementation state:

- Phase 0 Platform Foundation is implemented.
- Phase 1 MES is implemented through Step 8 plus the Step 8a i18n/data-quality hotfix.
- Phase 2 Step 1 WMS Master Data is implemented and closure-verified.
- Phase 2 Step 2 WMS Inventory / Inbound / Outbound is implemented.
- Phase 2 Step 3 WMS Console is implemented.
- Circuit-breaker hardening is implemented across synchronous server-to-server MES/WMS dependencies,
  including MES execution, WMS outbound, WMS inbound, and kiosk gateway Keycloak login.
- Phase 3 Step 1 QMS Inspection Service is implemented on port `13110` with database port `15442`.
- Phase 3 Step 2 QMS Nonconformance Service is implemented on port `13120` with database port `15443`.
- Current active milestone is Phase 4 Platform E2E Integration.
- QMS Console is implemented as React/Vite and deployed on port 13130.
- QMS Console Step 3b UI/UX hardening is implemented: no native interactive controls outside UI primitives,
  URL-persisted 10/50/100 pagination, action-specific Radix AlertDialogs for irreversible mutations,
  WMS-matching navy/slate/amber tokens, and QMS JA/KO fallback flags registered in the MES Translation
  Review Queue (`qms_console_i18n_resource`, two OPEN flags).
- Hello World scaffolding validator was used during Phase 0, then removed from source/runtime on
  2026-07-22.

Current progress from `process/PROJECT_WORKLOAD_PROGRESS.md`:

| # | Milestone | Status | Trace |
|---|---|---|---|
| 0 | Phase 0 Platform Foundation | Completed | `implementation/phase-0-platform-foundation.md` |
| 1 | Phase 1 Step 1 MES Master Data | Completed | `implementation/phase-1-mes-master-data-service.md` |
| 2 | Phase 1 Step 2 MES Traceability | Completed | `implementation/phase-1-2-mes-traceability-service.md` |
| 3 | Phase 1 Step 3 MES Execution Stage A | Completed | `implementation/phase-1-3-mes-execution-service.md` |
| 4 | Phase 1 Step 4 MES Execution Stage B | Completed | `implementation/phase-1-4-mes-execution-service-b.md` |
| 5 | Phase 1 Step 5 Kiosk Gateway and Kiosk UI | Completed | `implementation/phase-1-5-mes-kiosk-gateway.md` |
| 6 | Phase 1 Step 6 MES Console | Completed | `implementation/phase-1-6-mes-console.md` |
| 7 | Phase 1 Step 7 Labor Resource + WorkCenter CRUD + MBOM UI Fix | Completed | `implementation/phase-1-7-labor-resource-management.md` |
| 8 | Phase 1 Step 8 i18n Platform Foundation | Completed | `implementation/phase-1-8-i18n-platform-foundation.md` |
| 8a | Phase 1 Step 8a i18n Static Coverage and Data Quality Hotfix | Completed | `implementation/phase-1-8a-i18n-coverage-data-quality-hotfix.md` |
| 9 | Phase 2 Step 1 WMS Master Data | Completed | `implementation/phase-2-1-wms-master-data-service.md` |
| 10 | Phase 2 Step 2 WMS Inventory / Inbound / Outbound | Completed | `implementation/phase-2-2-wms-inventory-stock.md` |
| 11 | Phase 2 Step 3 WMS Console | Completed | `implementation/phase-2-3-wms-console.md` |
| 12a | Phase 3 Step 1 QMS Inspection Service | Completed | `implementation/phase-3-1-qms-inspection-service.md` |
| 12b | Phase 3 Step 2 QMS Nonconformance / NCR / CAPA | Completed | `implementation/phase-3-2-qms-nonconformance-service.md` |
| 12c | Phase 3 Step 3 QMS Console | Completed | `implementation/phase-3-3-qms-console.md` |
| 13 | Phase 4 Cross-cluster Integration and Hardening | Pending | none |

Current active task after WMS Console:

- Phase 3 Step 3 QMS Console is complete; continue with Phase 4 cross-context integration and security/load verification.
- QMS Inspection Service is implemented with localized plans/characteristics/defect codes, server-side
  result evaluation, idempotent `OperationFinished` draft creation, and `InspectionFailed` events for
  the next NCR service. Trace: `implementation/phase-3-1-qms-inspection-service.md`.
- QMS Console follows the React/Vite, Tailwind, shared shadcn-style pattern, starts with i18n, and is served on `13130`.
- The latest completed demo workload is the route-aware page-detail modal in both consoles. Every
  current MES and WMS route exposes a top-right detail action with client-only VI/EN/JA/KO content
  covering purpose, usage, displayed data, statuses, and demo limitations. Trace:
  `implementation/demo-page-detail-modals-mes-wms.md`.
- WMS Console follow-up work already completed includes shared `SelectBase` controls and CRUD
  confirmation dialogs, common paginated tables (10/50/100 rows), complete status/type i18n coverage,
  warehouse descriptions stored as localized database data, and a real warehouse-map movement ledger
  endpoint. Traces are in `implementation/wms-console-selectbase-crud-confirmation.md`,
  `implementation/wms-console-datatable-pagination-status-i18n.md`,
  `implementation/wms-warehouse-map-description-i18n.md`, and
  `implementation/wms-warehouse-map-movement-ledger.md`.
- Do not resurrect Hello World. It is not an active scaffold, workspace, route, image, container, or DB.
- Preserve the circuit-breaker baseline from `implementation-fix/circuit-breaker-hardening.md` for any
  new synchronous service dependency.

## 2. Business Context

Won Seal Tech manufactures technical rubber products, especially rubber-metal automotive parts such as
automotive engine mounts. The MES MVP controls the production route, materials, labels, work orders,
shopfloor operator workflow, and planning/manager console.

Product families in the catalog:

- Finished goods:
  - `FG_RUBBER_METAL`
  - `FG_SEALS_ORING`
- Semi-finished goods:
  - `SFG_COMPOUND`
  - `SFG_TREATED_METAL`
- Raw materials:
  - `RM_RUBBER_BASE`
  - `RM_CHEMICALS`
  - `RM_METAL_BASE`

Representative seed product:

- Item Revision: `FG-WS-CM01-R1`
- Product: automotive engine mount / `Cao su chan may o to`
- Base quantity: `100.000000`
- Base UOM: `PCS`

The system is built to support data-driven execution, traceability, and future cross-cluster flows:

- MES produces and records shopfloor events.
- WMS stages and consumes material by WorkCenter.
- QMS inspects production results, raises NCR/CAPA records, and publishes quality decisions/events for
  future MES/WMS workflow integration.

## 3. Core MES Production Flow

The MVP route for `FG-WS-CM01` is:

| Sequence | Operation Code | Vietnamese Name | MES Behavior |
|---:|---|---|---|
| 10 | `OP-MIX` | Luyen can cao su | Start/finish execution, material scan, issue mother batch label. |
| 20 | `OP-PREP` | Xu ly loi kim loai | Quantity confirmation, manual raw steel scan, no output label. |
| 30 | `OP-CUT` | Cat tach phoi tam me-con | Scan mother QR, call traceability split, activate child labels. |
| 40 | `OP-MOLD` | Ep dinh va luu hoa | Scan child QR and pallet, consume child label, issue finished output label. |
| 50 | `OP-TRIM` | Cat bavia / dinh hinh | Quantity confirmation, record good and scrap. |
| 60 | `OP-QC` | Kiem tra chat luong | PASS issues label; FAIL requires reason code and no PASS label. |

Operation-specific behavior must remain data-driven where possible. Traceability calls are allowed where
the business process requires them (`OP-MIX`, `OP-CUT`, `OP-MOLD`, `OP-QC`), but code must not duplicate
traceability ownership inside execution.

## 4. Representative Product Structure

MBOM for `FG-WS-CM01-R1`:

| Seq | Component Revision | Material | Qty | UOM | Scrap | Issue Operation | Backflush | Phantom |
|---:|---|---|---:|---|---:|---|---|---|
| 10 | `SFG-MET-CM01-R1` | Treated metal core | 100.000000 | PCS | 1.00% | `OP-MOLD` | Yes | No |
| 20 | `SFG-RUB-CM01-R1` | Rubber child blank | 102.000000 | PCS | 2.00% | `OP-MOLD` | Yes | No |
| 30 | `RM-STL-05-R1` | Raw steel blank | 101.000000 | PCS | 0.50% | `OP-PREP` | No | No |
| 40 | `RM-CHEM-BOND-R1` | Bonding chemical | 1.500000 | KG | 5.00% | `OP-PREP` | Yes | No |
| 50 | `SFG-ROLL-EPDM-R1` | EPDM parent roll | 15.500000 | M2 | 3.00% | `OP-CUT` | Yes | Yes |

Important rules:

- `SFG-ROLL-EPDM-R1` is a phantom component.
- Phantom is a relationship property on `MD_MBOM_LINE`, not a fixed property on `MD_ITEM`.
- At `OP-CUT`, traceability splits the parent roll/sheet into child labels and records genealogy.
- Manual material scan is required for `RM-STL-05-R1` at `OP-PREP`.
- Backflush lines are automatically consumed on operation confirmation.

## 5. Product Master Data Catalogs

The product catalogs in `product-doc/` are the domain authority for field-level meaning and validation
intent. Current implementation does not necessarily implement every optional/recommended field, but new
work should align with these catalogs unless there is a documented implementation decision.

### 5.1 Foundation Master Data

Source: `product-doc/I-FOUNDATION-MASTER-DATA-CATALOG.md`

#### `MD_SITE`

Purpose:

- Defines plant/site scope for SKU, MBOM, Work Center, calendar, and permissions.
- Data owner: system admin / plant manager.
- Priority: MVP-Core.

Fields:

| Field | Meaning |
|---|---|
| `SiteID` | Primary key. |
| `SiteCode` | Unique plant code, e.g. `HN01`. |
| `SiteName` | Display name. |
| `TimeZone` | Timezone for kiosk start/end timestamps, e.g. `Asia/Ho_Chi_Minh`. |
| `DefaultCalendarID` | Optional default plant calendar. |
| `Status` | `Active` or `Inactive`. |

Validation:

- `SiteCode` unique globally.
- Do not delete a site after WO transactions exist; mark `Inactive`.

#### `MD_PRODUCTION_AREA`

Purpose:

- Production hierarchy for workshop, line, cell, zone.
- Used to attach Work Centers, devices, and permissions.

Fields:

| Field | Meaning |
|---|---|
| `AreaID` | Primary key. |
| `SiteID` | Owning site. |
| `AreaCode` | Area code. |
| `AreaName` | Display name. |
| `AreaType` | `Workshop`, `Line`, `Cell`, `Zone`. |
| `ParentAreaID` | Optional tree parent. |
| `SequenceNo` | Display ordering. |
| `Status` | `Active` or `Inactive`. |

Validation:

- No cycles in `ParentAreaID`.
- Work Center area must belong to same site.

#### `MD_UOM`

Purpose:

- Standard units for products, raw materials, sheets, child blanks, and BOM quantities.

Fields:

| Field | Meaning |
|---|---|
| `UOMID` | Primary key. |
| `UOMCode` | Unique UOM code such as `M2`, `PCS`, `KG`. |
| `UOMName` | Display name. |
| `UOMType` | `Count`, `Length`, `Area`, `Weight`, `Time`. |
| `DecimalPrecision` | Allowed decimal precision. |
| `AllowFraction` | Whether fractional quantities are allowed. |
| `Status` | `Active` or `Inactive`. |

Validation:

- `UOMCode` unique globally.
- Do not change `UOMType` after use/release.

#### `MD_UOM_CONVERSION`

Purpose:

- Converts between purchasing, warehouse, and production units.
- Example: Roll -> Meter, Sheet -> M2.

Fields:

| Field | Meaning |
|---|---|
| `ConversionID` | Primary key. |
| `ItemID` | Optional item-specific conversion. |
| `FromUOMID` | Source UOM. |
| `ToUOMID` | Target UOM. |
| `Factor` | `1 FromUOM = Factor * ToUOM`. |
| `RoundingRule` | Rounding policy. |
| `EffectiveFrom` | Start date. |

Validation:

- `Factor` must not be zero.
- Only one effective conversion per `[Item + FromUOM + ToUOM]` at a time.

#### `MD_SHIFT`

Purpose:

- Defines shift time, breaks, and net available minutes.
- Used for scheduling and execution reporting.

Fields:

| Field | Meaning |
|---|---|
| `ShiftID` | Primary key. |
| `SiteID` | Owning site. |
| `ShiftCode` | Shift code such as `A`. |
| `StartTime` | Shift start. |
| `EndTime` | Shift end. |
| `BreakMinutes` | Total break duration. |
| `NetAvailableMinutes` | Shift duration minus break. |
| `CrossMidnight` | Whether shift crosses midnight. |

Validation:

- `NetAvailableMinutes = shift duration - BreakMinutes`.
- Avoid overlapping shifts in one site unless explicitly allowed by plant policy.

#### `MD_REASON_CODE`

Purpose:

- Standard reasons for downtime, scrap, rework, hold, and adjustment.

Fields:

| Field | Meaning |
|---|---|
| `ReasonID` | Primary key. |
| `ReasonCode` | Short reason code, e.g. `MAT_WAIT`. |
| `ReasonName` | Display name. |
| `ReasonCategory` | `Downtime`, `Scrap`, `Rework`, `Hold`, `Adjustment`. |
| `RequiresComment` | Requires operator text comment. |
| `RequiresApproval` | Requires manager approval. |
| `ApplicableAreaID` | Optional area scope. |
| `Status` | `Active` or `Inactive`. |

Validation:

- `ReasonCode` unique within category.
- Do not delete used reason codes; mark `Inactive`.

### 5.2 Product and MBOM Catalog

Source: `product-doc/II-PRODUCTS-&-MBOM-CATALOG.md`

#### `MD_ITEM`

Purpose:

- Master item/SKU catalog for 160-200 SKU across finished goods, semi-finished goods, raw materials,
  and consumables.

Fields:

| Field | Meaning |
|---|---|
| `ItemID` | Primary key. |
| `ItemCode` | Globally unique SKU code. |
| `ItemName` | Display name. |
| `ItemType` | `FinishedGood`, `SemiFinished`, `RawMaterial`, `Consumable`. |
| `ItemGroup` | Technical product group. |
| `BaseUOMID` | Base UOM. |
| `PlanningStrategy` | `MTS`, `MTO`, `ETO`. |
| `ProcurementType` | `Make`, `Buy`, `Subcontract`. |
| `TrackingLevel` | `None`, `Lot`, `Serial`, `ParentChild`. |
| `DefaultScrapRate` | Optional default scrap rate. |
| `Status` | `Draft`, `Active`, `Inactive`. |

Validation:

- `ItemCode` should not change after `Active`.
- `ItemType` and `ProcurementType` must be logically compatible.

#### `MD_ITEM_REVISION`

Purpose:

- Engineering revision/version control without overwriting production history.

Fields:

| Field | Meaning |
|---|---|
| `ItemRevisionID` | Primary key. |
| `ItemID` | Parent item. |
| `RevisionNo` | Revision code such as `R1`. |
| `RevisionStatus` | `Draft`, `InReview`, `Released`, `Obsolete`. |
| `SpecificationRef` | Optional document/spec reference. |
| `EffectiveFrom` | Start datetime. |
| `EffectiveTo` | Optional end datetime. |
| `ChangeReason` | Reason for revision. |
| `ReleasedBy` | Approver reference. |

Validation:

- Only one effective default released revision per SKU/site at a time.
- Do not edit core released revision data; release a new revision.

#### `MD_MBOM_HEADER`

Purpose:

- Defines a production BOM for a product revision at a site.

Fields:

| Field | Meaning |
|---|---|
| `MBOMID` | Primary key. |
| `MBOMCode` | MBOM code. |
| `ProductRevisionID` | Finished/semi-finished output revision. |
| `SiteID` | Site scope. |
| `MBOMVersion` | Version number. |
| `BaseQuantity` | Base output quantity. |
| `BaseUOMID` | Base output UOM. |
| `ValidFrom` | Effective start. |
| `ValidTo` | Optional effective end. |
| `Status` | `Draft`, `InReview`, `Released`, `Obsolete`. |

Validation:

- Released MBOM must contain at least one line.
- Only released MBOMs can be linked to `MD_PRODUCTION_VERSION`.

#### `MD_MBOM_LINE`

Purpose:

- Defines component, hierarchy, quantity, scrap, phantom behavior, and issue operation.

Fields:

| Field | Meaning |
|---|---|
| `MBOMLineID` | Primary key. |
| `MBOMID` | Parent MBOM. |
| `ParentLineID` | Optional parent line for multi-level tree. |
| `SequenceNo` | Display/explosion sequence. |
| `ComponentRevisionID` | Component item revision. |
| `QuantityPer` | Component quantity per base output quantity. |
| `UOMID` | UOM. |
| `ScrapRate` | Expected scrap rate. |
| `PhantomFlag` | Whether line is phantom/exploded and not independent output. |
| `IssueOperationID` | Operation consuming/issuing material. |
| `BackflushFlag` | Auto-consume on operation completion. |
| `OptionalFlag` | Optional material. |
| `EffectiveFrom` | Effective start. |
| `EffectiveTo` | Optional effective end. |

Validation:

- No circular BOM tree.
- `QuantityPer > 0`.
- Phantom is line-level relationship logic.

#### `MD_COMPONENT_SUBSTITUTE`

Purpose:

- Defines allowed substitute materials when primary material is unavailable.

Fields:

| Field | Meaning |
|---|---|
| `SubstituteID` | Primary key. |
| `MBOMLineID` | Original MBOM line. |
| `SubstituteRevisionID` | Substitute item revision. |
| `PriorityNo` | Priority order. |
| `ConversionFactor` | Conversion ratio. |
| `MaxUsagePercent` | Maximum usage percentage. |
| `RequiresApproval` | Whether substitution requires approval. |
| `EffectiveFrom` | Effective start. |

Validation:

- Substitute cannot be the same as original component revision.
- Substitute must be same technical group or approved by quality/engineering.

#### `MD_PRODUCTION_VERSION`

Purpose:

- Locks the valid triple `[Item Revision + MBOM + Routing]` for WO creation.

Fields:

| Field | Meaning |
|---|---|
| `ProductionVersionID` | Primary key. |
| `ProductRevisionID` | Product revision. |
| `MBOMID` | Released MBOM. |
| `RoutingID` | Released routing. |
| `SiteID` | Site. |
| `MinLotSize` | Minimum lot size. |
| `MaxLotSize` | Maximum lot size. |
| `DefaultFlag` | Default version selector. |
| `ValidFrom` | Effective start. |
| `ValidTo` | Optional effective end. |
| `Status` | `Draft`, `InReview`, `Released`, `Obsolete`. |

Validation:

- MBOM and Routing must match site and product revision.
- Only one effective default production version per product/site/lot-size range.

### 5.3 Routing and Standards Catalog

Source: `product-doc/III-ROUTING-&-STANDARDS-CATALOG.md`

#### `MD_OPERATION`

Purpose:

- Standard operation catalog for production, inspection, packing, and handling steps.

Fields:

| Field | Meaning |
|---|---|
| `OperationID` | Primary key. |
| `OperationCode` | Unique operation code. |
| `OperationName` | Display name. |
| `OperationType` | `Production`, `Inspection`, `Packing`, `Handling`. |
| `ConfirmationMode` | `StartFinish`, `QuantityOnly`, `Auto`. |
| `QuantityReporting` | `GoodOnly`, `GoodScrap`. |
| `RequiresMaterialScan` | Whether material scan is mandatory. |
| `RequiresOutputLabel` | Whether output label is required. |
| `AllowPartialCompletion` | Whether partial completion is allowed. |
| `Status` | `Active` or `Inactive`. |

Validation:

- `OperationCode` unique globally.
- Do not delete operations used in WO transactions; mark `Inactive`.

#### `MD_ROUTING_HEADER`

Purpose:

- Defines process route for one product revision at one site.

Fields:

| Field | Meaning |
|---|---|
| `RoutingID` | Primary key. |
| `RoutingCode` | Routing code. |
| `ProductRevisionID` | Product revision. |
| `SiteID` | Site. |
| `RoutingVersion` | Version number. |
| `RoutingType` | `Standard`, `Alternate`, `Rework`. |
| `ValidFrom` | Effective start. |
| `ValidTo` | Optional effective end. |
| `Status` | `Draft`, `InReview`, `Released`, `Obsolete`. |

Validation:

- Released routing must have at least one operation.
- Do not directly edit routing used by production orders.

#### `MD_ROUTING_OPERATION`

Purpose:

- Defines operation sequence, default Work Center, dependencies, queue/move time, and scheduling params.

Fields:

| Field | Meaning |
|---|---|
| `RoutingOperationID` | Primary key. |
| `RoutingID` | Parent routing. |
| `SequenceNo` | Operation sequence. |
| `OperationID` | Operation catalog reference. |
| `DefaultWorkCenterID` | Default Work Center. |
| `PredecessorSeq` | Predecessor sequences for dependencies/parallelism. |
| `SchedulingMode` | `Finite` or `Infinite`. |
| `OverlapAllowed` | Whether overlap/partial transfer is allowed. |
| `TransferBatchQty` | Transfer batch quantity. |
| `QueueTimeMin` | Queue time. |
| `MoveTimeMin` | Move time. |
| `MilestoneFlag` | Progress milestone marker. |

Validation:

- `SequenceNo` unique within routing.
- `PredecessorSeq` cannot create a cycle.

#### `MD_PRODUCTION_STANDARD`

Purpose:

- Defines setup time, cycle time, labor count, yield, and efficiency by product/operation/resource.

Fields:

| Field | Meaning |
|---|---|
| `StandardID` | Primary key. |
| `ProductRevisionID` | Product revision. |
| `RoutingOperationID` | Routing operation. |
| `WorkCenterID` | Work Center. |
| `EquipmentID` | Optional equipment-specific standard. |
| `BaseQuantity` | Quantity basis. |
| `SetupTimeMin` | Setup duration. |
| `CycleTimeSec` | Cycle time. |
| `LaborCount` | Direct labor count. |
| `StandardYield` | Expected yield. |
| `EfficiencyFactor` | Planning efficiency factor. |
| `SourceMethod` | `Engineering`, `TimeStudy`, `HistoricalApproved`. |
| `SampleSize` | Optional measured sample size. |
| `ValidFrom` | Effective start. |
| `ReviewDueDate` | Review date. |

Validation:

- Prefer equipment-specific standard; otherwise use WorkCenter standard.
- One effective standard per `[ProductRevisionID + RoutingOperationID + Resource]`.
- Do not auto-overwrite standard from transaction data without approval.

#### `MD_WORK_INSTRUCTION`

Purpose:

- Released SOP/instruction content for Kiosk.

Fields:

| Field | Meaning |
|---|---|
| `InstructionID` | Primary key. |
| `InstructionCode` | Document code. |
| `OperationID` | Operation reference. |
| `ProductRevisionID` | Optional SKU-specific instruction. |
| `InstructionVersion` | Version number. |
| `ContentType` | `Text`, `PDF`, `Image`, `Video`, `URL`. |
| `ContentURI` | File/link. |
| `AcknowledgementRequired` | Operator must acknowledge before start. |
| `Status` | `Draft`, `InReview`, `Released`, `Obsolete`. |

Validation:

- Kiosk shows only released/effective instructions.
- Product-specific instructions override generic operation instructions.

### 5.4 Resources and Capabilities Catalog

Source: `product-doc/IV-RESOURCES & CAPABILITIES CATALOG.md`

#### `MD_WORK_CENTER`

Purpose:

- Logical capacity group used for routing, scheduling, and production load/progress aggregation.

Fields:

| Field | Meaning |
|---|---|
| `WorkCenterID` | Primary key. |
| `WorkCenterCode` | Unique code. |
| `WorkCenterName` | Display name. |
| `AreaID` | Area/workshop. |
| `ResourceType` | `MachineGroup`, `LaborCell`, `Mixed`. |
| `CapacityModel` | `TimeBased`, `QuantityBased`. |
| `FiniteCapacityFlag` | Whether finite planning applies. |
| `DefaultShiftID` | Optional default shift. |
| `MaxConcurrentJobs` | Jobs that can run in parallel. |
| `Status` | `Active`, `Inactive`. |

Validation:

- Must belong to valid area/site.
- Do not store machine IP or IoT config in Work Center.

#### `MD_WORKSTATION`

Purpose:

- Logical execution point where operators interact through Kiosk/Tablet.

Fields:

| Field | Meaning |
|---|---|
| `WorkstationID` | Primary key. |
| `WorkstationCode` | Unique code. |
| `WorkstationName` | Display name. |
| `AreaID` | Area. |
| `ExecutionMode` | `Kiosk`, `Tablet`, `Manual`, `Automatic`. |
| `MaxConcurrentJobs` | Concurrent job capacity. |
| `DefaultTerminalID` | Optional terminal. |
| `Status` | `Active`, `Inactive`. |

Validation:

- Workstation is logical; physical machinery is `MD_EQUIPMENT`.
- Do not delete workstations with transaction history.

#### `MD_EQUIPMENT`

Purpose:

- Physical machines/equipment used for planning and execution records.

Fields:

| Field | Meaning |
|---|---|
| `EquipmentID` | Primary key. |
| `EquipmentCode` | Site-unique machine code. |
| `EquipmentName` | Display name. |
| `EquipmentType` | Machine type. |
| `Manufacturer` | Optional manufacturer. |
| `Model` | Optional model. |
| `SerialNumber` | Physical serial number. |
| `PlanningResourceFlag` | Can be used for scheduling. |
| `ExecutionStatus` | `Available`, `Maintenance`, `OutOfService`. |
| `DefaultEfficiency` | Default efficiency factor. |
| `Status` | `Active`, `Inactive`. |

Validation:

- `EquipmentCode` unique per site.
- Master `ExecutionStatus` is reference state; downtime transactions are separate.

#### `MD_RESOURCE_ASSIGNMENT`

Purpose:

- Effective-dated relationship between Work Center, Workstation, and Equipment.

Fields:

| Field | Meaning |
|---|---|
| `AssignmentID` | Primary key. |
| `WorkCenterID` | Work Center. |
| `WorkstationID` | Workstation. |
| `EquipmentID` | Optional equipment. |
| `AssignmentRole` | `Primary`, `Alternate`, `Supporting`. |
| `SchedulingFlag` | Available to planning. |
| `OEEAggregationFlag` | Future KPI/OEE aggregation. |
| `EffectiveFrom` | Start. |
| `EffectiveTo` | Optional end. |

Validation:

- One equipment cannot be primary on two workstations in the same effective time range.
- Related resources must belong to the same site.

#### `MD_RESOURCE_CAPABILITY`

Purpose:

- Defines which Work Centers/equipment can execute which product/operation and priority.

Fields:

| Field | Meaning |
|---|---|
| `CapabilityID` | Primary key. |
| `ProductRevisionID` | Optional product revision. |
| `ItemGroup` | Optional item group. |
| `OperationID` | Operation. |
| `WorkCenterID` | Work Center. |
| `EquipmentID` | Optional equipment. |
| `Eligibility` | Whether resource is eligible. |
| `PriorityNo` | Selection priority. |
| `SpeedFactor` | Speed vs standard. |
| `MinLotSize` | Minimum lot size. |
| `MaxLotSize` | Maximum lot size. |
| `SetupFamily` | Setup grouping. |

Validation:

- Must specify either `ProductRevisionID` or `ItemGroup`.
- Equipment must belong to the WorkCenter during the effective period.

#### `MD_RESOURCE_CALENDAR`

Purpose:

- Resource availability by date/shift, planned down time, holidays, capacity factors.

Fields:

| Field | Meaning |
|---|---|
| `ResourceCalendarID` | Primary key. |
| `ResourceType` | `WorkCenter`, `Workstation`, `Equipment`. |
| `ResourceID` | Resource id. |
| `CalendarDate` | Date. |
| `ShiftID` | Shift. |
| `AvailabilityStatus` | `Available`, `PlannedDown`, `Holiday`. |
| `AvailableMinutes` | Available minutes. |
| `CapacityFactor` | Availability multiplier. |
| `ReasonID` | Optional reason code. |

Validation:

- Unique `[ResourceID + CalendarDate + ShiftID]`.
- Long-term capacity changes should use Production Standard approval, not ad hoc calendar edits.

#### `MD_SKILL`

Purpose:

- Skill catalog for operation qualification and workforce planning.

Fields:

| Field | Meaning |
|---|---|
| `SkillID` | Primary key. |
| `SkillCode` | Unique skill code. |
| `SkillName` | Display name. |
| `SkillCategory` | `MachineOperation`, `Quality`, `MaterialHandling`. |
| `LevelScale` | e.g. `L1,L2,L3,L4`. |
| `CertificationRequired` | Whether certification is required. |
| `Status` | `Active`, `Inactive`. |

Validation:

- `SkillCode` unique globally.
- HR may own detailed certification; MES stores needed execution references.

#### `MD_OPERATION_SKILL_REQUIREMENT`

Purpose:

- Skill and headcount requirements for routing operations.

Fields:

| Field | Meaning |
|---|---|
| `RequirementID` | Primary key. |
| `RoutingOperationID` | Routing operation. |
| `SkillID` | Required skill. |
| `MinimumLevel` | Required level. |
| `RequiredPersons` | Number of people. |
| `MandatoryFlag` | Blocks if not met. |
| `EffectiveFrom` | Effective start. |

Validation:

- `RequiredPersons > 0`.
- Required skill must be active and in site scope when site scoping exists.

### 5.5 Traceability and QR Catalog

Source: `product-doc/V-QR-CATALOG.md`

#### `MD_TRACEABILITY_POLICY`

Purpose:

- Defines whether item/item-group is tracked by Lot, Serial, or ParentChild and when labels are created.

Fields:

| Field | Meaning |
|---|---|
| `TracePolicyID` | Primary key. |
| `ItemID` | Optional specific item. |
| `ItemGroup` | Optional group. |
| `TrackingLevel` | `None`, `Lot`, `Serial`, `ParentChild`. |
| `LotCreationPoint` | `WORelease`, `OperationStart`, `OperationFinish`. |
| `ChildLabelCreationMode` | `OnDemand`, `PreGenerateInactive`. |
| `AllowSplit` | Whether split is allowed. |
| `AllowMerge` | Whether merge is allowed. |
| `RequireMaterialGenealogy` | Whether genealogy is mandatory. |
| `Status` | `Active`, `Inactive`. |

Validation:

- Must specify `ItemID` or `ItemGroup`.
- Item-specific policy overrides group policy.

#### `MD_NUMBERING_RULE`

Purpose:

- Generates unique codes for lots, parent labels, child labels.

Fields:

| Field | Meaning |
|---|---|
| `NumberRuleID` | Primary key. |
| `EntityType` | `Lot`, `ParentLabel`, `ChildLabel`. |
| `SiteID` | Site. |
| `PrefixTemplate` | Prefix with date tokens. |
| `SequenceLength` | Padded sequence length. |
| `ResetFrequency` | `Never`, `Yearly`, `Monthly`, `Daily`. |
| `CheckDigitMethod` | Optional `Mod10`/custom. |
| `CurrentSequence` | Current sequence. |
| `Status` | `Active`, `Inactive`. |

Validation:

- Sequence increments must be atomic in the database.
- No overlapping active rule per `[EntityType + SiteID]`.

#### `MD_QR_SPLIT_RULE`

Purpose:

- Defines parent-to-child split behavior at cutting operations.

Fields:

| Field | Meaning |
|---|---|
| `SplitRuleID` | Primary key. |
| `SourceItemRevisionID` | Parent revision. |
| `TargetItemRevisionID` | Child revision. |
| `OperationID` | Operation allowed to split, usually `OP-CUT`. |
| `SourceUOMID` | Source UOM. |
| `TargetUOMID` | Target UOM. |
| `QuantityMethod` | `Fixed`, `OperatorInput`, `FromTemplate`. |
| `DefaultChildQty` | Optional default child qty. |
| `MaxChildren` | Maximum child labels. |
| `TolerancePercent` | Material balance tolerance. |
| `ActivationMode` | `ActivateOnScan`, `ActivateOnConfirm`. |
| `RemainderPolicy` | `KeepParentBalance`, `CreateRemainderChild`, `Scrap`. |
| `RequireSecondCheck` | Manager/QC second check. |
| `Status` | `Active`, `Inactive`. |

Validation:

- Source and target revisions must have valid traceability policies.
- Sum child quantity cannot exceed parent quantity plus tolerance.
- Split can run only at the configured operation.

#### `MD_LABEL_TEMPLATE`

Purpose:

- Defines QR label layout, size, printer language, and payload schema.

Fields:

| Field | Meaning |
|---|---|
| `LabelTemplateID` | Primary key. |
| `TemplateCode` | Template code. |
| `LabelPurpose` | `ParentLabel`, `ChildLabel`, `LotLabel`. |
| `ItemGroup` | Optional group. |
| `WidthMM` | Label width. |
| `HeightMM` | Label height. |
| `PrinterLanguage` | `ZPL`, `TSPL`, `PDF`. |
| `TemplateContentURI` | Template file URI. |
| `PayloadSchema` | Required QR payload fields. |
| `TemplateVersion` | Version. |
| `Status` | `Draft`, `InReview`, `Released`, `Obsolete`. |

Validation:

- Released label templates are immutable; release a new version for changes.
- Child label payload must contain unique `LabelID` and `ParentID`.

### 5.6 Kiosk and Security Catalog

Source: `product-doc/VI-KIOSK-&-SECURITY-CATALOG.md`

#### `MD_TERMINAL`

Purpose:

- Field device/tablet/kiosk definition, tied to Workstation and printer/scan setup.

Fields:

| Field | Meaning |
|---|---|
| `TerminalID` | Primary key. |
| `TerminalCode` | Unique device code. |
| `TerminalName` | Display name. |
| `TerminalType` | `Kiosk`, `Tablet`, `WebStation`. |
| `WorkstationID` | Default workstation. |
| `ScanMode` | `Camera`, `USBScanner`, `RFID`. |
| `PrinterEndpointRef` | Printer/print service reference. |
| `OfflineModeEnabled` | Whether offline queue is enabled. |
| `HeartbeatIntervalSec` | Heartbeat interval. |
| `Status` | `Active`, `Inactive`. |

Validation:

- One terminal should have one default Workstation at a time.
- Never store plain-text credentials/secrets in terminal data.

#### `MD_ROLE_PERMISSION`

Purpose:

- Domain permission matrix for configuration, release/approval, WO creation, and execution.

Fields:

| Field | Meaning |
|---|---|
| `PermissionID` | Primary key. |
| `RoleCode` | Role from IAM/Keycloak. |
| `ResourceType` | `Item`, `MBOM`, `Routing`, `WO`, `Execution`, `Traceability`. |
| `Action` | `View`, `Create`, `Edit`, `Release`, `Approve`, `Execute`. |
| `DataScopeType` | `All`, `Site`, `Area`, `WorkCenter`, `OwnAssignment`. |
| `ConditionExpression` | Optional business condition. |
| `Status` | `Active`, `Inactive`. |

Validation:

- Deny by default.
- Approve/release must be separated from edit for important master data.

#### `MD_USER_RESOURCE_SCOPE`

Purpose:

- Assigns user/employee to site/area/workcenter/workstation scope.

Fields:

| Field | Meaning |
|---|---|
| `UserScopeID` | Primary key. |
| `UserID` | IAM/user reference. |
| `RoleCode` | Role in this scope. |
| `SiteID` | Site. |
| `AreaID` | Optional area. |
| `WorkCenterID` | Optional Work Center. |
| `WorkstationID` | Optional Workstation. |
| `ValidFrom` | Start. |
| `ValidTo` | Optional end. |
| `Status` | `Active`, `Inactive`. |

Validation:

- Child scopes must belong to parent scopes.
- If Area/WorkCenter/Workstation are null, scope is all of the site for that role.

### 5.7 ERD Matrix and Release Validation

Source: `product-doc/VII-ERD-MATRIX-&-DEV-VALIDATION.md`

Core relationships:

| Source | Target | Rule |
|---|---|---|
| `MD_ITEM` | `MD_ITEM_REVISION` | WO must reference a concrete item revision, not only item. |
| `MD_ITEM_REVISION` | `MD_MBOM_HEADER` | One revision can have multiple MBOMs by site/version. |
| `MD_MBOM_HEADER` | `MD_MBOM_LINE` | Multi-level tree through `ParentLineID`; cycle checks mandatory. |
| `[ItemRevision + MBOM + Routing]` | `MD_PRODUCTION_VERSION` | Production Version is the official configuration for WO creation. |
| `MD_ROUTING_HEADER` | `MD_ROUTING_OPERATION` | Operation order through `SequenceNo` and `PredecessorSeq`. |
| `MD_ROUTING_OPERATION` | `MD_WORK_CENTER` | Work Center is the default logical resource for an operation. |
| WorkCenter/Workstation/Equipment | `MD_RESOURCE_ASSIGNMENT` | Effective-dated resource relationship. |
| Item/Operation | Resource | `MD_RESOURCE_CAPABILITY` allows only eligible resources. |
| Item/Operation/Resource | `MD_PRODUCTION_STANDARD` | Equipment standard has priority over WorkCenter standard. |
| Item/ItemGroup | `MD_TRACEABILITY_POLICY` | Item-specific policy overrides group policy. |
| Traceability Policy | Split/Number/Label rules | Traceability config drives QR flow. |
| `MD_TERMINAL` | `MD_WORKSTATION` | Terminal filters WOs and routes print commands by workstation. |
| User | `MD_USER_RESOURCE_SCOPE` | Role permission plus resource scope controls authorization. |

Release validation checklist:

1. Item Revision is `Released` and effective.
2. MBOM has lines, no tree cycle, positive quantities, valid UOM.
3. Phantom component has released/effective child MBOM.
4. Routing has operations, unique sequences, no predecessor cycle.
5. Work Center is active and in correct site.
6. Resource Capability has at least one eligible resource.
7. Production Standard exists with positive setup/cycle values for schedulable operations.
8. Resource Calendar exists for planning period.
9. Traceability rules exist for ParentChild products; delegated to `mes-traceability-service`.
10. Permissions and resource scope exist for release/approval/operation.

Transactional read flow:

1. Create WO reads item revision, production version, MBOM, and routing.
2. Explode operations and duration from routing operations, production standards, and shifts.
3. Planning/allocation reads Work Center, assignment, capability, and calendar.
4. Kiosk reads terminal, workstation, resource scope, and role permissions.
5. Execution reads operation, standard, reason code, and work instruction.
6. Parent QR scan reads traceability policy, split rule, and UOM conversion.
7. Label generation uses numbering rule, label template, and kiosk printer endpoint.

## 6. Architecture Strategy

Source: `process/stragegy.md`

Core mental model:

- MES, WMS, and QMS are clusters, not single services.
- Each cluster is a set of independently deployable services with their own databases.
- Shared infrastructure belongs to Platform Foundation.
- Cross-cluster integration happens through events and explicit APIs, never shared databases.

Invariant:

- One service = one database = one bounded context = one ownership boundary = one independent deployment
  capability.

Cluster decomposition:

| Cluster | Service | Bounded Context |
|---|---|---|
| MES | `mes-master-data-service` | Slow-changing master data: foundation, products, routing, standards, resources, domain access. |
| MES | `mes-traceability-service` | Traceability policy, numbering, QR split, label instances, genealogy. |
| MES | `mes-execution-service` | Work order lifecycle, operation execution, material consumption, completion. |
| MES | `mes-kiosk-gateway-service` | Edge-facing terminal login, WebSocket hub, offline queue. |
| MES | `kiosk-operator-ui` | Shopfloor operator tablet/kiosk workflow. |
| MES | `mes-console` | Planner/manager desktop UI. |
| WMS | `wms-master-data-service` | Warehouse, zone, location, bin, WMS UOM mapping. |
| WMS | `wms-inventory-service` | Append-only stock ledger and balance projection. |
| WMS | `wms-inbound-service` | Receipt and putaway workflow. |
| WMS | `wms-outbound-service` | Material request, staging-first allocation, shortage. |
| WMS | `wms-console` | Implemented React/Vite/shadcn-style operational console. |
| QMS | `qms-inspection-service` | Inspection plans, defect codes, characteristics, results, MES event consumer, and quality events. |
| QMS | `qms-nonconformance-service` | NCR header, disposition history, CAPA, inspection-failure consumer, idempotent case creation, and quality events. |
| QMS | `qms-console` | React/Vite QMS UI on `13130`; inspection queue, result recording, NCR and CAPA workflows. |

Cross-service rules:

- No service queries another service database.
- Consumers build local read models from events or call explicit APIs with circuit breakers.
- Outbox pattern is mandatory for meaningful transactional state changes.
- Event names follow `<Cluster>.<BoundedContext>.<EventName>.v<N>`.
- Event envelope shape is:
  - `event_id`
  - `event_type`
  - `occurred_at`
  - `source_service`
  - `trace_id`
  - `payload`
- Use choreography-based sagas initially. Move to orchestration only if saga complexity justifies it.
- Use Anti-Corruption Layers for cross-cluster model differences.
- Use service manifests as a living registry of ownership, events, and APIs.

Anti-drift governance:

- ADRs for major architecture choices.
- Bounded Context Canvas before implementing a new service.
- Contract tests for event publisher/consumer compatibility.
- Service manifest registry/script should eventually generate the event map.
- Definition of Ready for a new service: canvas, event contract, ownership, and dependencies known.
- i18n completeness gate before marking any cluster/console completed.

## 7. Tech Stack Decisions

Source: `process/TECH-STACK-DECISION.md`

The platform is polyglot by workload, not by developer preference.

Decision criteria:

| Workload | Prefer Node.js | Prefer Go |
|---|---|---|
| Request style | CRUD request/response, read-heavy | High-frequency writes, long-lived connections |
| Concurrency | Low write race pressure | High concurrency / many clients |
| CPU per request | Light query/validation | CPU-bound calculations/algorithms |
| Tail latency | Not strict | Must be stable under spikes |
| Connections | Short-lived HTTP | WebSocket/MQTT/long-lived or high throughput |

Current and planned stack choices:

| Service/App | Current/Planned | Stack | Reason |
|---|---|---|---|
| Unified Portal | Implemented | React + Vite SPA | Lightweight app launcher. |
| `mes-master-data-service` | Implemented | Node.js, TypeScript, Express, Drizzle, PostgreSQL, KafkaJS | CRUD/read-heavy master data. |
| `mes-traceability-service` | Implemented | Go, Chi, pgx, Kafka | Atomic numbering and concurrent QR split/label workflow. |
| `mes-execution-service` | Implemented | Go, Chi, pgx, gobreaker, Kafka | Real-time execution and CPU-bound compute/check in same bounded context. |
| `mes-kiosk-gateway-service` | Implemented | Go | Long-lived WebSocket/edge gateway workload. |
| `kiosk-operator-ui` | Implemented | React/Vite app served by Docker/nginx | Tablet/kiosk shopfloor UI. |
| `mes-console` | Implemented | React/Vite/Tailwind/shadcn-style UI served by Docker/nginx | Current codebase reality; earlier strategy mentioned Remix, but actual implementation is Vite. |
| `wms-master-data-service` | Implemented | Node.js/TypeScript/Express/Drizzle | CRUD/read-heavy WMS master data. |
| `wms-inventory-service` | Implemented | Go | Append-only stock ledger, concurrent stock movement correctness. |
| `wms-inbound-service` | Implemented | Node.js/TypeScript/Express/PostgreSQL | Receipt workflow, lower concurrency. |
| `wms-outbound-service` | Implemented | Go | Latency-sensitive staging-first allocation and shortage logic. |
| `wms-console` | Implemented | React 18, Vite, TypeScript, Tailwind, Radix/shadcn-style primitives, TanStack Query/Table, Recharts, Docker/nginx | Built to match the actual MES Console pattern; includes Keycloak PKCE, VI/EN/JA/KO i18n, warehouse map, master data, inventory, inbound, outbound, shared selects/tables, confirmations, error/404 handling, and route-aware detail modals. |
| `qms-inspection-service` | Implemented | Node.js/TypeScript/Express/Drizzle/PostgreSQL/KafkaJS | Inspection plans/results and quality-event publication; uses an `opossum` breaker for MES reference validation. |
| `qms-nonconformance-service` | Implemented | Node.js, TypeScript, Express, PostgreSQL, KafkaJS | NCR, disposition, CAPA, and idempotent inspection-failure case management. |

Shared libraries:

- `libs/shared-kernel`: TypeScript shared contracts and DB SQL helpers.
- `libs/shared-kernel-go`: Go shared event/outbox helpers.
- `libs/i18n-ui-shared`: React i18n provider/hooks and shared locale model.

Frontend design rules already applied to MES Console:

- Use shadcn-style common UI components where possible.
- Industrial MES theme: deep navy primary, slate/charcoal structure, light slate neutral surfaces,
  safety amber/rubber orange for actions/active/critical highlights.
- High contrast for factory kiosks, tablets, and desktop workstations.
- MES Console has global ErrorBoundary/404 handling and a default Vietnamese language toggle.
- WMS Console follows the same industrial theme and has route-level ErrorBoundary/404 handling,
  Vietnamese as the default locale, a language toggle, shared `SelectBase`, shared paginated tables,
  and confirmation dialogs for mutating actions.
- QMS Console follows the same industrial theme and has route-level ErrorBoundary/404 handling,
  Vietnamese as the default locale, VI/EN/JA/KO locale support, shared Radix/shadcn-style primitives,
  URL-persisted pagination, and confirmation dialogs for mutating actions.

## 8. Platform Foundation

Compose file: `infra/docker-compose.platform.yml`

Shared runtime infrastructure:

| Component | Container | Host Port | Internal Port | Notes |
|---|---|---:|---:|---|
| Kafka KRaft | `platform-kafka` | `19092`, `19093` | `9092`, `9093`, `29092` | Event broker. |
| Schema Registry | `platform-schema-registry` | `18081` | `8081` | Event schema registry. |
| Kafka UI | `platform-kafka-ui` | `18082` | `8080` | Dev inspection UI. |
| Keycloak | `platform-keycloak` | `18080` | `8080` | Realm `wonsealtech`. |
| Kong | `platform-kong` | `18000`, `18001` | `8000`, `8001` | DB-less API Gateway. |
| OTel Collector | `platform-otel-collector` | `14317`, `14318`, `18888`, `18889` | `4317`, `4318`, `8888`, `8889` | Trace/metric collection. |
| Tempo | `platform-tempo` | `13200`, `14319` | `3200`, `4317` | Distributed tracing. |
| Loki | `platform-loki` | `13100` | `3100` | Log aggregation. |
| Prometheus | `platform-prometheus` | `19090` | `9090` | Metrics. |
| Grafana | `platform-grafana` | `13001` | `3000` | Dashboards. |
| Portal | `platform-portal` | `13000` | `80` | Defined in `infra/docker-compose.yml`. |

Current compose layering:

- `infra/docker-compose.platform.yml`: shared infrastructure.
- `infra/docker-compose.mes.yml`: MES services and MES UIs.
- `infra/docker-compose.wms.yml`: WMS services.
- `infra/docker-compose.yml`: root include for platform + MES + WMS + QMS + Portal.
- `infra/docker-compose.qms.yml`: QMS inspection database/service, nonconformance database/service,
  and QMS Console. The root Compose file includes this file; explicit commands may also add it for clarity.

Common commands:

```bash
cd /home/neurosus/mes-system
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml up -d --build <service>
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml logs --tail=100 <service>
# Equivalent explicit full-stack form:
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml \
  -f infra/docker-compose.mes.yml -f infra/docker-compose.wms.yml -f infra/docker-compose.qms.yml ps
```

Hello World decommission:

- Removed service source: `services/hello-world-service/`.
- Removed compose services: `hello-world-service`, `hello-world-db`.
- Removed Kong route: `/api/hello`.
- Removed Docker containers, image, and DB volume.
- Historical Phase 0 implementation record notes the validator was decommissioned.

## 9. Identity, SSO, and Portal Policy

Keycloak:

- Realm: `wonsealtech`
- Admin user: `admin` / `Admin@123!`
- Realm export: `infra/keycloak/realm-export.json`

OIDC clients:

| Client | URL | Purpose |
|---|---|---|
| `portal-client` | `http://100.68.50.41:13000` | Unified Portal. |
| `mes-client` | `http://100.68.50.41:13052` | MES Console and MES browser login. |
| `wms-client` | `http://100.68.50.41:13091` | WMS Console and WMS API bearer tokens. |
| `qms-client` | `http://100.68.50.41:13130` | QMS Console. |

Global roles:

- `EXECUTIVE`
- `PLANT_MANAGER`
- `OPERATOR`
- `QC_TECHNICIAN`
- `WAREHOUSE_STAFF`

Seed users:

| Username | Password | Roles / Behavior |
|---|---|---|
| `admin` | `Admin@123!` | `EXECUTIVE`; multi-app chooser. |
| `plant.manager` | `Manager@123!` | `PLANT_MANAGER`, often also `EXECUTIVE`; multi-app chooser. |
| `qc.tech01` | `Quality@123!` | `QC_TECHNICIAN`; QMS inspection/result recording workflow. |
| `operator01` | `Operator@123!` | `OPERATOR`; direct MES redirect from Portal. |
| `warehouse.staff` | See realm export/live Keycloak | `WAREHOUSE_STAFF`; used in WMS auth verification. |

Auth flows:

- Unified Portal uses Authorization Code + PKCE with `portal-client`.
- MES Console uses Authorization Code + PKCE with `mes-client`.
- Kiosk Gateway uses Direct Access Grant through `mes-kiosk-gateway-service` against `mes-client`.
- WMS Kong routes use native Kong JWT verification against Keycloak RS256 token for WMS APIs.

Portal app-resolution policy from `implementation-fix/sso-flow-portal-hotfix.md`:

- Count role-entitled apps before filtering by deployment status.
- `0` role-entitled apps -> no-access page.
- Exactly `1` live role-entitled app -> direct redirect to that app.
- `2+` role-entitled apps -> render chooser.
- MES, WMS, and QMS are all deployed and live; multi-app users see all entitled live applications.
- Direct app URLs remain valid; each app owns its own Keycloak client and PKCE flow.

Key SSO hotfix outcome:

- H1 (`portal-client` points to MES) was not reproduced after audit; live and checked-in config point
  Portal to `:13000`.
- H2 was hardened: Portal now has explicit 0/1/2+ app-resolution logic and tests.
- Live Keycloak client URL/logout drift was normalized.
- On 2026-07-23 the live `wms-client` was corrected from the stale `:4001` origin to the deployed
  `:13091` WMS Console origin; the realm export and Portal defaults now match.
- Browser-only SSO reuse/logout visual check was not executed from CLI, but config and code paths were
  verified.

React Keycloak init rule:

- React StrictMode can mount components twice.
- Do not call `keycloak.init()` from multiple places.
- MES Console fixed `"A 'Keycloak' instance can only be initialized once."` by using idempotent init in
  `services/mes-console/src/context/AuthContext.tsx`.

Current three-console SSO verification:

- Portal `13000`, MES `13052`, WMS `13091`, and QMS `13130` all returned HTTP 200.
- Keycloak issued correctly scoped `portal-client`, `mes-client`, `wms-client`, and `qms-client` tokens.
- WMS and QMS Kong APIs rejected missing tokens with 401 and wrong-client tokens with 403.
- MES browser login and token-backed API calls work, but the legacy MES Kong routes currently accept
  unauthenticated requests and synthesize forwarded headers. This is an API gateway security gap for
  Phase 4, not a failure of the browser SSO flow. See `docs/SSO-USER-GUIDE-MES-WMS-QMS.md` and
  `implementation-fix/sso-mes-wms-qms-verification.md`.

Vite build-time env rule:

- Vite apps served by nginx cannot read runtime env vars after build.
- Any `VITE_*` value must be passed as Docker build arg.
- MES Console Docker build passes `VITE_KEYCLOAK_URL=http://100.68.50.41:18080`.

## 10. API Gateway

Kong config: `infra/kong/kong.yml`

Gateway behavior:

- DB-less declarative mode.
- Adds correlation IDs.
- MES routes generally use pre-function header forwarding/defaults.
- WMS routes use native Kong JWT plugin plus pre-function role extraction.
- Global OpenTelemetry plugin forwards traces to OTel Collector.
- `/api/hello` no longer exists.

Current routes:

| Kong Path | Service |
|---|---|
| `/api/mes/master-data` | `mes-master-data-service:3020` |
| `/api/mes/execution` | `mes-execution-service:3030` |
| `/api/mes/traceability` | `mes-traceability-service:3040` |
| `/api/mes/kiosk-gateway` | `mes-kiosk-gateway-service:3050` |
| `/api/wms/master-data` | `wms-master-data-service:3060` |
| `/api/wms/inventory` | `wms-inventory-service:3070` |
| `/api/wms/inbound` | `wms-inbound-service:3080` |
| `/api/wms/outbound` | `wms-outbound-service:3090` |
| `/api/qms/inspection` | `qms-inspection-service:3110` |
| `/api/qms/nonconformance` | `qms-nonconformance-service:3120` |

WMS auth closure rules:

- No WMS anonymous/default identity.
- No token returns `401`.
- Kong validates Keycloak token signature/expiry.
- WMS pre-function accepts expected app/client and forwards:
  - `X-User-ID = sub`
  - `X-Role-Code = first supported realm role`
  - `X-Trace-ID`

QMS auth closure rules:

- No QMS anonymous/default identity.
- No token returns `401`.
- Kong validates the Keycloak JWT signature and expiry.
- QMS pre-function requires `azp=qms-client`, accepts `QC_TECHNICIAN`, `PLANT_MANAGER`, or `EXECUTIVE`,
  and forwards `X-User-ID`, `X-Role-Code`, and `X-Trace-ID`.

MES gateway security status:

- MES browser consoles use Keycloak PKCE and token-backed requests can be made successfully.
- The current legacy MES Kong routes use pre-function forwarded-header/default behavior without the native
  JWT plugin used by WMS/QMS. A request without a bearer token can therefore reach MES master-data APIs.
- This is an explicit Phase 4 security gap. Adding the JWT plugin requires updating all MES frontend API
  clients to send the current bearer token in the same coordinated change.

## 11. Services and Ownership

### `mes-master-data-service`

Manifest: `services/mes-master-data-service/service.manifest.yaml`
Stack: Node.js, TypeScript, Express, Drizzle, PostgreSQL, KafkaJS, OTel.
Port: direct `13020` -> internal `3020`; Kong `/api/mes/master-data`.
Database: `mes_master_data_db`, host `mes-master-data-db`.

Owns:

- MES foundation/product/process/resource/labor/access master data.
- Does not own traceability config tables.
- Does not own kiosk terminals.
- Does not own execution transactions.

HTTP:

- `GET /api/mes/master-data/:resource`
- `GET /api/mes/master-data/:resource/:id`
- `POST /api/mes/master-data/:resource`
- `PATCH /api/mes/master-data/:resource/:id`
- `POST /api/mes/master-data/:resource/:id/release`
- `POST /api/mes/master-data/production-versions/:id/validate`
- `POST /api/mes/master-data/employee-schedules/bulk`
- `GET /api/mes/master-data/employee-schedules?work_center_id=&date=`
- `GET /api/mes/master-data/work-centers/:id/headcount`
- `GET /api/mes/master-data/employees/:id/skills`
- `PUT /api/mes/master-data/employees/:id/skills`

Publishes:

- `MES.MasterData.ItemRevisionReleased.v2`
- `MES.MasterData.MBOMReleased.v2`
- `MES.MasterData.RoutingReleased.v1`
- `MES.MasterData.ProductionVersionReleased.v1`
- `MES.MasterData.ProductionStandardReleased.v1`
- `MES.MasterData.WorkCenterActivated.v2`
- `MES.MasterData.EquipmentActivated.v2`
- `MES.MasterData.EmployeeCreated.v1`
- `MES.MasterData.ShiftCreated.v1`
- `MES.MasterData.EmployeeScheduleAssigned.v1`

Important notes:

- Step 8 introduced LocalizedText-capable `.v2` events for ItemRevision, MBOM, WorkCenter, Equipment.
- `.v1` schemas may remain registered; new consumers should use `.v2`.
- Validation rule #9 (Traceability) is delegated to `mes-traceability-service`.
- RoleCode/UserID are Keycloak references, not local foreign keys.

### `mes-traceability-service`

Stack: Go, Chi, pgx/v5, Kafka, OTel.
Port: direct `13040` -> internal `3040`; Kong `/api/mes/traceability`.
Database: `mes_traceability_db`.

Owns:

- Traceability policies.
- Numbering rules and atomic sequences.
- QR split rules.
- Label templates.
- Label instances.
- Immutable genealogy events.

Consumes:

- `MES.MasterData.ItemRevisionReleased.v2`
- `MES.MasterData.MBOMReleased.v2`

Publishes:

- `MES.Traceability.LabelIssued.v1`
- `MES.Traceability.QRSplitPerformed.v1`
- `MES.Traceability.GenealogyRecorded.v1`

Implemented behavior:

- Policy resolution.
- Mother label issuance.
- Atomic sequence increments.
- QR split with idempotency.
- Label consumption.
- Genealogy graph query.
- Local read models preserve LocalizedText JSONB from Master Data `.v2`.

### `mes-execution-service`

Stack: Go, Chi, pgx/v5, gobreaker, Kafka, OTel.
Port: direct `13030` -> internal `3030`; Kong `/api/mes/execution`.
Database: `mes_execution_db`.

Owns:

- Work orders.
- WO operations.
- WO material requirements.
- WO approval log.
- Execution sessions.
- Operation confirmations.
- Material consumption.
- WMS staging status/details on material requirements.

HTTP:

- `POST /api/mes/execution/work-orders`
- `POST /api/mes/execution/work-orders/:id/compute-check`
- `POST /api/mes/execution/work-orders/:id/approve`
- `POST /api/mes/execution/work-orders/:id/stage-materials`
- `POST /api/mes/execution/work-orders/:id/reject`
- `GET /api/mes/execution/work-orders/:id`
- `GET /api/mes/execution/work-orders`

Consumes:

- `MES.MasterData.ItemRevisionReleased.v2`
- `MES.MasterData.MBOMReleased.v2`
- `MES.MasterData.RoutingReleased.v1`
- `MES.MasterData.ProductionVersionReleased.v1`
- `MES.MasterData.ProductionStandardReleased.v1`
- `MES.MasterData.WorkCenterActivated.v2`
- `MES.MasterData.EquipmentActivated.v2`

Publishes:

- `MES.Execution.WOCreated.v1`
- `MES.Execution.WOApproved.v1`
- `MES.Execution.OperationStarted.v1`
- `MES.Execution.OperationFinished.v1`
- `MES.Execution.MaterialConsumed.v1`
- `MES.Execution.WOCompleted.v1`

Important behavior:

- Creates Draft WO by exploding MBOM and snapshotting routing.
- Computes standard time and capacity advisory.
- Approval performs freshness and permission checks through circuit-breaker guarded sync calls to
  `mes-master-data-service`.
- Stage B handles real-time start/finish/abort, backflush/manual consumption, traceability service calls,
  and auto-completion.
- Phase 2 Step 2 added `POST /stage-materials` as a retryable WMS staging action after WO release.
- `MES.Execution.MaterialConsumed.v1` additively carries `work_center_id` for WMS staging decrement.

### `mes-kiosk-gateway-service`

Stack: Go, WebSocket, PostgreSQL, Kafka, Keycloak integration.
Port: direct `13050` -> internal `3050`; Kong `/api/mes/kiosk-gateway`.
Database: `mes_kiosk_gateway_db`.

Owns:

- Terminal login/session gateway.
- WebSocket hub.
- Offline server-to-terminal message queue.
- Edge-facing integration for kiosk clients.

Key behavior:

- Direct Access Grant login through Keycloak.
- Kiosk WebSocket updates.
- Offline queue and reconnect behavior.
- Should remain separate from MES domain services.

### `kiosk-operator-ui`

Stack: React/Vite frontend served by Docker/nginx.
Port: `13051`.

Purpose:

- Shopfloor operator tablet/kiosk workflow.
- Pessimistic UI: no success before backend success.
- Three-layer error handling.
- Offline/connection status handling.
- i18n enabled after Phase 1 Step 8.

### `mes-console`

Stack: React/Vite/Tailwind/shadcn-style UI served by Docker/nginx.
Port: `13052`.
Auth: Keycloak `mes-client`.

Purpose:

- Planner/manager/admin desktop UI.
- MES master data admin.
- Labor resource management.
- WorkCenter CRUD and headcount.
- MBOM tree editor.
- Routing, Production Version, Tier2 admin.
- Work order list/create/detail, compute-check, approve/reject, material staging view.
- ErrorBoundary and 404 page.
- Language toggle; default Vietnamese.
- Industrial MES theme.

Known important fixes:

- Keycloak init is idempotent.
- `/master-data/routings` crash from undefined `.slice()` was fixed with defensive UI and ErrorBoundary.
- Static i18n coverage/hardcoded string audit was run and improved.
- Seed-data/localized-text enrichment scripts exist.

### `wms-master-data-service`

Stack: Node.js, TypeScript, Express, Drizzle, PostgreSQL, KafkaJS, OTel.
Port: direct `13060` -> internal `3060`; Kong `/api/wms/master-data`.
Database: `wms_master_data_db`.

Owns:

- `wms_warehouse`
- `wms_zone`
- `wms_storage_location`
- `wms_storage_bin`
- `wms_item_uom_mapping`
- Local `rm_item_revision` read model from MES.

Publishes:

- `WMS.MasterData.WarehouseCreated.v1`
- `WMS.MasterData.ZoneCreated.v1`
- `WMS.MasterData.LocationCreated.v1`
- `WMS.MasterData.StorageBinCreated.v1`
- `WMS.MasterData.ItemUOMMappingCreated.v1`

Consumes:

- `MES.MasterData.ItemRevisionReleased.v2`

Important rules:

- All translatable WMS fields use LocalizedText JSONB from day one.
- No direct queries to MES DB.
- WMS app runtime DB user has no DELETE grants on owned WMS master-data tables.
- Location model was patched with:
  - `location_purpose`: `Storage` or `WorkCenterStaging`
  - `staging_for_work_center_ref`: MES WorkCenter reference only
  - one staging location per WorkCenter

### `wms-inventory-service`

Stack: Go, PostgreSQL, Kafka.
Port: direct `13070` -> internal `3070`; Kong `/api/wms/inventory`.
Database: `wms_inventory_db`.

Owns:

- `inv_lot`
- `inv_balance`
- append-only `inv_stock_movement`
- `inv_discrepancy_log`

HTTP:

- `GET /api/wms/inventory/balances`
- `GET /api/wms/inventory/movements`
- `POST /api/wms/inventory/movements/receipt`
- `POST /api/wms/inventory/movements/transfer-to-staging`

Consumes:

- `MES.MasterData.ItemRevisionReleased.v2`
- `WMS.MasterData.LocationCreated.v1`
- `MES.Execution.MaterialConsumed.v1`

Rules:

- Balance changes only in same transaction as stock movement.
- Current balance is a projection of append-only movement ledger.
- Expired lots excluded from new allocation/consumption queries but visible for audit.
- `wms_inventory_user` has no DELETE on lot/balance/movement.
- `wms_inventory_user` has no UPDATE on movement.
- Consumption decrements WorkCenter staging by `work_center_id`.

### `wms-inbound-service`

Stack: Node.js, TypeScript, Express, PostgreSQL.
Port: direct `13080` -> internal `3080`; Kong `/api/wms/inbound`.
Database: `wms_inbound_db`.

Owns:

- Receipt header/lines.
- Inbound receiving workflow.

HTTP:

- `POST /api/wms/inbound/receipts`
- `POST /api/wms/inbound/receipts/:id/confirm`
- `GET /api/wms/inbound/receipts/:id`

Rules:

- Confirmed receipts call `wms-inventory-service` receipt API.
- Inbound receives into ordinary Warehouse `Storage` locations only.
- Direct receipt into `WorkCenterStaging` is rejected.

### `wms-outbound-service`

Stack: Go, PostgreSQL, Kafka.
Port: direct `13090` -> internal `3090`; Kong `/api/wms/outbound`.
Database: `wms_outbound_db`.

Owns:

- Material requests for WorkCenter staging.
- Shortage/allocation decisions.

HTTP:

- `POST /api/wms/outbound/material-requests`
- `GET /api/wms/outbound/material-requests/:id`

Consumes:

- `WMS.MasterData.LocationCreated.v1`

Publishes:

- `WMS.Outbound.MaterialStaged.v1`
- `WMS.Outbound.MaterialShortageDeclared.v1`

Rules:

- Staging-first allocation: check existing WorkCenter staging balance before Warehouse transfer.
- Transfer only the shortfall from Warehouse Storage to WorkCenter staging.
- Shortage is all-or-nothing per material line; no partial transfer when total available stock is below
  shortfall.
- Leftover staged stock stays at that WorkCenter and is reused by later requests.
- FEFO allocation from non-expired Warehouse Storage lots.

### `qms-inspection-service`

Stack: Node.js, TypeScript, Express, Drizzle, PostgreSQL, KafkaJS, OTel, `opossum`.
Port: direct `13110` -> internal `3110`; Kong `/api/qms/inspection`.
Database: `qms_inspection_db`, host port `15442`.

Owns:

- Inspection plans and release validation.
- Inspection characteristics, defect codes, result headers, and result details.
- MES item-revision/local reference projections needed for plan validation.
- Inspection result evaluation and quality outbox events.

HTTP capabilities:

- Defect-code list/create/update.
- Inspection plan list/detail/create/update/release.
- Characteristic list/create/update.
- Result list/detail/record with server-side pass/fail recomputation.

Consumes:

- `MES.MasterData.ItemRevisionReleased.v2`.
- `MES.Execution.OperationFinished.v1`.

Publishes:

- `QMS.Inspection.InspectionPlanReleased.v1`.
- `QMS.Inspection.InspectionResultRecorded.v1`.
- `QMS.Inspection.InspectionFailed.v1`.

Rules:

- Only operations resolved as `operation_type=Inspection` create draft results; `OP-QC` is not hardcoded.
- Draft creation is idempotent by source event ID.
- Release validation checks characteristics, variable bounds/UOM, MES references, operation type, and
  duplicate effective plans.
- MES reference validation uses the circuit-breaker baseline and emits OTel state transitions.

### `qms-nonconformance-service`

Stack: Node.js, TypeScript, Express, PostgreSQL, KafkaJS, OTel.
Port: direct `13120` -> internal `3120`; Kong `/api/qms/nonconformance`.
Database: `qms_nonconformance_db`, host port `15443`.

Owns:

- NCR headers and lifecycle state.
- Append-only disposition history with one active disposition per NCR.
- CAPA records, verification/closure audit, and NCR/CAPA links.
- Atomic per-site NCR/CAPA numbering and outbox events.

HTTP capabilities:

- NCR list/detail/create/update/disposition.
- CAPA list/detail/create/update/link/verify/close.

Consumes:

- `QMS.Inspection.InspectionFailed.v1`.

Publishes:

- `QMS.Nonconformance.NCRRaised.v1`.
- `QMS.Nonconformance.NCRDispositioned.v1`.
- `QMS.Nonconformance.CAPAClosed.v1`.

Rules:

- Inspection-failure consumption uses advisory locking and unique `source_event_id`; duplicate Kafka
  delivery cannot create a second NCR.
- Defect severity maps `Critical > Major > Minor`; legacy events without a category conservatively use
  `Major`.
- There is no DELETE endpoint or delete database privilege.
- CAPA closure is allowed only from `Verified`; same-person verification is retained as an audit flag.

### `qms-console`

Stack: React 18, Vite, TypeScript, Tailwind, Radix/shadcn-style primitives, TanStack Query/Table,
Keycloak-js, Docker/nginx.
Port: host `13130` -> container `80`.
Auth: Keycloak PKCE with realm `wonsealtech`, client `qms-client`.

Screens/workflows:

- Dashboard and inspection plan list/detail/release.
- Defect-code list.
- Pending/pass/fail/history inspection result queue and result recording.
- NCR list/detail/disposition.
- CAPA list/detail/create/link/verify/close.

UI rules delivered:

- Vietnamese default with VI/EN/JA/KO locale support; QMS-specific JA/KO fallback quality flags are
  tracked in the MES translation review queue.
- Shared data table defaults to 10 rows with 10/50/100 options and URL-persisted query/page/page-size.
- Mutations use action-specific pessimistic confirmation dialogs.
- Route ErrorBoundary and 404 page are enabled.
- Page-detail modal content is client-only and describes purpose, usage, fields, and status meanings.
- QMS and WMS currently have local copies of the shared primitives; extracting `libs/console-ui-shared`
  is deferred to Phase 4 to avoid deployment import-graph drift.

## 12. WMS Two-Echelon Inventory Rule

This is permanent domain architecture:

- WMS inventory uses two echelons:
  - Central Warehouse `Storage` locations.
  - Per-WorkCenter `WorkCenterStaging` locations.
- `wms_storage_location.location_purpose` distinguishes `Storage` and `WorkCenterStaging`.
- `wms_storage_location.staging_for_work_center_ref` stores the MES WorkCenter reference for staging.
- Material requests check existing WorkCenter staging stock first.
- Only shortfall is transferred from Warehouse Storage.
- Leftover staged material is not automatically returned to Warehouse.
- Consumption events from MES decrement the correct WorkCenter staging location.
- Expired lots are not allocated for new requests.
- FEFO is used for Warehouse transfers.

Canonical verification from Phase 2 Step 2:

1. Receipt 100 sheets into Storage.
2. Outbound request 60 to WorkCenter staging -> transferred 60.
3. Warehouse balance 40, staging balance 60.
4. MES consumption event for 40 with `work_center_id` -> staging becomes 20.
5. Second request for 15 -> already staged 20, no transfer.
6. Request 1000 -> `409 INSUFFICIENT_STOCK`.
7. Expired-only request -> `409 INSUFFICIENT_STOCK`, available 0.
8. FEFO lots `2026-08-01` qty 30 and `2026-11-01` qty 50, request 40 -> transfers 30 then 10.

## 13. i18n Platform

Phase 1 Step 8 and Step 8a implemented platform i18n:

- Supported locales: Vietnamese (`vi`), English (`en`), Japanese (`ja`), Korean (`ko`).
- Vietnamese is the default UI locale.
- `LocalizedText` contract exists in TypeScript shared kernel.
- Go shared kernel has equivalent i18n contract.
- `libs/i18n-ui-shared` provides frontend i18n provider/hooks.
- MES master data schemas/events were retrofitted to LocalizedText where fields are translatable.
- Go services preserve LocalizedText JSONB read models.
- Portal, MES Console, and Kiosk have locale support.
- WMS Console and QMS Console also support VI/EN/JA/KO with Vietnamese default; QMS-specific JA/KO
  fallback entries are tracked as two OPEN review flags.
- Static coverage scanner exists: `npm run i18n:scan`.
- MES audit script exists: `npm run i18n:audit:mes`.
- Seed enrichment script exists: `npm run i18n:seed:enrich:mes`.
- ADR: `docs/adr/0002-i18n-completeness-governance.md`.
- Checklist: `docs/i18n/coverage-checklist.md`.

i18n governance:

- Before any cluster/console is marked complete, hardcoded string scan should have zero unexplained
  exemptions.
- Any migration from scalar text to LocalizedText must use data quality heuristic/backfill and track flags
  through review queue.
- New WMS/QMS features must use LocalizedText from the first migration for translatable fields.

Step 8a delivered:

- MES static i18n gap fixes.
- `i18n_data_quality_flag` sidecar table/API.
- MES Translation Review Queue.
- Audit script for mislabeled Vietnamese.
- Seed-data language enrichment migration/script.
- Frontend hardcoded UI string scanner.
- ADR governance update.

## 14. Implementation Reports

Implementation records are important because they reflect what was actually delivered.

### Phase 0 - Platform Foundation

Trace: `implementation/phase-0-platform-foundation.md`

Delivered:

- Kafka KRaft.
- Schema Registry.
- Keycloak realm and clients.
- Kong API Gateway.
- Observability stack.
- Shared kernel.
- Unified Portal.
- Temporary Hello World validator, now decommissioned.

Verification:

- Platform containers healthy.
- Keycloak realm available.
- Portal login/render verified.
- SSO/SLO historically verified.
- Tempo/Grafana verified.

### Phase 1 Step 1 - MES Master Data

Trace: `implementation/phase-1-mes-master-data-service.md`

Delivered:

- `mes-master-data-service`.
- 26+ master-data tables.
- Validation Engine.
- Event outbox.
- Service manifest.
- Docker/Compose/Kong route.
- Seed data for representative product flow.

### Phase 3 Step 1 - QMS Inspection Service

Trace: `implementation/phase-3-1-qms-inspection-service.md`

Delivered:

- `qms-inspection-service` with owned `qms_inspection_db`.
- Inspection plan, characteristic, defect-code, result, and result-detail tables with LocalizedText fields.
- Release checklist returning all validation errors, including Inspection operation and effective-plan rules.
- Server-side result evaluation with mandatory-characteristic and variable-spec validation.
- MES master-data local projections and `MES.Execution.OperationFinished.v1` consumer.
- Idempotent draft inspection creation keyed by source event ID; no hardcoded `OP-QC` filter.
- `QMS.Inspection.InspectionPlanReleased.v1`, `InspectionResultRecorded.v1`, and `InspectionFailed.v1`.
- QMS-specific Kong JWT route for `qms-client` and QC/manager roles.

Verification:

- QMS TypeScript typecheck/build passed.
- MES execution Go tests passed after enriching the OperationFinished payload.
- Docker Compose config passed; QMS database/service started healthy.
- Direct health endpoint returned `200`; gateway route returned `401` without a bearer token.

Key implementation:

- Node.js/TypeScript/Express/Drizzle.
- Lifecycle state and audit columns.
- Optimistic row versions.
- Release events for item revision, MBOM, routing, production version, standards, work centers, equipment.

### Phase 3 Step 2 - QMS Nonconformance Service

Trace: `implementation/phase-3-2-qms-nonconformance-service.md`

Delivered:

- `qms-nonconformance-service` with owned `qms_nonconformance_db`, NCR numbering rules/sequences,
  NCR header, disposition history, CAPA, and NCR/CAPA link tables.
- Atomic per-site NCR/CAPA codes (`NCR-YYYYMMDD-00001` and `CAPA-YYYYMMDD-00001`) allocated with
  PostgreSQL insert/upsert `RETURNING` semantics.
- Inspection-failure Kafka consumer with advisory-lock and unique `source_event_id` idempotency;
  inspection failures map the producer's worst defect category to NCR severity; legacy events without a
  category conservatively use `Major`.
- Manual NCR, disposition, CAPA, link, verify, and close APIs with role restrictions, optimistic row
  versions, outbox events, and no DELETE endpoint.
- Kong route `/api/qms/nonconformance` using the existing QMS Keycloak JWT/prefunction policy.
- Full QMS demo data is seeded with `npm run seed:qms:demo`; trace:
  `implementation/qms-demo-seed-data.md`. The idempotent seed covers four plan states, Attribute/Variable
  characteristics, pending/pass/fail/history results, all defect severities, NCR/disposition states, CAPA
  states, and NCR/CAPA links without emitting Kafka events.

Verification:

- TypeScript typecheck/build passed; Docker Compose rebuilt and started the service and owned database.
- Service health returned `ok` from inside the container; Kafka consumer joined the
  `QMS.Inspection.InspectionFailed.v1` group; database reported healthy.
- Kong was force-recreated with the new route configuration. Direct host curl can be unavailable in
  this restricted runtime, so gateway response verification is retained as an environment check.

### Phase 3 Step 3 - QMS Console

Trace: `implementation/phase-3-3-qms-console.md`

Delivered:

- React/Vite QMS Console on `13130` with `qms-client` PKCE authentication.
- Inspection plan/detail/release, defect-code, result queue/recording, NCR/disposition, and CAPA
  create/link/verify/close workflows.
- Vietnamese default, VI/EN/JA/KO locale support, industrial navy/slate/amber theme, shared UI
  primitives, route ErrorBoundary, 404 page, page-detail modal, and pessimistic mutation confirmations.
- Shared 10/50/100 pagination with URL persistence for plans, defect codes, results, NCR, and CAPA.
- QMS JA/KO fallback registration into the MES translation review queue.

Verification:

- QMS Console typecheck and production build passed.
- Full QMS Compose topology is running on `13110`, `13120`, and `13130`, with databases healthy on
  `15442` and `15443`.
- Deterministic idempotent QMS demo seed ran successfully twice; it covers plan states, characteristics,
  results, defects, NCR/disposition, CAPA, and links without emitting Kafka events.
- Real MES `OP-QC` FAIL -> `InspectionFailed.v1` -> Critical NCR and duplicate-redelivery idempotency are
  verified in the QMS nonconformance implementation trace.

### Phase 1 Step 2 - MES Traceability

Trace: `implementation/phase-1-2-mes-traceability-service.md`

Delivered:

- Traceability service in Go.
- Label template, numbering rule, numbering sequence, QR split rule, traceability policy.
- Label instance and genealogy event runtime tables.
- Local read models for item revisions/MBOM.
- Atomic sequence generation.
- Idempotent split engine.
- Label issue/split/consume and genealogy APIs.
- Outbox events.

Acceptance passed:

- Policy resolution.
- Mother label issue.
- Atomic sequence increment.
- QR split.
- Idempotency.
- Consumption.
- Genealogy graph.
- Kafka outbox publish.
- Kong route header forwarding.

### Phase 1 Step 3 - MES Execution Stage A

Trace: `implementation/phase-1-3-mes-execution-service.md`

Delivered:

- Go `mes-execution-service` Stage A.
- `libs/shared-kernel-go`.
- WorkOrder domain model.
- Demand, readiness, create WO, compute/check, approve use cases.
- Local read models from Master Data.
- `MES.Execution.WOCreated.v1` and `MES.Execution.WOApproved.v1`.

Verification:

- `go test ./...`.
- Master Data events projected into execution DB.
- WO creation and approval through Kong.
- Outbox events published.

### Phase 1 Step 4 - MES Execution Stage B

Trace: `implementation/phase-1-4-mes-execution-service-b.md`

Delivered:

- Real-time operation execution.
- Execution sessions.
- Operation confirmations.
- Material consumption ledger.
- Traceability client with circuit breaker.
- Backflush and manual scan material consumption.
- Operation start/finish and WO completion events.

Acceptance passed:

- Create/approve WO.
- `OP-MIX` label issue.
- `OP-PREP` manual scan.
- `OP-CUT` QR split.
- `OP-MOLD` child consume and FG label issue.
- `OP-TRIM` good/scrap.
- `OP-QC` PASS label.
- Auto-completion.
- Outbox publish.

### Phase 1 Step 5 - Kiosk Gateway and UI

Trace: `implementation/phase-1-5-mes-kiosk-gateway.md`

Delivered:

- `mes-kiosk-gateway-service`.
- Keycloak Direct Access Grant login.
- WebSocket hub.
- Offline queue.
- Kiosk Operator UI.
- Offline banner and error boundary.
- Kiosk routes for login, WO list, operation screen.

Rules:

- Kiosk must be pessimistic.
- No success UI before backend success.
- Offline/connection states must be explicit.

### Phase 1 Step 6 - MES Console

Trace: `implementation/phase-1-6-mes-console.md`

Delivered:

- MES Console app.
- Navbar/sidebar/auth context.
- Items, MBOM, Routing, Production Version, Tier2 admin.
- WO list/create/detail.
- Role-gated approval/rejection.
- 503 circuit breaker retry UI.
- Confirmation and comment checks for rejection.

Later hotfixes extended it with:

- ErrorBoundary and 404.
- Shadcn-style common UI components.
- Industrial theme.
- i18n coverage.
- WorkCenters, Employees, Shifts, Work Calendar screens.

### Phase 1 Step 7 - Labor Resource Management

Trace: `implementation/phase-1-7-labor-resource-management.md`

Delivered:

- `md_employee`
- `md_skill`
- `md_employee_skill`
- `md_shift`
- `md_employee_shift_schedule`
- WorkCenter full CRUD.
- Employee/Shift/Work Calendar UI.
- WorkCenter create/edit/headcount UI.
- MBOM UI fix and routing alias fix.

Known design:

- Employee multi-skill assignment implemented.
- WorkCenter eligibility remains simple through employee default WorkCenter.
- Explicit per-day schedule rows instead of recurrence rules.
- Compute/check labor capacity remains follow-up.

### Phase 1 Step 8 - i18n Platform Foundation

Trace: `implementation/phase-1-8-i18n-platform-foundation.md`

Delivered:

- Shared LocalizedText contracts in TS/Go.
- React i18n shared package.
- MES master-data schema/event retrofits.
- Read model updates in Go services.
- Locale switchers in Portal/MES/Kiosk.
- VI/EN/JA/KO resources.

Manual checks remaining in trace:

- Some SSO/label-print browser checks may require manual UI verification.

### Phase 1 Step 8a - i18n Coverage and Data Quality Hotfix

Trace: `implementation/phase-1-8a-i18n-coverage-data-quality-hotfix.md`

Delivered:

- Static string coverage fixes.
- Data quality flag table/API.
- Translation Review Queue.
- Audit/enrichment scripts.
- ADR and checklist.

### Phase 2 Step 1 - WMS Master Data

Trace: `implementation/phase-2-1-wms-master-data-service.md`

Delivered:

- First WMS service.
- Warehouse, Zone, Location, Storage Bin, Item UOM mapping.
- Local MES ItemRevision read model.
- LocalizedText JSONB from first migration.
- WMS master-data events.
- Kong route `/api/wms/master-data`.
- Closure fixed WMS auth, DB grants, and observability traces.

Closure evidence:

- No token returns 401 at Kong.
- WMS DB runtime user has no DELETE grants.
- Tempo trace captured Kong/WMS/DB spans.
- Full four-locale round trip verified.

### Phase 2 Step 2 - WMS Inventory / Inbound / Outbound

Trace: `implementation/phase-2-2-wms-inventory-stock.md`

Delivered:

- WMS storage vs WorkCenter staging location patch.
- `wms-inventory-service`.
- `wms-inbound-service`.
- `wms-outbound-service`.
- MES `stage-materials` integration.
- `stock_check_status` and `stock_check_detail`.
- Additive `work_center_id` in material consumed event.
- Compose/Kong wiring for WMS services.

Acceptance passed:

- Storage/staging validation.
- DB security grants.
- Canonical staging/consumption/reuse flow.
- Shortage.
- Expiry filtering.
- FEFO allocation.

### SSO Flow Portal Hotfix

Trace: `implementation-fix/sso-flow-portal-hotfix.md`

Delivered:

- Explicit Portal app resolution module.
- Unit tests for 0/1/2+ app decisions.
- Portal direct redirect for single live app.
- Multi-app chooser for Plant Manager/Admin.
- Live Keycloak URL/logout normalization.
- AI rule update for `process-fix/` -> `implementation-fix/`.

### Three-console SSO Verification

Trace: `implementation-fix/sso-mes-wms-qms-verification.md`

Verified on 2026-07-23:

- Portal `13000`, MES `13052`, WMS `13091`, and QMS `13130` returned HTTP 200.
- Keycloak issued correctly scoped tokens for `portal-client`, `mes-client`, `wms-client`, and
  `qms-client`; WMS/QMS APIs rejected missing tokens with 401 and wrong-client tokens with 403.
- Portal WMS/QMS defaults and cards were corrected to live ports/status, and live/checked-in `wms-client`
  redirect/logout origins were corrected from `4001` to `13091`.
- User-facing flow is documented in `docs/SSO-USER-GUIDE-MES-WMS-QMS.md`.
- Remaining gap: legacy MES Kong routes do not yet enforce bearer JWT at the gateway; this is a Phase 4
  security task requiring coordinated MES frontend Authorization-header changes.

### Circuit Breaker Hardening Hotfix

Trace: `implementation-fix/circuit-breaker-hardening.md`

Prompt: `implementation-fix/Circuit-breaker-audit.md`

Delivered:

- Full source audit of outbound synchronous HTTP calls between MES/WMS services.
- Shared Go circuit-breaker helper in `libs/shared-kernel-go/circuit_breaker.go`.
- Standard Go baseline via `gobreaker`:
  - Minimum request volume: 4.
  - Failure threshold: >= 50%.
  - Open timeout: 30s.
  - Half-open trial requests: 2.
  - Retryable dependency error wrapper.
  - OTel span `circuit_breaker.state_change`.
  - OTel metric `circuit_breaker_state_changes_total`.
- Node baseline via `opossum` for `wms-inbound-service`:
  - `volumeThreshold: 4`.
  - `errorThresholdPercentage: 50`.
  - `resetTimeout: 30_000`.
  - `timeout: 10_000`.
  - 4xx responses filtered as business errors.
  - OTel span and metric for state transitions.

Hardened dependencies:

| Caller | Dependency | Endpoint(s) | Result |
|---|---|---|---|
| `mes-execution-service` | `mes-master-data-service` | approval freshness/permission check | Shared breaker, bounded client timeout, no swallowed connection failures, 503 retryable response. |
| `mes-execution-service` | `mes-traceability-service` | label issue/split/consume | Shared breaker, 5xx/network retryable, 4xx business errors, OP-QC PASS-label failures now propagate. |
| `mes-execution-service` | `wms-outbound-service` | `POST /api/wms/outbound/material-requests` | Shared breaker, shortage remains business result, 503 retry UI preserved. |
| `wms-outbound-service` | `wms-inventory-service` | `GET /balances`, `POST /transfer-to-staging` | Shared breaker, 503 inventory-unavailable response, duplicate staging protection. |
| `wms-inbound-service` | `wms-inventory-service` | `POST /movements/receipt` | Opossum breaker, 503 retryable failures, receipt remains Draft on rollback. |
| `mes-kiosk-gateway-service` | `platform-keycloak` | token endpoint | Shared breaker, Keycloak 5xx/network returns 503, invalid credentials remain 401. |

Stage-materials idempotency rule:

- `wms-outbound-service` serializes duplicate material staging requests with
  `pg_advisory_xact_lock(hashtext(idempotencyKey))`.
- Idempotency key shape: `wo_id + work_center_ref + item_revision_id + required_qty`.
- While the lock is held, the service checks for an existing `material_request` and returns it.
- Repeated calls must not double-transfer warehouse stock to WorkCenter staging.

Intentionally left outside this hotfix:

- Browser UI `fetch` calls. These are user-agent calls, not server-to-server business dependencies.
- Schema Registry bootstrap registration calls. These are platform startup/infrastructure calls and should
  be handled by a separate startup resilience policy if needed.

Verification passed:

- `env GOCACHE=/tmp/go-build-cache /usr/local/go/bin/go test ./...` in:
  - `libs/shared-kernel-go`
  - `services/mes-execution-service`
  - `services/wms-outbound-service`
  - `services/mes-kiosk-gateway-service`
- `npm run test --workspace=wms-inbound-service`
- `npm run build --workspace=wms-inbound-service`

Manifest updates:

- `services/mes-execution-service/service.manifest.yaml`
- `services/wms-outbound-service/service.manifest.yaml`
- `services/wms-inbound-service/service.manifest.yaml`
- `services/mes-kiosk-gateway-service/service.manifest.yaml`

## 15. Runtime Ports

Current important local/external ports:

| Component | URL |
|---|---|
| Unified Portal | `http://100.68.50.41:13000` or `http://127.0.0.1:13000` |
| Grafana | `http://100.68.50.41:13001` |
| MES Master Data | `http://127.0.0.1:13020` |
| MES Execution | `http://127.0.0.1:13030` |
| MES Traceability | `http://127.0.0.1:13040` |
| MES Kiosk Gateway | `http://127.0.0.1:13050` |
| Kiosk Operator UI | `http://100.68.50.41:13051` |
| MES Console | `http://100.68.50.41:13052` |
| QMS Inspection | `http://127.0.0.1:13110` |
| QMS Nonconformance | `http://127.0.0.1:13120` |
| QMS Console | `http://100.68.50.41:13130` |
| WMS Master Data | `http://127.0.0.1:13060` |
| WMS Inventory | `http://127.0.0.1:13070` |
| WMS Inbound | `http://127.0.0.1:13080` |
| WMS Outbound | `http://127.0.0.1:13090` |
| WMS Console | `http://100.68.50.41:13091` |
| Loki | `http://127.0.0.1:13100` |
| Tempo | `http://127.0.0.1:13200` |
| OTel gRPC | `127.0.0.1:14317` |
| OTel HTTP | `http://127.0.0.1:14318` |
| Kong Proxy | `http://100.68.50.41:18000` |
| Kong Admin | `http://127.0.0.1:18001` |
| Keycloak | `http://100.68.50.41:18080` |
| Schema Registry | `http://127.0.0.1:18081` |
| Kafka UI | `http://127.0.0.1:18082` |
| Prometheus | `http://127.0.0.1:19090` |
| Kafka host bootstrap | `localhost:19092` |

Database host ports:

| DB | Host Port |
|---|---:|
| `mes_master_data_db` | `15434` |
| `mes_execution_db` | `15435` |
| `mes_traceability_db` | `15436` |
| `mes_kiosk_gateway_db` | `15437` |
| `wms_master_data_db` | `15438` |
| `wms_inventory_db` | `15439` |
| `wms_inbound_db` | `15440` |
| `wms_outbound_db` | `15441` |
| `qms_inspection_db` | `15442` |
| `qms_nonconformance_db` | `15443` |

## 16. Common Verification Commands

Root:

```bash
npm run typecheck --workspaces --if-present
npm run lint --workspaces --if-present
npm run test --workspaces --if-present
```

i18n:

```bash
npm run i18n:scan
npm run i18n:audit:mes
npm run i18n:seed:enrich:mes
```

Portal:

```bash
npm run test --workspace=mom-unified-portal
npm run build --workspace=mom-unified-portal
npm run lint --workspace=mom-unified-portal
```

WMS master data:

```bash
npm run build --workspace=wms-master-data-service
npm run test --workspace=wms-master-data-service
```

WMS inbound:

```bash
npm run build --workspace=wms-inbound-service
npm run test --workspace=wms-inbound-service
```

WMS demo data:

```bash
npm run seed:wms:demo
```

This seed script is documented in `implementation/wms-demo-seed-data.md`. It reads MES master data
references where available, then upserts WMS master data, inventory lots/balances/movements,
inbound receipts, outbound material requests, and discrepancy examples across `2026-04-23` through
`2026-07-22`.

QMS services and console:

```bash
npm run typecheck --workspace=qms-inspection-service
npm run build --workspace=qms-inspection-service
npm run test --workspace=qms-inspection-service
npm run typecheck --workspace=qms-nonconformance-service
npm run build --workspace=qms-nonconformance-service
npm run test --workspace=qms-nonconformance-service
npm run typecheck --workspace=qms-console
npm run build --workspace=qms-console
npm run seed:qms:demo
```

Go services:

```bash
go test ./...
```

Run stack:

```bash
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml up -d --build <service>
docker compose -f infra/docker-compose.platform.yml -f infra/docker-compose.yml logs --tail=100 <service>
```

## 17. Current Known Caveats

### Open Issues and Next Actions

| Priority | Issue / risk | Current impact | Next action / owner |
|---|---|---|---|
| High | MES Kong routes lack native bearer-JWT enforcement | MES APIs can be reached without a bearer token because legacy routes synthesize forwarded identity headers. | Phase 4 security task: add JWT/client/role policy and update every MES frontend API client to send `Authorization`. |
| Medium | QMS JA/KO strings use shared English fallback | QMS locale switching works, but QMS-specific translations are incomplete. | Translate the QMS dictionaries and close the two OPEN `qms_console_i18n_resource` review flags. |
| Medium | Browser-only SSO/SLO visual flow | CLI proved URLs, token issuance, and gateway responses, but not browser tab reuse/front-channel logout fan-out. | Run Playwright/manual browser verification across Portal -> MES/WMS/QMS and logout. |
| Medium | Historical `OperationFinished` events lack enriched context | Old Kafka messages are ignored by QMS inspection consumption rather than creating incomplete drafts. | Retain compatibility policy; use newly enriched MES events for production flow and replay only with an explicit migration plan. |
| Medium | Schema Registry additive compatibility warning in dev | Some WMS additive schema registration can return dev HTTP 409; the service logs a warning where no live consumer exists. | Resolve registry compatibility policy before external consumers or production promotion. |
| Low | WMS/QMS duplicate local UI primitives | No runtime failure; shared controls can drift between consoles. | Consider `libs/console-ui-shared` extraction during Phase 4 after import/deployment compatibility tests. |
| Low | QMS service manifest coverage | QMS implementation is running and documented, but service manifests should be added if the platform service registry requires every service to have one. | Add manifests and include them in the service inventory/contract validation workflow. |

The only active milestone is Phase 4 Platform E2E Integration. It must cover MES -> WMS material
staging/consumption, MES -> QMS inspection failure/NCR, cross-console SSO/SLO, contract compatibility,
load behavior, gateway security, circuit-breaker behavior, and observability evidence. Do not mark Phase 4
complete from UI health checks alone.

- QMS Inspection, Nonconformance, and Console are implemented; real FAIL-to-NCR and duplicate redelivery evidence is in the Phase 3 traces.
- QMS-specific Japanese/Korean console strings currently use the shared English fallback and have two
  OPEN quality flags in the MES translation review queue; this is tracked data-quality work, not a missing
  locale switch.
- MES Console is Vite/React in current code even though older strategy preferred Remix for business
  consoles.
- Product overview file is current through QMS Console Step 3b; Phase 4 remains the next workload.
- Historical prompts may mention Hello World; it is removed from active runtime/source.
- Some browser-only SSO/SLO checks cannot be proven from CLI alone; use Playwright/browser if required.
- Step 2 WMS known note: dev Schema Registry may reject additive `WMS.MasterData.LocationCreated.v1`
  fields under current compatibility mode; service treats that specific dev 409 as warning because no
  live external consumer existed before Step 2. Do not generalize this into a no-version-bump rule.
- Root Compose includes QMS, but a platform/MES-only Compose command does not start QMS; use the root
  Compose file or add `infra/docker-compose.qms.yml` explicitly when verifying all three clusters.

## 18. Working Rules For Future AI Agents

Before implementing anything:

1. Read this file.
2. Read `process/PROJECT_WORKLOAD_PROGRESS.md`.
3. Read the relevant prompt in `process/` or `process-fix/`.
4. Read the relevant implementation record:
   - Roadmap prompts in `process/` write/update `implementation/`.
   - Hotfix/regression prompts in `process-fix/` write/update `implementation-fix/`.
5. Read target service manifest.
6. Inspect source code, migrations, Dockerfile, compose, and Kong route.
7. Run `git status --short`; worktree may be dirty with user/previous-agent changes.
8. Never revert unrelated user changes.

Implementation trace rule:

- If the task comes from `process/Phase-X...`, write/update `implementation/...`.
- If the task comes from `process-fix/...`, write/update `implementation-fix/...`.
- Do not renumber workload for hotfix/regression prompts.
- Update `process/PROJECT_WORKLOAD_PROGRESS.md` only when the milestone status genuinely changes.

Architecture rules:

- No cross-service DB reads.
- No shared DB ownership.
- Use local read models or explicit APIs.
- Use circuit breakers for synchronous service dependencies.
  - Go services use `libs/shared-kernel-go.NewCircuitBreaker` unless there is a documented exception.
  - Node services use `opossum` or an equivalent proven library, not a custom breaker.
  - Default baseline: >=50% failure ratio after at least 4 requests, open timeout about 30s, half-open 1-3
    probes.
  - Open/downstream-unavailable dependencies must return explicit retryable errors and service-level 503
    responses, not silent success.
  - Breaker state transitions must emit OTel telemetry through the existing collector path.
- Use outbox for meaningful state changes.
- Preserve event compatibility or version event names.
- Service manifests must be kept current.
- New translatable fields use LocalizedText from day one.
- New UI must use shared i18n and no unexplained hardcoded strings.
- WMS stock must follow two-echelon staging rule.
- Keycloak is the SSO source of truth.
- Portal chooser policy must preserve multi-app chooser behavior.

Cleanup/decommission rules:

- Removing a service requires:
  - Delete source/workspace package.
  - Remove compose service, DB, volumes.
  - Remove Kong route.
  - Remove package-lock/workspace entries.
  - Update AI context and implementation trace if relevant.
  - Stop/remove running containers, images, and obsolete DB volumes.
  - Verify compose config and route removal.

## 19. Next Workload Direction

Immediate next milestone:

- Phase 3 Step 3 QMS Console (inspection queue, result recording, NCR, disposition, and CAPA UI) is complete.
- Phase 4 Platform E2E Integration is the next workload.
- Phase 4 cross-cluster E2E integration, load/security/chaos hardening.
- Step 3b trace: `implementation/phase-3-3-qms-console.md`; optional `libs/console-ui-shared` extraction is
  a Phase 4 anti-drift follow-up because WMS/QMS currently have identical local primitive APIs.
- Current cross-console SSO behavior and role/user flow: `docs/SSO-USER-GUIDE-MES-WMS-QMS.md`.
- Latest SSO audit: `implementation-fix/sso-mes-wms-qms-verification.md`; it records the corrected live
  WMS client URL and the remaining MES Kong bearer-auth gap.
