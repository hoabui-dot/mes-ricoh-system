# Hằng số nghiệp vụ — Trạm biên in ấn và khắc nhãn (Business Constants)

> **QUY TẮC AI (AI RULE)**: Tất cả mã nguồn phải sử dụng các hằng số chuỗi được định nghĩa ở đây. Tuyệt đối không viết cứng (hardcode) các giá trị nghiệp vụ dưới dạng chuỗi ma thuật (magic strings). Hãy import từ `ND.UnifiedContracts.Constants.BusinessConstants`.

---

## Quy tắc triển khai AI (AI Implementation Rule)

Trước khi triển khai bất kỳ tính năng nào liên quan đến hoạt động sản xuất:

1. ✅ Đọc [PRODUCT_OVERVIEW.md](./PRODUCT_OVERVIEW.md) — hiểu hệ thống
2. ✅ Đọc [MANUFACTURING_WORKFLOW.md](./MANUFACTURING_WORKFLOW.md) — hiểu quy trình
3. ✅ Đọc [DEVICE_CATALOG.md](./DEVICE_CATALOG.md) — hiểu các thiết bị
4. ✅ Đọc [EVENT_MODEL.md](./EVENT_MODEL.md) — hiểu các sự kiện
5. ✅ Đọc [MQTT_PAYLOAD_CONTRACT.md](./MQTT_PAYLOAD_CONTRACT.md) — hiểu giao thức
6. ✅ Đọc tài liệu này — hiểu các giá trị hợp lệ

**Chỉ sau khi hoàn thành các bước trên mới được bắt đầu sinh mã nguồn.**

**Tài liệu nghiệp vụ có độ ưu tiên cao hơn mọi giả định khi triển khai.**

---

## Các loại khắc (Marking Types)

Được sử dụng trong trường `data[].tag = "marking.type"` thuộc thông điệp MQTT.

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `MarkingType.LaserEtching` | `LASER_ETCHING` | Khắc laser tiêu chuẩn trên bề mặt |
| `MarkingType.LaserDotPeen` | `LASER_DOT_PEEN` | Khắc gõ chấm cơ học |
| `MarkingType.LaserSerialization` | `LASER_SERIALIZATION` | Tạo và khắc số sê-ri duy nhất |
| `MarkingType.LaserQrMarking` | `LASER_QR_MARKING` | Khắc mã QR bằng laser |
| `MarkingType.LaserBarcodeMarking` | `LASER_BARCODE_MARKING` | Khắc mã vạch bằng laser |

### Ý nghĩa chi tiết

**`LASER_ETCHING`**
Khắc laser tiêu chuẩn. Loại bỏ lớp vật liệu bề mặt để tạo ra vết khắc vĩnh viễn. Sử dụng cho số lô, mã ngày và văn bản chữ-số trên bề mặt cứng.

**`LASER_DOT_PEEN`**
Khắc cơ học gõ chấm. Một đầu kim tạo ra một chuỗi các chấm đè lên nhau để tạo thành ký tự. Sử dụng trên bề mặt kim loại khi cần độ tương phản cao.

**`LASER_SERIALIZATION`**
Tự động tạo và khắc số sê-ri tuần tự. Mỗi sản phẩm nhận một số sê-ri tăng dần duy nhất. Hệ thống tự động tạo sê-ri dựa trên công thức của lô hàng.

**`LASER_QR_MARKING`**
Khắc mã QR bằng laser. Sử dụng cho các mã truy xuất nguồn gốc cần khả năng quét đọc lâu dài.

**`LASER_BARCODE_MARKING`**
Khắc mã vạch bằng laser. Hỗ trợ các chuẩn mã vạch 1D (Code 39, Code 128, GS1).

---

## Các loại in (Print Types)

Được sử dụng trong trường `data[].tag = "print.type"` thuộc thông điệp MQTT.

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `PrintType.LabelPrint` | `LABEL_PRINT` | In nhãn chung |
| `PrintType.QrLabel` | `QR_LABEL` | Nhãn có mã QR là thành phần chính |
| `PrintType.BarcodeLabel` | `BARCODE_LABEL` | Nhãn có mã vạch là thành phần chính |
| `PrintType.PackagingLabel` | `PACKAGING_LABEL` | Nhãn bao bì ngoài / Nhãn thùng carton |
| `PrintType.ProductLabel` | `PRODUCT_LABEL` | Nhãn dán trực tiếp lên sản phẩm |

---

## Trạng thái xác thực (Verification Status)

Sử dụng trong bản ghi công việc (job records), kết quả của dịch vụ thị giác (vision results), và các sự kiện đồng bộ (sync events).

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `VerificationStatus.Pass` | `VERIFIED_PASS` | Xác thực thành công — nội dung khớp với mong đợi |
| `VerificationStatus.Fail` | `VERIFIED_FAIL` | Xác thực thất bại — không đọc được hoặc không khớp nội dung |
| `VerificationStatus.Retry` | `VERIFIED_RETRY` | Cần thực hiện lại việc xác thực — do lỗi ánh sáng/camera |
| `VerificationStatus.Bypass` | `VERIFIED_BYPASS` | Xác thực được bỏ qua bởi người vận hành được ủy quyền |

### Ý nghĩa chi tiết

**`VERIFIED_PASS`**
Hệ thống thị giác xác nhận nội dung in/khắc khớp hoàn toàn với nội dung mong đợi. Sản phẩm được phép đi tiếp.

**`VERIFIED_FAIL`**
Hệ thống thị giác phát hiện sai lệch hoặc không thể đọc được nội dung. Sản phẩm không được phép đi tiếp. Yêu cầu quyết định từ người vận hành.

**`VERIFIED_RETRY`**
Hệ thống thị giác không thể hoàn thành việc xác thực do điều kiện tạm thời (ánh sáng kém, camera chưa sẵn sàng). Tự động quét lại.

**`VERIFIED_BYPASS`**
Người vận hành được ủy quyền đã phê duyệt bỏ qua bước xác thực một cách rõ ràng. Việc này phải được ghi nhật ký kèm ID người vận hành, lý do và dấu thời gian. Sản phẩm được đi tiếp nhưng bị gắn cờ cảnh báo.

---

## Chất lượng dữ liệu (Data Quality)

Sử dụng trong trường `data[].quality` thuộc thông điệp MQTT.

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `DataQuality.Good` | `GOOD` | Giá trị tin cậy từ thiết bị |
| `DataQuality.Uncertain` | `UNCERTAIN` | Độ tin cậy của thiết bị ở mức thấp |
| `DataQuality.Bad` | `BAD` | Giá trị không hợp lệ — lỗi thiết bị |
| `DataQuality.Missing` | `MISSING` | Không có giá trị — tag chưa có dữ liệu |

### Ý nghĩa chi tiết

**`GOOD`**
Thiết bị trả về giá trị với độ tin cậy tuyệt đối. Giá trị này đáng tin cậy để xử lý tiếp.

**`UNCERTAIN`**
Thiết bị trả về giá trị nhưng độ tin cậy thấp. Cần ghi nhận cảnh báo. Việc sử dụng hay không tùy thuộc vào ngữ cảnh.

**`BAD`**
Thiết bị trả về giá trị không hợp lệ hoặc thông báo lỗi. Không sử dụng giá trị này cho các quyết định nghiệp vụ. Ghi log lỗi.

**`MISSING`**
Tag nghiệp vụ được yêu cầu nhưng không có giá trị nào được cung cấp. Đây là lỗi cấu hình hoặc lỗi truyền thông. Từ chối thông điệp nếu tag này là bắt buộc.

---

## Hoạt động sản xuất (Production Operations)

Sử dụng trong trường `data[].tag = "operation.type"` thuộc thông điệp MQTT.

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `ProductionOperation.PrintOnly` | `PRINT_ONLY` | Chỉ thực hiện in nhãn |
| `ProductionOperation.MarkOnly` | `MARK_ONLY` | Chỉ thực hiện khắc laser |
| `ProductionOperation.PrintAndMark` | `PRINT_AND_MARK` | Yêu cầu cả máy in và máy khắc laser |
| `ProductionOperation.VerifyOnly` | `VERIFY_ONLY` | Chỉ kiểm tra ngoại quan — không in/khắc |
| `ProductionOperation.Rework` | `REWORK` | Gia công/xử lý lại sản phẩm bị lỗi trước đó |

### Ý nghĩa chi tiết

**`PRINT_ONLY`**
Chỉ sử dụng máy in nhãn. Không sử dụng máy khắc laser. Vẫn thực hiện việc xác thực nhãn bằng camera.

**`MARK_ONLY`**
Chỉ sử dụng máy khắc laser. Không sử dụng máy in nhãn. Vẫn thực hiện việc xác thực vết khắc bằng camera.

**`PRINT_AND_MARK`**
Yêu cầu cả máy in nhãn và máy khắc laser. Việc in nhãn luôn được thực hiện trước, sau đó là khắc laser. Cả hai bước phải thành công trước khi tiến hành xác thực bằng camera.

**`VERIFY_ONLY`**
Không in ấn hay khắc laser. Trạm chỉ chạy hệ thống thị giác để kiểm tra sản phẩm đã được dán nhãn hoặc khắc trước đó ở nơi khác.

**`REWORK`**
Sản phẩm xử lý trước đó đã bị lỗi và cần được gia công lại. Loại gia công lại (REPRINT, RELASER, v.v.) sẽ quyết định thiết bị nào được sử dụng. Yêu cầu phê duyệt từ người vận hành.

---

## Các loại ghi đè (Overwrite Types)

Sử dụng trong thực thể `OverwriteRequest` và tag `rework.type`.

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `OverwriteType.Reprint` | `REPRINT` | In lại nhãn |
| `OverwriteType.Relaser` | `RELASER` | Khắc lại laser |
| `OverwriteType.ForcePass` | `FORCE_PASS` | Ép trạng thái xác thực thành PASS |
| `OverwriteType.ForceComplete` | `FORCE_COMPLETE` | Ép toàn bộ công việc thành trạng thái COMPLETE |

---

## Các loại kích hoạt (Trigger Types)

Sử dụng trong thực thể `JobAttempt` để xác định cách bắt đầu lượt chạy thử.

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `TriggerType.Auto` | `AUTO` | Kích hoạt tự động bởi sự kiện MQTT gửi tới |
| `TriggerType.ManualRetry` | `MANUAL_RETRY` | Người vận hành kích hoạt thử lại thủ công |
| `TriggerType.Overwrite` | `OVERWRITE` | Kích hoạt bởi một yêu cầu ghi đè được duyệt |

---

## Trạng thái Job (Job Status)

Sử dụng trong thực thể `Job` để theo dõi vòng đời của công việc.

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `JobStatus.Created` | `CREATED` | Job đã được tạo, chưa được đưa vào hàng đợi |
| `JobStatus.Queued` | `QUEUED` | Job đã nằm trong hàng đợi thực thi |
| `JobStatus.Processing` | `PROCESSING` | Job đang được tích cực thực thi |
| `JobStatus.WaitRework` | `WAIT_REWORK` | Job tạm dừng, chờ quyết định ghi đè từ người vận hành |
| `JobStatus.Completed` | `COMPLETED` | Job đã hoàn thành thành công |
| `JobStatus.Failed` | `FAILED` | Job thất bại sau tất cả các lần thử lại |
| `JobStatus.Cancelled` | `CANCELLED` | Job bị hủy bởi người vận hành |

---

## Các loại sự kiện (Event Types)

Sử dụng trong tất cả các sự kiện được xuất bản nội bộ và gửi tới Factory Gateway.

### Sự kiện in
```
PRINT_REQUESTED, PRINT_STARTED, PRINT_COMPLETED, PRINT_FAILED, PRINT_RETRYING
```

### Sự kiện khắc
```
MARK_REQUESTED, MARK_STARTED, MARK_COMPLETED, MARK_FAILED, MARK_RETRYING
```

### Sự kiện xác thực
```
VERIFY_STARTED, VERIFY_PASS, VERIFY_FAIL, VERIFY_RETRY, VERIFY_BYPASS
```

### Sự kiện Job
```
JOB_CREATED, JOB_STARTED, JOB_COMPLETED, JOB_FAILED, JOB_CANCELLED
```

### Sự kiện ghi đè
```
OVERWRITE_REQUESTED, OVERWRITE_APPROVED, OVERWRITE_REJECTED, OVERWRITE_EXECUTED
```

### Sự kiện đồng bộ
```
SYNC_STARTED, SYNC_COMPLETED, SYNC_FAILED, SYNC_RETRYING
```

### Sự kiện PLC
```
PLC_LINE_STATE_CHANGED, PLC_TRIGGER_DETECTED, PLC_FAULT_DETECTED, PLC_FAULT_CLEARED
```

### Sự kiện sức khỏe thiết bị
```
DEVICE_ONLINE, DEVICE_OFFLINE
```

---

## Tham chiếu C#

Tất cả các hằng số ở trên được triển khai trong:

```
shared/ND.UnifiedContracts/Constants/BusinessConstants.cs
```

Mẫu import:

```csharp
using ND.UnifiedContracts.Constants;

// Cách dùng:
var operation = ProductionOperation.PrintOnly;         // "PRINT_ONLY"
var marking = MarkingType.LaserEtching;               // "LASER_ETCHING"
var status = VerificationStatus.Pass;                  // "VERIFIED_PASS"
var quality = DataQuality.Good;                        // "GOOD"
```
