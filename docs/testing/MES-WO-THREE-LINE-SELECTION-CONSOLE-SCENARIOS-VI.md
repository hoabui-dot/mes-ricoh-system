# Ba scenario Production Version để test chọn Production Line trên MES Console

## Mục đích

Bộ seed này tạo cùng một sản phẩm, MBOM và site, với hai Production Line:

- `WST-SEED-LINE-1`: Primary line.
- `WST-SEED-LINE-2`: Backup line.

Ba Production Version dưới đây được tạo riêng để chọn trên `work-orders/new`:

| Use case | Production Version | Kết quả mong đợi |
|---|---|---|
| 1. Hai line hợp lệ | `WST-UAT-PV-01-PRIMARY-READY` | Chọn `WST-SEED-LINE-1`. |
| 2. Primary không đủ khả năng | `WST-UAT-PV-02-BACKUP-FALLBACK` | Primary bị block, hệ thống fallback và chọn `WST-SEED-LINE-2`. |
| 3. Cả hai line không đủ khả năng | `WST-UAT-PV-03-BOTH-LINES-HOLD` | Không chọn line; WO vào `RESOURCE_HOLD` và pipeline hiển thị blocker. |

## Reset và seed

Chạy trong môi trường development/local:

```bash
npm run reset:seed:mes:wo-line-scenarios
```

Lệnh này dọn toàn bộ Work Order test và dữ liệu seed sở hữu namespace `WST-SEED`/`WST-UAT`, sau đó tạo lại master-data và execution read model. Lệnh không xóa master-data canonical ngoài namespace này.

Có thể kiểm tra seed sau đó bằng:

```bash
npm run verify:mes:seed
```

Ngày test mặc định là ngày làm việc kế tiếp. Có thể cố định ngày có lịch bằng:

```bash
E2E_WO_TARGET_DATE=2026-08-10 npm run reset:seed:mes:wo-line-scenarios
```

## Test trên MES Console

1. Mở `work-orders/new`.
2. Chọn ngày mục tiêu đúng với ngày seed, ví dụ `10/08/2026`.
3. Tạo lần lượt ba WO bằng ba Production Version ở bảng trên.
4. Với use case 1 và 2, pipeline phải hoàn tất tạo WO; kiểm tra Production Line trong summary/detail.
5. Với use case 3, pipeline phải kết thúc ở trạng thái giữ tài nguyên (`RESOURCE_HOLD`), không tự chọn Primary hoặc Backup. Mở chi tiết lỗi/blocker trong pipeline để xem nguyên nhân.

Sản lượng phải tự nhập, không có giá trị mặc định. Dùng `1` hoặc `2` PCS để test.

## Cleanup sau khi test thủ công

Sau khi hoàn tất test, chạy lại lệnh reset ở trên trước khi seed lại bộ dữ liệu sạch. Lệnh reset chỉ dọn Work Order test và namespace seed được quản lý bởi script.
