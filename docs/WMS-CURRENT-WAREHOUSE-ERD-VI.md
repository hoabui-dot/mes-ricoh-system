# Mô hình ERD WMS quản lý kho hiện tại

## 1. Cách đọc tài liệu

WMS dùng database-per-service. Vì vậy ERD được chia theo bounded context:

- đường quan hệ liền: foreign key thật trong cùng database;
- quan hệ ghi chú “logical reference”: chỉ dùng chung UUID, không có foreign key;
- bảng `rm_*`: local read model được đồng bộ bằng Kafka;
- các bảng kỹ thuật `schema_migrations` và `outbox_events` được mô tả riêng, không làm rối sơ đồ nghiệp vụ.

ERD phản ánh migration/code hiện tại, không suy diễn mô hình mục tiêu.

## 2. ERD tổng quan xuyên service

```mermaid
flowchart LR
    MES_ITEM[MES Item Revision] -. Kafka Released .-> MD_RM[Master Data\nrm_item_revision]
    MES_ITEM -. Kafka Released .-> INV_RM_ITEM[Inventory\nrm_item_revision]
    MES_ITEM -. Kafka Released .-> OUT_RM_ITEM[Outbound\nrm_item_revision]

    WC[MES Work Center] -. UUID reference .-> LOC[Master Data\nwms_storage_location]
    LOC -. Kafka LocationCreated .-> INV_RM_LOC[Inventory\nrm_storage_location]
    LOC -. Kafka LocationCreated .-> OUT_RM_LOC[Outbound\nrm_storage_location]

    RECEIPT[Inbound\ninbound_receipt + lines] -. HTTP receipt command .-> LOT[Inventory\ninv_lot]
    LOT --> BAL[Inventory\ninv_balance]
    LOT --> MOV[Inventory\ninv_stock_movement]

    WO[MES Work Order + requirements] -. HTTP material request .-> MR[Outbound\nmaterial_request]
    MR -. HTTP transfer command .-> MOV
    WO -. Kafka MaterialConsumed .-> MOV
```

Không có foreign key xuyên các khối trên.

## 3. WMS Master Data database

```mermaid
erDiagram
    WMS_WAREHOUSE ||--o{ WMS_ZONE : contains
    WMS_ZONE ||--o{ WMS_STORAGE_LOCATION : contains
    WMS_STORAGE_LOCATION ||--o{ WMS_STORAGE_BIN : contains
    RM_ITEM_REVISION ||..o{ WMS_ITEM_UOM_MAPPING : "logical item_revision_id"

    WMS_WAREHOUSE {
        uuid warehouse_id PK
        varchar warehouse_code UK
        jsonb warehouse_name
        jsonb warehouse_description
        uuid site_id
        varchar status
        uuid created_by
        timestamptz created_at
        uuid updated_by
        timestamptz updated_at
        int row_version
    }

    WMS_ZONE {
        uuid zone_id PK
        uuid warehouse_id FK
        varchar zone_code
        jsonb zone_name
        varchar zone_type
        varchar status
        uuid created_by
        timestamptz created_at
        uuid updated_by
        timestamptz updated_at
        int row_version
    }

    WMS_STORAGE_LOCATION {
        uuid location_id PK
        uuid zone_id FK
        varchar location_code
        jsonb location_name
        varchar location_purpose
        uuid staging_for_work_center_ref
        varchar status
        uuid created_by
        timestamptz created_at
        uuid updated_by
        timestamptz updated_at
        int row_version
    }

    WMS_STORAGE_BIN {
        uuid bin_id PK
        uuid location_id FK
        varchar bin_code
        jsonb bin_name
        numeric capacity_qty
        uuid capacity_uom_id
        varchar status
        uuid created_by
        timestamptz created_at
        uuid updated_by
        timestamptz updated_at
        int row_version
    }

    RM_ITEM_REVISION {
        uuid item_revision_id PK
        varchar item_code
        jsonb item_name
        timestamptz updated_at
    }

    WMS_ITEM_UOM_MAPPING {
        uuid mapping_id PK
        uuid item_revision_id
        varchar storage_uom_code
        numeric conversion_factor
        numeric default_bin_capacity_qty
        uuid created_by
        timestamptz created_at
        uuid updated_by
        timestamptz updated_at
        int row_version
    }
```

### Ràng buộc chính

| Bảng | Unique/check quan trọng |
|---|---|
| `wms_warehouse` | `warehouse_code` unique; status `Active/Inactive` |
| `wms_zone` | `(warehouse_id, zone_code)` unique; zone type thuộc 5 giá trị định nghĩa |
| `wms_storage_location` | `(zone_id, location_code)` unique; một staging location/Work Center; purpose và staging ref phải khớp |
| `wms_storage_bin` | `(location_id, bin_code)` unique; capacity không âm |
| `wms_item_uom_mapping` | `(item_revision_id, storage_uom_code)` unique; conversion factor dương |

`wms_item_uom_mapping.item_revision_id`, `wms_storage_location.staging_for_work_center_ref`, `wms_warehouse.site_id` và `wms_storage_bin.capacity_uom_id` là logical reference, không có FK tới hệ thống nguồn.

## 4. WMS Inbound database

```mermaid
erDiagram
    INBOUND_RECEIPT ||--|{ INBOUND_RECEIPT_LINE : has

    INBOUND_RECEIPT {
        uuid receipt_id PK
        varchar receipt_code UK
        uuid warehouse_location_id
        varchar status
        uuid created_by
        timestamptz created_at
        timestamptz confirmed_at
    }

    INBOUND_RECEIPT_LINE {
        uuid line_id PK
        uuid receipt_id FK
        uuid item_revision_id
        varchar lot_code
        numeric qty
        varchar uom_code
        date expiry_date
    }
```

### Ràng buộc và logical reference

- `(receipt_id, lot_code)` unique.
- `qty > 0`.
- Receipt status: `Draft`, `Confirmed`, `Cancelled`.
- `warehouse_location_id` tham chiếu logic tới Master Data location.
- `item_revision_id` tham chiếu logic tới MES Item Revision; Inbound không có `rm_item_revision`.
- Schema có `Cancelled`, nhưng code chưa có command chuyển trạng thái này.

## 5. WMS Inventory database

```mermaid
erDiagram
    INV_LOT ||--o{ INV_BALANCE : has
    INV_LOT ||--o{ INV_STOCK_MOVEMENT : records
    RM_ITEM_REVISION ||..o{ INV_LOT : "logical item_revision_id"
    RM_STORAGE_LOCATION ||..o{ INV_BALANCE : "logical location_id"
    RM_STORAGE_LOCATION ||..o{ INV_STOCK_MOVEMENT : "logical from/to location"
    RM_STORAGE_LOCATION ||..o{ INV_DISCREPANCY_LOG : "logical location_id"

    INV_LOT {
        uuid lot_id PK
        varchar lot_code UK
        uuid item_revision_id
        timestamptz received_at
        date expiry_date
        varchar status
        numeric original_qty
        varchar uom_code
        timestamptz created_at
    }

    INV_BALANCE {
        uuid balance_id PK
        uuid lot_id FK
        uuid location_id
        numeric on_hand_qty
        int row_version
        timestamptz updated_at
    }

    INV_STOCK_MOVEMENT {
        uuid movement_id PK
        varchar movement_type
        uuid lot_id FK
        uuid from_location_id
        uuid to_location_id
        numeric qty
        uuid wo_id
        uuid work_center_ref
        timestamptz occurred_at
        uuid created_by
    }

    INV_DISCREPANCY_LOG {
        uuid discrepancy_id PK
        varchar discrepancy_type
        uuid item_revision_id
        uuid location_id
        numeric requested_qty
        numeric consumed_qty
        numeric shortage_qty
        uuid wo_id
        uuid work_center_ref
        jsonb detail
        timestamptz created_at
    }

    RM_ITEM_REVISION {
        uuid item_revision_id PK
        varchar item_code
        jsonb item_name
        timestamptz updated_at
    }

    RM_STORAGE_LOCATION {
        uuid location_id PK
        varchar location_code
        jsonb location_name
        varchar location_purpose
        uuid staging_for_work_center_ref
        varchar status
        timestamptz updated_at
    }
```

### Ràng buộc chính

| Bảng | Ràng buộc |
|---|---|
| `inv_lot` | `lot_code` unique; original quantity dương; status thuộc `Active/Expired/Quarantined/Consumed` |
| `inv_balance` | `(lot_id, location_id)` unique; on-hand không âm |
| `inv_stock_movement` | quantity dương; type thuộc `RECEIPT/TRANSFER_TO_STAGING/CONSUMPTION/ADJUSTMENT` |
| `rm_storage_location` | purpose thuộc `Storage/WorkCenterStaging` |

`inv_balance.location_id`, các location trên movement và mọi UUID MES (`item_revision_id`, `wo_id`, `work_center_ref`) không có FK. Inventory không lưu `warehouse_id`, `zone_id` hoặc `bin_id`.

## 6. WMS Outbound database

```mermaid
erDiagram
    RM_ITEM_REVISION ||..o{ MATERIAL_REQUEST : "logical item_revision_id"
    RM_STORAGE_LOCATION ||..o{ MATERIAL_REQUEST : "resolved by work_center_ref"

    MATERIAL_REQUEST {
        uuid request_id PK
        varchar request_code UK
        varchar source_system
        uuid wo_id
        varchar work_order_code
        varchar work_order_name
        uuid work_center_ref
        varchar work_center_code
        varchar work_center_name
        uuid item_revision_id
        varchar item_code
        varchar item_name
        varchar uom_code
        numeric required_qty
        numeric already_staged_qty
        numeric shortfall_qty
        numeric available_qty
        numeric transferred_qty
        varchar status
        jsonb detail
        timestamptz created_at
        timestamptz updated_at
    }

    RM_STORAGE_LOCATION {
        uuid location_id PK
        varchar location_code
        varchar location_purpose
        uuid staging_for_work_center_ref
        varchar status
        timestamptz updated_at
    }

    RM_ITEM_REVISION {
        uuid item_revision_id PK
        varchar item_code
        jsonb item_name
        timestamptz updated_at
    }
```

### Ràng buộc chính

- `request_code` unique.
- Business identity unique: `(wo_id, work_center_ref, item_revision_id, required_qty)`.
- `required_qty > 0`.
- Status chỉ có `Staged` hoặc `Shortage`.
- `material_request` lưu snapshot tên/mã/UOM và số lượng tại thời điểm xử lý.
- Không có FK từ material request tới hai read model; việc join Item Revision chỉ phục vụ fallback hiển thị.

## 7. Quan hệ với MES Execution

Các trường liên kết chính:

| WMS | MES | Ý nghĩa |
|---|---|---|
| `material_request.wo_id` | `wo_header.wo_id` | WO yêu cầu vật tư |
| `material_request.item_revision_id` | `wo_material_requirement.component_item_revision_id` | vật tư cần cấp |
| `material_request.work_center_ref` | `wo_operation.work_center_id` | nơi nhận staging |
| `inv_stock_movement.wo_id` | `wo_header.wo_id` | truy vết transfer/consumption theo WO |
| `inv_stock_movement.work_center_ref` | MES Work Center | truy vết theo điểm staging |
| `inv_discrepancy_log.*` | WO, Work Center, Item Revision | sai lệch tiêu hao |

MES lưu kết quả WMS trở lại:

- `wo_material_requirement.stock_check_status`: `NotChecked`, `Staged`, `Shortage`;
- `wo_material_requirement.stock_check_detail`: snapshot JSON response của Outbound.

Tất cả là quan hệ logic, không có FK xuyên database.

## 8. Bảng kỹ thuật

| Bounded context | Bảng kỹ thuật |
|---|---|
| Master Data | `schema_migrations`, `outbox_events` |
| Inbound | `schema_migrations` |
| Inventory | `schema_migrations` |
| Outbound | `schema_migrations`, `outbox_events` |

`outbox_events` bảo đảm dữ liệu nghiệp vụ và event được ghi cùng transaction tại Master Data/Outbound. Inbound gọi Inventory đồng bộ qua HTTP và hiện không có outbox riêng.

## 9. Các điểm mô hình chưa nối

1. Bin không nối với balance/movement; không thể biết tồn thực tế nằm ở bin nào.
2. UOM mapping không nối với lot/movement bằng FK và chưa được dùng để quy đổi.
3. Inbound không có FK/read model cho location hoặc Item Revision.
4. Inventory không lưu Warehouse/Zone nên truy vấn hierarchy phải ghép ở Console qua Master Data API.
5. Outbound read model location không có Zone/Warehouse; thuật toán cộng toàn bộ Storage balance của Item Revision, không giới hạn Warehouse/Site.
6. Update master data không có event tương ứng, tạo nguy cơ read model lệch trạng thái nguồn.
7. `inv_discrepancy_log` có dữ liệu nhưng chưa có query API/UI hoàn chỉnh.

