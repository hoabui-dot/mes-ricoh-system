# Claude: Báo cáo tích hợp Domain Event và Transactional Outbox từ MES sang WMS

**Ngày audit:** 2026-08-04  
**Run ID:** `20260804T083809Z`  
**Chế độ:** `READ_ONLY_AUDIT`  
**Phạm vi:** MES → WMS và các phản hồi WMS → MES bắt buộc để khép kín workflow  
**Trạng thái triển khai:** Chưa triển khai integration trong task này

## 1. Tóm tắt điều hành

MES hiện đã dùng Transactional Outbox trong ba bounded context: Master Data, Execution và Traceability. Các thay đổi nghiệp vụ và outbox record nhìn chung được ghi trong cùng database transaction. Application relay sau đó publish event lên Kafka. Không tìm thấy CDC trực tiếp trên business table và không có cross-service database read trong đường tích hợp chuẩn.

Tuy nhiên, kiến trúc hiện tại chưa đủ để WMS vận hành độc lập và an toàn:

- WMS chưa nhận đầy đủ Item, UOM, UOM Conversion, Material Group, lifecycle/effectivity và inventory-control policy.
- `ItemRevisionReleased.v2` đã có nhưng chưa phải một projection contract đầy đủ cho kho.
- `WOApproved`, `MaterialStagingRequested`, `MaterialConsumed` và traceability events mới bao phủ một phần material/output lifecycle.
- Envelope chỉ có sáu trường, thiếu aggregate version, correlation, causation, schema version và partition key.
- Outbox đảm bảo atomic write nhưng thiếu metadata, replay, retention, alerting và stable ordering key.
- Relay TypeScript dùng `FOR UPDATE SKIP LOCKED` ngoài explicit transaction, nên claim không được giữ xuyên suốt publish/update.
- MES result consumer cho WMS staging có nguy cơ commit Kafka offset trước khi database update bền vững; chưa có inbox, stale/version/conflict và unknown-aggregate policy.
- Không có snapshot watermark và reconciliation contract để bootstrap WMS sau MES.

Catalog chuẩn gồm **46 contract**, trong đó **6 contract đúng tên/ngữ nghĩa hiện đã có**, **4 dòng catalog có partial equivalent qua 3 event surface hiện hữu**, và **10 event P0 còn thiếu hoặc chỉ partial**. Blueprint đủ chi tiết để bắt đầu implementation, nhưng hệ thống chưa sẵn sàng production integration.

## 2. Phạm vi và nguyên tắc audit

Task này chỉ đọc source, schema, manifests, seed, test, Kafka metadata và runtime database counts. Không sửa source, migration, seed, topic, outbox row, runtime data, test hay deployment.

Nguyên tắc bắt buộc:

1. MES sở hữu product identity, revision, UOM, production definition, Work Order, execution và production traceability.
2. WMS sở hữu warehouse topology, stock, lot balance, reservation, movement, putaway, picking và replenishment.
3. WMS dùng local projection; không đọc database MES.
4. Request/command không được gọi là completed fact.
5. Business transaction và event phải được ghi atomically qua outbox.
6. Consumer phải idempotent vì outbox relay là at-least-once.
7. Draft/InReview không dùng cho warehouse operation; chỉ Released và currently effective là operational.
8. Inactive/Obsolete phải được đồng bộ như deactivation/tombstone, không hard-delete projection history.

## 3. Nguồn đã kiểm tra

- `AI_CONTEXT.md`, `UI_AI_CONTEXT.md`.
- `AI_document/01_BUSINESS_DOMAIN.md`, `06_SERVICE_BOUNDARIES.md`, `08_EVENT_DRIVEN_ARCHITECTURE.md`, `14_WORKFLOW_AND_USECASES.md`, `19_KNOWN_LIMITATIONS.md`.
- Các remediation/certification report hiện có và Kiosk Demo reports.
- `product-doc/product-doc.md` và ERD/dev validation.
- Master Data schema, migration runner, table registry, router, seed, event publisher và manifest.
- Execution migrations, Work Order/material/consumption use cases, event consumers, schemas và manifest.
- Traceability migrations, label/genealogy use cases, publisher và manifest.
- Shared TypeScript/Go envelope và outbox relay.
- `infra/schemas`, Compose, scripts và E2E tests.
- Runtime read-only: PostgreSQL counts, Kafka topic list/partition metadata và service logs.

Không có `services/wms-*` trong checkout này. WMS runtime containers tồn tại nhưng source WMS không thuộc audit evidence của report.

## 4. Kiến trúc MES hiện tại

```text
mes-master-data-service
  md_item / md_item_revision / md_uom / md_material_group / production definitions
  -> master-data outbox

mes-execution-service
  wo_header / wo_operation / wo_material_requirement
  material_consumption / operation_confirmation
  -> execution outbox

mes-traceability-service
  label_instance / genealogy_event
  -> traceability outbox

Kafka
  -> MES local projections, WMS workflows, kiosk and other bounded contexts
```

Runtime audit thấy 63 Master Data tables, 41 Execution tables và 12 Traceability tables. Canonical data tại thời điểm audit có 8 Items, 8 Item Revisions, 7 UOMs và 5 Material Groups.

Work Order tạo immutable snapshot từ Production Version, Routing và MBOM. Material requirements sinh từ MBOM; WMS không cần copy toàn bộ MBOM/route để thực hiện staging. WMS chỉ cần shared item identity, UOM, demand quantity và target staging context.

## 5. Kiến trúc Outbox/Kafka hiện tại

### Luồng thực tế

```text
BEGIN domain transaction
  write business row(s)
  write outbox_events
COMMIT
  application relay polls PENDING
  publish Kafka
  mark PUBLISHED or retry/FAILED
```

Ba database đều có `outbox_events`. Current columns là `id`, `event_type`, `topic`, `payload`, `status`, `created_at`, `published_at`, `retry_count`, `error_message`.

Điểm đạt:

- Domain write và outbox insert dùng cùng transaction tại các producer đã audit.
- Go relay có transaction và `FOR UPDATE SKIP LOCKED`.
- Publish là synchronous/acknowledged trước khi mark `PUBLISHED`.
- Kafka failure không rollback business transaction đã commit.

Điểm thiếu:

- Không có aggregate type/ID/version, event version riêng, headers, available-at, correlation, causation và partition key.
- Kafka key thường là event ID, không bảo đảm ordering theo aggregate.
- Retry tối đa ba lần rồi `FAILED`; không có operator replay command hay alert chuẩn.
- Không có retention/cleanup policy và outbox backlog/oldest-age metrics.
- TypeScript relay không `BEGIN`; row lock từ SELECT không được giữ tới publish/update.
- Publish thành công nhưng crash trước status update sẽ publish duplicate; consumer bắt buộc idempotent.

Runtime Execution outbox có 4 `FAILED`, 1 `PUBLISHED`; Master Data và Traceability outbox rỗng tại thời điểm audit.

## 6. Vấn đề nghiệp vụ khi WMS không nhận master data

Nếu chỉ nhận `item_revision_id` trong staging request mà không có projection chuẩn, WMS không thể xác định chắc chắn:

- Item code/name/type và revision nào đang operational.
- UOM precision, fractional policy và conversion hợp lệ.
- Revision có hiệu lực tại Site nào.
- Lot/serial/expiry policy nào phải áp dụng.
- Material Group phục vụ warehouse policy/report nào.
- Work Center nào map tới `WorkCenterStaging` location.
- FG/SFG output có được phép tạo expected receipt hay không.

WMS không được tự tạo Item lạ từ staging/receipt command. Nếu projection chưa sẵn sàng, WMS phải reject typed result; MES phải hiển thị sync state và giữ workflow ở trạng thái có thể reconcile.

## 7. Ma trận quyền sở hữu dữ liệu

| Data Object | Current MES aggregate/table | MES owner | WMS owner | Shared identity | WMS local copy | Direction | Synchronization | Classification |
|---|---|---|---|---|---|---|---|---|
| Item | `md_item` | Master Data | projection | ID + code | Có | MES→WMS | snapshot + event | `MES_AUTHORITATIVE_WMS_PROJECTION_REQUIRED` |
| Item Revision | `md_item_revision` | Master Data | projection | revision ID | Có | MES→WMS | snapshot + event | `MES_AUTHORITATIVE_WMS_PROJECTION_REQUIRED` |
| UOM / Conversion | `md_uom`, `md_uom_conversion` | Master Data | projection | UOM/conversion ID | Có | MES→WMS | snapshot + event | `MES_AUTHORITATIVE_WMS_PROJECTION_REQUIRED` |
| Material Group / Item Type | `md_material_group`, `md_item.item_type` | Master Data | projection | ID/code/enum | Có | MES→WMS | snapshot + event | `MES_AUTHORITATIVE_WMS_PROJECTION_REQUIRED` |
| RM / FG | Item + Revision | Master Data | inventory | revision ID | Có | MES→WMS | snapshot + event | `MES_AUTHORITATIVE_WMS_PROJECTION_REQUIRED` |
| SFG | Item + Revision | Master Data | inventory nếu warehouse-managed | revision ID | Có điều kiện | MES→WMS | snapshot + event | `DECISION_REQUIRED` |
| Packaging / Consumable | Chưa có type riêng | Chưa chốt | inventory nếu stocked | Chưa có | Có điều kiện | Chưa chốt | Chưa có | `DECISION_REQUIRED` |
| Lot/serial/expiry policy | `tracking_level` một phần | Chưa đủ | warehouse execution | revision ID | Có | MES→WMS | policy event | `DECISION_REQUIRED` |
| Barcode / packaging spec | Chưa có | Chưa chốt | warehouse use | Chưa có | Có điều kiện | Chưa chốt | Chưa có | `DECISION_REQUIRED` |
| Label policy | Traceability config | MES Traceability | extension | policy/item ref | Tùy receipt | MES→WMS | reference | `MES_AUTHORITATIVE_WMS_REFERENCE_OPTIONAL` |
| Production Version | `md_production_version` | Master Data | none | ID/code | Reference | MES→WMS | demand context | `MES_AUTHORITATIVE_WMS_REFERENCE_OPTIONAL` |
| MBOM | header/line | Master Data | none | snapshot refs | Không | none | derived demand only | `NOT_REQUIRED_IN_WMS` |
| Routing / Operation | routing tables | Master Data | none | issue operation ref | Không | none | demand context only | `NOT_REQUIRED_IN_WMS` |
| Work Order | `wo_header` | Execution | workflow ref | WO ID/code | Workflow | MES→WMS | facts | `SHARED_WORKFLOW_NO_MASTER_COPY` |
| WO Operation | `wo_operation` | Execution | none | operation ref | Reference | MES→WMS | context only | `MES_AUTHORITATIVE_WMS_REFERENCE_OPTIONAL` |
| Material Requirement | `wo_material_requirement` | Execution | fulfillment workflow | requirement/demand ID | Workflow | hai chiều | command/result | `SHARED_WORKFLOW_NO_MASTER_COPY` |
| Reservation | Chưa có warehouse aggregate | requester | WMS Inventory | request ID | Có | hai chiều | command/result | `WMS_AUTHORITATIVE` |
| Staging | local status projection | readiness projection | WMS | demand/request ID | Có | hai chiều | command/result | `SHARED_WORKFLOW_NO_MASTER_COPY` |
| Issue | Chưa có | context/requester | WMS Inventory | issue ID | Có | hai chiều | command/result | `WMS_AUTHORITATIVE` |
| Consumption | `material_consumption` | Execution | decrement projection | consumption ID | Có | MES→WMS | fact | `MES_AUTHORITATIVE_WMS_PROJECTION_REQUIRED` |
| Return / Scrap | Chưa đủ aggregate | Chưa chốt | inventory movement | Chưa chốt | Có | hai chiều | command/fact | `DECISION_REQUIRED` |
| Production Output | confirmation + label | Execution/Traceability | receipt inventory | output/label ID | Có | MES→WMS | fact | `MES_AUTHORITATIVE_WMS_PROJECTION_REQUIRED` |
| FG Expected Receipt | Chưa có | MES requester | WMS Inbound | expected receipt ID | Workflow | hai chiều | command/result | `SHARED_WORKFLOW_NO_MASTER_COPY` |
| SFG Expected Receipt | Chưa có | MES requester nếu managed | WMS Inbound | expected receipt ID | Có điều kiện | hai chiều | command/result | `DECISION_REQUIRED` |
| Production lot/serial | `label_instance` | Traceability | inventory projection | label/lot/serial | Có | MES→WMS | fact | `MES_AUTHORITATIVE_WMS_PROJECTION_REQUIRED` |
| Quality status | Không thuộc MES tables | QMS | disposition projection | inspection/lot | Có | QMS→WMS | ngoài scope producer MES | `DECISION_REQUIRED` |
| Production Line | `md_production_line` | Master Data | none | ID/code | Reference | MES→WMS | small ref | `MES_AUTHORITATIVE_WMS_REFERENCE_OPTIONAL` |
| Work Center | `md_work_center` | Master Data | staging mapping | ID/code/site | Có | MES→WMS | snapshot + event | `MES_AUTHORITATIVE_WMS_PROJECTION_REQUIRED` |
| Workstation / Machine | workstation/equipment tables | Master Data | none | Không cần | Không | none | none | `NOT_REQUIRED_IN_WMS` |
| Worker Skill / Employee | skill/employee tables | Master Data | none | Không cần | Không | none | none | `NOT_REQUIRED_IN_WMS` |
| Warehouse / Zone / Bin | Không có | none | WMS Master Data | WMS IDs | Có | WMS internal | none from MES | `WMS_AUTHORITATIVE` |
| Putaway/Picking/Replenishment | Không có | none | WMS | WMS IDs | Có | WMS internal | none from MES | `WMS_AUTHORITATIVE` |
| On-hand/Reservation/Ledger | Không có | none | WMS Inventory | inventory IDs | Có | WMS internal | acknowledgement only | `WMS_AUTHORITATIVE` |

Machine-readable full matrix nằm trong `data-ownership-matrix.json`.

## 8. Phân loại dữ liệu cần đồng bộ

- **Bắt buộc projection:** Site reference, Item, Revision, UOM, Conversion, Material Group, Item Type, RM, FG, Work Center, consumption/output/lot identity.
- **Reference tùy use case:** Production Version, Production Line, WO Operation, label/print evidence.
- **Shared workflow, không copy master:** WO, requirement/demand, staging, expected receipt.
- **Không gửi WMS:** full MBOM, Routing topology, Workstation, machine/resource planning, worker skills, employee.
- **WMS authoritative:** warehouse topology, stock, warehouse reservation, movement, putaway, picking, replenishment.
- **Cần Product decision:** SFG mode, packaging/consumable category, lot/serial/expiry policy, barcode, packaging specification, return/scrap semantics và QMS disposition.

## 9. Event catalog cho master data

| ID | Event | Trigger | WMS purpose | Key | Priority | Current |
|---|---|---|---|---|---|---|
| EV-01 | `SiteReleased.v1` | Site operational | Site scope | site | P0 | Missing |
| EV-02/03/04 | `ItemReleased/Changed/Deactivated.v1` | Released change/lifecycle | Item projection | item | P0/P1 | Missing |
| EV-05 | `ItemRevisionReleased.v2` | Revision Released | Revision projection | item | P0 | Implemented |
| EV-06/07 | `ItemRevisionSuperseded/EffectivityChanged.v1` | lifecycle/effectivity | Stop stale revision use | item | P1/P0 | Missing |
| EV-08/09 | `UomReleased/UomChanged.v1` | UOM operational change | Quantity validation | UOM | P0 | Missing |
| EV-10 | `UomConversionChanged.v1` | conversion change | Conversion | conversion | P1 | Missing |
| EV-11 | `MaterialGroupReleased.v1` | group lifecycle | Classification | group | P1 | Missing |
| EV-12 | `InventoryControlPolicyChanged.v1` | tracking/expiry policy | Lot/serial/expiry | revision | P0 | Decision + missing |
| EV-13/14 | Barcode/Packaging events | identity/spec change | Scan/handling | revision | P2 | Decision + missing |
| EV-15 | `WorkCenterActivated.v2` | Work Center active | Staging mapping | Work Center | P0 | Implemented |

Item/Revision/UOM operational events phải phát khi trạng thái Released/effective hoặc deactivation có hiệu lực. Không gửi Draft/InReview để WMS dùng nghiệp vụ.

## 10. Payload chuẩn Item/Revision/UOM

**Required:** item/revision IDs và codes, localized names, item type, lifecycle, effective interval, base UOM ID/code, Material Group ID/code, Site, source system và aggregate version.

**Required nhưng current còn thiếu contract:** allowed UOM/conversions, inventory-managed và inventory-control policy.

**Decision/not implemented:** lot/serial flags tách biệt, expiry, shelf-life days, barcode/GTIN và packaging specification.

**WMS-owned, không publish:** warehouse, zone, bin, putaway, picking, replenishment và stock policy extension.

Current `ItemRevisionReleased.v2` có revision, item, type, site, effectivity và base UOM; cần bổ sung Item lifecycle contract, Material Group code và version semantics trước khi dùng làm projection đầy đủ.

## 11. Ranh giới Product Definition

| Object | WMS need |
|---|---|
| MBOM | Không copy full structure; nhận material demand đã explode |
| Routing / Routing Operations | Không copy; chỉ issue operation/Work Center context khi cần |
| Production Version | Small reference tùy audit/reconciliation |
| Line Eligibility / Production Line | Reference tùy staging/output reporting |
| Work Center | Projection bắt buộc để map staging location |
| Workstation / Machine requirements / Production Standard | Không copy |
| Worker Skills / Employees | Không copy; tránh PII và coupling |

Kết luận này được source xác nhận ở material-staging flow: MES gửi item revision, requirement IDs, quantity và Work Center; không gửi full routing/resource topology.

## 12. Event catalog cho Work Order và vật tư

| Event | Type | Trigger | Response/compensation | Priority | Current |
|---|---|---|---|---|---|
| `WorkOrderReleased.v1` | Fact | WO Released | cancel/change facts | P0 | `WOApproved.v1` partial |
| `WorkOrderChanged/Cancelled.v1` | Fact | warehouse fields/cancel | WMS cancels open workflow | P1 | Missing |
| `MaterialRequirementPublished.v1` | Fact | released demand | projection applied/reject | P0 | Missing |
| `MaterialRequirementChanged.v1` | Fact | demand version changed | reconcile | P1 | Missing |
| `MaterialReservationRequested/Cancelled.v1` | Command | reservation lifecycle | confirmed/rejected | P1 | Missing |
| `MaterialStagingRequested.v1` | Command | explicit stage action | staged/shortage | P0 | Implemented, idempotency gap |
| `MaterialIssueRequested.v1` | Command | issue required | issued/rejected | P1 | Missing |
| `MaterialConsumed.v1` | Fact | consumption committed | inventory apply/reconcile | P1 | Implemented |
| `MaterialConsumptionReversed.v1` | Fact | reversal committed | inventory compensation | P1 | Missing |
| `MaterialReturnRequested.v1` | Command | return request | returned/rejected | P1 | Missing/decision |
| `MaterialScrapped.v1` | Fact | inventory-impacting scrap | adjustment acknowledgement | P1 | Missing/decision |

`MaterialStagingRequested` là command, không phải bằng chứng vật tư đã staged. `MaterialConsumed` là fact sau khi MES commit consumption.

## 13. Event catalog cho sản lượng và nhập kho

| Event | Type | Purpose | Priority | Current |
|---|---|---|---|---|
| `ProductionOutputDeclared.v1` | Fact | Authoritative output quantity/identity | P1 | Missing |
| `FinishedGoodsReceiptRequested.v1` | Command | Tạo expected FG receipt | P1 | Missing |
| `SemiFinishedReceiptRequested.v1` | Command | Receipt warehouse-managed SFG | P1 | Missing/decision |
| `ProductionOutputReversed.v1` | Fact | Compensate output | P1 | Missing |
| `ProductionLotCreated.v1` | Fact | Lot identity | P2 | `LabelIssued.v1` partial |
| `SerialsCreated.v1` | Fact | Serial identity | P2 | `LabelIssued.v1` partial |
| `GenealogyUpdated.v1` | Fact | Warehouse-relevant genealogy | P2 | `GenealogyRecorded.v1` partial |

`WOCompleted.v1` không thay thế output/expected-receipt contract vì thiếu output ID, revision, quantity, UOM, lot/serial, receipt identity và reversal semantics.

## 14. Event phản hồi từ WMS về MES

| WMS event | MES usage | Current |
|---|---|---|
| `ItemProjectionApplied.v1` | Mark revision/site sync ready | Missing |
| Reservation confirmed/rejected | Update readiness/material hold | Missing |
| Material issued | Update issue state | Missing |
| `WMS.Outbound.MaterialStaged.v1` | Mark requirement staged | Consumer implemented, unsafe durability |
| `MaterialShortageDeclared.v1` | Shortage/operator action | Consumer implemented, unsafe durability |
| Material returned | Close return | Missing |
| FG/SFG received | Close expected receipt | Missing |
| Receipt rejected | Display typed error/hold | Missing |
| Inventory adjustment confirmed | Reconcile material/output | Decision/missing |

WMS acknowledgement phải mang stable request ID, result event ID/version, quantities, UOM, location/transaction reference, correlation/trace và typed reason.

## 15. Nguyên vật liệu, bán thành phẩm và thành phẩm

### Raw Material

Trước reservation/picking/staging/issue/return/scrap, WMS phải có Released/effective Item Revision, UOM/conversion, inventory/tracking/expiry policy và Site mapping. Stock truth, lot eligibility và FEFO thuộc WMS.

### Semi-Finished

- `WAREHOUSE_MANAGED`: bắt buộc projection và expected receipt.
- `DIRECT_LINE_TO_LINE_WIP`: không tạo warehouse receipt; MES/traceability giữ identity.
- `HYBRID`: policy theo Revision/Site quyết định từng output.

Current schema chưa có field phân loại ba mode này; Product phải phê duyệt trước Phase 7.

### Finished Product

WMS Item/Revision projection phải `READY` trước expected receipt, lot/label registration phục vụ kho, receipt và putaway. WMS không tự tạo unknown item từ receipt command.

### Packaging và consumables

Current Item Type chỉ xác nhận `FG`, `SFG`, `RM`. Labels/cartons/pallets/wrapping/consumables cần decision: nếu có stock/lot/cost/movement thì phải là WMS-managed item; nếu chỉ là print artifact thì không tạo inventory projection.

## 16. Chuẩn event envelope

Envelope mục tiêu:

```json
{
  "event_id": "uuid",
  "event_type": "MES.MasterData.ItemRevisionReleased.v2",
  "event_version": 2,
  "occurred_at": "RFC3339Nano UTC",
  "published_at": "RFC3339Nano UTC",
  "producer": "mes-master-data-service",
  "aggregate_type": "ItemRevision",
  "aggregate_id": "uuid",
  "aggregate_version": 12,
  "correlation_id": "uuid/string",
  "causation_id": "uuid/string",
  "trace_id": "otel-trace-id",
  "site_id": "uuid",
  "site_code": "SITE-KZ3",
  "schema_version": 2,
  "payload": {},
  "metadata": {}
}
```

Partition key là aggregate ID: `item_id` cho Item/Revision ordering, `wo_id` cho WO, logical demand ID cho demand/staging và consumption/output ID cho immutable facts. Duplicate xử lý bằng `(consumer, event_id)` + payload hash; stale aggregate version no-op có metric; version gap park/reconcile. Không đưa token, secret, employee PII hay unrelated resource data vào payload.

## 17. Thiết kế Transactional Outbox

Outbox mục tiêu cần thêm nullable columns trước, sau đó backfill và tăng constraint:

`event_id`, `aggregate_type`, `aggregate_id`, `aggregate_version`, `event_type`, `event_version`, `payload`, `headers`, `occurred_at`, `available_at`, `published_at`, `status`, `attempt_count`, `last_error`, `correlation_id`, `causation_id`, `trace_id`, `partition_key`.

Yêu cầu:

- Business state commit **iff** event đã được ghi bền vững vào outbox.
- Stable event/partition key; retry không tạo logical event mới.
- Claim bằng transaction-scoped lock hoặc atomic lease.
- At-least-once publish và idempotent consumer.
- `FAILED/PARKED` có operator replay, audit và reason.
- Retention chỉ cleanup sau thời hạn và evidence/replay watermark an toàn.
- Metrics pending, oldest age, attempts, failed và publish latency.

Current verdict: `TRANSACTIONALLY_ATOMIC_WRITES_BUT_OPERATIONALLY_INCOMPLETE`.

## 18. Thiết kế Kafka topic

Current source dùng một topic cho mỗi event type. Blueprint ưu tiên logical topic để giảm vận hành nhưng không đổi topic hiện tại trực tiếp:

| Logical topic | Producer | Key/order | Retention/compaction | DLQ |
|---|---|---|---|---|
| `mes.master-data.item-events.v1` | Master Data | item ID | long + compacted | `.dlq` |
| `mes.master-data.reference-events.v1` | Master Data | type:ID | long + compacted | `.dlq` |
| `mes.execution.work-order-events.v1` | Execution | WO ID | audit retention | `.dlq` |
| `mes.execution.material-events.v1` | Execution | demand/consumption ID | audit retention | `.dlq` |
| `mes.execution.production-output-events.v1` | Execution | output ID | audit retention | `.dlq` |
| `mes.traceability.lot-serial-events.v1` | Traceability | lot/serial ID | traceability retention | `.dlq` |

Master-data topics nên compact vì projection cần latest aggregate state, nhưng event history/retention requirement phải được Platform phê duyệt. Migration topic phải dual-publish/dual-consume có contract test; không rename in place.

## 19. Quyết định CDC

| Option | Verdict | Lý do |
|---|---|---|
| A. Application Outbox Publisher | `RECOMMENDED` hiện tại | Đã tồn tại, ít hạ tầng mới; cần harden claim/replay/metrics |
| B. CDC trên Outbox | `ACCEPTABLE` về sau | Tách relay khỏi app, tốt cho scale/operations; cần Debezium expertise và envelope routing chuẩn |
| C. CDC trên business tables | `NOT_RECOMMENDED` | Rò schema nội bộ, không mang business semantics, tạo coupling và event nhiễu |

Không có CDC trực tiếp business table hiện tại. Chưa cần đưa Debezium vào trước khi sửa outbox/application relay. Nếu sau này dùng CDC, chỉ observe outbox và giữ application là nơi tạo semantic event atomically.

## 20. WMS local projection

WMS cần projection riêng cho Site, Item, Revision, UOM, Conversion, Material Group và Work Center mapping; thêm `wms_mes_sync_state` và `wms_consumed_event`.

Update rule:

- Insert nếu chưa tồn tại.
- Same event/same hash: no-op.
- Same event/different hash: conflict.
- Aggregate version mới kế tiếp: apply.
- Version cũ: ignore + metric.
- Version gap: park + reconciliation.
- Inactive: giữ history, cấm transaction mới.
- Không overwrite WMS-owned warehouse/bin/strategy fields.

## 21. Bootstrap và snapshot

Kafka history không đủ để bootstrap chắc chắn một WMS triển khai muộn. Cần MES integration snapshot API site-scoped:

1. Tạo consistent watermark/effective-at.
2. Page Released/effective Sites, UOMs, conversions, groups, Items, Revisions, Work Centers.
3. WMS upsert theo shared ID/version.
4. Lưu watermark và Kafka offsets tương ứng.
5. Consume event sau watermark.
6. Reconcile và chỉ sau đó mark `WMS_MASTER_SYNC_READY`.

API generic CRUD hiện tại không cung cấp atomic multi-object watermark. Cần endpoint integration chuyên biệt với opaque cursor, stable ordering, site/effectivity filters và service authentication. Không cho WMS query MES DB.

## 22. Reconciliation và drift detection

- Hourly incremental, daily full per Site và on-demand sau bootstrap/replay.
- So sánh missing/unknown object, version, lifecycle, effectivity, UOM, policy, barcode và packaging.
- Auto-repair chỉ replay exact event hoặc upsert authoritative newer snapshot không conflict.
- Identity conflict, version regression và policy conflict cần manual approval.
- Evidence phải có run ID, Site, object, MES/WMS versions, mismatch code, action, actor và timestamps.
- MES sửa source data; WMS sửa projection; Platform cung cấp transport/offset evidence.

Reconciliation không thay thế event delivery.

## 23. Synchronization readiness gates

| Workflow | Policy |
|---|---|
| WO Create | Cho phép; hiển thị sync status, không sync HTTP bắt buộc |
| WO Release | Warn hoặc block chỉ khi approved policy yêu cầu early reservation |
| Material reservation/staging/issue | Block nếu Item/Revision/UOM/Work Center projection chưa ready |
| Execution Start | Block khi mandatory material chưa staged theo policy |
| WO Completion | Không rollback production vì WMS receipt chậm; tạo durable receipt pending/hold |
| FG/SFG expected receipt | Block command nếu master projection chưa ready |

Tránh synchronous coupling ở WO creation. Readiness được xác nhận bằng local MES sync projection/ack state, không gọi WMS trong mọi browser request.

## 24. Error handling, DLQ và replay

- Kafka unavailable: outbox giữ PENDING; alert theo oldest age.
- Publisher unavailable: business transaction vẫn commit; relay catch-up khi phục hồi.
- WMS consumer unavailable: lag tăng; projection/workflow chưa `READY`.
- Malformed/unsupported version: park/DLQ, giữ raw bytes/hash/topic/partition/offset.
- Duplicate: no-op; conflicting duplicate: durable conflict.
- Stale: ignore + metric; version gap: park + snapshot/reconcile.
- WMS validation reject: typed rejection, không transport retry vô hạn.
- Retry exhaustion: `FAILED/PARKED`, alert và controlled replay command.
- Reversal: event/command riêng tham chiếu original transaction; không sửa lịch sử.
- Prolonged delay: operator-visible sync/material/receipt hold.

## 25. Security và data governance

- Service account JWT/mTLS theo Platform decision; browser token không dùng làm Kafka producer identity.
- Kafka ACL theo producer/topic và consumer group; Schema Registry cũng cần ACL.
- Secrets chỉ từ secret management/environment, không payload/log.
- Site scope bắt buộc trong snapshot/event và authorization.
- Không gửi employee, skill, machine serial hay PII không phục vụ warehouse use case.
- TLS/encryption in transit theo Platform; field-level encryption chỉ khi payload có dữ liệu nhạy cảm được duyệt.
- Deactivation thay delete; retention tuân thủ audit/traceability policy.

## 26. Observability

Metrics bắt buộc: outbox pending/oldest age, publish success/failure/latency, throughput, consumer lag, projection apply success/failure, duplicate, stale, version gap, DLQ, reconciliation mismatch, sync latency và workflow rejection do sync.

Log phải có service, event ID/type/version, aggregate ID/version, topic/partition/offset, correlation, causation, trace, Site và safe error code. Dashboard theo Site và bounded context; alert cho oldest age, failed rows, sustained lag, DLQ growth và P0 projection mismatch.

## 27. Test strategy

| Suite | Cases |
|---|---|
| Outbox | commit/rollback atomicity, duplicate publish, concurrent relay, retry, restart, poison, retention |
| Master contract | Item/revision/UOM lifecycle, effectivity, policy, duplicate, stale, gap, schema compatibility |
| Bootstrap | concurrent source change, watermark handoff, pagination, restart, reconciliation |
| Material | demand publish/change, reservation, staging, issue, consumption, reverse, return, scrap |
| Output | FG/SFG output, lot/serial, receipt accept/reject, reversal, duplicate prevention |
| Failure | Kafka/WMS outage, lag, DLQ, replay, projection rebuild, no cross-DB access |
| Security | service auth, Site scope, Kafka ACL, Schema Registry ACL, sensitive-log scan |

Full E2E phải dùng MES-owned domain fixture và WMS-owned stock fixture; không insert chéo database.

## 28. Event priority P0–P3

### P0

Site, Item release/deactivation, Revision release/effectivity, UOM release/change, inventory-control policy, Work Center activation, WorkOrderReleased, MaterialRequirementPublished, MaterialStagingRequested, ItemProjectionApplied và WMS staged/shortage results.

### P1

Item updates, UOM conversion, Material Group, WO change/cancel, reservation/issue, consumption/reversal, return/scrap, production output và FG/SFG receipt workflow.

### P2

Barcode, packaging specification, production lot/serial, warehouse-relevant genealogy và inventory adjustment acknowledgement.

### P3

Optional optimization/reference events only after a documented warehouse use case. MES resource planning, employee và skill events không mặc nhiên trở thành P3 WMS events; chúng là `NOT_REQUIRED_IN_WMS`.

## 29. Gap register

| Gap | Domain | Current → Required | Severity | MES service | WMS impact | Change/Test |
|---|---|---|---|---|---|---|
| GAP-001 | Item | No release/deactivate → lifecycle facts | P0 | Master Data | unknown/stale item | events + lifecycle tests |
| GAP-002 | UOM | No UOM events → UOM/conversion facts | P0 | Master Data | quantity mismatch | schemas + precision tests |
| GAP-003 | Policy | generic tracking only → explicit inventory policy | P0 | Master Data | unsafe lot/expiry | decision/migration/tests |
| GAP-004 | Revision | no deactivation/effectivity facts | P0 | Master Data | stale revision use | events + ordering tests |
| GAP-005 | Envelope | six fields → aggregate/causality/version | P0 | Shared kernels | weak replay/order | vNext contract tests |
| GAP-006 | Outbox | missing metadata/key | P0 | all producers | weak diagnostics/order | additive migration/tests |
| GAP-007 | Relay | TypeScript lock not transaction-scoped | P0 | shared kernel | duplicate publish | claim fix/concurrency test |
| GAP-008 | Operations | three retries, no replay/metrics | P1 | all producers | silent drift | command/metrics/failure test |
| GAP-009 | WO | WOApproved not governed WMS release fact | P0 | Execution | ambiguous context | contract/event tests |
| GAP-010 | Demand | no stable demand aggregate/version | P0 | Execution | duplicate/misaligned request | model/migration/tests |
| GAP-011 | Staging | retry creates new event/key | P0 | Execution | duplicate transfer | idempotency tests |
| GAP-012 | Result | unsafe commit/no inbox/version | P0 | Execution | lost/corrupt readiness | consumer rewrite/restart tests |
| GAP-013 | Output | no expected receipt lifecycle | P1 | Execution/Trace | no safe receipt | output/events/E2E |
| GAP-014 | Recovery | no reverse/return/scrap facts | P1 | Execution | inventory drift | domain/events/tests |
| GAP-015 | Bootstrap | no consistent watermark API | P0 | Master Data | unsafe late deployment | API/bootstrap race tests |
| GAP-016 | Reconcile | no drift/replay contract | P1 | MES + WMS | undetected drift | jobs/evidence/tests |
| GAP-017 | Schema | generic/incomplete schemas, runtime 409 warning | P0 | producers/Platform | unsafe deploy | per-event schemas/CI |
| GAP-018 | Security/Obs | no integration ACL/dashboard | P1 | MES/Platform | weak control/diagnosis | policy/telemetry tests |

## 30. Lộ trình triển khai

| Phase | Scope | Completion gate |
|---:|---|---|
| 0 | Ownership, category, identity, state/version và contract approval | ADR/schema approved |
| 1 | Envelope/outbox/relay/replay/metrics hardening | Atomicity/concurrency/restart pass |
| 2 | Site/Item/Revision/UOM/Work Center synchronization | P0 projection contracts pass |
| 3 | Bootstrap snapshot/watermark/reconciliation | Late WMS bootstrap converges |
| 4 | WorkOrderReleased + stable material demand | WMS receives versioned demand |
| 5 | Reservation/staging/issue + acknowledgements/inbox | Idempotent full staging passes |
| 6 | Consumption/reversal/return/scrap | Inventory correction converges |
| 7 | FG/SFG output and expected receipt | Receipt/reject/reversal passes |
| 8 | Lot/serial/genealogy | Identity reconciliation passes |
| 9 | ACL, observability, DLQ, replay | Failure/security drills pass |
| 10 | Full E2E certification | Signed evidence, zero P0 gaps |

Mỗi phase phải có additive migration, legacy rehearsal, seed/cleanup thuộc owner, unit/contract/integration/E2E test và rollback plan phù hợp.

## 31. Rủi ro và quyết định cần phê duyệt

1. SFG là warehouse-managed, direct WIP hay hybrid theo Revision/Site.
2. Packaging/consumables có phải inventory Item hay chỉ operational artifact.
3. Owner và schema của lot/serial/expiry/shelf-life/barcode/packaging policy.
4. `WOApproved.v1` được chuẩn hóa thành WorkOrderReleased semantic hay tạo event mới.
5. Final parent/line material-demand aggregate và version rule.
6. Grouped logical topics hay tiếp tục topic-per-event; migration strategy.
7. Application relay lâu dài hay Debezium outbox sau khi harden.
8. Master snapshot watermark và Kafka offset handoff protocol.
9. Work Order release gate policy khi WMS master sync pending.
10. Scrap/return/output reversal ownership và accounting consequences.

Trả lời các câu hỏi bắt buộc:

- **Authority Item/Revision/UOM:** MES Master Data.
- **Item categories gửi WMS:** RM, FG và mọi SFG/packaging/consumable được warehouse-manage; SFG cần policy.
- **MES data không copy:** full MBOM/routing/resource topology, workstation, machine, worker skill, employee.
- **Master P0:** Site, Item lifecycle, Revision lifecycle/effectivity, UOM và inventory policy, Work Center.
- **WO/material P0:** WorkOrderReleased, MaterialRequirementPublished, MaterialStagingRequested và staged/shortage response.
- **Commands:** reservation/staging/issue/return/receipt requests. **Facts:** released, consumed, output declared, staged/received results.
- **WMS acknowledgements:** projection applied, reservation result, staged/shortage, issued, returned, receipt accepted/rejected.
- **Current outbox transaction-safe:** Có cho business write + durable event insert ở audited producers; chưa đủ operational safety.
- **Business-table CDC:** Không có và không khuyến nghị.
- **Có cần CDC ngay:** Không. Application relay sau hardening là lựa chọn hiện tại; CDC chỉ acceptable trên outbox về sau.
- **Bootstrap:** consistent site snapshot + watermark + Kafka catch-up + reconciliation.
- **Drift detection:** hourly incremental, daily full và on-demand controlled replay.
- **Revision chưa sync:** block reservation/staging/issue/receipt; không tự tạo item.
- **Block lifecycle nào:** không block WO Create; release warn/block theo approved policy; block WMS-dependent commands và mandatory-material execution start.
- **Thứ tự:** contract → outbox/envelope → master sync → bootstrap/reconcile → demand → material workflows → output/traceability → operations certification.
- **Product approvals còn thiếu:** SFG, packaging/consumables, inventory policy, demand model, lifecycle gates và reversal semantics.
- **Architecture ready:** Blueprint sẵn sàng implementation; production integration chưa sẵn sàng.

## 32. Kết luận cuối

MES đã có nền tảng Transactional Outbox và một số event quan trọng, nên không cần thay kiến trúc bằng CDC business-table hoặc synchronous cross-database integration. Cần harden envelope/outbox/consumer trước, sau đó hoàn thiện P0 master projection, bootstrap/reconciliation và stable material-demand workflow. Khi 11 phase hoàn tất cùng evidence, WMS mới có thể dùng MES-owned identity và production facts một cách độc lập, idempotent và có khả năng phục hồi.

MES_TO_WMS_EVENT_OUTBOX_BLUEPRINT_READY_FOR_IMPLEMENTATION
