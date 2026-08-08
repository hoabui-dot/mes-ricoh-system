# PHẦN III: QUY TRÌNH VÀ ĐỊNH MỨC (ROUTING & STANDARDS CATALOG)

Tài liệu đặc tả danh mục Master Data quản lý công đoạn (`Operation`), quy trình công nghệ (`Routing`), định mức thời gian / năng suất (`Production Standard`) và hướng dẫn thao tác (`Work Instruction`) cho hệ thống MES MVP.

## Ranh giới authoring của Routing Operation (2026-08-07)

Khi thêm một công đoạn vào Routing, cùng một dòng sẽ chọn Work Center và
khai báo nguồn định mức cùng các giá trị theo Routing: số lượng tham chiếu,
thời gian setup, cycle time, số nhân lực, efficiency và yield. Vì vậy cùng
một Operation có thể có giá trị khác nhau trong các Routing khác nhau.

Console không còn yêu cầu người dùng lặp lại quan hệ này tại các trang
Resource Capability hoặc Production Standard độc lập. Các bảng backend vẫn
được giữ để tương thích và lưu các ràng buộc eligibility theo tài nguyên.
Operation defaults là mặc định dùng chung; Work Order chụp giá trị đã phân
giải khi tạo.

---

## C1. MD_OPERATION — Danh mục công đoạn

### 1. Thông tin chung (Overview)
- **Mục đích:** Chuẩn hóa danh mục các công đoạn sản xuất dùng chung (Chuẩn bị, Cắt, Ép, Lắp ráp, Kiểm tra, Đóng gói...).
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `OperationID` | UUID | Có | `OP-CUT` | Khóa chính công đoạn. |
| `OperationCode` | String(30) | Có | `CUT` | Mã công đoạn duy nhất toàn hệ thống. |
| `OperationName` | String(150) | Có | Cắt tấm cao su | Tên hiển thị của công đoạn. |
| `OperationType` | Enum | Có | `Production` | Phân loại: `Production`, `Inspection`, `Packing`, `Handling`. |
| `ConfirmationMode` | Enum | Có | `StartFinish` | Chế độ ghi nhận tại Kiosk: `StartFinish`, `QuantityOnly`, `Auto`. |
| `QuantityReporting` | Enum | Có | `GoodScrap` | Báo cáo sản lượng: `GoodOnly`, `GoodScrap`. |
| `RequiresMaterialScan` | Boolean | Có | `Yes` | `Yes`: Bắt buộc quét mã NVL/BTP trước khi bắt đầu. |
| `RequiresOutputLabel` | Boolean | Có | `Yes` | `Yes`: Yêu cầu in/kích hoạt tem QR đầu ra. |
| `AllowPartialCompletion` | Boolean | Có | `Yes` | `Yes`: Cho phép báo cáo hoàn thành từng phần. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-03** | Kỹ thuật | Khai báo công đoạn chuẩn dùng lại cho nhiều quy trình (Routing). | Danh mục quy trình công nghệ thống nhất. |
| **UC-EX-02** | Công nhân | Kiosk căn cứ cấu hình công đoạn để quyết định luồng bấm (bấm Start/Finish hay chỉ nhập số lượng). | Màn hình giao diện hiển thị đúng luồng thao tác. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- `OperationCode` bắt buộc phải là duy nhất trên toàn hệ thống.
- Công đoạn đã phát sinh transaction trong WO không được xóa; chỉ cho phép chuyển sang `Status = Inactive`.

---

## C2. MD_ROUTING_HEADER — Routing Header

### 1. Thông tin chung (Overview)
- **Mục đích:** Định nghĩa quy trình công nghệ tổng thể của một Item Revision tại một Nhà máy (Site).
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `RoutingID` | UUID | Có | `RT-FG001-V1` | Khóa chính Routing Header. |
| `RoutingCode` | String(50) | Có | `RT-FG001` | Mã định danh Routing. |
| `ProductRevisionID` | UUID | Có | `REV-FG001-R2` | Tham chiếu Revision sản phẩm áp dụng. |
| `SiteID` | UUID | Có | `SITE-HN01` | Nhà máy áp dụng quy trình. |
| `RoutingVersion` | Integer | Có | `1` | Số phiên bản quy trình Routing. |
| `RoutingType` | Enum | Có | `Standard` | Phân loại quy trình: `Standard`, `Alternate`, `Rework`. |
| `ValidFrom` | DateTime | Có | `2026-08-01` | Thời điểm bắt đầu có hiệu lực. |
| `ValidTo` | DateTime | Không | *NULL* | Thời điểm hết hiệu lực. |
| `Status` | Enum | Có | `Released` | Trạng thái: `Draft`, `InReview`, `Released`, `Obsolete`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-03** | Kỹ thuật | Khai báo và phát hành quy trình sản xuất cho SKU. | Tạo khung để sắp xếp thứ tự các công đoạn chi tiết. |
| **UC-PLAN-01** | Điều độ | Từ Routing được duyệt, hệ thống sinh ra chuỗi các công đoạn cho WO. | WO được phân rã chính xác theo từng công đoạn. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Một Routing ở trạng thái `Status = Released` bắt buộc phải chứa ít nhất một công đoạn chi tiết (`MD_ROUTING_OPERATION`).
- Cấm chỉnh sửa trực tiếp cấu trúc của Routing đã được tham chiếu sử dụng trong các Lệnh sản xuất (WO).

---

## C3. MD_ROUTING_OPERATION — Chi tiết Routing

### 1. Thông tin chung (Overview)
- **Mục đích:** Khai báo thứ tự thực hiện, Work Center mặc định, mối quan hệ trước/sau giữa các công đoạn và tham số lập lịch.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `RoutingOperationID` | UUID | Có | `RTO-0010` | Khóa chính dòng chi tiết Routing. |
| `RoutingID` | UUID | Có | `RT-FG001-V1` | Tham chiếu Routing Header (`MD_ROUTING_HEADER`). |
| `SequenceNo` | Integer | Có | `20` | Thứ tự bước thực hiện công đoạn (10, 20, 30...). |
| `OperationID` | UUID | Có | `OP-CUT` | Tham chiếu công đoạn (`MD_OPERATION`). |
| `DefaultWorkCenterID`| UUID | Có | `WC-CUT` | Cụm máy/Work Center mặc định thực hiện. |
| `PredecessorSeq` | String(100) | Không | `10` | Danh sách bước phải hoàn thành trước (hỗ trợ chạy song song). |
| `SchedulingMode` | Enum | Có | `Finite` | Chế độ lập lịch: `Finite` (Giới hạn năng lực), `Infinite`. |
| `OverlapAllowed` | Boolean | Có | `No` | `Yes`: Cho phép chuyển lô gối đầu từng phần sang bước sau. |
| `TransferBatchQty` | Decimal(18,3) | Không | `10.000` | Số lượng lô chuyển giao tối thiểu giữa 2 công đoạn. |
| `QueueTimeMin` | Decimal(12,2) | Không | `5.00` | Thời gian chờ chuẩn trước khi vào máy (Phút). |
| `MoveTimeMin` | Decimal(12,2) | Không | `2.00` | Thời gian di chuyển chuẩn giữa các trạm (Phút). |
| `MilestoneFlag` | Boolean | Có | `No` | `Yes`: Mốc công đoạn quan trọng để theo dõi tiến độ tổng thể. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-03** | Kỹ thuật | Thiết lập thứ tự công đoạn: Cắt $\to$ Dán tem $\to$ Kiểm tra. | Quy trình logic rõ ràng cho hệ thống và người vận hành. |
| **UC-PLAN-01** | Điều độ | Lập lịch chi tiết từng công đoạn và phân bổ xuống Work Center. | Tiến độ WO được tính toán chính xác theo chuỗi phụ thuộc. |
| **UC-EX-01** | Công nhân | Màn hình Kiosk chỉ hiển thị các công đoạn đã đến lượt thực hiện. | Ngăn chặn công nhân làm nhảy bước hoặc sai quy trình. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- `SequenceNo` bắt buộc phải là duy nhất trong cùng một `RoutingID`.
- Giá trị trong `PredecessorSeq` cấm tham chiếu vòng lặp (vòng lặp chuỗi phụ thuộc).

---

## C4. MD_PRODUCTION_STANDARD — Định mức thời gian và năng suất

### 1. Thông tin chung (Overview)
- **Mục đích:** Định nghĩa Cycle Time, Setup Time, năng suất chuẩn, số lượng công nhân và hệ số hiệu suất theo tổ hợp Sản phẩm – Công đoạn – Tài nguyên.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** IE / Kỹ thuật sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `StandardID` | UUID | Có | `STD-FG001-CUT-M01` | Khóa chính định mức sản xuất. |
| `ProductRevisionID` | UUID | Có | `REV-FG001-R2` | Tham chiếu Revision sản phẩm. |
| `RoutingOperationID` | UUID | Có | `RTO-0020` | Tham chiếu công đoạn trong Routing. |
| `WorkCenterID` | UUID | Có | `WC-CUT` | Tham chiếu Work Center áp dụng. |
| `EquipmentID` | UUID | Không | `EQ-CUT-01` | Thiết bị cụ thể; `NULL` = Dùng chuẩn chung của Work Center. |
| `BaseQuantity` | Decimal(18,3) | Có | `1.000` | Số lượng sản phẩm cơ sở dùng tính chu kỳ. |
| `SetupTimeMin` | Decimal(12,3) | Có | `5.000` | Thời gian chuẩn bị/Cài đặt máy cho 1 lô (Phút). |
| `CycleTimeSec` | Decimal(12,3) | Có | `45.000` | Thời gian chạy máy cho 1 `BaseQuantity` (Giây). |
| `LaborCount` | Decimal(6,2) | Có | `1.00` | Số lượng nhân công trực tiếp định mức. |
| `StandardYield` | Decimal(7,4) | Có | `0.9800` | Tỷ lệ sản phẩm đạt chuẩn dự kiến (98%). |
| `EfficiencyFactor` | Decimal(7,4) | Có | `0.9000` | Hệ số hiệu suất thực tế dùng cho lập kế hoạch (90%). |
| `SourceMethod` | Enum | Có | `TimeStudy` | Phương pháp xác định: `Engineering`, `TimeStudy`, `HistoricalApproved`. |
| `SampleSize` | Integer | Không | `30` | Kích thước mẫu đo thực tế. |
| `ValidFrom` | DateTime | Có | `2026-08-01` | Thời điểm bắt đầu có hiệu lực. |
| `ReviewDueDate` | Date | Không | `2026-11-01` | Hạn rà soát lại định mức. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-PLAN-01** | Điều độ | Tính toán tổng thời gian cần thiết (Planned Duration) để xếp tải máy. | Kế hoạch sản xuất bám sát thời gian thực tế. |
| **UC-EX-03** | MES | So sánh `CycleTime` thực tế ghi nhận từ Kiosk với định mức chuẩn. | Cảnh báo kịp thời khi công đoạn bị chậm tiến độ. |
| **UC-MGR-01** | Quản lý | Rà soát các công đoạn giảm năng suất và phát hành `Standard` mới. | Cập nhật định mức thực tế mà không phá hủy dữ liệu quá khứ. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Thứ tự ưu tiên áp dụng định mức: Ưu tiên dùng chuẩn theo `EquipmentID` cụ thể; nếu không có mới dùng chuẩn chung theo `WorkCenterID`.
- Một tổ hợp `[ProductRevisionID + RoutingOperationID + Resource]` chỉ được phép tồn tại duy nhất một định mức có hiệu lực tại một thời điểm.
- Cấm tự động đè đổi chuẩn từ dữ liệu transaction thực tế mà chưa thông qua quy trình duyệt của IE/Kỹ thuật.

---

## C5. MD_WORK_INSTRUCTION — Hướng dẫn công việc

### 1. Thông tin chung (Overview)
- **Mục đích:** Cung cấp hướng dẫn thao tác, quy trình chuẩn (SOP), hình ảnh hoặc video trực quan trên màn hình Kiosk cho từng công đoạn/SKU.
- **Mức ưu tiên:** MVP-Recommended
- **Data Owner đề xuất:** Kỹ thuật / Chất lượng

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `InstructionID` | UUID | Có | `WI-CUT-001` | Khóa chính bản ghi hướng dẫn. |
| `InstructionCode` | String(50) | Có | `WI-CUT-RUB` | Mã tài liệu hướng dẫn. |
| `OperationID` | UUID | Có | `OP-CUT` | Tham chiếu công đoạn áp dụng. |
| `ProductRevisionID` | UUID | Không | `REV-FG001-R2` | Áp dụng riêng cho SKU; `NULL` = Dùng chung cho công đoạn. |
| `InstructionVersion` | Integer | Có | `2` | Số phiên bản tài liệu. |
| `ContentType` | Enum | Có | `PDF` | Loại định dạng: `Text`, `PDF`, `Image`, `Video`, `URL`. |
| `ContentURI` | String(500) | Có | `/docs/WI-CUT-002.pdf` | Đường dẫn lưu trữ tài liệu. |
| `AcknowledgementRequired`| Boolean | Có | `No` | `Yes`: Công nhân bắt buộc bấm "Xác nhận đã đọc" trước khi Start job. |
| `Status` | Enum | Có | `Released` | Trạng thái: `Draft`, `InReview`, `Released`, `Obsolete`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-EX-01** | Công nhân | Mở xem ngay hướng dẫn thao tác (WI/SOP) trên màn hình Kiosk khi nhận việc. | Hạn chế thao tác sai kỹ thuật tại hiện trường. |
| **UC-TRACE-01** | Quản lý | Kiểm tra phiên bản tài liệu hướng dẫn nào đang có hiệu lực lúc sản xuất. | Phục vụ công tác đánh giá chất lượng (Audit). |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Kiosk chỉ hiển thị tài liệu hướng dẫn có `Status = Released` và đang nằm trong khoảng thời gian hiệu lực.
- Trường hợp có tài liệu cấu hình riêng cho `ProductRevisionID` cụ thể, Kiosk sẽ ưu tiên hiển thị tài liệu này thay cho tài liệu dùng chung của công đoạn.

### 5. Quyền sở hữu Operation, Routing và Production Standard (2026-07-27)

`MD_OPERATION` là nguồn duy nhất cho định nghĩa nghiệp vụ và engineering
defaults. Confirmation Mode, Quantity Reporting, Material Scan, Output Label,
Allow Partial Completion, Planning Enabled và các default Cycle/Setup/Base
Quantity, Required Persons, Efficiency, Yield không được chỉnh sửa trong
Routing.

`MD_ROUTING_OPERATION` sở hữu cấu trúc kế hoạch: Work Center, Sequence,
Predecessor, Scheduling, Queue/Move, Overlap, Transfer Batch và Milestone.
Các giá trị chuẩn kế hoạch được lưu tại `MD_PRODUCTION_STANDARD` theo
`RoutingOperationID`; Routing editor chỉ là giao diện thống nhất cho hai phần
lưu trữ này. Work Order chụp các giá trị kế hoạch thành snapshot khi tạo và
Compute & Check không đọc lại Operation Catalog.

#### Kế thừa giá trị kế hoạch

Routing Operation có `PlanningMode`: `INHERITED` hoặc `ROUTING_OVERRIDE`.
Ở chế độ kế thừa, giao diện chỉ hiển thị giá trị đã phân giải và nguồn dữ
liệu. Ở chế độ override, người dùng chủ động tạo hoặc thay thế Production
Standard gắn với Routing Operation. Workstation Capability chỉ dùng để tư vấn
năng lực và chọn nguồn lực, không được ghi đè định mức kế hoạch.

Nguồn phân giải theo thứ tự: Production Standard của Routing đã Released,
Production Standard Work Center đã Released, rồi engineering default của
Operation. Công đoạn schedulable chưa phân giải đủ cycle time, base quantity,
workers, efficiency hoặc yield không được Release. Work Order lưu lại toàn bộ
giá trị và nguồn đã phân giải vào planning snapshot; thay đổi master data sau
đó không thay đổi Work Order đã tạo.

## C7. Production Version Compatibility Boundary (2026-07-29)

Routing is an independent operation flow and does not store `item_revision_id`; Site is resolved from its Work Center context. Production Version selects a Released MBOM and Routing, derives Item Revision from MBOM, derives Site from Routing, and validates Site compatibility, base UOM, current MBOM lines, issue-operation membership and Work Center scope before release. Routing operations remain process occurrences of reusable Operation Catalog records; Routing owns order, dependencies and resource capability context.

Draft Routing edits synchronize the current operation graph by stable `md_routing_operation.master_id`; unchanged
operations are updated in place so Production Standards and worker-skill overrides retain their references. Removed
operations become inactive history. Sequence uniqueness applies only to current active operations. Routing detail
must show resolved planning values and their source, not browser defaults. The base-quantity lifecycle estimate is
`setup * 60 + cycle + queue * 60 + move * 60`; Work Order duration is calculated separately from WO quantity and
runtime resource/calendar factors.
