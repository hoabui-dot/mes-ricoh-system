# PHẦN VI: KIOSK VÀ PHÂN QUYỀN (KIOSK & SECURITY CATALOG)

Tài liệu đặc tả danh mục Master Data quản lý thiết bị hiện trường (`Terminal`), vai trò & quyền chức năng (`Role Permission`) và phân vùng phạm vi tài nguyên người dùng (`User Resource Scope`) cho hệ thống MES MVP.

---

## F1. MD_TERMINAL — Tablet / Kiosk tại hiện trường

### 1. Thông tin chung (Overview)
- **Mục đích:** Gắn thiết bị giao diện (Kiosk/Tablet) với Workstation cụ thể và cấu hình chế độ quét, máy in endpoint, hiển thị danh sách WO.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** IT / Sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `TerminalID` | UUID | Có | `TERM-CUT-01` | Khóa chính thiết bị terminal. |
| `TerminalCode` | String(40) | Có | `KIOSK-CUT-01` | Mã định danh thiết bị duy nhất. |
| `TerminalName` | String(150) | Có | Kiosk trạm cắt 01 | Tên hiển thị của thiết bị. |
| `TerminalType` | Enum | Có | `Kiosk` | Loại thiết bị: `Kiosk`, `Tablet`, `WebStation`. |
| `WorkstationID` | UUID | Có | `WS-CUT-01` | Tham chiếu điểm thực thi/Trạm mặc định (`MD_WORKSTATION`). |
| `ScanMode` | Enum | Có | `CameraScanner` | Chế độ quét mã: `Camera`, `USBScanner`, `RFID`. |
| `PrinterEndpointRef` | String(200) | Không | `PRN-CUT-01` | Tham chiếu địa chỉ máy in hoặc Print Service hiện trường. |
| `OfflineModeEnabled` | Boolean | Có | `No` | `Yes`: Cho phép lưu tạm và đồng bộ khi mất kết nối. |
| `HeartbeatIntervalSec` | Integer | Không | `60` | Tần suất gửi tín hiệu duy trì kết nối online (Giây). |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-EX-01** | Công nhân | Mở màn hình Kiosk và tự động tải danh sách WO gán cho Workstation. | Không cần chọn lại vị trí trạm mỗi lần đăng nhập. |
| **UC-TR-01** | Công nhân | Thực hiện quét tem mẹ bằng thiết bị đã được cấu hình phương thức scan. | Tín hiệu scan mã vạch đi đúng luồng xử lý trên Kiosk. |
| **UC-TR-02** | MES | Định tuyến lệnh in tem con tới máy in cấu hình tại `PrinterEndpointRef`. | In đúng tem ra máy in đặt tại trạm hiện trường. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Một `TerminalID` chỉ được phép gán duy nhất một `WorkstationID` mặc định tại một thời điểm.
- Tuyệt đối cấm lưu trữ mật khẩu, secret key hoặc credential trực tiếp dưới dạng plain-text trong bảng này.

---

## F2. MD_ROLE_PERMISSION — Vai trò và quyền chức năng

### 1. Thông tin chung (Overview)
- **Mục đích:** Phân định chi tiết quyền quản lý cấu hình/duyệt master/tạo WO đối với cấp quản lý và quyền xem/thực thi thao tác hiện trường của công nhân.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản trị hệ thống

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `PermissionID` | UUID | Có | `PERM-001` | Khóa chính bản ghi quyền. |
| `RoleCode` | String(50) | Có | `PROD_MANAGER` | Mã vai trò người dùng (ví dụ: `OPERATOR`, `PROD_MANAGER`). |
| `ResourceType` | Enum | Có | `MBOM` | Tên đối tượng tài nguyên: `Item`, `MBOM`, `Routing`, `WO`, `Execution`, `Traceability`. |
| `Action` | Enum | Có | `Approve` | Hành động được phép: `View`, `Create`, `Edit`, `Release`, `Approve`, `Execute`. |
| `DataScopeType` | Enum | Có | `Area` | Phạm vi dữ liệu tác động: `All`, `Site`, `Area`, `WorkCenter`, `OwnAssignment`. |
| `ConditionExpression` | String(500) | Không | `status=Draft` | Biểu thức điều kiện bổ sung khi kiểm tra quyền. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-SEC-01** | Quản lý | Thực hiện khởi tạo, chỉnh sửa và duyệt phát hành MBOM, Routing, WO. | Kiểm soát chặt chẽ chỉ đúng cấp thẩm quyền mới được thay đổi master data. |
| **UC-SEC-02** | Công nhân | Chỉ được xem danh sách WO và bấm thực thi công đoạn trong phạm vi trạm được giao. | Ngăn chặn công nhân truy cập hoặc can thiệp các màn hình cấu hình hệ thống. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Mặc định từ chối (Deny-by-default): Nếu tài khoản không được gán quyền rõ ràng trong bảng, hệ thống tự động chặn hành động.
- Hành động Duyệt/Phát hành (`Approve`/`Release`) bắt buộc phải tách biệt khỏi quyền Chỉnh sửa (`Edit`) đối với các đối tượng master data quan trọng.

---

## F3. MD_USER_RESOURCE_SCOPE — Phạm vi người dùng theo tài nguyên

### 1. Thông tin chung (Overview)
- **Mục đích:** Gán tài khoản người dùng/nhân viên vào phạm vi Site, Area, Work Center hoặc Workstation cụ thể để lọc danh sách công việc và kiểm soát quyền thực thi.
- **Mức ưu tiên:** MVP-Core
- **Data Owner đề xuất:** Quản trị hệ thống / Quản lý sản xuất

### 2. Cấu trúc dữ liệu (Schema / Fields)

| Field | Kiểu dữ liệu | Bắt buộc | Ví dụ | Ý nghĩa / Quy tắc nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| `UserScopeID` | UUID | Có | `USC-001` | Khóa chính bản ghi phân vùng người dùng. |
| `UserID` | UUID | Có | `USR-OP-001` | Tham chiếu ID người dùng / Nhân viên. |
| `RoleCode` | String(50) | Có | `OPERATOR` | Mã vai trò áp dụng trong phạm vi này. |
| `SiteID` | UUID | Có | `SITE-HN01` | Phân vùng Nhà máy (Site). |
| `AreaID` | UUID | Không | `AREA-CUT` | Phân vùng Xưởng / Khu vực (`MD_PRODUCTION_AREA`). |
| `WorkCenterID` | UUID | Không | `WC-CUT` | Phân vùng Cụm máy / Work Center (`MD_WORK_CENTER`). |
| `WorkstationID` | UUID | Không | `WS-CUT-01` | Phân vùng Điểm thực thi / Trạm (`MD_WORKSTATION`). |
| `ValidFrom` | DateTime | Có | `2026-08-01` | Thời điểm bắt đầu có hiệu lực gán phân vùng. |
| `ValidTo` | DateTime | Không | *NULL* | Thời điểm kết thúc hiệu lực gán phân vùng. |
| `Status` | Enum | Có | `Active` | Trạng thái: `Active`, `Inactive`. |

### 3. Kịch bản sử dụng (Use Cases)

| Mã Use Case | Tác nhân | Cách sử dụng Master Data | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UC-EX-01** | Công nhân | MES tự động lọc và hiển thị danh sách WO theo đúng Workstation/Work Center được gán. | Màn hình làm việc tối giản, hiển thị đúng phạm vi trách nhiệm. |
| **UC-SEC-01** | Quản lý | Cấp quyền phân vùng tạm thời (có ngày hiệu lực `ValidTo`) cho công nhân điều chuyển hỗ trợ xưởng khác. | Quản trị linh hoạt nhân sự hiện trường theo khoảng thời gian thực tế. |

### 4. Quy tắc kiểm soát dữ liệu (Validation Rules)
- Cấu trúc phân vùng con phải thuộc phân vùng cha tương ứng (ví dụ: `WorkstationID` chọn phải nằm trong `WorkCenterID` và `AreaID` đã khai báo).
- Nếu trường `AreaID`, `WorkCenterID` và `WorkstationID` để trống (`NULL`), người dùng sẽ có phạm vi truy cập toàn bộ `SiteID` đó theo quyền của `RoleCode`.