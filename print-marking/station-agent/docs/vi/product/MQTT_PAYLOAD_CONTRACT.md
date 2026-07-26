# Hợp đồng Payload MQTT — Trạm biên in ấn và khắc nhãn (MQTT Payload Contract)

> ⚠️ **TÀI LIỆU NÀY LÀ BẮT BUỘC**
>
> Tất cả các truyền thông MQTT giữa Factory Gateway và MQTT Adapter **phải tuân thủ nghiêm ngặt hợp đồng này**.
>
> **AI tuyệt đối không được tự ý tạo ra các cấu trúc payload thay thế.**
>
> Việc xác thực JSON schema phải được thực thi trên mọi thông điệp đến (inbound).

---

## Schema thông điệp MQTT chuẩn (Canonical MQTT Message Schema)

Đây là định dạng thông điệp MQTT **duy nhất** được chấp nhận. Không cho phép bất kỳ sự sai lệch nào.

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Laser-Marking-03",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:30:00+07:00",
  "event_id": "evt-mark-20260616-9921",
  "data": [
    {
      "tag": "marking.type",
      "value": "LASER_ETCHING",
      "quality": "GOOD"
    }
  ]
}
```

---

## Thông số kỹ thuật các trường (Field Specifications)

| Trường | Kiểu | Bắt buộc | Các ràng buộc |
|---|---|---|---|
| `site` | string | ✅ | Không để trống, tối đa 100 ký tự |
| `area` | string | ✅ | Không để trống, tối đa 100 ký tự |
| `line` | string | ✅ | Không để trống, tối đa 100 ký tự |
| `machine` | string | ✅ | Không để trống, tối đa 100 ký tự |
| `edge_id` | string | ✅ | Không để trống, phải trùng khớp với ID trạm biên cục bộ |
| `timestamp` | chuỗi ISO 8601 | ✅ | Phải bao gồm cả múi giờ lệch |
| `event_id` | string | ✅ | Duy nhất trên toàn cầu, định dạng: `evt-{type}-{YYYYMMDD}-{seq}` |
| `data` | array | ✅ | Yêu cầu chứa ít nhất 1 phần tử |
| `data[].tag` | string | ✅ | Đường dẫn tag phân tách bằng dấu chấm (VD: `operation.type`) |
| `data[].value` | string | ✅ | Giá trị nghiệp vụ (xem phần hằng số) |
| `data[].quality` | string | ✅ | Một trong số: `GOOD`, `UNCERTAIN`, `BAD`, `MISSING` |

---

## Định nghĩa JSON Schema (JSON Schema Definition)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "UnifiedEvent",
  "type": "object",
  "required": ["site", "area", "line", "machine", "edge_id", "timestamp", "event_id", "data"],
  "properties": {
    "site":      { "type": "string", "minLength": 1, "maxLength": 100 },
    "area":      { "type": "string", "minLength": 1, "maxLength": 100 },
    "line":      { "type": "string", "minLength": 1, "maxLength": 100 },
    "machine":   { "type": "string", "minLength": 1, "maxLength": 100 },
    "edge_id":   { "type": "string", "minLength": 1, "maxLength": 100 },
    "timestamp": { "type": "string", "format": "date-time" },
    "event_id":  { "type": "string", "minLength": 1, "maxLength": 200 },
    "data": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["tag", "value", "quality"],
        "properties": {
          "tag":     { "type": "string", "minLength": 1 },
          "value":   { "type": "string" },
          "quality": { "type": "string", "enum": ["GOOD", "UNCERTAIN", "BAD", "MISSING"] }
        }
      }
    }
  },
  "additionalProperties": false
}
```

---

## Cấu trúc Topic MQTT (MQTT Topic Structure)

### Chiều nhận (Gateway → Trạm biên)

```
nd/{site}/{edge_id}/command
```

Ví dụ:
```
nd/NMDDuongDuong/edge-ipc-l3-marking/command
```

### Chiều gửi (Trạm biên → Gateway)

```
nd/{site}/{edge_id}/result
nd/{site}/{edge_id}/event
nd/{site}/{edge_id}/heartbeat
```

---

## Payload hoàn chỉnh cho các hoạt động (Complete Operation Payloads)

### Chỉ in (`PRINT_ONLY`)

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Printer-01",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:30:00+07:00",
  "event_id": "evt-print-20260616-0001",
  "data": [
    {
      "tag": "operation.type",
      "value": "PRINT_ONLY",
      "quality": "GOOD"
    },
    {
      "tag": "print.type",
      "value": "LABEL_PRINT",
      "quality": "GOOD"
    },
    {
      "tag": "product.id",
      "value": "FC-WP-RO100G-B-998822",
      "quality": "GOOD"
    },
    {
      "tag": "product.lot",
      "value": "LOT-2026-06-A-001",
      "quality": "GOOD"
    },
    {
      "tag": "product.mfg_date",
      "value": "2026-06-16",
      "quality": "GOOD"
    },
    {
      "tag": "product.exp_date",
      "value": "2028-06-16",
      "quality": "GOOD"
    }
  ]
}
```

---

### Chỉ khắc (`MARK_ONLY`)

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Laser-Marking-03",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:31:00+07:00",
  "event_id": "evt-mark-20260616-0042",
  "data": [
    {
      "tag": "operation.type",
      "value": "MARK_ONLY",
      "quality": "GOOD"
    },
    {
      "tag": "marking.type",
      "value": "LASER_ETCHING",
      "quality": "GOOD"
    },
    {
      "tag": "marking.serial",
      "value": "SN-0001234",
      "quality": "GOOD"
    },
    {
      "tag": "marking.lot",
      "value": "2026-BATCH-A",
      "quality": "GOOD"
    },
    {
      "tag": "marking.date_code",
      "value": "260616",
      "quality": "GOOD"
    }
  ]
}
```

---

### In và khắc (`PRINT_AND_MARK`)

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Station-Combined-01",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:32:00+07:00",
  "event_id": "evt-combined-20260616-0099",
  "data": [
    {
      "tag": "operation.type",
      "value": "PRINT_AND_MARK",
      "quality": "GOOD"
    },
    {
      "tag": "print.type",
      "value": "PRODUCT_LABEL",
      "quality": "GOOD"
    },
    {
      "tag": "marking.type",
      "value": "LASER_SERIALIZATION",
      "quality": "GOOD"
    },
    {
      "tag": "product.id",
      "value": "FC-WP-RO100G-B-998822",
      "quality": "GOOD"
    },
    {
      "tag": "product.lot",
      "value": "LOT-2026-06-A-001",
      "quality": "GOOD"
    },
    {
      "tag": "marking.serial",
      "value": "SN-0001234",
      "quality": "GOOD"
    }
  ]
}
```

---

### Chỉ xác thực (`VERIFY_ONLY`)

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Camera-QC-01",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:33:00+07:00",
  "event_id": "evt-verify-20260616-0150",
  "data": [
    {
      "tag": "operation.type",
      "value": "VERIFY_ONLY",
      "quality": "GOOD"
    },
    {
      "tag": "verify.expected_content",
      "value": "FC-WP-RO100G-B-998822",
      "quality": "GOOD"
    },
    {
      "tag": "verify.camera_id",
      "value": "CAM-01",
      "quality": "GOOD"
    }
  ]
}
```

---

### Làm lại (`REWORK`)

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Station-Combined-01",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:35:00+07:00",
  "event_id": "evt-rework-20260616-0200",
  "data": [
    {
      "tag": "operation.type",
      "value": "REWORK",
      "quality": "GOOD"
    },
    {
      "tag": "rework.original_job_id",
      "value": "job-20260616-9921",
      "quality": "GOOD"
    },
    {
      "tag": "rework.type",
      "value": "REPRINT",
      "quality": "GOOD"
    },
    {
      "tag": "rework.operator_id",
      "value": "OP-007",
      "quality": "GOOD"
    }
  ]
}
```

---

## Các Data Tag thông dụng (Well-Known Data Tags)

Đây là những tag duy nhất được chấp nhận trong mảng `data`. AI không được tự tạo các tag mới mà không cập nhật danh sách này.

| Tag | Ý nghĩa | Các giá trị hợp lệ |
|---|---|---|
| `operation.type` | Loại hoạt động sản xuất | `PRINT_ONLY`, `MARK_ONLY`, `PRINT_AND_MARK`, `VERIFY_ONLY`, `REWORK` |
| `print.type` | Loại nhãn cần in | `LABEL_PRINT`, `QR_LABEL`, `BARCODE_LABEL`, `PACKAGING_LABEL`, `PRODUCT_LABEL` |
| `marking.type` | Loại khắc laser | `LASER_ETCHING`, `LASER_DOT_PEEN`, `LASER_SERIALIZATION`, `LASER_QR_MARKING`, `LASER_BARCODE_MARKING` |
| `product.id` | Mã định danh sản phẩm | Ký tự tự do (tối đa 200 ký tự) |
| `product.lot` | Số lô sản phẩm | Ký tự tự do (tối đa 100 ký tự) |
| `product.mfg_date` | Ngày sản xuất | `YYYY-MM-DD` |
| `product.exp_date` | Ngày hết hạn | `YYYY-MM-DD` |
| `marking.serial` | Số sê-ri cần khắc | Tự do |
| `marking.lot` | Lô hàng cần khắc | Tự do |
| `marking.date_code` | Mã ngày cần khắc | Tự do |
| `verify.expected_content` | Nội dung mong đợi để xác thực | Tự do |
| `verify.camera_id` | Mã định danh camera | Device ID |
| `rework.original_job_id` | Job đang được làm lại | Định dạng Job ID |
| `rework.type` | Loại làm lại | `REPRINT`, `RELASER`, `FORCE_PASS`, `FORCE_COMPLETE` |
| `rework.operator_id` | Người vận hành làm lại | Operator ID |

---

## Quy tắc xác thực (Validation Rules)

### MQTT Adapter BẮT BUỘC phải:

1. **Xác thực JSON schema** trên mọi thông điệp nhận được — từ chối thông điệp sai định dạng.
2. **Kiểm tra `edge_id`** xem có khớp với ID của trạm biên cục bộ không — bỏ qua nếu là của trạm khác.
3. **Kiểm tra tính duy nhất của `event_id`** bằng cách sử dụng cơ chế idempotency của Redis — loại bỏ các sự kiện trùng lặp.
4. **Xác thực `quality`** — ghi cảnh báo vào log nếu có bất kỳ tag nào có chất lượng là `BAD` hoặc `MISSING`.
5. **Phân tích cú pháp `operation.type`** — phải là một trong các hoạt động đã được định nghĩa.
6. **Phát ra chính xác một sự kiện nội bộ** cho mỗi thông điệp hợp lệ nhận được.

### MQTT Adapter KHÔNG ĐƯỢC phép:

- Chấp nhận các payload không hoàn chỉnh, thiếu các trường bắt buộc.
- Chấp nhận các giá trị `operation.type` lạ, không xác định.
- Bỏ qua các lỗi xác thực mà không ghi log lại.
- Thay đổi `event_id` của các thông điệp nhận được.

---

## Định dạng kết quả gửi đi (Outbound Result Format)

Khi xuất bản kết quả gửi lại cho Gateway, hãy sử dụng định dạng sau:

```json
{
  "site": "NMDDuongDuong",
  "area": "Assembly_Section",
  "line": "Chuyen03",
  "machine": "Printer-01",
  "edge_id": "edge-ipc-l3-marking",
  "timestamp": "2026-06-16T15:30:05+07:00",
  "event_id": "evt-result-20260616-0001",
  "source_event_id": "evt-print-20260616-0001",
  "event_type": "PRINT_COMPLETED",
  "job_id": "job-20260616-9921",
  "result": "PASS",
  "data": [
    {
      "tag": "result.duration_ms",
      "value": "4850",
      "quality": "GOOD"
    }
  ]
}
```
