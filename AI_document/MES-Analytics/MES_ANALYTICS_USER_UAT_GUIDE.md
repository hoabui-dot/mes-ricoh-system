# Hướng dẫn UAT Analytics MES

## Chuẩn bị

1. Đăng nhập MES Console bằng tài khoản Planner/Plant Manager.
2. Mở **Phân tích sản xuất** tại `/analytics`.
3. Chọn khoảng ngày không quá 366 ngày; dữ liệu mặc định là 30 ngày gần nhất.
4. Dùng filter Nhà máy, Dây chuyền và Trạng thái WO; nút Đặt lại xóa filter URL.

## UAT theo màn hình

- **Tổng quan**: kiểm tra Active WO, Completed, Blocked, Planned Qty, Good Qty, Scrap Qty, line phụ và Resource Hold.
- **Work Order**: mở một dòng báo cáo để đến chi tiết WO; kiểm tra line đã chọn và lý do fallback.
- **Nguồn lực & Line**: đối chiếu line load, allocation source và resource hold với Work Order.
- **Công đoạn & chất lượng**: kiểm tra trạng thái công đoạn, failed/retry/abort và good/scrap; đây là dữ liệu thực thi MES, không phải QMS.
- **Vật tư & truy xuất**: chỉ kiểm tra MES readiness và label/lot/serial/genealogy; không dùng màn hình này để kết luận tồn kho WMS.
- **In nhãn**: kiểm tra job success/failure, attempts và latency; không trộn trạng thái Kafka vào KPI sản xuất.
- **Readiness Master Data**: kiểm tra released PV/line, workstation, machine unit và các thiếu hụt capability/calendar/standard/skill.

## Tiêu chí dừng

Không certify khi dữ liệu non-zero chưa được đối chiếu owner DB, khi fallback scenario không chọn Backup đúng rule, hoặc khi Playwright authenticated smoke không hoàn tất.
