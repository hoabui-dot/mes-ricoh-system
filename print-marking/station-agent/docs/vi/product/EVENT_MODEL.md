# Mô hình sự kiện — Trạm biên in ấn và khắc nhãn (Event Model)

> **QUY TẮC AI (AI RULE)**: Tất cả các sự kiện nghiệp vụ phải sử dụng chính xác các loại sự kiện được định nghĩa ở đây. Không tạo ra các chuỗi loại sự kiện mới mà không thêm chúng vào tài liệu này và file `BusinessConstants.cs`.

---

## Cấu trúc phong bì sự kiện (Event Envelope Schema)

Mỗi sự kiện được xuất bản bởi hệ thống này — cho dù là nội bộ hay gửi tới Factory Gateway — đều phải tuân theo cấu trúc phong bì sau:

```json
{
  "event_id": "evt-print-20260616-0001",
  "timestamp": "2026-06-16T15:30:00+07:00",
  "event_type": "PRINT_COMPLETED",
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Printer-01",
  "edge_id": "edge-ipc-l3-marking",
  "job_id": "job-20260616-9921",
  "payload": {}
}
```

### Định nghĩa các trường (Field Definitions)

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `event_id` | string | ✅ | Mã định danh sự kiện duy nhất trên toàn cầu |
| `timestamp` | ISO 8601 | ✅ | Thời gian xảy ra sự kiện theo múi giờ địa phương |
| `event_type` | string | ✅ | Một trong các giá trị được định nghĩa bên dưới |
| `site` | string | ✅ | Mã định danh nhà máy |
| `area` | string | ✅ | Khu vực sản xuất |
| `line` | string | ✅ | Mã định danh dây chuyền sản xuất |
| `machine` | string | ✅ | Máy phát sinh sự kiện |
| `edge_id` | string | ✅ | Mã định danh phần cứng trạm biên |
| `job_id` | string | ✅ | Job liên quan (nếu có) |
| `payload` | object | ✅ | Dữ liệu cụ thể của sự kiện (xem bên dưới) |

---

## Danh mục sự kiện đầy đủ (Full Event Catalog)

### Sự kiện In (Print Events)

| Loại sự kiện | Tác nhân kích hoạt | Payload |
|---|---|---|
| `PRINT_REQUESTED` | Job Engine nhận được lệnh in | `{ print_type, content_summary, printer_id }` |
| `PRINT_STARTED` | Printer adapter bắt đầu gửi dữ liệu | `{ printer_id, zpl_size_bytes }` |
| `PRINT_COMPLETED` | Máy in xác nhận đã in xong | `{ printer_id, duration_ms }` |
| `PRINT_FAILED` | Máy in báo lỗi hoặc quá thời gian | `{ printer_id, error_code, error_message }` |
| `PRINT_RETRYING` | Kích hoạt nỗ lực in lại | `{ attempt_no, reason }` |

### Sự kiện Khắc (Mark Events)

| Loại sự kiện | Tác nhân kích hoạt | Payload |
|---|---|---|
| `MARK_REQUESTED` | Job Engine nhận được lệnh khắc | `{ marking_type, content_summary, laser_id }` |
| `MARK_STARTED` | Laser adapter bắt đầu gửi lệnh khắc | `{ laser_id, marking_type }` |
| `MARK_COMPLETED` | Máy khắc báo cáo khắc thành công | `{ laser_id, duration_ms }` |
| `MARK_FAILED` | Máy khắc báo lỗi hoặc quá thời gian | `{ laser_id, error_code, error_message }` |
| `MARK_RETRYING` | Kích hoạt nỗ lực khắc lại | `{ attempt_no, reason }` |

### Sự kiện Xác thực (Verification Events)

| Loại sự kiện | Tác nhân kích hoạt | Payload |
|---|---|---|
| `VERIFY_STARTED` | Hệ thống thị giác được kích hoạt | `{ camera_id, expected_content }` |
| `VERIFY_PASS` | Hệ thống xác nhận nội dung trùng khớp | `{ camera_id, decoded_content, confidence }` |
| `VERIFY_FAIL` | Phát hiện không khớp hoặc không đọc được | `{ camera_id, decoded_content, expected_content, error }` |
| `VERIFY_RETRY` | Thực hiện quét lại | `{ attempt_no, reason }` |
| `VERIFY_BYPASS` | Người vận hành bỏ qua bước xác thực | `{ operator_id, reason, approval_id }` |

### Sự kiện Công việc (Job Events)

| Loại sự kiện | Tác nhân kích hoạt | Payload |
|---|---|---|
| `JOB_CREATED` | Công việc mới được tạo từ sự kiện Gateway | `{ job_id, operation_type, trigger_type }` |
| `JOB_STARTED` | Bắt đầu thực thi công việc | `{ job_id, attempt_no }` |
| `JOB_COMPLETED` | Tất cả các bước công việc thành công | `{ job_id, total_duration_ms }` |
| `JOB_FAILED` | Công việc thất bại sau tất cả các lần thử | `{ job_id, failed_step, error_message }` |
| `JOB_CANCELLED` | Người vận hành hủy bỏ công việc | `{ job_id, operator_id, reason }` |

### Sự kiện Ghi đè (Overwrite Events)

| Loại sự kiện | Tác nhân kích hoạt | Payload |
|---|---|---|
| `OVERWRITE_REQUESTED` | Người vận hành yêu cầu ghi đè | `{ job_id, overwrite_type, reason, requested_by }` |
| `OVERWRITE_APPROVED` | Giám sát phê duyệt ghi đè | `{ job_id, overwrite_type, approved_by }` |
| `OVERWRITE_REJECTED` | Giám sát từ chối ghi đè | `{ job_id, overwrite_type, rejected_by, reason }` |
| `OVERWRITE_EXECUTED` | Thực thi hành động ghi đè | `{ job_id, overwrite_type, executed_at }` |

### Sự kiện Đồng bộ (Sync Events)

| Loại sự kiện | Tác nhân kích hoạt | Payload |
|---|---|---|
| `SYNC_STARTED` | Bộ xử lý Outbox bắt đầu đồng bộ | `{ outbox_id, target_topic }` |
| `SYNC_COMPLETED` | Gateway xác nhận đã nhận (ACK) | `{ outbox_id, gateway_ack_id }` |
| `SYNC_FAILED` | Gateway không phản hồi xác nhận | `{ outbox_id, attempt_no, error }` |
| `SYNC_RETRYING` | Thử lại việc phát bản tin từ Outbox | `{ outbox_id, attempt_no, next_retry_at }` |

### Sự kiện PLC (PLC Events)

| Loại sự kiện | Tác nhân kích hoạt | Payload |
|---|---|---|
| `PLC_LINE_STATE_CHANGED` | Thanh ghi trạng thái dây chuyền PLC thay đổi | `{ plc_id, old_state, new_state }` |
| `PLC_TRIGGER_DETECTED` | Cảm biến sản phẩm được kích hoạt | `{ plc_id, sensor_id, trigger_type }` |
| `PLC_FAULT_DETECTED` | Thanh ghi lỗi máy được thiết lập | `{ plc_id, fault_code, description }` |
| `PLC_FAULT_CLEARED` | Lỗi máy được khắc phục | `{ plc_id, fault_code }` |

### Sự kiện Sức khỏe Thiết bị (Device Health Events)

| Loại sự kiện | Tác nhân kích hoạt | Payload |
|---|---|---|
| `DEVICE_ONLINE` | Kiểm tra sức khỏe thiết bị thành công | `{ device_id, device_type }` |
| `DEVICE_OFFLINE` | Kiểm tra sức khỏe thiết bị thất bại | `{ device_id, device_type, error }` |

---

## Luồng sự kiện theo quy trình (Event Flow by Workflow)

### Luồng Chỉ in (Print Only Flow)

```
JOB_CREATED
    └─► JOB_STARTED
            └─► PRINT_REQUESTED
                    └─► PRINT_STARTED
                            ├─► PRINT_COMPLETED
                            │       └─► VERIFY_STARTED
                            │               ├─► VERIFY_PASS
                            │               │       └─► JOB_COMPLETED → SYNC_STARTED → SYNC_COMPLETED
                            │               └─► VERIFY_FAIL
                            │                       └─► (retry or) JOB_FAILED → SYNC_STARTED
                            └─► PRINT_FAILED
                                    └─► PRINT_RETRYING (x3)
                                            └─► JOB_FAILED → SYNC_STARTED
```

### Luồng Chỉ khắc (Mark Only Flow)

```
JOB_CREATED → JOB_STARTED
    └─► MARK_REQUESTED → MARK_STARTED
            ├─► MARK_COMPLETED → VERIFY_STARTED → VERIFY_PASS → JOB_COMPLETED
            └─► MARK_FAILED → MARK_RETRYING → JOB_FAILED
```

### Luồng Kết hợp (Combined Flow)

```
JOB_CREATED → JOB_STARTED
    └─► PRINT_REQUESTED → PRINT_STARTED → PRINT_COMPLETED
            └─► MARK_REQUESTED → MARK_STARTED → MARK_COMPLETED
                    └─► VERIFY_STARTED → VERIFY_PASS → JOB_COMPLETED
```

---

## Định dạng Event ID

Event ID phải là duy nhất và chứa đủ thông tin ngữ cảnh để phục vụ việc gỡ lỗi (debugging):

```
evt-{event_category}-{YYYYMMDD}-{sequence}

Ví dụ:
  evt-print-20260616-0001
  evt-mark-20260616-0042
  evt-verify-20260616-0099
  evt-sync-20260616-0200
```

---

## Lưu trữ sự kiện (Event Storage)

Các sự kiện được lưu trữ ở hai nơi:

1. **SQLite cục bộ** — bảng `JobStateTransitions` — dùng cho lịch sử vận hành và logic thử lại (retry logic)
2. **MQTT Outbox** — bảng `MqttOutboxEvents` — dùng để gửi tin cậy lên Factory Gateway

Các sự kiện trong outbox được thử lại liên tục cho đến khi Gateway xác nhận đã nhận (ACK).

---

## Các quy tắc quan trọng

1. **Không sự kiện nào được phép bỏ qua một cách âm thầm.** Mọi sự kiện phải được lưu cục bộ trước khi thực hiện bất kỳ hành động nào.
2. **Dấu thời gian phải bao gồm múi giờ lệch (offset).** Định dạng ISO 8601 kèm theo `+07:00` đối với múi giờ Việt Nam.
3. **Mã Job ID phải được đính kèm trong tất cả các sự kiện** để Gateway có thể liên kết toàn bộ sự kiện của cùng một sản phẩm.
4. **Tất cả các sự kiện ghi đè (overwrite) phải xác định rõ người vận hành** để phục vụ việc kiểm toán (audit).
