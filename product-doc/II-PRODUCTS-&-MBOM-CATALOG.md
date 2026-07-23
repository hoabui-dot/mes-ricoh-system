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
| `ChangeReason` | String(500) | Không | Thay độ dày | Lý do thay đổi phiên bản kỹ thuật. |
| `ReleasedBy` | UserID | Không | `USR-ENG-01` | ID Người phê duyệt phát hành. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-01** | Kỹ thuật | Phát hành revision mới cho SKU khi có thay đổi thiết kế. | WO mới áp dụng revision mới, WO cũ giữ nguyên lịch sử. |
| **UC-TRACE-01** | Quản lý | Truy xuất sản phẩm thực tế được sản xuất theo revision nào. | Bảo toàn dấu vết thay đổi kỹ thuật (Traceability). |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Tại một thời điểm, mỗi SKU chỉ có duy nhất một `RevisionStatus = Released` làm mặc định cho từng Site.
- Cấm sửa đổi dữ liệu lõi của revision đã ở trạng thái `Released`; mọi thay đổi bắt buộc phải phát hành `Revision` mới.

---

## B3. MD_MBOM_HEADER — MBOM Header

### 1. Thông tin chung (Overview)
- **Mục đích:** Định nghĩa cấu trúc sản xuất đa cấp của một phiên bản thành phẩm tại một Nhà máy (Site).
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `MBOMID` | UUID | Có | `MBOM-FG001-V1` | Khóa chính MBOM Header. |
| `MBOMCode` | String(50) | Có | `MBOM-FG001` | Mã định danh MBOM. |
| `ProductRevisionID` | UUID | Có | `REV-FG001-R2` | Tham chiếu Revision thành phẩm đầu ra. |
| `SiteID` | UUID | Có | `SITE-HN01` | Nhà máy áp dụng MBOM. |
| `MBOMVersion` | Integer | Có | `1` | Số phiên bản cấu trúc BOM. |
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

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-PLAN-02** | Điều độ | Lựa chọn nguyên vật liệu thay thế khi vật tư chuẩn bị thiếu. | WO vẫn tiến hành sản xuất nhưng giữ được kiểm soát. |
| **UC-TRACE-01** | Quản lý | Truy xuất lịch sử xem WO thực tế đã tiêu hao vật tư thay thế nào. | Đảm bảo minh bạch nguồn gốc dòng vật tư (Genealogy). |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Vật tư `SubstituteRevisionID` cấm trùng với `ComponentRevisionID` của dòng MBOM gốc.
- Vật tư thay thế bắt buộc phải cùng nhóm kỹ thuật hoặc phải thông qua quy trình phê duyệt kiểm định.

---

## B6. MD_PRODUCTION_VERSION — Phiên bản sản xuất

### 1. Thông tin chung (Overview)
- **Mục đích:** Khóa cố định bộ ba hợp lệ **[Item Revision + MBOM + Routing]** tại một Nhà máy để lập Lệnh sản xuất (WO), tránh rủi ro chọn sai cấu hình kỹ thuật.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật sản xuất / Điều độ

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `ProductionVersionID`| UUID | Có | `PV-FG001-01` | Khóa chính phiên bản sản xuất. |
| `ProductRevisionID` | UUID | Có | `REV-FG001-R2` | Tham chiếu Revision thành phẩm đầu ra. |
| `MBOMID` | UUID | Có | `MBOM-FG001-V1` | Tham chiếu cấu trúc MBOM được duyệt. |
| `RoutingID` | UUID | Có | `RT-FG001-V1` | Tham chiếu quy trình Routing được duyệt. |
| `SiteID` | UUID | Có | `SITE-HN01` | Nhà máy áp dụng cấu hình này. |
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
- `MBOMID` và `RoutingID` được liên kết bắt buộc phải thuộc cùng một `SiteID` và cùng một `ProductRevisionID`.
- Tại một thời điểm, chỉ cho phép duy nhất một bản ghi có `DefaultFlag = Yes` có hiệu lực cho cùng một tổ hợp `[ProductRevisionID + SiteID + Khoảng LotSize]`.