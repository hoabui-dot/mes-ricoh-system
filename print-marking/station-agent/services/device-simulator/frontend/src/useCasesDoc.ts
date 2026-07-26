export const USE_CASES_MD = `# Feature Request: Build Enterprise Test Use Case Console inside Device Simulator

You are a Senior QA Automation Architect, MES Solution Architect, and Full Stack Engineer.

Your task is to analyze the existing codebase and extend the Device Simulator application with a new module called:

## Test Use Case Console

The goal is to provide a centralized testing dashboard capable of executing complete business scenarios of the manufacturing system without requiring manual operation from Kiosk UI.

The Device Simulator should evolve from a simple simulator into a complete Integration Testing Platform.

---

# Business Goal

Before every release, QA, Developers, Product Owners, and Directors should be able to validate:

* Core business flows
* Device integration flows
* Permission flows
* SignalR synchronization
* Projection updates
* Device heartbeat monitoring
* Rework / Retry operations
* Error handling scenarios

using a single testing console.

The objective is:

* One-click execution
* Full visibility
* Repeatable tests
* Automatic verification
* Release confidence

---

# New Navigation Tab

Add a new tab:

\`\`\`text
Virtual Devices
Factory Gateway
Production History
Environment Config
Test Console
\`\`\`

Place Test Console beside existing simulator tabs.

---

# Test Console Architecture

The Test Console should communicate directly with:

\`\`\`text
Kiosk API
MES API
Projection API
Identity API
Device Simulator API
Factory Gateway API
SignalR Hub
\`\`\`

The console should orchestrate complete business scenarios.

---

# Test Suite Categories

Group test cases by business domain.

## Authentication

* Login Success
* Login Failed
* Operator Login
* Admin Login
* Password Reset
* User Disabled

---

## Permission Control

* View History Permission
* Rework Permission
* Permission Denied
* Admin Access
* Operator Access

---

## Production Flow

* Print Product Success
* Laser Product Success
* Print + Mark Success
* Camera Verification Success
* Complete Job Success

---

## Rework Flow

* Reprint Product
* Re-Mark Product
* Retry Failed Job
* Verify New History Record Created
* Verify Original History Preserved
* Verify Audit Log Created

---

## Device Health

* Printer Offline
* Laser Offline
* Vision Offline
* Gateway Offline
* Heartbeat Timeout

---

## SignalR

* Realtime Device Status Update
* Realtime Production History Update
* Realtime Job Status Update
* Reconnect Scenario

---

## Failure Scenarios

* Printer Busy
* Laser Busy
* Device Timeout
* Gateway Disconnect
* Invalid Payload
* Duplicate Request

---

# Test Case Execution UI

Each test case should appear as a separate executable card.

Example:

\`\`\`text
┌────────────────────────────────────┐
│ Print Product Success              │
│ Verify successful print workflow   │
│                                    │
│ [ Run Test ]                       │
└────────────────────────────────────┘
\`\`\`

Status:

* Not Executed
* Running
* Passed
* Failed

Use clear visual indicators.

---

# Run All Tests

Provide:

\`\`\`text
[ Run All ]
\`\`\`

This should execute all test cases sequentially.

Display:

\`\`\`text
Total Tests: 87
Passed: 85
Failed: 2
Running: 0
Success Rate: 97.7%
\`\`\`

---

# Detailed Execution Log

Each test must generate a timeline.

Example:

\`\`\`text
22:10:01
Create Failed Job

22:10:02
POST /api/jobs/retry

Payload:
{
  "jobId": "123"
}

22:10:03
Response 200 OK

22:10:03
SignalR Event Received

22:10:04
History Record Created

22:10:04
Audit Log Created

22:10:05
Test Passed
\`\`\`

---

# Execution Trace View

Every step must capture:

* Timestamp
* Duration
* Request URL
* HTTP Method
* Request Payload
* Response Payload
* SignalR Events
* Database Verification Results

Example:

\`\`\`text
Step 3

POST /api/rework

Duration:
312ms

Request:
{ ... }

Response:
{ ... }

Result:
PASS
\`\`\`

---

# API Verification Layer

After each action, automatically verify:

## Database

* Job exists
* History exists
* Audit log exists

## Projection

* Projection updated

## SignalR

* Event published

## Device

* Device state updated

---

# Test Definition Engine

Do not hardcode test flows.

Create reusable JSON-based test definitions.

Example:

{
"name": "Rework Product Success",
"category": "Rework",
"steps": [
{
"action": "CreateFailedJob"
},
{
"action": "GrantPermission"
},
{
"action": "ExecuteRework"
},
{
"action": "VerifyHistory"
},
{
"action": "VerifyAudit"
}
]
}

New test cases should be configurable without modifying frontend code.

---

# Metrics Dashboard

Display:

* Total Test Cases
* Passed
* Failed
* Average Execution Time
* Longest Running Test
* SignalR Events Received
* API Calls Executed

---

# Export Capability

Allow exporting:

* JSON report
* Markdown report
* HTML report

Example:

\`\`\`text
Test Run #2026-06-23

Passed:
85

Failed:
2

Success Rate:
97.7%
\`\`\`

---

# Technical Requirements

Frontend:

* React
* TypeScript
* shadcn/ui
* TanStack Query

Backend:

* .NET
* Clean Architecture
* CQRS

Testing Layer:

* Test Orchestrator Service
* API Client Layer
* SignalR Monitoring Layer
* Execution Engine

---

# Deliverables

Analyze the existing Device Simulator codebase and implement:

1. Test Console UI.
2. Test Execution Engine.
3. API Integration Layer.
4. SignalR Event Monitor.
5. Timeline Log Viewer.
6. JSON Test Definition System.
7. Run-All Test Runner.
8. Report Exporting.
9. Execution Metrics Dashboard.
10. Architecture documentation.

The final implementation should make Device Simulator become the central validation platform for the entire MES/Kiosk ecosystem.
`;

export const USE_CASES_MD_VI = `# Yêu cầu Tính năng: Xây dựng Kênh điều khiển Kịch bản Kiểm thử Doanh nghiệp (Enterprise Test Use Case Console) bên trong Bộ giả lập Thiết bị

Bạn là Kiến trúc sư Kiểm thử Tự động hóa Cao cấp, Kiến trúc sư Giải pháp MES và Kỹ sư Full Stack.

Nhiệm vụ của bạn là phân tích mã nguồn hiện tại và mở rộng ứng dụng Bộ giả lập Thiết bị với một mô-đun mới có tên:

## Kênh điều khiển Kịch bản Kiểm thử (Test Use Case Console)

Mục tiêu là cung cấp một bảng điều khiển kiểm thử tập trung có khả năng thực thi các kịch bản nghiệp vụ hoàn chỉnh của hệ thống sản xuất mà không cần thao tác thủ công từ Kiosk UI.

Bộ giả lập Thiết bị sẽ phát triển từ một bộ giả lập đơn giản thành một Nền tảng Kiểm thử Tích hợp (Integration Testing Platform) hoàn chỉnh.

---

# Mục tiêu Nghiệp vụ

Trước mỗi bản phát hành, QA, Lập trình viên, Chủ sở hữu Sản phẩm (Product Owners) và Ban Giám đốc phải có khả năng xác thực:

* Các luồng nghiệp vụ cốt lõi
* Luồng tích hợp thiết bị
* Luồng phân quyền người dùng
* Đồng bộ hóa thời gian thực qua SignalR
* Cập nhật tầng Projection
* Giám sát nhịp tim (heartbeat) thiết bị
* Các hoạt động làm lại / thử lại (Rework / Retry)
* Các kịch bản xử lý lỗi

chỉ bằng một kênh kiểm thử duy nhất.

Mục tiêu hướng tới là:

* Thực thi bằng một cú nhấp chuột (One-click execution)
* Khả năng hiển thị toàn diện
* Các ca kiểm thử có thể lặp lại
* Tự động xác thực kết quả
* Tăng sự tự tin khi phát hành sản phẩm

---

# Tab Điều hướng Mới

Thêm một tab mới:

\`\`\`text
Thiết bị Ảo (Virtual Devices)
Cổng nhà máy (Factory Gateway)
Lịch sử Sản xuất (Production History)
Cấu hình Môi trường (Environment Config)
Bảng kiểm thử (Test Console)
\`\`\`

Đặt tab "Test Console" bên cạnh các tab giả lập hiện có.

---

# Kiến trúc Bảng kiểm thử (Test Console Architecture)

Bảng kiểm thử sẽ giao tiếp trực tiếp với:

\`\`\`text
Kiosk API
MES API
Projection API
Identity API
Device Simulator API
Factory Gateway API
SignalR Hub
\`\`\`

Kênh điều khiển chịu trách nhiệm điều phối toàn bộ các kịch bản nghiệp vụ hoàn chỉnh.

---

# Các Danh mục Bộ kiểm thử (Test Suite Categories)

Nhóm các ca kiểm thử (test cases) theo phân vùng nghiệp vụ.

## Xác thực (Authentication)

* Đăng nhập Thành công
* Đăng nhập Thất bại
* Đăng nhập Người vận hành (Operator)
* Đăng nhập Quản trị viên (Admin)
* Đặt lại Mật khẩu
* Vô hiệu hóa Người dùng

---

## Kiểm soát Quyền hạn (Permission Control)

* Quyền Xem Lịch sử
* Quyền Làm lại (Rework)
* Quyền bị Từ chối
* Quyền truy cập Admin
* Quyền truy cập Operator

---

## Quy trình Sản xuất (Production Flow)

* In Sản phẩm Thành công
* Khắc Laser Thành công
* In + Khắc Thành công
* Xác thực Camera Thành công
* Hoàn thành Công việc Thành công

---

## Quy trình Rework (Rework Flow)

* In lại Sản phẩm (Reprint)
* Khắc lại Sản phẩm (Relaser)
* Thử lại Công việc Thất bại
* Xác thực Bản ghi Lịch sử Mới được Tạo
* Xác thực Bảo toàn Lịch sử Ban đầu
* Xác thực Nhật ký Audit được Tạo

---

## Sức khỏe Thiết bị (Device Health)

* Máy in Ngoại tuyến (Offline)
* Máy khắc Laser Ngoại tuyến
* Camera QC Ngoại tuyến
* Cổng kết nối ngoại tuyến
* Hết thời gian nhận nhịp tim (Heartbeat Timeout)

---

## Tín hiệu thời gian thực (SignalR)

* Cập nhật Trạng thái Thiết bị thời gian thực
* Cập nhật Lịch sử Sản xuất thời gian thực
* Cập nhật Trạng thái Công việc thời gian thực
* Kịch bản Kết nối lại (Reconnect Scenario)

---

## Kịch bản Thất bại (Failure Scenarios)

* Máy in Bận
* Máy khắc Laser Bận
* Thiết bị phản hồi chậm (Timeout)
* Mất kết nối Gateway
* Dữ liệu gửi đi (Payload) không hợp lệ
* Yêu cầu trùng lặp

---

# Giao diện Thực thi Ca kiểm thử (Test Case Execution UI)

Mỗi ca kiểm thử sẽ hiển thị dưới dạng một thẻ thực thi riêng biệt.

Ví dụ:

\`\`\`text
┌────────────────────────────────────┐
│ In Sản phẩm Thành công             │
│ Xác thực quy trình in thành công   │
│                                    │
│ [ Chạy kiểm thử ]                  │
└────────────────────────────────────┘
\`\`\`

Các Trạng thái:

* Chưa Thực thi (Not Executed)
* Đang chạy (Running)
* Thành công (Passed)
* Thất bại (Failed)

Sử dụng các chỉ báo trực quan rõ ràng.

---

# Chạy Tất cả các Ca kiểm thử

Cung cấp nút:

\`\`\`text
[ Chạy Tất cả ]
\`\`\`

Nút này sẽ thực thi tuần tự toàn bộ các ca kiểm thử.

Hiển thị kết quả:

\`\`\`text
Tổng số Ca kiểm thử: 87
Thành công: 85
Thất bại: 2
Đang chạy: 0
Tỷ lệ Thành công: 97.7%
\`\`\`

---

# Nhật ký Thực thi Chi tiết (Detailed Execution Log)

Mỗi lần kiểm thử phải tạo ra một dòng thời gian (timeline).

Ví dụ:

\`\`\`text
22:10:01
Tạo Công việc Thất bại

22:10:02
POST /api/jobs/retry

Dữ liệu gửi:
{
  "jobId": "123"
}

22:10:03
Phản hồi: 200 OK

22:10:03
Nhận sự kiện SignalR

22:10:04
Tạo bản ghi lịch sử thành công

22:10:04
Tạo nhật ký Audit thành công

22:10:05
Kiểm thử Đạt (Passed)
\`\`\`

---

# Xem dấu vết Thực thi (Execution Trace View)

Mỗi bước thực hiện phải ghi nhận lại:

* Dấu thời gian (Timestamp)
* Thời lượng thực thi (Duration)
* URL của Yêu cầu (Request URL)
* Phương thức HTTP (HTTP Method)
* Dữ liệu Yêu cầu (Request Payload)
* Dữ liệu Phản hồi (Response Payload)
* Các Sự kiện SignalR nhận được
* Kết quả Xác thực Cơ sở Dữ liệu

Ví dụ:

\`\`\`text
Bước 3

POST /api/rework

Thời lượng:
312ms

Yêu cầu:
{ ... }

Phản hồi:
{ ... }

Kết quả:
ĐẠT (PASS)
\`\`\`

---

# Tầng Tự động Xác thực API (API Verification Layer)

Sau mỗi hành động, hệ thống tự động xác thực:

## Cơ sở Dữ liệu

* Kiểm tra sự tồn tại của Job
* Kiểm tra sự tồn tại của lịch sử
* Kiểm tra nhật ký Audit được tạo

## Tầng Projection

* Bản đọc Projection được cập nhật

## Tín hiệu thời gian thực (SignalR)

* Sự kiện (Event) được phát hành thành công

## Thiết bị

* Trạng thái thiết bị được cập nhật chính xác

---

# Bộ máy Định nghĩa Ca kiểm thử (Test Definition Engine)

Không hardcode các luồng kiểm thử.

Tạo ra các định nghĩa kiểm thử dựa trên tệp cấu hình JSON có thể tái sử dụng.

Ví dụ:

{
"name": "Rework Product Success",
"category": "Rework",
"steps": [
{
"action": "CreateFailedJob"
},
{
"action": "GrantPermission"
},
{
"action": "ExecuteRework"
},
{
"action": "VerifyHistory"
},
{
"action": "VerifyAudit"
}
]
}

Các ca kiểm thử mới có thể dễ dàng cấu hình mà không cần lập trình lại frontend.

---

# Bảng chỉ số Hiệu năng (Metrics Dashboard)

Hiển thị:

* Tổng số Ca kiểm thử
* Số ca Thành công
* Số ca Thất bại
* Thời gian thực thi trung bình
* Ca kiểm thử tốn nhiều thời gian nhất
* Số sự kiện SignalR đã nhận
* Số cuộc gọi API đã thực thi

---

# Khả năng Xuất báo cáo (Export Capability)

Cho phép xuất:

* Báo cáo dạng JSON
* Báo cáo dạng Markdown
* Báo cáo dạng HTML

Ví dụ:

\`\`\`text
Lần chạy kiểm thử #2026-06-23

Thành công:
85

Thất bại:
2

Tỷ lệ Thành công:
97.7%
\`\`\`

---

# Yêu cầu Kỹ thuật

Mặt trước (Frontend):

* React
* TypeScript
* thư viện shadcn/ui
* TanStack Query

Mặt sau (Backend):

* .NET
* Kiến trúc sạch (Clean Architecture)
* Mô hình CQRS

Tầng kiểm thử (Testing Layer):

* Dịch vụ điều phối kiểm thử (Test Orchestrator Service)
* Lớp kết nối API (API Client Layer)
* Lớp giám sát SignalR (SignalR Monitoring Layer)
* Bộ máy thực thi kiểm thử (Execution Engine)

---

# Danh sách Bàn giao (Deliverables)

Phân tích mã nguồn bộ giả lập thiết bị hiện tại và triển khai:

1. Giao diện Bảng điều khiển Kiểm thử (Test Console UI).
2. Bộ máy thực thi kiểm thử (Test Execution Engine).
3. Lớp tích hợp API (API Integration Layer).
4. Bộ giám sát sự kiện SignalR (SignalR Event Monitor).
5. Trình xem nhật ký dòng thời gian (Timeline Log Viewer).
6. Hệ thống định nghĩa ca kiểm thử bằng JSON.
7. Bộ chạy kiểm thử tất cả các ca (Run-All Test Runner).
8. Xuất báo cáo kết quả kiểm thử.
9. Bảng chỉ số thực thi kiểm thử.
10. Tài liệu kiến trúc kiểm thử.

Bản triển khai cuối cùng phải giúp Bộ giả lập Thiết bị trở thành nền tảng xác thực trung tâm cho toàn bộ hệ sinh thái MES/Kiosk.
`;
