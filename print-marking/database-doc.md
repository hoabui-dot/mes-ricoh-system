# Station Agent - Database Dictionary & Data Model Documentation

## 1. Tổng quan hệ thống

Station Agent được thiết kế theo kiến trúc:

* Database Per Service
* Event Driven Architecture
* MQTT Communication
* Outbox Pattern
* RBAC (Role Based Access Control)
* Full Audit Trail
* Full Job History Tracking
* Manual Rework / Override Support

---

# Danh sách Service

| Service         | Database      |
| --------------- | ------------- |
| MQTT Adapter    | mqtt.db       |
| Job Engine      | job_engine.db |
| Printer Adapter | printer.db    |
| Laser Adapter   | laser.db      |
| Vision Service  | vision.db     |
| PLC Adapter     | plc.db        |
| Kiosk UI        | kiosk.db      |

Tổng cộng:

* 7 Services
* 7 Databases
* 27 Tables

---

# 2. MQTT DATABASE

Database:

```text
mqtt.db
```

---

## Table: mqtt_messages

### Mục đích

Lưu toàn bộ message nhận hoặc gửi qua MQTT Broker.

### Ví dụ dữ liệu

| Column       | Example             |
| ------------ | ------------------- |
| id           | 8f91e3d0            |
| message_id   | MSG-20260618-0001   |
| topic        | station/job/create  |
| payload_json | {"jobNo":"JOB001"}  |
| direction    | INBOUND             |
| received_at  | 2026-06-18 10:00:00 |
| processed_at | 2026-06-18 10:00:01 |

### Công dụng

* Trace MQTT message
* Debug communication
* Replay event

---

## Table: mqtt_outbox_events

### Mục đích

Triển khai Outbox Pattern.

### Ví dụ

| Column         | Example    |
| -------------- | ---------- |
| aggregate_type | Job        |
| aggregate_id   | JOB_UUID   |
| event_type     | JobCreated |
| payload_json   | {...}      |
| status         | PUBLISHED  |
| retry_count    | 0          |

### Công dụng

Đảm bảo event không bị mất khi publish MQTT.

---

# 3. JOB ENGINE DATABASE

Database:

```text
job_engine.db
```

Đây là database quan trọng nhất.

---

## Table: job_engine_jobs

### Mục đích

Master Record của toàn bộ Job.

### Ví dụ

| Column         | Example     |
| -------------- | ----------- |
| job_no         | JOB-000001  |
| source_system  | MES         |
| job_type       | PRINT_LABEL |
| current_status | COMPLETED   |
| product_code   | PUMP-A001   |

### Trạng thái

```text
CREATED
QUEUED
PROCESSING
WAIT_REWORK
COMPLETED
FAILED
CANCELLED
```

---

## Table: job_engine_job_attempts

### Mục đích

Lưu từng lần chạy Job.

### Ví dụ

| attempt_no | trigger_type | result_status |
| ---------- | ------------ | ------------- |
| 1          | AUTO         | FAILED        |
| 2          | MANUAL_RETRY | SUCCESS       |

### Công dụng

Theo dõi retry.

---

## Table: job_engine_job_steps

### Mục đích

Theo dõi từng bước xử lý.

### Ví dụ

| step_name    | status    |
| ------------ | --------- |
| PRINT_LABEL  | COMPLETED |
| LASER_MARK   | COMPLETED |
| VISION_CHECK | PASSED    |

---

## Table: job_engine_job_history

### Mục đích

Audit toàn bộ lịch sử Job.

### Ví dụ

| old_status | new_status | action_name  |
| ---------- | ---------- | ------------ |
| CREATED    | PROCESSING | START_JOB    |
| PROCESSING | FAILED     | LASER_FAILED |

---

## Table: job_engine_state_transitions

### Mục đích

State Machine Tracking.

### Ví dụ

| from_state  | to_state    |
| ----------- | ----------- |
| PROCESSING  | FAILED      |
| FAILED      | WAIT_REWORK |
| WAIT_REWORK | PROCESSING  |

---

## Table: job_engine_overwrite_requests

### Mục đích

Manual Override / Rework.

### Ví dụ

| overwrite_type | reason |
| -------------- | ------ |
| FORCE_PASS     |        |
| REPRINT        |        |
| RELASER        |        |
| FORCE_COMPLETE |        |

### Ví dụ

```text
Operator phát hiện camera lỗi

=> Tạo overwrite request

=> Approve

=> Sinh Attempt #2
```

---

# 4. PRINTER DATABASE

Database:

```text
printer.db
```

---

## Table: printer_printers

### Mục đích

Danh sách máy in.

### Ví dụ

| printer_code |
| ------------ |
| PRINTER-01   |

| ip_address   |
| ------------ |
| 192.168.1.10 |

---

## Table: printer_jobs

### Mục đích

Lưu lịch sử in.

### Ví dụ

| label_template  |
| --------------- |
| PRODUCT_LABEL_A |

| print_status |
| ------------ |
| SUCCESS      |

### Mapping

```text
job_engine_job_attempts
          ↓
printer_jobs
```

---

## Table: printer_events

### Mục đích

Lưu event từ printer.

### Ví dụ

| event_type     |
| -------------- |
| PAPER_EMPTY    |
| COVER_OPEN     |
| PRINT_STARTED  |
| PRINT_FINISHED |

---

## Table: label_templates

### Mục đích

Lưu trữ cấu hình template nhãn thiết kế từ studio dạng JSON.

### Các thuộc tính chính

* name: Tên template
* description: Mô tả template
* dpi: Độ phân giải máy in (203/300/600)
* label_width: Chiều rộng nhãn (mm)
* label_height: Chiều cao nhãn (mm)
* template_json: Nội dung thiết kế dạng JSON

---

## Table: label_template_versions

### Mục đích

Lưu trữ các phiên bản cũ của template để phục vụ cho in lịch sử.

### Các thuộc tính chính

* template_id: Khóa ngoại trỏ đến template
* version: Số phiên bản
* template_json: Nội dung thiết kế JSON của phiên bản đó

---

## Table: print_history

### Mục đích

Lưu trữ chi tiết toàn bộ các lượt gửi lệnh in để phân tích lỗi/hiệu năng.

### Các thuộc tính chính

* template_id: ID template được in
* template_version: Phiên bản template được in
* printer_code: Máy in thực hiện
* status: Trạng thái (SUCCESS/FAILED)
* duration_ms: Thời gian gửi in
* tcp_request_hex: Dữ liệu TCP thô gửi đi dạng hex
* tcp_response_hex: Dữ liệu TCP phản hồi dạng hex
* exception_message: Lỗi chi tiết nếu in thất bại

---

# 5. LASER DATABASE

Database:

```text
laser.db
```

---

## Table: laser_lasers

Danh sách thiết bị laser.

### Ví dụ

```text
LASER-01
LASER-02
```

---

## Table: laser_jobs

### Mục đích

Lưu lịch sử khắc laser.

### Ví dụ

| template_name     |
| ----------------- |
| SERIAL_TEMPLATE_A |

| mark_status |
| ----------- |
| SUCCESS     |

---

## Table: laser_events

### Mục đích

Lưu event của laser.

### Ví dụ

```text
LASER_READY
LASER_ERROR
MARK_START
MARK_FINISH
```

---

# 6. VISION DATABASE

Database:

```text
vision.db
```

---

## Table: vision_cameras

### Mục đích

Danh sách camera AI.

### Ví dụ

```text
CAM-01
CAM-02
```

---

## Table: vision_results

### Mục đích

Lưu kết quả kiểm tra Vision.

### Ví dụ

| inspection_result |
| ----------------- |
| PASS              |
| FAIL              |

| defect_code |
| ----------- |
| QR_MISSING  |
| SERIAL_BLUR |
| OCR_ERROR   |

| image_path                  |
| --------------------------- |
| /storage/2026/06/job001.jpg |

### Công dụng

QA Traceability.

---

# 7. PLC DATABASE

Database:

```text
plc.db
```

---

## Table: plc_devices

### Mục đích

Danh sách PLC.

### Ví dụ

```text
PLC-01
PLC-02
```

---

## Table: plc_commands

### Mục đích

Lệnh gửi tới PLC.

### Ví dụ

| command_name |
| ------------ |
| START_PICK   |

| command_payload   |
| ----------------- |
| {"position":"A1"} |

| execution_status |
| ---------------- |
| SUCCESS          |

---

## Table: plc_events

### Mục đích

Event từ PLC.

### Ví dụ

```text
PICK_START
PICK_FINISH
CONVEYOR_RUNNING
CONVEYOR_STOP
```

---

## Table: plc_robot_pick_events

### Mục đích

Lưu kết quả robot gắp sản phẩm.

### Ví dụ

| pick_result |
| ----------- |
| SUCCESS     |
| FAIL        |

### Công dụng

Trace robot operation.

---

# 8. KIOSK DATABASE

Database:

```text
kiosk.db
```

Authentication & Authorization Center.

---

## Table: kiosk_users

### Mục đích

Thông tin người dùng.

### Ví dụ

| username   |
| ---------- |
| operator01 |

| full_name    |
| ------------ |
| Nguyen Van A |

---

## Table: kiosk_roles

### Mục đích

Role hệ thống.

### Ví dụ

```text
ADMIN
SUPERVISOR
OPERATOR
QA
```

---

## Table: kiosk_permissions

### Mục đích

Danh sách quyền.

### Ví dụ

```text
JOB_VIEW
JOB_RETRY
JOB_FORCE_PASS
USER_MANAGE
```

---

## Table: kiosk_user_roles

### Mục đích

Mapping User ↔ Role.

### Ví dụ

```text
operator01
   ↓
OPERATOR
```

---

## Table: kiosk_role_permissions

### Mục đích

Mapping Role ↔ Permission.

### Ví dụ

```text
OPERATOR
   ↓
JOB_VIEW

SUPERVISOR
   ↓
JOB_RETRY
JOB_FORCE_PASS
```

---

## Table: kiosk_sessions

### Mục đích

Session đăng nhập.

### Ví dụ

| token     |
| --------- |
| JWT_TOKEN |

| login_at         |
| ---------------- |
| 2026-06-18 08:00 |

---

## Table: kiosk_access_logs

### Mục đích

Audit toàn bộ hành động người dùng.

### Ví dụ

| action_name |
| ----------- |
| LOGIN       |
| RETRY_JOB   |
| FORCE_PASS  |
| REPRINT     |

| target_type |
| ----------- |
| JOB         |
| USER        |

| target_id  |
| ---------- |
| JOB-000001 |

---

# 9. Luồng Retry / Manual Override

```text
Job Failed
     ↓
job_engine_jobs

     ↓
WAIT_REWORK

     ↓
Operator Login

     ↓
kiosk_sessions

     ↓
kiosk_access_logs

     ↓
job_engine_overwrite_requests

     ↓
Approve

     ↓
job_engine_job_attempts
(Attempt #2)

     ↓
Printer / Laser / Vision / PLC
```

---

# 10. Bảng quan trọng nhất hệ thống

Backup Priority:

1. job_engine_jobs
2. job_engine_job_attempts
3. job_engine_job_history
4. job_engine_overwrite_requests
5. vision_results
6. printer_jobs
7. laser_jobs
8. plc_robot_pick_events

Chỉ cần các bảng này là có thể tái dựng gần như toàn bộ lịch sử sản xuất, audit trail, QA traceability và root cause analysis của nhà máy.
