# PHẦN V: TRUY XUẤT QR MẸ–CON (TRACEABILITY & QR CATALOG)

Tài liệu đặc tả danh mục Master Data quản lý chính sách truy xuất nguồn gốc (`Traceability Policy`), quy tắc sinh mã (`Numbering Rule`), quy tắc phân tách QR mẹ–con (`QR Split Rule`) và mẫu tem in QR (`Label Template`) cho hệ thống MES MVP.

---

## E1. MD_TRACEABILITY_POLICY — Chính sách truy xuất

### 1. Thông tin chung (Overview)
- **Mục đích:** Quy định Item/ItemGroup được quản lý theo Lot, Serial hay quan hệ QR mẹ–con, thời điểm phát sinh tem và chế độ quản lý lịch sử nguồn gốc.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Sản xuất / Chất lượng

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `TracePolicyID` | UUID | Có | `TP-RUB-001` | Khóa chính chính sách truy xuất. |
| `ItemID` | UUID | Không | `ITM-FG-001` | Tham chiếu Item cụ thể (`MD_ITEM`); `NULL` nếu áp dụng theo nhóm. |
| `ItemGroup` | String(80) | Không | `RubberSheet` | Tham chiếu nhóm Item áp dụng; `NULL` nếu chỉ định Item cụ thể. |
| `TrackingLevel` | Enum | Có | `ParentChild` | Cấp độ theo dõi: `None`, `Lot`, `Serial`, `ParentChild`. |
| `LotCreationPoint` | Enum | Có | `WORelease` | Thời điểm tạo Lot: `WORelease`, `OperationStart`, `OperationFinish`. |
| `ChildLabelCreationMode`| Enum | Có | `PreGenerateInactive` | Chế độ sinh tem con: `OnDemand`, `PreGenerateInactive`. |
| `AllowSplit` | Boolean | Có | `Yes` | `Yes`: Cho phép thực hiện thao tác tách lô/tấm. |
| `AllowMerge` | Boolean | Có | `No` | `Yes`: Cho phép thực hiện thao tác gộp lô/tấm. |
| `RequireMaterialGenealogy`| Boolean | Có | `Yes` | `Yes`: Bắt buộc lưu trữ mối quan hệ nguồn–đích giữa các vật tư. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-TR-01** | MES | Xác định luồng quét tương ứng khi công nhân tiếp nhận tấm mẹ tại trạm. | Hệ thống mở đúng giao diện và chức năng xử lý QR mẹ–con. |
| **UC-TRACE-01** | Quản lý | Thực hiện truy ngược bán thành phẩm con về lại tấm mẹ hoặc lô nguồn gốc. | Bảo đảm cây gia hệ truy xuất nguồn gốc (Genealogy) end-to-end. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Bắt buộc phải khai báo ít nhất một trong hai trường: `ItemID` hoặc `ItemGroup`.
- Trường hợp có cấu hình riêng cho `ItemID` cụ thể, hệ thống sẽ ưu tiên áp dụng cấu hình này thay cho cấu hình `ItemGroup` chung.

---

## E2. MD_NUMBERING_RULE — Quy tắc sinh mã

### 1. Thông tin chung (Overview)
- **Mục đích:** Khai báo quy tắc tự động sinh mã duy nhất cho Lot, tem QR mẹ, tem QR con và các định danh truy xuất trong hệ thống.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản trị hệ thống

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `NumberRuleID` | UUID | Có | `NR-CHILD-01` | Khóa chính quy tắc sinh mã. |
| `EntityType` | Enum | Có | `ChildLabel` | Loại đối tượng áp dụng: `Lot`, `ParentLabel`, `ChildLabel`. |
| `SiteID` | UUID | Có | `SITE-HN01` | Phạm vi Nhà máy (Site) áp dụng. |
| `PrefixTemplate` | String(100) | Có | `CH-{YY}{MM}{DD}-` | Mẫu Prefix (hỗ trợ biến thời gian `{YY}`, `{MM}`, `{DD}`). |
| `SequenceLength` | Integer | Có | `6` | Độ dài chữ số của chuỗi số tăng tự động (ví dụ: `000152`). |
| `ResetFrequency` | Enum | Có | `Daily` | Tần suất Reset chuỗi số: `Never`, `Yearly`, `Monthly`, `Daily`. |
| `CheckDigitMethod` | Enum | Không | `Mod10` | Phương pháp tính chữ số kiểm tra: `Không`, `Mod10`, `Custom`. |
| `CurrentSequence` | BigInteger | Có | `152` | Giá trị số tự tăng hiện tại. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-TR-02** | MES | Tự động sinh mã QR con không trùng lặp khi kích hoạt/in tem. | Mỗi bán thành phẩm con sở hữu duy nhất một định danh (ID). |
| **UC-TRACE-01** | Quản lý | Tra cứu và tìm kiếm thông tin theo quy tắc cấu trúc mã chuẩn. | Đơn giản hóa công tác đối soát và truy vấn dữ liệu. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Thao tác tăng giá trị `CurrentSequence` bắt buộc phải đạt tính nguyên tố (Atomic Operation) trên Database để chống trùng mã khi ghi nhận đồng thời.
- Cấm tồn tại hai quy tắc ở trạng thái `Status = Active` trùng lặp tổ hợp `[EntityType + SiteID]` trong cùng một khoảng thời gian hiệu lực.

---

## E3. MD_QR_SPLIT_RULE — Quy tắc tách QR mẹ–con

### 1. Thông tin chung (Overview)
- **Mục đích:** Định nghĩa quy tắc và thuật toán phân tách một tấm/lô mẹ thành nhiều bán thành phẩm con tại công đoạn cắt.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật sản xuất / Chất lượng

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `SplitRuleID` | UUID | Có | `SR-RUB-001` | Khóa chính quy tắc tách QR. |
| `SourceItemRevisionID`| UUID | Có | `REV-ME-R1` | Tham chiếu Revision Item nguồn (Tấm/Lô mẹ). |
| `TargetItemRevisionID`| UUID | Có | `REV-CHILD-R1` | Tham chiếu Revision Item đích (Tấm/Lô con). |
| `OperationID` | UUID | Có | `OP-CUT` | Công đoạn duy nhất cho phép thực hiện thao tác tách. |
| `SourceUOMID` | UUID | Có | `UOM-M2` | Đơn vị tính của sản phẩm mẹ. |
| `TargetUOMID` | UUID | Có | `UOM-M2` | Đơn vị tính của sản phẩm con. |
| `QuantityMethod` | Enum | Có | `OperatorInput` | Phương thức xác định lượng con: `Fixed`, `OperatorInput`, `FromTemplate`. |
| `DefaultChildQty` | Decimal(18,6) | Không | `0.500000` | Số lượng mặc định cho mỗi mã con. |
| `MaxChildren` | Integer | Có | `20` | Số lượng mã con tối đa sinh ra từ một mã mẹ. |
| `TolerancePercent` | Decimal(7,3) | Có | `2.000` | Tỷ lệ sai số cân bằng vật chất cho phép (2%). |
| `ActivationMode` | Enum | Có | `ActivateOnScan` | Chế độ kích hoạt tem con: `ActivateOnScan`, `ActivateOnConfirm`. |
| `RemainderPolicy` | Enum | Có | `KeepParentBalance` | Chính sách xử lý phần dư mẹ: `KeepParentBalance`, `CreateRemainderChild`, `Scrap`. |
| `RequireSecondCheck` | Boolean | Có | `No` | `Yes`: Yêu cầu quản lý/QC xác nhận lại lần 2. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-TR-01** | Công nhân | Quét mã QR tấm mẹ tại trạm cắt. | MES tải đúng quy tắc `SplitRule` tương ứng. |
| **UC-TR-02** | Công nhân | Nhập số lượng/kích thước các tấm con và thực hiện kích hoạt tem. | Tem con được sinh ra và kích hoạt theo đúng quy tắc cấu hình. |
| **UC-TR-03** | MES | Kiểm tra tổng sản lượng các tấm con không vượt quá lượng tấm mẹ + tỷ lệ `TolerancePercent`. | Ngăn chặn hành vi tách sai lệch số lượng vật chất thực tế. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Cả `SourceItemRevisionID` và `TargetItemRevisionID` bắt buộc phải có `TraceabilityPolicy` hợp lệ đang kích hoạt.
- Cấm tổng số lượng sản phẩm con sau quy đổi vượt quá số lượng sản phẩm mẹ cộng thêm tỷ lệ sai số `TolerancePercent`.
- `SplitRule` chỉ được phép thực thi tại công đoạn (`OperationID`) đã được cấu hình trong bảng.

---

## E4. MD_LABEL_TEMPLATE — Mẫu tem QR

### 1. Thông tin chung (Overview)
- **Mục đích:** Định nghĩa cấu trúc, thông số kích thước, ngôn ngữ máy in và schema dữ liệu mã hóa hiển thị cho tem mẹ, tem con và tem lô.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Sản xuất / IT

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `LabelTemplateID` | UUID | Có | `LBL-CHILD-001` | Khóa chính mẫu tem. |
| `TemplateCode` | String(50) | Có | `QR-CHILD-70X40` | Mã định danh mẫu tem. |
| `LabelPurpose` | Enum | Có | `ChildLabel` | Mục đích sử dụng tem: `ParentLabel`, `ChildLabel`, `LotLabel`. |
| `ItemGroup` | String(80) | Không | `RubberSheet` | Nhóm Item áp dụng mẫu tem này; `NULL` = Dùng chung. |
| `WidthMM` | Decimal(8,2) | Có | `70.00` | Chiều rộng tem (mm). |
| `HeightMM` | Decimal(8,2) | Có | `40.00` | Chiều cao tem (mm). |
| `PrinterLanguage` | Enum | Có | `ZPL` | Ngôn ngữ máy in lệnh: `ZPL`, `TSPL`, `PDF`. |
| `TemplateContentURI` | String(500) | Có | `/labels/child_v2.zpl` | Đường dẫn lưu trữ tập tin mẫu in. |
| `PayloadSchema` | String(500) | Có | `LabelID,Item,Lot,ParentID,Qty` | Danh sách các trường dữ liệu bắt buộc mã hóa vào mã QR. |
| `TemplateVersion` | Integer | Có | `2` | Phiên bản thiết kế mẫu tem. |
| `Status` | Enum | Có | `Released` | Trạng thái: `Draft`, `InReview`, `Released`, `Obsolete`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-TR-02** | Công nhân | Thực hiện in và dán tem con sau khi hoàn thành công đoạn cắt. | Tem in ra chứa đầy đủ các thông tin: `LabelID`, `Item`, `Lot`, `ParentID`, `Qty`. |
| **UC-TRACE-01** | Quản lý | Truy xuất phiên bản mẫu tem đã được sử dụng khi sản xuất lô hàng. | Phục vụ công tác đối soát và kiểm tra lịch sử in ấn. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Mẫu tem đã ở trạng thái `Status = Released` cấm chỉnh sửa nội dung trực tiếp; mọi thay đổi thiết kế phải phát hành phiên bản `TemplateVersion` mới.
- Cấu trúc `PayloadSchema` của mẫu tem con (`ChildLabel`) bắt buộc phải chứa trường `LabelID` duy nhất và trường `ParentID` để liên kết thông tin về mã mẹ.