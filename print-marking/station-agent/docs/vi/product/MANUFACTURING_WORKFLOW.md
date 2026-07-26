# Quy trình sản xuất — Trạm biên in ấn và khắc nhãn (Manufacturing Workflow)

> **QUY TẮC AI (AI RULE)**: Tất cả mã nguồn triển khai logic sản xuất phải tuân theo chính xác quy trình được mô tả ở đây. Không tự ý tạo thêm các luồng mới.

---

## Tổng quan

Trạm hỗ trợ ba chế độ hoạt động chính:

| Chế độ | Loại hoạt động | Thiết bị sử dụng |
|---|---|---|
| **Chỉ in** | `PRINT_ONLY` | Máy in → Hệ thống thị giác |
| **Chỉ khắc** | `MARK_ONLY` | Máy khắc laser → Hệ thống thị giác |
| **Kết hợp** | `PRINT_AND_MARK` | Máy in → Máy khắc laser → Hệ thống thị giác |
| **Chỉ xác thực** | `VERIFY_ONLY` | Hệ thống thị giác |
| **Làm lại** | `REWORK` | Tùy thuộc vào loại làm lại |

---

## Quy trình 1: Chỉ in (PRINT_ONLY)

Được sử dụng khi chỉ cần in nhãn và xác thực nhãn đó.

```
Factory Gateway
    │
    │ MQTT: UnifiedEvent { operation.type = "PRINT_ONLY" }
    ▼
MQTT Adapter
    │ Phân tích và xác thực payload
    │ Phát sự kiện nội bộ InboundMessageReceived
    ▼
Job Engine
    │ Tạo Job (status=CREATED)
    │ Tạo JobAttempt (status=RUNNING)
    │ Xác định nội dung in (từ công thức/payload)
    ▼
Printer Adapter
    │ Truy xuất mẫu nhãn thiết kế & phiên bản từ Repository
    │ Khởi tạo dữ liệu động vào các trường liên kết (placeholders)
    │ Thực hiện kết xuất từ mẫu nhãn JSON sang ZPL qua ZPL Strategy Renderer
    │ Đẩy tác vụ in vào hàng đợi Channel<PrintJob>
    │ Gửi mảng byte ZPL tới Máy in (TCP 9100) thông qua TCP Client
    │ Chờ phản hồi xác nhận trạng thái từ máy in (ACK/NACK)
    │ Ghi lịch sử in ấn (Print History) & lịch sử thay đổi (Audit Trail)
    │ Trả về kết quả: SUCCESS / FAILURE
    ▼
Job Engine
    │ Nếu FAILURE → đánh dấu lần thử FAILED → thử lại hoặc báo động
    │ Nếu SUCCESS → tiếp tục bước xác thực
    ▼
Vision Service
    │ Kích hoạt quét camera
    │ Đọc mã vạch/QR/văn bản
    │ So sánh với nội dung mong đợi
    │ Trả về: VERIFIED_PASS / VERIFIED_FAIL / VERIFIED_RETRY
    ▼
Job Engine
    │ Nếu VERIFIED_FAIL → quét lại (lên đến tối đa)
    │ Nếu VERIFIED_RETRY → chờ và quét lại
    │ Nếu VERIFIED_PASS → đánh dấu Job COMPLETED
    ▼
Cơ sở dữ liệu SQLite cục bộ
    │ Lưu trữ các bản ghi Job, JobAttempt, JobStep
    │ Ghi lại kết quả xác thực
    ▼
Sync Agent (MQTT Outbox)
    │ Phát hành kết quả lên Factory Gateway
    │ { event_type: "PRINT_COMPLETED", result: "PASS" }
    ▼
Factory Gateway
    └ Xác nhận đã nhận (ACK)
```

### Các hướng xử lý lỗi

| Tình huống | Hành động |
|---|---|
| Máy in không thể kết nối | Thử lại 3 lần → đánh dấu Job FAILED → cảnh báo người vận hành |
| In thành công nhưng xác thực thất bại | Thử lại quét camera 3 lần → yêu cầu can thiệp từ người vận hành |
| Hệ thống thị giác ngoại tuyến (offline) | Đánh dấu xác thực là BYPASSED (chỉ khi được cấu hình cho phép) |
| Đồng bộ hóa lên Gateway thất bại | MQTT outbox thử lại vô hạn cho đến khi nhận được ACK |

---

## Quy trình 2: Chỉ khắc (MARK_ONLY)

Được sử dụng khi việc khắc sản phẩm được thực hiện trực tiếp trên bao bì mà không in nhãn giấy.

```
Factory Gateway
    │
    │ MQTT: UnifiedEvent { operation.type = "MARK_ONLY" }
    ▼
MQTT Adapter
    │ Phân tích và xác thực payload
    │ Phát sự kiện nội bộ InboundMessageReceived
    ▼
Job Engine
    │ Tạo Job (status=CREATED)
    │ Tạo JobAttempt (status=RUNNING)
    │ Xác định nội dung khắc và loại khắc
    │   (marking.type = LASER_ETCHING / LASER_DOT_PEEN / v.v.)
    ▼
Laser Adapter
    │ Kết nối tới máy khắc laser (TCP/SDK)
    │ Gửi lệnh khắc kèm nội dung
    │ Chờ xác nhận hoàn tất từ máy khắc
    │ Trả về: SUCCESS / FAILURE
    ▼
Job Engine
    │ Nếu FAILURE → thử lại → báo động
    │ Nếu SUCCESS → tiếp tục bước xác thực
    ▼
Vision Service
    │ Kích hoạt camera quét qua vùng khắc
    │ Chạy OCR hoặc giải mã mã vạch/QR
    │ So sánh với nội dung khắc mong đợi
    │ Trả về: VERIFIED_PASS / VERIFIED_FAIL
    ▼
Job Engine
    │ Cập nhật trạng thái Job
    ▼
Cơ sở dữ liệu SQLite cục bộ
    │ Lưu trữ tất cả bản ghi
    ▼
Sync Agent
    │ Phát hành kết quả: MARK_COMPLETED hoặc MARK_FAILED
    ▼
Factory Gateway
```

---

## Quy trình 3: Kết hợp (PRINT_AND_MARK)

Sử dụng khi yêu cầu cả in nhãn và khắc laser trên cùng một sản phẩm.

```
Factory Gateway
    │
    │ MQTT: UnifiedEvent { operation.type = "PRINT_AND_MARK" }
    ▼
MQTT Adapter
    │ Phân tích và xác thực toàn bộ payload
    ▼
Job Engine
    │ Tạo Job
    │ Tạo JobAttempt
    │ Phân rã thành các bước:
    │   Bước 1: PRINT (IN NHÃN)
    │   Bước 2: LASER_MARK (KHẮC LASER)
    │   Bước 3: VERIFY (XÁC THỰC)
    ▼
┌── Bước 1: Printer Adapter ───────────────────────────────┐
│   Gửi nội dung ZPL/EPL                                   │
│   Chờ hoàn tất in nhãn                                   │
│   Trả về: SUCCESS / FAILURE                              │
└──────────────────────────────────────────────────────────┘
    │
    │ (chỉ tiếp tục nếu Bước 1 SUCCESS)
    ▼
┌── Bước 2: Laser Adapter ─────────────────────────────────┐
│   Gửi lệnh khắc laser                                    │
│   Chờ hoàn tất khắc laser                                │
│   Trả về: SUCCESS / FAILURE                              │
└──────────────────────────────────────────────────────────┘
    │
    │ (chỉ tiếp tục nếu Bước 2 SUCCESS)
    ▼
┌── Bước 3: Vision Service ────────────────────────────────┐
│   Quét nhãn (nếu có in)                                  │
│   Quét vết khắc (nếu có khắc)                            │
│   Cả hai phải vượt qua để đạt VERIFIED_PASS              │
└──────────────────────────────────────────────────────────┘
    │
    ▼
Job Engine
    │ Nếu bất kỳ bước nào FAILED → xử lý theo quy tắc lỗi bên dưới
    │ Nếu tất cả PASS → đánh dấu Job COMPLETED
    ▼
Cơ sở dữ liệu SQLite cục bộ → Sync Agent → Factory Gateway
```

### Quy tắc lỗi cho từng bước (Kết hợp)

| Bước thất bại | Hành vi |
|---|---|
| In thất bại | KHÔNG tiến hành khắc laser. Thử lại bước in. |
| Khắc laser thất bại (in OK) | Chỉ thử lại khắc laser. Nhãn đã in được giữ nguyên. |
| Xác thực thất bại | Thử lại xác thực. Nếu vượt quá số lần quét → chờ quyết định của người vận hành. |
| Người vận hành duyệt REPRINT | Chỉ in lại nhãn, sau đó xác thực lại nhãn |
| Người vận hành duyệt RELASER | Chỉ khắc laser lại, sau đó xác thực lại vết khắc |
| Người vận hành duyệt FORCE_PASS | Ghi nhận là VERIFIED_BYPASS, tiếp tục |
| Người vận hành duyệt FORCE_COMPLETE | Hoàn tất Job bất kể kết quả |

---

## Quy trình 4: Chỉ xác thực (VERIFY_ONLY)

Sử dụng để kiểm tra chất lượng độc lập mà không cần kích hoạt in nhãn hoặc khắc laser.

```
Factory Gateway → MQTT Adapter → Job Engine
    │ Tạo Job (VERIFY_ONLY)
    ▼
Vision Service
    │ Quét sản phẩm
    │ OCR / giải mã mã vạch/QR
    ▼
Job Engine → SQLite → Sync Agent → Factory Gateway
```

---

## Quy trình 5: Làm lại (REWORK)

Sử dụng khi một sản phẩm bị lỗi trước đó cần được xử lý lại.

- Một công việc làm lại sẽ tham chiếu đến Job ID ban đầu.
- Hệ thống ghi nhận việc làm lại riêng biệt với trường `triggerType = OVERWRITE`.
- Người vận hành phải được xác định rõ ràng trong bản ghi làm lại.
- Sau khi làm lại, quy trình xác thực tiêu chuẩn sẽ được áp dụng.

---

## Tích hợp PLC trong Quy trình sản xuất

PLC giao tiếp độc lập như một thiết bị báo cáo trạng thái:

```
Cảm biến PLC (phát hiện sản phẩm)
    │ Tín hiệu I/O số (Digital I/O) kích hoạt
    ▼
PLC Adapter
    │ Đọc tín hiệu kích hoạt
    │ Phát hành sự kiện: PLC_TRIGGER_DETECTED
    ▼
Job Engine (tùy chọn: tự động bắt đầu job khi nhận tín hiệu PLC)
```

Trạng thái dây chuyền PLC (State machine):
```
LINE_IDLE → LINE_RUNNING → LINE_PAUSED → LINE_STOPPED
```

---

## Vòng đời trạng thái Job (Job Lifecycle State Machine)

```
CREATED
    │
    ▼
QUEUED
    │
    ▼
PROCESSING ─────► WAIT_REWORK (chờ can thiệp của người vận hành)
    │                   │
    │◄───────────────────┘
    │
    ├─► COMPLETED
    └─► FAILED
         │
         └─► CANCELLED (hủy bởi người vận hành)
```

---

## Thời gian chờ và Giới hạn thử lại (Timing and Timeouts)

| Hoạt động | Thời gian chờ mặc định (Timeout) | Giới hạn thử lại (Retry Limit) |
|---|---|---|
| Kết nối máy in | 5 giây | 3 |
| Gửi lệnh in | 10 giây | 3 |
| Thực thi khắc laser | 30 giây | 3 |
| Quét camera xác thực | 10 giây | 3 |
| Đồng bộ Gateway | Không áp dụng | Vô hạn (bằng outbox) |
