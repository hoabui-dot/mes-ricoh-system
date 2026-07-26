# Zebra Label Printing Architecture

## Mục tiêu

Xây dựng một hệ thống thiết kế và in nhãn (Label Printing) cho máy in Zebra theo kiến trúc Enterprise, trong đó:

- Frontend chỉ chịu trách nhiệm thiết kế Label Template.
- Backend (.NET) chịu trách nhiệm render sang ZPL.
- Gửi trực tiếp ZPL tới Zebra Printer qua TCP/IP (Port 9100).
- Không cần tách riêng Label Template Service, toàn bộ xử lý nằm trong Print Adapter Service.

---

# Kiến trúc tổng thể

```text
                   React Label Designer
                           │
                           │ REST API
                           ▼
               ASP.NET Core Print Adapter
 ┌─────────────────────────────────────────────────────────┐
 │                                                         │
 │  Template Repository (JSON)                             │
 │  FluentValidation                                       │
 │  ZPL Renderer (Strategy Pattern)                        │
 │  Print Queue (Channel<PrintJob>)                        │
 │  TCP Printer Client (Port 9100)                         │
 │  Serilog                                                │
 │                                                         │
 └─────────────────────────────────────────────────────────┘
                           │
                           ▼
                  Zebra Printer (ZPL)
```

---

# Workflow

## Bước 1 - Thiết kế Label

Người dùng thao tác trên React Label Designer.

Có thể:

- Thêm Text
- Barcode
- QR Code
- Logo
- Line
- Rectangle
- Circle

Frontend chỉ sinh ra JSON.

Ví dụ:

```json
{
  "width": 100,
  "height": 50,
  "dpi": 203,
  "elements": [
    {
      "id": "1",
      "type": "text",
      "x": 20,
      "y": 30,
      "font": "Arial",
      "fontSize": 18,
      "binding": "ProductName"
    },
    {
      "id": "2",
      "type": "barcode",
      "x": 20,
      "y": 80,
      "binding": "Barcode",
      "symbology": "Code128"
    }
  ]
}
```

Frontend hoàn toàn không biết ZPL.

---

## Bước 2 - Lưu Template

Frontend gửi JSON lên Print Adapter Service.

```http
POST /templates

{
   ...
}
```

Backend lưu JSON vào Database.

Không lưu ZPL.

---

## Bước 3 - In

Frontend gọi

```http
POST /print
```

```json
{
    "templateId":"shipping-label",
    "data":{
        "ProductName":"Coffee",
        "Barcode":"123456789"
    }
}
```

---

## Bước 4 - Render

Print Adapter Service

```
Template JSON

+

Runtime Data

↓

Label Document

↓

ZPL Renderer

↓

ZPL String
```

Ví dụ:

```zpl
^XA

^FO20,30
^A0N,30,30
^FDCoffee^FS

^FO20,80
^BCN,80,Y,N,N
^FD123456789^FS

^XZ
```

---

## Bước 5 - Print

Gửi trực tiếp ZPL tới Zebra Printer.

```
TCP Socket

Port 9100
```

Không cần Driver Windows.

---

# Frontend Tech Stack

## Core

- React
- TypeScript
- Vite

---

## UI

- TailwindCSS
- shadcn/ui

---

## Label Designer

### Khuyến nghị

- react-konva
- konva

Lý do:

- Drag & Drop
- Resize
- Rotate
- Zoom
- Layer
- Group
- Selection
- Performance cao

---

## State Management

- Zustand

---

## API

- TanStack Query
- Axios

---

## Validation

- Zod

---

## Barcode Preview

- JsBarcode

---

## QR Code Preview

- qrcode.react

---

## Font

- Noto Sans
- Roboto
- Arial

Frontend chỉ dùng để Preview.

Backend sẽ mapping sang Font Zebra.

---

# Backend Tech Stack (.NET)

## Core

- ASP.NET Core (.NET 9)

---

## JSON

- System.Text.Json

---

## Validation

- FluentValidation

---

## Logging

- Serilog

---

## Object Mapping

- Mapster

---

## TCP Printing

- System.Net.Sockets

Không cần thư viện bên ngoài.

---

## Background Queue

- BackgroundService
- Channel<PrintJob>

Giúp:

- Queue Print
- Retry
- Tránh nghẽn Printer

---

## Database

Có thể dùng:

- SQLite
- SQL Server
- PostgreSQL

Chỉ lưu:

- Label Template
- Print History (nếu cần)

---

# Print Adapter Service Architecture

```text
PrintAdapterService

├── API
│
├── Template
│     ├── Repository
│     └── JSON Model
│
├── Renderer
│     ├── ILabelRenderer
│     └── ZPLRenderer
│
├── Printer
│     ├── IPrinterClient
│     └── ZebraPrinterClient
│
├── Queue
│     └── Print Background Worker
│
├── Validation
│
└── Logging
```

---

# Strategy Pattern

```
ILabelRenderer
        │
        │
 ┌──────┴───────────────┐
 │                      │
ZPLRenderer      PDFRenderer
```

Hiện tại chỉ implement:

```
ZPLRenderer
```

Sau này có thể mở rộng:

- Honeywell (EPL)
- PDF
- PNG

mà không ảnh hưởng Frontend.

---

# Dữ liệu Template

Frontend chỉ lưu JSON.

Backend render thành:

```
Text

↓

^FO
^A
^FD

Barcode

↓

^BC

QRCode

↓

^BQ

Image

↓

^GFA
```

Không lưu ZPL cố định.

---

# Ưu điểm của kiến trúc

- Frontend không phụ thuộc ZPL.
- Backend chịu trách nhiệm render.
- Dễ bảo trì.
- Dễ mở rộng sang nhiều loại máy in.
- Có thể thay đổi Renderer mà không cần sửa Frontend.
- Có thể thêm Preview PDF hoặc PNG trong tương lai.
- Hỗ trợ Queue Printing.
- Kiến trúc phù hợp cho MES/WMS/ERP trong môi trường công nghiệp.

---

# Tech Stack Summary

## Frontend

| Thành phần | Công nghệ |
|------------|-----------|
| Framework | React |
| Language | TypeScript |
| Build Tool | Vite |
| UI | TailwindCSS |
| Component | shadcn/ui |
| Canvas | react-konva + konva |
| State | Zustand |
| API | TanStack Query + Axios |
| Validation | Zod |
| Barcode Preview | JsBarcode |
| QR Preview | qrcode.react |

---

## Backend

| Thành phần | Công nghệ |
|------------|-----------|
| Framework | ASP.NET Core (.NET 9) |
| JSON | System.Text.Json |
| Validation | FluentValidation |
| Logging | Serilog |
| Mapping | Mapster |
| TCP Printing | System.Net.Sockets |
| Queue | BackgroundService + Channel<T> |
| Database | SQLite / SQL Server / PostgreSQL |

---

# Kết luận

Kiến trúc này phù hợp với hệ thống sử dụng máy in Zebra trong môi trường MES/WMS/ERP.

Frontend chỉ chịu trách nhiệm thiết kế Label dưới dạng JSON, trong khi Print Adapter Service (.NET) đảm nhiệm toàn bộ quá trình:

- Quản lý Template
- Render JSON → ZPL
- Quản lý Queue
- Gửi ZPL trực tiếp đến Zebra Printer qua TCP/IP (Port 9100)

Việc không tách riêng Label Template Service giúp hệ thống đơn giản hơn, giảm chi phí vận hành, nhưng vẫn đảm bảo khả năng mở rộng khi cần hỗ trợ thêm nhiều loại máy in hoặc định dạng đầu ra khác trong tương lai.