# Kiosk UI AI Context — Chi tiết Giao diện & Tính năng Vận hành

Tài liệu này mô tả chi tiết giao diện người dùng (Kiosk UI) của hệ thống Trạm Biên In ấn & Khắc nhãn, bao gồm cấu trúc bố cục, các tính năng, các form nhập liệu, trường thông tin, hành vi đóng/mở modal và luồng hiển thị thông báo lỗi/thành công.

---

## 1. Cấu trúc và Định tuyến (Routing & Navigation)

Giao diện Kiosk UI được xây dựng dưới dạng ứng dụng trang đơn (SPA) chia làm 2 màn hình chính:
- **Màn hình Đăng nhập (`/login`)**: Yêu cầu xác thực tài khoản.
- **Màn hình Trang chủ Dashboard (`/`)**: Được bảo vệ bởi lớp kiểm tra phân quyền (`ProtectedRoute`). Nếu người dùng chưa đăng nhập, hệ thống tự động điều hướng về `/login`.

---

## 2. Chi tiết Giao diện Đăng nhập (`LoginPage.tsx`)

Màn hình đăng nhập được tối giản hóa với phong cách hiện đại (Dark Mode), dải viền cam chuyển sắc ở phía trên và logo hình ngọn lửa ở trung tâm thẻ (Card) đăng nhập.

- **Các trường thông tin (Form Fields)**:
  - **Tên đăng nhập (`username`)**: Ô nhập dạng text, có biểu tượng người dùng (`User`). Trường bắt buộc.
  - **Mật khẩu (`password`)**: Ô nhập dạng mật khẩu ẩn, có biểu tượng ổ khóa (`Lock`). Trường bắt buộc.
- **Hành vi nút bấm**:
  - Click nút **Đăng nhập** (`Submit`): Gửi yêu cầu HTTP POST xác thực tài khoản qua `authApi.login`. Trong lúc gửi, nút hiển thị trạng thái tải (Loading).
- **Thông báo phản hồi (Toasts/Banners)**:
  - Nếu đăng nhập thất bại: Hiển thị banner màu đỏ nổi bật phía trên form với nội dung `"Tên đăng nhập hoặc mật khẩu không chính xác"`.
  - Nếu đăng nhập thành công: Lưu token vào bộ nhớ tạm/Session và chuyển trang sang Dashboard `/`.

---

## 3. Cấu trúc Dashboard chính (`DashboardPage.tsx`)

Bố cục tổng thể của trang chính gồm 3 phần:
1. **Thanh Header trên cùng (Sticky Header)**:
   - Bên trái: Logo hệ thống, nhãn `"ND Station Kiosk"`, mã Trạm (`STATION-01`).
   - Ở giữa: Thông tin tài khoản đăng nhập (Username và Vai trò dịch thuật như `Quản trị viên`, `Thành viên`), đồng hồ hiển thị thời gian thực theo định dạng `vi-VN` (giờ:phút:giây và ngày/tháng/năm).
   - Bên phải: Trạng thái kết nối SignalR (`SignalR` màu xanh lá nếu Online, `Offline` màu đỏ nếu mất mạng), nút chuyển đổi giao diện Sáng/Tối (Sun/Moon), và nút **Đăng xuất**.
2. **Thanh Báo động Khẩn cấp (Persistent Alarm Banner)**:
   - Xuất hiện ngay bên dưới Header khi có cảnh báo hệ thống chưa xác nhận (`alarmBannerCount > 0`). Hiển thị nhấp nháy dòng chữ: `"HỆ THỐNG PHÁT HIỆN CÓ KHÓA BÁO ĐỘNG CHƯA XÁC NHẬN (... CẢNH BÁO) — NHẤN ĐỂ VÀO TRUNG TÂM XỬ LÝ"`.
   - Click vào banner sẽ tự động chuyển hướng người dùng sang tab Cảnh báo (`alarms`).
3. **Thanh Điều hướng Trái (Left Sidebar Navigation)**:
   - Gồm các thẻ menu điều hướng: **Trang chủ** (dashboard), **Lịch sử** (history), **Truy xuất** (traceability), **Lệnh sản xuất** (orders), **Cảnh báo** (alarms), **Cấu hình** (config), **Chẩn đoán** (diagnostics), **Kết nối** (connectivity), **Phân quyền** (rbac), **Mẫu tem** (templates), **Máy in** (printers).
4. **Khu vực Nội dung chính (Main Content)**:
   - Hiển thị nội dung tương ứng theo tab đang chọn.

---

## 4. Chi tiết các Tab Tính năng

### 4.1. Tab Trang chủ (Dashboard Tab)

Bố cục của khu vực nội dung được chia làm 3 cột: 2 cột bên trái chứa thông tin lệnh sản xuất và thông tin sản phẩm, 1 cột bên phải chứa nhật ký hoạt động.

- **Cột Trái - Khung 1: Thông tin lệnh sản xuất (Production Info)**:
  - Mã Lệnh (Production Order)
  - Work Order / SKU (Mã kế hoạch và mã SKU sản phẩm)
  - Quy trình (Workflow)
  - Công đoạn (Operation) - kèm thẻ hiển thị loại chế độ in/khắc (ví dụ: `PRINT_ONLY` hoặc `PRINT_AND_MARK`)
  - Trạm vận hành (Station - mặc định `STATION-01`)
  - Đội sản xuất (Assigned Team)
  - Người vận hành (Operator)
  - Sản lượng & Tiến độ (Quantity / Progress): định dạng `đã hoàn thành / kế hoạch pcs`, kèm số lượng còn lại.
  - **Thanh tiến độ (Progress Bar)**:
    - Nếu trạng thái là `PREPARING` (Đang tạo file in): Thanh tiến độ hiển thị hoạt ảnh trượt màu tím kèm thông báo nhấp nháy `"ĐANG CHUẨN BỊ NHÃN IN..."`.
    - Trạng thái khác: Hiển thị thanh tiến độ màu xanh thương hiệu tương ứng với tỷ lệ phần trăm sản lượng thực tế.
- **Cột Trái - Khung 2: Thông tin sản phẩm (Product Detail)**:
  - Tên sản phẩm (Product Name)
  - Mã SKU (Product Code)
  - Phiên bản (Revision)
  - Nhóm vật liệu (Material / Rubber)
  - Độ cứng & Màu sắc (Hardness / Color)
  - Số Lô sản xuất (Lot / Batch)
  - Ngày sản xuất / Hết hạn
  - Xuất xứ / Khách hàng (OEM)
- **Cột Phải - Nhật ký trạm (10 lệnh gần nhất)**:
  - Hiển thị danh sách 10 bản ghi sản xuất gần đây nhất dưới dạng bảng. Click vào dòng bất kỳ sẽ mở **Modal Chi tiết Lượt sản xuất** (`ProductionExecutionDetailModal`), hiển thị chi tiết từng bước (In, Khắc, Xác thực camera), thời gian và kết quả QC.
- **Thanh Hành động dưới cùng (Bottom Action Bar)**:
  - Chứa nút **"Xử lý lại sản phẩm (Reprocess)"** lớn màu cam-đỏ. Nút này sẽ bị vô hiệu hóa (disabled) nếu không có job nào đang chạy. Nhấp vào nút sẽ mở **Modal Xử lý lại/In lại**.

---

### 4.2. Modal Yêu cầu In / Khắc lại sản phẩm

- **Bố cục Modal**: Grid chia làm 2 phần:
  - **Bên trái**: "Danh sách sản xuất hôm nay". Hiển thị danh sách các sản phẩm đã được xử lý trong ngày. Operator nhấp vào một dòng sản phẩm để chọn.
  - **Bên phải**: Form đăng ký yêu cầu xử lý lại của sản phẩm được chọn.
- **Các trường thông tin trong Form (Fields)**:
  - Hiển thị thông tin sản phẩm đã chọn (Job No, SKU, Serial, Loại công việc).
  - **Hành động thực hiện**: Tự động hiển thị nhãn `IN LẠI NHÃN (REPRINT)`, `KHẮC LẠI LASER (RELASER)`, hoặc `LÀM LẠI QUY TRÌNH (REPROCESS)` dựa theo loại công việc ban đầu.
  - **Lý do in/khắc lại (`reprintReasonCode`)**: Dropdown chọn lý do (Lỗi chất lượng in, Mã khắc không đọc được, Sai nhãn, Lỗi xác thực vision, Khiếu nại khách hàng, Nhầm lẫn của thao tác viên, Kiểm tra bảo trì, Khác).
  - **Ghi chú chi tiết (`reprintComment`)**: Trường nhập text nhiều dòng (textarea) bắt buộc.
  - **Checkbox xác nhận trách nhiệm (`reprintConfirmed`)**: Checkbox bắt buộc người dùng tích chọn trước khi gửi.
- **Hành vi nút bấm**:
  - Click **Hủy bỏ**: Đóng modal, reset toàn bộ form.
  - Click **Gửi yêu cầu**: Mở hộp thoại xác nhận phụ (`ConfirmDialog`) hỏi: *"Hành động này sẽ tạo ra một lượt gia công mới và lưu giữ toàn bộ dữ liệu lịch sử. Bạn có muốn tiếp tục?"*.
- **Thông báo phản hồi (Inline Alerts)**:
  - Nếu gửi thành công: Hiển thị banner xanh lục `"Yêu cầu in/khắc lại đã được gửi thành công."`, vô hiệu hóa các trường nhập, chờ **1.5 giây** rồi tự động đóng modal.
  - Nếu thất bại: Hiển thị banner đỏ chứa lỗi chi tiết nhận từ backend. Modal giữ nguyên trạng thái mở để Operator sửa đổi dữ liệu.

---

### 4.3. Tab Lịch sử (History Tab)

- **Bộ lọc tìm kiếm (Filter Card)**:
  - **Lệnh sản xuất**: Ô nhập văn bản tìm kiếm mã WO.
  - **Mã sản phẩm**: Ô nhập văn bản tìm kiếm mã SKU.
  - **Trạng thái**: Dropdown chọn bộ lọc trạng thái (`RECEIVED`, `QUEUED`, `PROCESSING`, `PRINTING`, `VERIFYING`, `COMPLETED`, `FAILED`).
  - **Khoảng thời gian**: Dropdown chọn nhanh (Hôm nay, Hôm qua, 3 ngày qua, 7 ngày qua) để tự động cập nhật ngày bắt đầu và kết thúc.
  - **Từ ngày & Đến ngày**: Ô nhập định dạng ngày (date picker), tự động kiểm tra giới hạn (không được vượt quá ngày hiện tại hoặc thời hạn lưu trữ).
- **Hành vi bộ lọc**:
  - Click **Tìm kiếm**: Gửi yêu cầu API truy vấn danh sách lịch sử và đặt trang hiện tại về 1.
  - Click **Xóa bộ lọc**: Khôi phục bộ lọc mặc định (7 ngày gần nhất, không lọc trạng thái/WO/SKU).
- **Bảng dữ liệu**: Hiển thị danh sách bản ghi gồm cột: Thời gian, Lệnh sản xuất, Mã sản phẩm, Serial/UID, Trạng thái (hiển thị dưới dạng badge màu sắc). Click vào dòng bản ghi sẽ mở hộp thoại thông tin chi tiết.
- **Phân trang (Pagination)**: Footer hiển thị `"Hiển thị trang X/Y (Z kết quả)"` kèm 2 nút **Trang trước** và **Trang sau**. Nút bị vô hiệu hóa nếu đang ở trang đầu/trang cuối hoặc đang trong quá trình tải dữ liệu.

---

### 4.4. Tab Phân quyền (RBAC Tab)

Chỉ hiển thị cho người dùng có vai trò `SUPER_ADMIN`.

- **Danh sách người dùng (Bên trái)**:
  - Bảng hiển thị danh sách nhân viên vận hành trạm. Cột hành động chứa các icon tương ứng cho: Phân quyền trực tiếp, Đặt lại mật khẩu, Kích hoạt/Vô hiệu hóa tài khoản, Xóa tài khoản.
- **Khung Đăng ký người dùng mới (Bên phải)**:
  - **Tên đăng nhập (`newUsername`)**: Ô nhập text.
  - **Họ và tên (`newFullName`)**: Ô nhập text.
  - **Mật khẩu (`newPassword`)**: Ô nhập password (yêu cầu tối thiểu 6 ký tự).
  - **Vai trò hệ thống**: Dropdown chọn quyền (mặc định bị khóa cứng chọn `MEMBER` để ngăn chặn nhân viên tự ý tạo thêm tài khoản admin cấp cao tại trạm biên).
  - Click **Tạo người dùng**: Gửi yêu cầu HTTP POST tới `rbacApi.createUser`. Sau khi tạo thành công, tự động làm mới (refresh) danh sách tài khoản bên trái và xóa sạch các ô nhập liệu trong form đăng ký.
