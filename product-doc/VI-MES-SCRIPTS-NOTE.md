# Ghi chú lệnh hệ thống

Root `package.json` chỉ giữ các lệnh vận hành cần dùng thường xuyên:

- `npm run reset:seed:mes:wo`: cleanup dữ liệu demo disposable rồi seed một bộ MES tổng hoàn chỉnh. Chỉ chạy ở development/demo; script có guardrail môi trường và yêu cầu xác nhận reset.
- `npm run cloudflare:urls`: đọc tunnel hiện tại và in URL Portal, MES, WMS, QMS, API và SSO. Nếu tunnel không tồn tại, giá trị được in là `NONE`.
- `npm run rebuild:mes`: build và recreate các service MES bằng compose.
- `npm run rebuild:print-station`: build/recreate Projection và Kiosk Print Station, chuẩn bị Kafka topic và chạy runtime verification.
- `npm run build:printer-adapter:images`: build hai image Printer Adapter cho local, không push Docker Hub.
- `npm run build:printer-adapter:both`: build và push các image Printer Adapter theo script build hiện tại.
- `npm run test:mes:machine-flow`: kiểm thử API Machine Definition, Physical Machine Unit, readiness, assignment conflict và cleanup fixture.
- `npm run machines:reset`: cleanup, seed và verify dataset Machine Won Seal Tech trong namespace `WST-*`.
- `npm run machines:verify`: kiểm tra nhanh dataset Won Seal Tech hiện tại mà không thay đổi dữ liệu.

Các script con được gọi bên trong hai workflow tổng (reset/seed và rebuild Print Station) vẫn được giữ lại. Các script test, verify, migrate, demo seed riêng lẻ và command tương ứng đã được loại khỏi root để tránh tạo thêm entry point không được quản lý.

Không chạy `reset:seed:mes:wo` trên production hoặc database production-like. Sau khi chạy seed, kiểm tra log compose và trạng thái service trước khi dùng fixture trên UI.
