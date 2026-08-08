# Tổng quan Nghiệp vụ & Quy trình Sản xuất — Print-Marking Edge Station

Tài liệu này tổng hợp toàn bộ thông tin tổng quan, mô hình triển khai, các phân vùng nghiệp vụ cốt lõi, và luồng quy trình sản xuất (workflow) tiếng Việt cho trạm biên.

---

## 1. Tổng quan Nghiệp vụ

**Trạm biên in ấn và khắc nhãn (Print-Marking Edge Station)** là một nền tảng tính toán biên công nghiệp (Industrial Edge Computing Platform) được triển khai trực tiếp trên sàn sản xuất của nhà máy, đóng vai trò là lớp xử lý thông minh cục bộ (local intelligence layer) giữa Factory Gateway trung tâm và các thiết bị sản xuất vật lý.

### Vòng lặp thực thi 8 bước (8-Step Execution Loop):
1. **RECEIVE (NHẬN)**: Nhận lệnh sản xuất từ Factory Gateway thông qua HTTP API (`POST /api/gateway/orders`).
2. **CREATE (TẠO)**: Job Engine tạo một công việc (Job) với đầy đủ thông số cấu hình và recipe.
3. **GENERATE (TẠO ND)**: Tạo nội dung dữ liệu in/khắc (số sê-ri động, mã vạch, mã QR).
4. **EXECUTE PRINT (IN)**: Printer Adapter gửi lệnh in (mã ZPL) tới Máy in.
5. **EXECUTE MARK (KHẮC)**: Laser Adapter gửi thông số và lệnh khắc tới Máy khắc Laser.
6. **VERIFY (XÁC THỰC)**: Kích hoạt camera quét kết quả và thực hiện kiểm tra QC/OCR.
7. **PERSIST (LƯU TRỮ)**: Lưu kết quả vào cơ sở dữ liệu SQLite nội bộ.
8. **SYNC (ĐỒNG BỘ)**: Gửi thông tin trạng thái hoàn thành về lại Factory Gateway qua Kafka.

---

## 2. Quy trình sản xuất chi tiết (Workflows)

Trạm hỗ trợ các chế độ hoạt động chính:

### 2.1. Chỉ in (PRINT_ONLY)
Quy trình gửi lệnh in tem nhãn và thực hiện kiểm tra chất lượng nhãn:
- **Nhận lệnh**: Lệnh truyền vào qua Station Gateway và ghi nhận vào `gateway_requests` và `gateway_outbox_events`.
- **Tạo Job**: Job Engine lưu trạng thái `CREATED` và bắt đầu xử lý.
- **In ấn**: Printer Adapter nạp template nhãn, điền các giá trị placeholders động, chuyển đổi định dạng sang mã ZPL, và chuyển tiếp tới máy in nhãn qua cổng TCP 9100.
- **Xác thực**: Vision Service kích hoạt camera chụp ảnh nhãn in và thực hiện OCR đối chiếu chuỗi ký tự sê-ri/mã vạch.
- **Đồng bộ**: Trả trạng thái kết quả (`VERIFIED_PASS` hoặc `VERIFIED_FAIL`) và lưu log trước khi gửi thông báo đồng bộ lên Kafka.

### 2.2. Chỉ khắc (MARK_ONLY)
Quy trình thực hiện khắc laser trực tiếp lên sản phẩm/vỏ hộp không sử dụng nhãn dán:
- **Khắc Laser**: Laser Adapter kết nối SDK tới máy khắc laser, truyền file vẽ thiết kế (layout) và các thông số công suất/tần số laser, sau đó gửi tín hiệu bắt đầu khắc.
- **Xác thực**: Quét camera QC kiểm tra độ rõ nét và đối chiếu nội dung khắc.

### 2.3. Kết hợp in và khắc (PRINT_AND_MARK)
Thực hiện in nhãn, dán, sau đó nạp sản phẩm vào buồng khắc laser và tiến hành quét QC tổng thể.

### 2.4. Rework (Làm lại)
Kịch bản khi sản phẩm bị lỗi in/khắc hoặc hư hỏng tem:
- Người vận hành sử dụng Kiosk UI để gửi yêu cầu làm lại sản phẩm.
- Job Engine khởi tạo một lượt thực thi mới (JobAttempt tiếp theo) với tham số lý do làm lại và ghi log audit bắt buộc.

---

## 3. Các quy tắc xử lý lỗi

- **Mất kết nối máy in/khắc**: Thử lại tối đa 3 lần. Nếu vẫn không kết nối được, chuyển Job sang trạng thái `FAILED` và gửi cảnh báo về Kiosk UI Alarm Center.
- **Xác thực QC lỗi**: Chụp ảnh và quét lại (tối đa 3 lần). Nếu vẫn lỗi, dừng dây chuyền, giữ sản phẩm lỗi và yêu cầu Operator xác nhận/hủy bỏ thủ công trên Kiosk UI.
- **Lỗi mạng (Broker/Gateway)**: Mọi sự kiện đồng bộ trạng thái sản xuất phải được lưu trong bảng Outbox cục bộ. Tác vụ Outbox sẽ liên tục thử lại (infinite retries với exponential backoff) để đảm bảo không bị mất mát dữ liệu sản xuất.
