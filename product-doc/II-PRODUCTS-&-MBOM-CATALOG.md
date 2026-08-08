# PHẦN II: SẢN PHẨM VÀ MBOM (PRODUCTS & MBOM CATALOG)

Tài liệu đặc tả danh mục Master Data quản lý SKU, phiên bản kỹ thuật (Revision), cấu trúc định mức sản xuất đa cấp (MBOM) và cấu hình phiên bản sản xuất (Production Version) cho hệ thống MES MVP.

---

## B1. MD_ITEM — Danh mục Item / SKU

### 1. Thông tin chung (Overview)
- **Mục đích:** Quản lý 160–200 SKU bao gồm thành phẩm, bán thành phẩm, nguyên vật liệu và vật tư phụ.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản trị Master Data / Kỹ thuật

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `ItemID` | UUID | Có | `ITM-FG-001` | Khóa chính kỹ thuật (Primary Key). |
| `ItemCode` | String(50) | Có | `FG-RUB-001` | Mã SKU duy nhất toàn hệ thống. |
| `ItemName` | String(200) | Có | Tấm cao su thành phẩm 10 mm | Tên hiển thị của sản phẩm. |
| `ItemType` | Enum | Có | `FinishedGood` | Phân loại Item: `FinishedGood`, `SemiFinished`, `RawMaterial`, `Consumable`. |
| `ItemGroup` | String(80) | Có | `RubberSheet` | Nhóm phân loại SKU. |
| `BaseUOMID` | UUID | Có | `UOM-M2` | Đơn vị tính cơ sở (Tham chiếu `MD_UOM`). |
| `PlanningStrategy` | Enum | Có | `MTO` | Chiến lược kế hoạch: `MTS`, `MTO`, `ETO`. |
| `ProcurementType` | Enum | Có | `Make` | Phương thức cung ứng: `Make`, `Buy`, `Subcontract`. |
| `TrackingLevel` | Enum | Có | `Lot` | Cấp độ truy xuất: `None`, `Lot`, `Serial`, `ParentChild`. |
| `DefaultScrapRate` | Decimal(7,4) | Không | `0.0200` | Tỷ lệ hao hụt mặc định (2%); MBOM Line có thể ghi đè. |
| `Status` | Enum | Có | `Active` | Trạng thái vòng đời: `Draft`, `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-01** | Quản trị Master Data | Tạo mới và phân loại SKU vào hệ thống. | SKU sẵn sàng dùng trong MBOM và WO. |
| **UC-PLAN-01** | Điều độ sản xuất | Lọc các SKU loại `Make` để lập Lệnh sản xuất. | Chỉ sản phẩm hợp lệ mới được lập WO. |
| **UC-TR-01** | Công nhân | Hệ thống nhận diện chính sách `Lot`/`ParentChild` theo Item. | Luồng quét mã QR được kích hoạt đúng loại sản phẩm. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- `ItemCode` không được phép thay đổi sau khi chuyển sang trạng thái `Active`.
- `ItemType` và `ProcurementType` phải tương thích về mặt logic (ví dụ: `FinishedGood` không đi cùng mua ngoài `Buy` trực tiếp).

---

## B2. MD_ITEM_REVISION — Phiên bản Item

### 1. Thông tin chung (Overview)
- **Mục đích:** Quản lý thay đổi kỹ thuật và hiệu lực sản xuất mà không ghi đè lịch sử SKU.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật / Quản lý sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `ItemRevisionID` | UUID | Có | `REV-FG001-R2` | Khóa chính phiên bản Item. |
| `ItemID` | UUID | Có | `ITM-FG-001` | Tham chiếu Item gốc (`MD_ITEM`). |
| `RevisionNo` | String(20) | Có | `R2` | Mã ký hiệu phiên bản. |
| `RevisionStatus` | Enum | Có | `Released` | Trạng thái: `Draft`, `InReview`, `Released`, `Obsolete`. |
| `SpecificationRef` | String(255) | Không | `SPEC-RUB-002` | Mã tham chiếu tài liệu spec/bản vẽ kỹ thuật. |
| `EffectiveFrom` | DateTime | Có | `2026-08-01` | Thời điểm bắt đầu có hiệu lực. |
| `EffectiveTo` | DateTime | Không | *NULL* | Thời điểm kết thúc hiệu lực (Để trống nếu còn dùng). |
| `ChangeReason` | String(500) | Có với revision kế nhiệm | Thay độ dày | Lý do thay đổi phiên bản kỹ thuật; revision đầu tiên có thể để trống. |
| `ReleasedBy` | UserID | Không | `USR-ENG-01` | ID Người phê duyệt phát hành. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-01** | Kỹ thuật | Phát hành revision mới cho SKU khi có thay đổi thiết kế. | WO mới áp dụng revision mới, WO cũ giữ nguyên lịch sử. |
| **UC-TRACE-01** | Quản lý | Truy xuất sản phẩm thực tế được sản xuất theo revision nào. | Bảo toàn dấu vết thay đổi kỹ thuật (Traceability). |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Tại một thời điểm, mỗi SKU chỉ có duy nhất một `RevisionStatus = Released` làm mặc định cho từng Site.
- Cấm sửa đổi dữ liệu lõi của revision đã ở trạng thái `Released`; mọi thay đổi bắt buộc phải phát hành `Revision` mới.
- Khi tạo revision kế nhiệm, backend phải đóng khoảng hiệu lực của revision liền trước đúng tại `EffectiveFrom` mới và ghi temporal audit trong cùng transaction; các khoảng `[EffectiveFrom, EffectiveTo)` không được chồng lấn.

---

## B3. MD_MBOM_HEADER — MBOM Header

### 1. Thông tin chung (Overview)
- **Mục đích:** Định nghĩa cấu trúc sản xuất đa cấp. MBOM không sở hữu Nhà máy (Site); Production Version là nơi liên kết cấu hình sản xuất và lưu Site thực thi được suy ra từ Routing Work Center.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `MBOMID` | UUID | Có | `MBOM-FG001-V1` | Khóa chính MBOM Header. |
| `MBOMCode` | String(50) | Có | `MBOM-FG001` | Mã định danh MBOM. |
| `BaseQuantity` | Decimal(18,6) | Có | `1.000000` | Sản lượng cơ sở dùng để tính định mức. |
| `BaseUOMID` | UUID | Có | `UOM-M2` | Đơn vị tính của sản lượng cơ sở. |
| `ValidFrom` | DateTime | Có | `2026-08-01` | Thời điểm bắt đầu hiệu lực MBOM. |
| `ValidTo` | DateTime | Không | *NULL* | Thời điểm hết hiệu lực. |
| `Status` | Enum | Có | `Released` | Trạng thái: `Draft`, `InReview`, `Released`, `Obsolete`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-02** | Kỹ thuật | Thiết lập cấu trúc MBOM đa cấp cho SKU thành phẩm. | Hệ thống xác định chính xác danh mục NVL/BTP cần dùng. |
| **UC-PLAN-01** | Điều độ | Bung cấu trúc MBOM (Explosion) để tính toán nhu cầu vật tư. | Kế hoạch sản xuất có đầy đủ nhu cầu vật tư chính xác. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Một Header MBOM hợp lệ bắt buộc phải chứa ít nhất một dòng chi tiết (`MD_MBOM_LINE`).
- Chỉ những MBOM có `Status = Released` mới được phép liên kết vào `MD_PRODUCTION_VERSION`.

---

## B4. MD_MBOM_LINE — Chi tiết MBOM

### 1. Thông tin chung (Overview)
- **Mục đích:** Khai báo từng thành phần, cấp BOM, định mức, hao hụt, cờ Phantom và công đoạn cấp phát vật tư.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `MBOMLineID` | UUID | Có | `MBL-00010` | Khóa chính dòng MBOM. |
| `MBOMID` | UUID | Có | `MBOM-FG001-V1` | Tham chiếu Header (`MD_MBOM_HEADER`). |
| `ParentLineID` | UUID | Không | `MBL-00001` | ID dòng cha để tạo cây đa cấp; `NULL` nếu là cấp trực tiếp của thành phẩm. |
| `SequenceNo` | Integer | Có | `10` | Thứ tự hiển thị dòng định mức. |
| `ComponentRevisionID`| UUID | Có | `REV-RM001-R1` | Tham chiếu Item/Revision thành phần đầu vào. |
| `QuantityPer` | Decimal(18,6) | Có | `1.050000` | Định mức tiêu hao trên một `BaseQuantity`. |
| `UOMID` | UUID | Có | `UOM-M2` | Đơn vị tính định mức. |
| `ScrapRate` | Decimal(7,4) | Có | `0.0300` | Tỷ lệ hao hụt dự kiến cho dòng (3%). |
| `PhantomFlag` | Boolean | Có | `No` | `Yes`: Bung thành phần con, không phát sinh WO độc lập. |
| `IssueOperationID` | UUID | Không | `OP-CUT` | Công đoạn tiêu hao / cấp phát vật tư này. |
| `BackflushFlag` | Boolean | Có | `Yes` | `Yes`: Tự động tính trừ kho tiêu hao khi công đoạn hoàn thành. |
| `OptionalFlag` | Boolean | Có | `No` | `Yes`: Dòng vật tư tùy chọn (không bắt buộc). |
| `EffectiveFrom` | DateTime | Có | `2026-08-01` | Thời điểm dòng bắt đầu có hiệu lực. |
| `EffectiveTo` | DateTime | Không | *NULL* | Thời điểm dòng hết hiệu lực. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-02** | Kỹ thuật | Khai báo chi tiết vật tư, định mức và tỷ lệ hao hụt. | MBOM phản ánh chính xác công nghệ và phương thức chế tạo. |
| **UC-PLAN-01** | Điều độ | Tính toán lượng NVL cần thiết cho Lệnh sản xuất. | Nhu cầu NVL = $\text{WO Qty} \times \text{QuantityPer} \times (1 + \text{ScrapRate})$. |
| **UC-EX-03** | MES | Tự động khấu trừ vật tư (Backflush) khi bấm hoàn thành. | Ghi nhận tiêu hao chính xác theo định mức thực thi MVP. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Tuyệt đối không cho phép vòng lặp trong cây cấu trúc BOM (Circular Reference Check).
- Cờ `PhantomFlag` là thuộc tính thiết lập quan hệ trên từng dòng `MD_MBOM_LINE`, không đặt cố định tại `MD_ITEM`.
- Giá trị định mức `QuantityPer` bắt buộc phải $> 0$.
- Loại Item đầu vào phải theo loại Item đầu ra của MBOM: đầu ra `FG` chỉ nhận thành phần `SFG` hoặc `RM`; đầu ra `SFG` chỉ nhận thành phần `RM`. `FG` không bao giờ là thành phần MBOM.

---

## B5. MD_COMPONENT_SUBSTITUTE — Vật tư thay thế

### 1. Thông tin chung (Overview)
- **Mục đích:** Khai báo danh mục vật tư thay thế cho phép sử dụng khi vật tư chính thiếu hụt, đảm bảo kiểm soát ưu tiên và tỷ lệ quy đổi.
- **Mức ưu tiên:** MVP-Recommended
- **Data Owner đề xuất:** Kỹ thuật / Sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `SubstituteID` | UUID | Có | `SUB-001` | Khóa chính bản ghi vật tư thay thế. |
| `MBOMLineID` | UUID | Có | `MBL-00010` | Tham chiếu dòng MBOM gốc (`MD_MBOM_LINE`). |
| `SubstituteRevisionID`| UUID | Có | `REV-RM009-R1` | Tham chiếu Item/Revision của vật tư thay thế. |
| `PriorityNo` | Integer | Có | `1` | Thứ tự ưu tiên lựa chọn (1, 2, 3...). |
| `ConversionFactor` | Decimal(18,6) | Có | `1.000000` | Hệ số quy đổi (1 đơn vị chuẩn = $N$ đơn vị thay thế). |
| `MaxUsagePercent` | Decimal(7,2) | Không | `100.00` | Tỷ lệ phần trăm sử dụng tối đa cho phép trong một WO. |
| `RequiresApproval` | Boolean | Có | `Yes` | `Yes`: Bắt buộc Quản lý phê duyệt khi bấm chọn thay thế. |
| `EffectiveFrom` | DateTime | Có | `2026-08-01` | Thời điểm quy tắc thay thế có hiệu lực. |
| `EffectiveTo` | DateTime | Không | `2026-12-31` | Thời điểm quy tắc thay thế hết hiệu lực; để trống nếu không giới hạn. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-PLAN-02** | Điều độ | Lựa chọn nguyên vật liệu thay thế khi vật tư chuẩn bị thiếu. | WO vẫn tiến hành sản xuất nhưng giữ được kiểm soát. |
| **UC-TRACE-01** | Quản lý | Truy xuất lịch sử xem WO thực tế đã tiêu hao vật tư thay thế nào. | Đảm bảo minh bạch nguồn gốc dòng vật tư (Genealogy). |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Vật tư `SubstituteRevisionID` cấm trùng với `ComponentRevisionID` của dòng MBOM gốc.
- Revision thay thế phải ở trạng thái `Released` và đang nằm trong khoảng hiệu lực tại thời điểm khai báo.
- Vật tư thay thế tuân theo cùng ma trận loại Item như thành phần chính: MBOM đầu ra `FG` chỉ nhận `SFG` hoặc `RM`; MBOM đầu ra `SFG` chỉ nhận `RM`.
- Vật tư thay thế phải cùng `ItemGroup` kỹ thuật với thành phần chính.
- Base UOM phải giống thành phần chính. Nếu khác UOM, phải có UOM conversion `Released` đang hiệu lực: conversion theo Item phải thuộc Item thay thế; conversion dùng chung chỉ hợp lệ khi hai UOM cùng class/dimension.
- `PriorityNo` phải là số nguyên dương và không trùng trong cùng dòng MBOM; `ConversionFactor` phải lớn hơn `0`; `MaxUsagePercent` phải trong khoảng `(0, 100]`; khoảng ngày hiệu lực phải hợp lệ.
- Ngoại lệ tương thích là luồng kiểm định riêng: phải có `CompatibilityExceptionApproved = true` và lý do không rỗng, đồng thời bản ghi bắt buộc chờ phê duyệt. `RequiresApproval = true` đơn thuần không bỏ qua kiểm tra nhóm/UOM.

---

## B6. MD_PRODUCTION_VERSION — Phiên bản sản xuất

### 1. Thông tin chung (Overview)
- **Mục đích:** Khóa cố định tổ hợp hợp lệ **[MBOM + Routing]** để lập Lệnh sản xuất (WO). Item Revision được suy ra từ MBOM và Site được suy ra từ Routing, tránh cho người dùng chọn các giá trị kỹ thuật mâu thuẫn.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật sản xuất / Điều độ

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `ProductionVersionID`| UUID | Có | `PV-FG001-01` | Khóa chính phiên bản sản xuất. |
| `ProductRevisionID` | UUID | Backend suy ra | `REV-FG001-R2` | Snapshot Revision thành phẩm đầu ra, luôn bằng `MBOM.item_revision_id`; không phải field người dùng chọn. |
| `MBOMID` | UUID | Có | `MBOM-FG001-V1` | Tham chiếu cấu trúc MBOM được duyệt. |
| `RoutingID` | UUID | Có | `RT-FG001-V1` | Tham chiếu quy trình Routing được duyệt. |
| `SiteID` | UUID | Backend suy ra | `SITE-HN01` | Site duy nhất của các Work Center trong Routing; không phải field người dùng chọn. |
| `MinLotSize` | Decimal(18,3) | Không | `1.000` | Kích thước lô sản xuất tối thiểu. |
| `MaxLotSize` | Decimal(18,3) | Không | `1000.000` | Kích thước lô sản xuất tối đa. |
| `DefaultFlag` | Boolean | Có | `Yes` | `Yes`: Cấu hình mặc định tự động chọn khi tạo WO. |
| `ValidFrom` | DateTime | Có | `2026-08-01` | Thời điểm bắt đầu có hiệu lực. |
| `ValidTo` | DateTime | Không | *NULL* | Thời điểm kết thúc hiệu lực. |
| `Status` | Enum | Có | `Released` | Trạng thái: `Draft`, `InReview`, `Released`, `Obsolete`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-PLAN-01** | Điều độ | Chọn phiên bản sản xuất chuẩn khi khởi tạo WO. | WO tự động gắn đúng MBOM và Routing tương ứng. |
| **UC-TRACE-01** | Quản lý | Truy xuất thông tin cấu hình đã dùng để tạo WO. | Dữ liệu lịch sử cấu hình sản xuất bất biến. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- MBOM sở hữu `ProductRevisionID` và không có `SiteID`. Routing không sở hữu Item Revision và phải sử dụng Work Center thuộc đúng một Site. Production Version suy ra/lưu `ProductRevisionID` từ MBOM và `SiteID` từ Routing; Site của Revision đầu ra phải tương thích với Site của Routing.
- Tại một thời điểm, chỉ cho phép duy nhất một bản ghi có `DefaultFlag = Yes` có hiệu lực cho cùng một tổ hợp `[ProductRevisionID + SiteID + Khoảng LotSize]`.

## B7. Quyết định kiến trúc MBOM hiện hành (2026-07-29)

MBOM Header không sở hữu Site. Cùng một MBOM có thể được Production Version kết hợp với các Routing khác nhau; Site thực thi thuộc Production Version và được suy ra từ Site duy nhất của các Routing Work Center. MBOM Line là nơi sở hữu cấu trúc sản xuất đa cấp và định mức.

Không thêm trường `MBOMType` trùng lặp. Loại đầu ra Finished Good/Semi-Finished được suy ra từ Item Revision mà MBOM sở hữu; Raw Material không được phép làm đầu ra MBOM/Production Version. EBOM thuộc SAP và hiện không được lưu hoặc quản lý trong MES. Work Order chỉ sử dụng MBOM được chọn bởi Production Version và lưu snapshot bất biến.

Migration `0048_mbom_structure_and_substitute_controls` bổ sung cờ optional, uniqueness sequence theo sibling và metadata substitute có kiểu dữ liệu. Migration `0049_reconcile_released_mbom_line_lifecycle` sửa một dữ liệu legacy không nhất quán nhưng không đổi cấu trúc vật tư. Chi tiết API và giới hạn hiện tại: `implementation-fix/Redesign-MBOM-Architecture-and-Workflow-Implementation.md`.

## B8. Final MBOM Workflow Reconciliation (2026-07-29)

MBOM Header belongs to one output Item Revision through `item_revision_id` and has one business identity; there is no MBOM create-version workflow. A Released MBOM is immutable. A different manufacturing definition is created as a new MBOM with its own code. Current hierarchical lines are saved with complete replacement semantics and `expected_structure_version`; this technical counter prevents lost updates and is not a business version. Work Order explosion uses `quantity_per * (WO quantity / MBOM base quantity) * (1 + scrap_rate)`, skips unselected optional lines, and preserves MBOM line/parent identity in the Work Order snapshot. Production Version selects the MBOM and an independent Routing, then derives the output Item Revision from MBOM.

## B9.1. Site Ownership Correction (2026-08-06)

- `MD_MBOM_HEADER` không lưu `site_id`; form tạo/sửa/chi tiết/danh sách MBOM không hiển thị hoặc nhận Site.
- Routing Work Center là nguồn xác định Site thực thi. Tất cả Work Center đang hiệu lực của một Routing phải thuộc đúng một Site.
- `MD_PRODUCTION_VERSION.site_id` là snapshot Site của cấu hình sản xuất và được backend tự suy ra từ Routing; client không có quyền quyết định giá trị này.
- Work Order tiếp tục lưu snapshot Production Version/Site đã dùng và dữ liệu lịch sử không bị viết lại khi master data thay đổi.

Duplicate component policy: the same component may appear on different parents when the manufacturing structure requires it; active sibling sequence is unique under each parent. It is not implicitly aggregated across operations or parents because execution readiness and genealogy remain line-specific.

## B9. UOM Quantity Entry and Decimal Policy (2026-07-30)

UOM-aware quantities must use the selected Released UOM's `allow_fraction` and `decimal_precision`. Integer-only UOMs such as PCS accept `1` and reject `1.5`; a decimal UOM with precision 3 accepts `1.125` and rejects `1.1254`. The UI preserves the raw editing string and displays persisted values compactly (`1`, `1.5`, `1.25`) without insignificant trailing zeros. Invalid values are rejected rather than silently rounded. MBOM base quantity and line quantity are validated by the master-data service during create, update, validate, replacement and release.
