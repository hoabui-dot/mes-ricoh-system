# PHẦN I: MASTER DATA NỀN TẢNG (FOUNDATION MASTER DATA CATALOG)

Tài liệu đặc tả danh mục Master Data cấu trúc nền tảng bao gồm phạm vi tổ chức nhà máy (`Site`), xưởng sản xuất (`Production Area`), đơn vị tính (`UOM`), quy đổi đơn vị (`UOM Conversion`), ca làm việc (`Shift`) và mã nguyên nhân thực thi (`Reason Code`) cho hệ thống MES MVP.

---

## A1. MD_SITE — Nhà máy / Site

### 1. Thông tin chung (Overview)
- **Mục đích:** Xác định phạm vi nhà máy cho Work Center, lịch, tài nguyên và quyền truy cập. MBOM không thuộc Site; Site thực thi được xác định qua Routing và Production Version.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản trị hệ thống / Quản lý nhà máy

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `SiteID` | UUID | Có | `SITE-HN01` | Khóa chính nhà máy. |
| `SiteCode` | String(30) | Có | `HN01` | Mã nhà máy duy nhất toàn hệ thống. |
| `SiteName` | String(150) | Có | Nhà máy Hà Nội | Tên hiển thị của nhà máy. |
| `TimeZone` | String(50) | Có | `Asia/Ho_Chi_Minh` | Chuẩn hóa mốc thời gian Start/End trên Kiosk. |
| `DefaultCalendarID` | UUID | Không | `CAL-HN01` | Lịch làm việc mặc định của nhà máy. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-01** | Admin | Tạo Site trước khi khai báo xưởng, máy móc và SKU. | Dữ liệu được phân vùng chính xác theo đúng nhà máy. |
| **UC-SEC-01** | Quản lý | Giới hạn quyền truy cập và hiển thị dữ liệu theo Site. | Người dùng chỉ thao tác đúng phạm vi được cấp quyền. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- `SiteCode` bắt buộc phải là duy nhất trên toàn hệ thống.
- Cấm xóa nhà máy (`SiteID`) khi đã phát sinh Lệnh sản xuất (WO); chỉ được phép chuyển sang `Status = Inactive`.

---

## A2. MD_PRODUCTION_AREA — Xưởng / Khu vực / Line

### 1. Thông tin chung (Overview)
- **Mục đích:** Tạo cây tổ chức sản xuất để gắn Work Center, máy móc, Kiosk và phân quyền theo khu vực xưởng.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản lý sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `AreaID` | UUID | Có | `AREA-CUT` | Khóa chính khu vực/xưởng. |
| `SiteID` | UUID | Có | `SITE-HN01` | Tham chiếu nhà máy sở hữu (`MD_SITE`). |
| `AreaCode` | String(30) | Có | `CUT` | Mã xưởng / khu vực. |
| `AreaName` | String(150) | Có | Xưởng cắt | Tên hiển thị của xưởng. |
| `AreaType` | Enum | Có | `Workshop` | Loại khu vực: `Workshop`, `Line`, `Cell`, `Zone`. |
| `ParentAreaID` | UUID | Không | `AREA-RUBBER` | Tham chiếu khu vực cha (Hỗ trợ cấu trúc cây nhiều cấp). |
| `SequenceNo` | Integer | Không | `10` | Thứ tự hiển thị trên giao diện. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-03** | Quản lý sản xuất | Gán công đoạn cắt và Work Center vào xưởng cắt. | Quy trình (Routing) hiển thị đúng nơi thực hiện. |
| **UC-EX-01** | Công nhân | Kiosk lọc danh sách WO theo khu vực xưởng hiện trường. | Danh sách WO hiển thị phù hợp với vị trí trạm. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Không được phép tạo vòng lặp tham chiếu trong `ParentAreaID`.
- `AreaID` bắt buộc phải thuộc đúng `SiteID` sở hữu của Work Center tương ứng.

---

## A3. MD_UOM — Đơn vị tính

### 1. Thông tin chung (Overview)
- **Mục đích:** Chuẩn hóa đơn vị tính cho thành phẩm, nguyên vật liệu, tấm mẹ, bán thành phẩm con và định mức BOM.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản trị Master Data

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `UOMID` | UUID | Có | `UOM-M2` | Khóa chính đơn vị tính. |
| `UOMCode` | String(20) | Có | `M2` | Mã đơn vị tính (duy nhất). |
| `UOMName` | String(80) | Có | Mét vuông | Tên đơn vị tính hiển thị. |
| `UOMType` | Enum | Có | `Area` | Phân loại đơn vị: `Count`, `Length`, `Area`, `Weight`, `Time`. |
| `DecimalPrecision`| Integer | Có | `3` | Số chữ số phần thập phân cho phép lưu trữ. |
| `AllowFraction` | Boolean | Có | `Yes` | `Yes`: Cho phép nhập/tính toán số lẻ. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-02** | Kỹ thuật | Khai báo định mức `QuantityPer` trong MBOM theo KG, M2 hoặc PCS. | Tránh sai lệch đơn vị tính trong định mức. |
| **UC-TR-02** | Công nhân cắt | Ghi nhận lượng tấm mẹ tiêu hao và lượng tấm con thu hồi theo cùng đơn vị. | Kiểm soát cân bằng vật chất chính xác. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- `UOMCode` bắt buộc phải là duy nhất trên toàn hệ thống.
- Cấm thay đổi `UOMType` sau khi bản ghi đơn vị tính đã chuyển sang trạng thái `Released` hoặc đã dùng trong Master Data khác.

---

## A4. MD_UOM_CONVERSION — Quy đổi đơn vị

### 1. Thông tin chung (Overview)
- **Mục đích:** Thiết lập tỷ lệ quy đổi giữa đơn vị mua hàng / kho / sản xuất (Ví dụ: Cuộn $\to$ Mét, Tấm $\to$ $M^2$).
- **Mức ưu tiên:** MVP-Recommended
- **Data Owner đề xuất:** Kỹ thuật / Kho

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `ConversionID` | UUID | Có | `CV-RUB-001` | Khóa chính quy tắc quy đổi. |
| `ItemID` | UUID | Không | `ITM-RUBBER` | Tham chiếu Item áp dụng (`MD_ITEM`); Để trống nếu dùng chung. |
| `FromUOMID` | UUID | Có | `UOM-ROLL` | Tham chiếu đơn vị tính nguồn. |
| `ToUOMID` | UUID | Có | `UOM-M2` | Tham chiếu đơn vị tính đích. |
| `Factor` | Decimal(18,6) | Có | `25.000000` | Hệ số quy đổi: $1 \text{ FromUOM} = \text{Factor} \times \text{ToUOM}$. |
| `RoundingRule` | Enum | Có | `4 decimals` | Quy tắc làm tròn số sau quy đổi. |
| `EffectiveFrom` | Date | Có | `2026-08-01` | Ngày bắt đầu có hiệu lực quy đổi. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-02** | Kỹ thuật | Tính toán nhu cầu NVL khi BOM dùng $M^2$ nhưng kho quản lý theo Cuộn. | Nhu cầu vật tư và tiêu hao thực tế quy đổi thống nhất. |
| **UC-EX-03** | MES | Quy đổi sản lượng hoàn thành thực tế sang đơn vị báo cáo. | Hệ thống Dashboard tổng hợp chính xác số liệu. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Cấm cấu hình hệ số quy đổi `Factor = 0`.
- Mỗi tổ hợp `[Item + FromUOM + ToUOM]` chỉ được tồn tại duy nhất một bản ghi có hiệu lực tại một thời điểm.

---

## A5. MD_SHIFT — Ca làm việc

### 1. Thông tin chung (Overview)
- **Mục đích:** Xác định thời gian bắt đầu/kết thúc ca, giờ nghỉ và quỹ thời gian khả dụng chuẩn phục vụ lập lịch và ghi nhận thực thi.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản lý sản xuất / HR

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `ShiftID` | UUID | Có | `SHIFT-A` | Khóa chính ca làm việc. |
| `SiteID` | UUID | Có | `SITE-HN01` | Tham chiếu Nhà máy áp dụng (`MD_SITE`). |
| `WorkCenterShiftSet` | Aggregate | Có khi sử dụng | `WC-MIXING-SHIFT-SET-01` | Một form chọn đúng một Work Center và quản lý toàn bộ các ca của Work Center đó trong một bộ ca. Mã bộ ca được MES tự sinh và chỉ đọc. |
| `WorkCenterShift` | Quan hệ | Có khi sử dụng | `WC-MIXING / SHIFT-01` | Bảng trong form cho phép thêm nhiều ca có tên và khoảng `HH:mm - HH:mm`; toàn bộ bộ ca được lưu atomic và không được conflict trong 24 giờ của một ngày. |
| `ShiftCode` | String(50) | Có sau khi lưu | `WC-MIXING-SHIFT-01` | Mã ca con được MES tự sinh theo Work Center, read-only trên form và duy nhất trong toàn hệ thống. |
| `StartTime` | Time | Có | `06:00` | Giờ bắt đầu ca. |
| `EndTime` | Time | Có | `14:00` | Giờ kết thúc ca. |
| `BreakMinutes` | Integer | Có | `30` | Tổng số phút nghỉ trong ca. |
| `NetAvailableMinutes`| Integer | Có | `450` | Thời gian khả dụng thực tế chuẩn (Phút). |
| `CrossMidnight` | Boolean | Có | `No` | `Yes`: Ca làm việc kéo dài qua đêm (qua 00:00). |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-PLAN-01** | Điều độ | Tính toán số phút khả dụng để phân bổ thời lượng WO xuống máy. | Tránh việc lập lịch quá tải so với năng lực ca. |
| **UC-EX-02** | Công nhân | MES tự động nhận diện ca làm việc khi công nhân bấm Start job trên Kiosk. | Báo cáo sản lượng được thống kê chính xác theo ca. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Giá trị `NetAvailableMinutes` phải luôn bằng $\text{Tổng thời lượng ca} - \text{BreakMinutes}$.
- Một Work Center có thể có nhiều ca; tên ca do người dùng đặt tùy nghiệp vụ (`Ca 1`, `Ca 2`, `Ca sáng`, ...).
- Không giới hạn số ca theo Work Center, nhưng hai ca trong cùng Work Center không được chồng thời gian; kiểm tra cả ca qua nửa đêm.
- Công nhân bắt buộc được phân trực tiếp vào một Work Center; `SiteID` của công nhân do Work Center quyết định, không nhập độc lập.
- Lịch công nhân bắt buộc có Work Center và Work Center phải trùng với Work Center của công nhân.
- Ca trong lịch phải thuộc bộ ca active của Work Center tại ngày hiệu lực.
- Cấm lịch `Scheduled` của cùng công nhân chồng khoảng thời gian. Kiểm tra dùng khoảng thời gian thực, bao gồm ca kéo dài qua nửa đêm.
- LINE chỉ Ready về nhân lực khi từng công đoạn có đủ số công nhân tại đúng Work Center, đúng ca/ngày, trạng thái active và đạt level kỹ năng tối thiểu.

---

## A6. MD_REASON_CODE — Mã nguyên nhân thực thi

### 1. Thông tin chung (Overview)
- **Mục đích:** Chuẩn hóa danh mục nguyên nhân dừng máy, phế liệu, thiếu vật tư, sửa lại (Rework) và điều chỉnh sản lượng trên Kiosk.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Sản xuất / Chất lượng

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `ReasonID` | UUID | Có | `RSN-DT-01` | Khóa chính mã nguyên nhân. |
| `ReasonCode` | String(30) | Có | `MAT_WAIT` | Mã nguyên nhân ngắn. |
| `ReasonName` | String(150) | Có | Chờ nguyên vật liệu | Tên hiển thị đầy đủ. |
| `ReasonCategory` | Enum | Có | `Downtime` | Nhóm nguyên nhân: `Downtime`, `Scrap`, `Rework`, `Hold`, `Adjustment`. |
| `RequiresComment` | Boolean | Có | `Yes` | `Yes`: Bắt buộc công nhân nhập văn bản giải thích trên Kiosk. |
| `RequiresApproval` | Boolean | Có | `No` | `Yes`: Cần quản lý quét thẻ duyệt xác nhận. |
| `ApplicableAreaID` | UUID | Không | `AREA-CUT` | Giới hạn phạm vi xưởng áp dụng; `NULL` = Áp dụng toàn nhà máy. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-EX-03** | Công nhân | Lựa chọn mã nguyên nhân khi báo phế liệu hoặc sản lượng thiếu hụt. | Báo cáo phân tích nguyên nhân được chuẩn hóa. |
| **UC-MGR-01** | Quản lý | Báo cáo phân tích Pareto dừng máy / phế liệu theo mã chuẩn. | Có dữ liệu chính xác để phục vụ cải tiến liên tục (Kaizen). |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- `ReasonCode` bắt buộc phải là duy nhất trong cùng một `ReasonCategory`.
- Cấm xóa các mã nguyên nhân đã từng được sử dụng trong các giao dịch (Transactions); chỉ cho phép chuyển sang `Status = Inactive`.
