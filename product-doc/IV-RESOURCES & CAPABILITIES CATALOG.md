# PHẦN IV: TÀI NGUYÊN VÀ NĂNG LỰC (RESOURCES & CAPABILITIES CATALOG)

Tài liệu đặc tả danh mục Master Data quản lý nhóm năng lực logic (`Work Center`), điểm thực thi trạm (`Workstation`), máy móc thiết bị vật lý (`Equipment`), gán tài nguyên (`Resource Assignment`), khả năng đáp ứng (`Resource Capability`), lịch khả dụng (`Resource Calendar`), danh mục kỹ năng (`Skill`) và yêu cầu kỹ năng theo công đoạn (`Operation Skill Requirement`) cho hệ thống MES MVP.

---

## D1. MD_WORK_CENTER — Work Center

### 1. Thông tin chung (Overview)
- **Mục đích:** Nhóm năng lực logic dùng để thiết kế quy trình (Routing), lập lịch và tổng hợp tiến độ/tải sản xuất theo công đoạn hoặc xưởng.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản lý sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `WorkCenterID` | UUID | Có | `WC-CUT` | Khóa chính Work Center. |
| `WorkCenterCode` | String(30) | Có | `WC-CUT` | Mã Work Center duy nhất. |
| `WorkCenterName` | String(150) | Có | Cụm máy cắt cao su | Tên hiển thị của Work Center. |
| `AreaID` | UUID | Có | `AREA-CUT` | Tham chiếu Xưởng/Khu vực (`MD_PRODUCTION_AREA`). |
| `ResourceType` | Enum | Có | `MachineGroup` | Phân loại tài nguyên: `MachineGroup`, `LaborCell`, `Mixed`. |
| `CapacityModel` | Enum | Có | `TimeBased` | Mô hình năng lực: `TimeBased`, `QuantityBased`. |
| `FiniteCapacityFlag` | Boolean | Có | `Yes` | `Yes`: Giới hạn năng lực khi lập lịch. |
| `DefaultShiftID` | UUID | Không | `SHIFT-A` | Tham chiếu Ca làm việc mặc định (`MD_SHIFT`). |
| `MaxConcurrentJobs` | Integer | Có | `2` | Số lượng công việc (Jobs) được chạy song song tối đa. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-03** | Kỹ thuật | Gán công đoạn trong Routing vào Work Center logic. | Quy trình (Routing) không bị phụ thuộc vào một máy vật lý cụ thể. |
| **UC-PLAN-01** | Điều độ | Tổng hợp năng lực và tải theo Work Center trước khi phân bổ xuống máy. | Nhận diện sớm các điểm nghẽn (Bottlenecks) trên dây chuyền. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Work Center bắt buộc phải thuộc một `AreaID` / `SiteID` hợp lệ.
- Tuyệt đối không nhúng trực tiếp địa chỉ IP máy tính hay cấu hình IoT vào bảng Work Center trong phạm vi MVP.

---

## D2. MD_WORKSTATION — Workstation / Điểm thực thi

### 1. Thông tin chung (Overview)
- **Mục đích:** Định nghĩa vị trí logic nơi công nhân tương tác, đăng nhập và nhận Lệnh sản xuất (WO) trên giao diện Kiosk/Tablet.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản lý sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `WorkstationID` | UUID | Có | `WS-CUT-01` | Khóa chính điểm thực thi / Trạm. |
| `WorkstationCode` | String(30) | Có | `WS-CUT-01` | Mã trạm duy nhất. |
| `WorkstationName` | String(150) | Có | Trạm cắt 01 | Tên hiển thị của trạm. |
| `AreaID` | UUID | Có | `AREA-CUT` | Tham chiếu vị trí Xưởng/Khu vực. |
| `ExecutionMode` | Enum | Có | `Kiosk` | Chế độ thực thi: `Kiosk`, `Tablet`, `Manual`, `Automatic`. |
| `MaxConcurrentJobs` | Integer | Có | `1` | Số lượng Job xử lý đồng thời tại trạm. |
| `DefaultTerminalID` | UUID | Không | `TERM-CUT-01` | Thiết bị giao diện mặc định (`MD_TERMINAL`). |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-EX-01** | Công nhân | Đăng nhập tại trạm và mở danh sách WO được phân công. | Màn hình hiển thị chính xác danh sách công việc gán cho trạm đó. |
| **UC-EX-02** | Công nhân | Bấm Start/Finish các công đoạn trực tiếp tại Workstation. | MES ghi nhận chính xác mốc thời gian thực tế gắn liền với trạm. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- `Workstation` đại diện cho điểm thực thi logic; thiết bị máy móc vật lý được quản lý riêng tại `MD_EQUIPMENT`.
- Cấm xóa các `Workstation` đã có phát sinh lịch sử giao dịch (Transactions).

---

## D3. MD_EQUIPMENT — Máy / Thiết bị sản xuất

### 1. Thông tin chung (Overview)
- **Mục đích:** Quản lý danh mục máy móc thiết bị vật lý sử dụng để phân bổ WO và ghi nhận thực thi.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Sản xuất / Bảo trì

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `EquipmentID` | UUID | Có | `EQ-CUT-01` | Khóa chính thiết bị. |
| `EquipmentCode` | String(40) | Có | `CUT-M01` | Mã máy duy nhất trong phạm vi Site. |
| `EquipmentName` | String(150) | Có | Máy cắt cao su số 01 | Tên hiển thị của máy. |
| `EquipmentType` | String(80) | Có | `CuttingMachine` | Phân loại loại máy. |
| `Manufacturer` | String(100) | Không | `ABC` | Nhà sản xuất. |
| `Model` | String(100) | Không | `CT-500` | Ký hiệu Model thiết bị. |
| `SerialNumber` | String(100) | Không | `SN123456` | Số Serial vật lý của máy. |
| `PlanningResourceFlag`| Boolean | Có | `Yes` | `Yes`: Cho phép phân bổ Lệnh sản xuất trực tiếp xuống máy. |
| `ExecutionStatus` | Enum | Có | `Available` | Trạng thái vận hành tham chiếu: `Available`, `Maintenance`, `OutOfService`. |
| `DefaultEfficiency` | Decimal(7,4) | Có | `0.9000` | Hệ số năng lực mặc định của máy (90%). |
| `Status` | Enum | Có | `Active` | Trạng thái Master: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-PLAN-01** | Điều độ | Phân bổ các công đoạn trong WO xuống từng máy cụ thể. | Máy nhận đúng tải sản xuất theo năng lực. |
| **UC-EX-02** | Công nhân | Lựa chọn / Xác nhận đúng thiết bị đang vận hành trên Kiosk. | Kết quả sản lượng và thời gian được gán đúng máy. |
| **UC-MGR-01** | Quản lý | Chuyển máy sang trạng thái bảo trì để loại khỏi danh sách lập lịch. | Ngăn chặn hệ thống điều độ công việc vào máy không sẵn sàng. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- `EquipmentCode` bắt buộc phải là duy nhất trong phạm vi một `SiteID`.
- `ExecutionStatus` là trạng thái vận hành tham chiếu Master Data; các sự kiện dừng máy thực tế sẽ thuộc về dữ liệu giao dịch (Transaction).

---

## D4. MD_RESOURCE_ASSIGNMENT — Gán Work Center – Workstation – Equipment

### 1. Thông tin chung (Overview)
- **Mục đích:** Thiết lập quan hệ linh hoạt và có hiệu lực thời gian giữa cụm năng lực logic, điểm thực thi trạm và thiết bị máy móc vật lý.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản lý sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `AssignmentID` | UUID | Có | `RA-001` | Khóa chính bản ghi gán tài nguyên. |
| `WorkCenterID` | UUID | Có | `WC-CUT` | Tham chiếu Work Center (`MD_WORK_CENTER`). |
| `WorkstationID` | UUID | Có | `WS-CUT-01` | Tham chiếu Workstation (`MD_WORKSTATION`). |
| `EquipmentID` | UUID | Không | `EQ-CUT-01` | Tham chiếu Thiết bị gắn tại trạm (`MD_EQUIPMENT`). |
| `AssignmentRole` | Enum | Có | `Primary` | Vai trò gán: `Primary`, `Alternate`, `Supporting`. |
| `SchedulingFlag` | Boolean | Có | `Yes` | `Yes`: Cho phép hệ thống tính toán lập lịch. |
| `OEEAggregationFlag` | Boolean | Có | `Yes` | `Yes`: Sử dụng để tổng hợp KPI/OEE trong tương lai. |
| `EffectiveFrom` | DateTime | Có | `2026-08-01` | Thời điểm bắt đầu có hiệu lực. |
| `EffectiveTo` | DateTime | Không | *NULL* | Thời điểm kết thúc hiệu lực. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-PLAN-01** | Điều độ | Tìm kiếm các máy đang thuộc Work Center để phân bổ WO. | Phân bổ công việc chuẩn xác theo cấu hình hiện tại. |
| **UC-MGR-02** | Quản lý | Di chuyển thiết bị sang trạm khác bằng cách thiết lập mapping mới. | Không làm ảnh hưởng hay phá hỏng lịch sử của Routing/WO cũ. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Một `EquipmentID` cấm được gán vai trò chính (`AssignmentRole = Primary`) cho hai `WorkstationID` trong cùng một khoảng thời gian hiệu lực.
- Tất cả các đối tượng trong bản ghi Mapping bắt buộc phải thuộc cùng một `SiteID`.

---

## D5. MD_RESOURCE_CAPABILITY — Khả năng sản xuất của tài nguyên

### 1. Thông tin chung (Overview)
- **Mục đích:** Xác định cụ thể Work Center hoặc Thiết bị nào được phép thực hiện Sản phẩm / Công đoạn nào và thứ tự ưu tiên lựa chọn.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Kỹ thuật / Điều độ

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `CapabilityID` | UUID | Có | `CAP-001` | Khóa chính bản ghi năng lực. |
| `ProductRevisionID` | UUID | Không | `REV-FG001-R2` | Tham chiếu Revision sản phẩm; Để trống nếu dùng `ItemGroup`. |
| `ItemGroup` | String(80) | Không | `RubberSheet` | Phạm vi nhóm sản phẩm áp dụng. |
| `OperationID` | UUID | Có | `OP-CUT` | Tham chiếu Công đoạn (`MD_OPERATION`). |
| `WorkCenterID` | UUID | Có | `WC-CUT` | Tham chiếu Work Center hợp lệ. |
| `EquipmentID` | UUID | Không | `EQ-CUT-01` | Tham chiếu Thiết bị cụ thể (nếu chỉ định). |
| `Eligibility` | Boolean | Có | `Yes` | `Yes`: Đủ điều kiện/Cho phép chạy. |
| `PriorityNo` | Integer | Có | `1` | Thứ tự ưu tiên lựa chọn (1 là ưu tiên cao nhất). |
| `SpeedFactor` | Decimal(7,4) | Có | `1.0000` | Hệ số tốc độ so với chuẩn (1.0 = 100%). |
| `MinLotSize` | Decimal(18,3) | Không | `1.000` | Kích thước lô sản xuất tối thiểu trên tài nguyên. |
| `MaxLotSize` | Decimal(18,3) | Không | `500.000` | Kích thước lô sản xuất tối đa trên tài nguyên. |
| `SetupFamily` | String(50) | Không | `RUB-10MM` | Nhóm cấu hình setup dùng tối ưu gộp lô. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-PLAN-01** | Điều độ | Tra cứu danh sách các máy thay thế hợp lệ cho một công đoạn. | Ngăn chặn việc phân bổ WO vào máy không đủ khả năng chạy. |
| **UC-PLAN-03** | Planning Engine | Xếp ưu tiên máy và tự động hiệu chỉnh thời gian chạy theo `SpeedFactor`. | Tiến độ kế hoạch phản ánh chính xác thực tế dây chuyền. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Bắt buộc phải khai báo ít nhất một trong hai trường: `ProductRevisionID` hoặc `ItemGroup`.
- `EquipmentID` (nếu có chỉ định) bắt buộc phải đang thuộc `WorkCenterID` tương ứng tại thời điểm hiệu lực.

---

## D6. MD_RESOURCE_CALENDAR — Lịch khả dụng tài nguyên

### 1. Thông tin chung (Overview)
- **Mục đích:** Khai báo ca làm việc áp dụng, ngày nghỉ, lịch bảo trì kế hoạch và hệ số năng lực khả dụng của Work Center hoặc Máy.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Điều độ / Sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `ResourceCalendarID`| UUID | Có | `RC-EQ01-202608` | Khóa chính lịch khả dụng. |
| `ResourceType` | Enum | Có | `Equipment` | Loại tài nguyên: `WorkCenter`, `Workstation`, `Equipment`. |
| `ResourceID` | UUID | Có | `EQ-CUT-01` | ID của tài nguyên tương ứng. |
| `CalendarDate` | Date | Có | `2026-08-05` | Ngày áp dụng lịch. |
| `ShiftID` | UUID | Có | `SHIFT-A` | Tham chiếu Ca làm việc (`MD_SHIFT`). |
| `AvailabilityStatus` | Enum | Có | `Available` | Trạng thái khả dụng: `Available`, `PlannedDown`, `Holiday`. |
| `AvailableMinutes` | Integer | Có | `450` | Tổng số phút khả dụng thực tế trong ca. |
| `CapacityFactor` | Decimal(7,4) | Có | `1.0000` | Hệ số năng lực khả dụng (1.0 = 100%). |
| `ReasonID` | UUID | Không | `RSN-PM` | Tham chiếu mã nguyên nhân không khả dụng (`MD_REASON_CODE`). |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-PLAN-01** | Điều độ | Kiểm tra quỹ thời gian khả dụng còn lại của máy trước khi phân WO. | Ngăn chặn xếp lịch trùng vào ngày nghỉ hoặc lịch bảo trì. |
| **UC-MGR-02** | Quản lý | Tạm thời giảm `CapacityFactor` khi thiết bị gặp sự cố giảm năng suất. | Lịch lập phản ánh chính xác năng lực ngắn hạn mà không cần sửa định mức chuẩn. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Duy nhất một bản ghi được tồn tại cho mỗi tổ hợp `[ResourceID + CalendarDate + ShiftID]`.
- Các điều chỉnh năng lực dài hạn bắt buộc phải tiến hành cập nhật qua `MD_PRODUCTION_STANDARD` theo quy trình phê duyệt.

---

## D7. MD_SKILL — Danh mục kỹ năng

### 1. Thông tin chung (Overview)
- **Mục đích:** Chuẩn hóa danh mục các kỹ năng thao tác vận hành cần thiết cho công đoạn và cấp độ tay nghề của nhân sự.
- **Mức ưu tiên:** MVP-Recommended
- **Data Owner đề xuất:** Sản xuất / HR

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `SkillID` | UUID | Có | `SK-CUT` | Khóa chính kỹ năng. |
| `SkillCode` | String(30) | Có | `CUTTING` | Mã kỹ năng duy nhất. |
| `SkillName` | String(150) | Có | Vận hành máy cắt | Tên hiển thị của kỹ năng. |
| `SkillCategory` | Enum | Có | `MachineOperation` | Phân loại: `MachineOperation`, `Quality`, `MaterialHandling`. |
| `LevelScale` | String(100) | Có | `L1,L2,L3,L4` | Thang đo cấp độ tay nghề. |
| `CertificationRequired`| Boolean | Có | `Yes` | `Yes`: Bắt buộc phải có chứng chỉ/xác nhận từ HR. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-MD-04** | Quản lý | Khai báo bộ kỹ năng vận hành máy móc chuẩn cho nhà máy. | Có danh mục kỹ năng thống nhất phục vụ công tác phân công. |
| **UC-SEC-02** | MES | Kiểm tra xem nhân sự đăng nhập Kiosk có đủ trình độ/kỹ năng khi bấm Start job. | Giảm thiểu rủi ro vận hành sai do người thiếu chuyên môn. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- `SkillCode` bắt buộc phải là duy nhất trên toàn hệ thống.
- Hồ sơ nhân sự và chứng chỉ có thể đồng bộ từ hệ thống HR; MES/MOM chỉ lưu giữ các mã tham chiếu cần thiết cho thực thi.

---

## D8. MD_OPERATION_SKILL_REQUIREMENT — Yêu cầu kỹ năng theo công đoạn

### 1. Thông tin chung (Overview)
- **Mục đích:** Xác định rõ số lượng công nhân, loại kỹ năng và cấp độ tay nghề tối thiểu bắt buộc phải có để vận hành một công đoạn.
- **Mức ưu tiên:** MVP-Recommended
- **Data Owner đề xuất:** Kỹ thuật / Sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `RequirementID` | UUID | Có | `OSR-001` | Khóa chính yêu cầu kỹ năng. |
| `RoutingOperationID`| UUID | Có | `RTO-0020` | Tham chiếu bước công đoạn cụ thể (`MD_ROUTING_OPERATION`). |
| `SkillID` | UUID | Có | `SK-CUT` | Tham chiếu kỹ năng bắt buộc (`MD_SKILL`). |
| `MinimumLevel` | String(10) | Có | `L2` | Cấp độ tay nghề tối thiểu bắt buộc. |
| `RequiredPersons` | Decimal(6,2) | Có | `1.00` | Số lượng nhân sự cần thiết. |
| `MandatoryFlag` | Boolean | Có | `Yes` | `Yes`: Ràng buộc bắt buộc (Chặn thực thi nếu không đạt). |
| `EffectiveFrom` | DateTime | Có | `2026-08-01` | Thời điểm quy định có hiệu lực. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-PLAN-04** | Điều độ | Kiểm tra ca làm việc có đủ nhân sự đáp ứng tay nghề trước khi chốt lịch. | Hạn chế tối đa các lịch sản xuất không khả thi về mặt nhân sự. |
| **UC-EX-02** | MES | Cảnh báo hoặc khóa thao tác trên Kiosk nếu người vận hành không đủ cấp độ. | Đảm bảo tuân thủ phân quyền kỹ năng tại hiện trường. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Số lượng nhân sự yêu cầu `RequiredPersons` bắt buộc phải $> 0$.
- `SkillID` phải ở trạng thái `Status = Active` và thuộc cùng phạm vi `SiteID` tương ứng (nếu có cấu hình).