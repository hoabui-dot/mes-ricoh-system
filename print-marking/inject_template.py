#!/usr/bin/env python3
"""
inject_template.py
------------------
Injects all industrial label templates into the printer-adapter SQLite database.
Idempotent: checks by template_code. Existing templates are version-snapshotted
then updated. New metadata columns are added safely.

Usage:
    python inject_template.py               # auto-detect: local or docker
    python inject_template.py --docker      # force run inside Docker container
    python inject_template.py --local       # force run against local file paths
"""

import sqlite3
import os
import sys
import json
import uuid
import subprocess
from datetime import datetime

# ── Database paths ─────────────────────────────────────────────────────────────
DB_PATHS = [
    "./station-agent/sqlite-databases/printer.db",
    "./station-agent/services/printer-adapter/src/ND.PrinterAdapter.Api/data/printer.db"
]

# ── Template definitions ───────────────────────────────────────────────────────
# Each entry is a dict with all required fields.
# is_default = True for exactly ONE template (the system default for print jobs).

BASE_TEMPLATES = [
    {
        "template_code": "LBL-KHO-50x30",
        "name": "Vị trí kho / kệ / ô chứa",
        "description": "Tem định vị dùng để nhận diện vị trí lưu trữ trong kho, kệ hoặc ô chứa. 50×30mm với QR và Code128.",
        "note": "Dán cố định tại kệ, ô kho.",
        "category": "Kho",
        "dpi": 203,
        "label_width": 50.0,
        "label_height": 30.0,
        "orientation": "LANDSCAPE",
        "revision": "A",
        "supported_barcode_types": json.dumps(["CODE128", "QR"]),
        "supported_printer_models": json.dumps(["GK420t", "ZD420", "ZT230"]),
        "compatible_station_types": json.dumps(["WAREHOUSE", "PRINT_STATION"]),
        "is_default": True,
        "template_json": {
            "width": 50, "height": 30, "dpi": 203,
            "elements": [
                {"type": "text", "x": 10, "y": 12, "fontSize": 8, "text": "VI TRI KHO"},
                {"type": "text", "x": 10, "y": 45, "fontSize": 18, "binding": "location_code", "defaultValue": "A-01-03"},
                {"type": "text", "x": 10, "y": 100, "fontSize": 7, "binding": "zone", "defaultValue": "Khu A - Ke 1"},
                {"type": "barcode", "x": 10, "y": 125, "height": 50, "symbology": "CODE128", "barWidth": 2, "binding": "location_code", "defaultValue": "A-01-03"},
                {"type": "qr", "x": 300, "y": 30, "magnification": 3, "binding": "location_code", "defaultValue": "A-01-03"}
            ]
        }
    },
    {
        "template_code": "LBL-SAT-100x60",
        "name": "Bó sắt / kiện sắt",
        "description": "Tem nhận diện bó hoặc kiện sắt phục vụ quản lý kho và truy xuất. 100×60mm, Code128.",
        "note": "Nên có mã vật tư, lot, khối lượng.",
        "category": "Thành phẩm",
        "dpi": 203,
        "label_width": 100.0,
        "label_height": 60.0,
        "orientation": "LANDSCAPE",
        "revision": "A",
        "supported_barcode_types": json.dumps(["CODE128"]),
        "supported_printer_models": json.dumps(["GK420t", "ZT230", "ZT410"]),
        "compatible_station_types": json.dumps(["WAREHOUSE", "PRINT_STATION"]),
        "is_default": False,
        "template_json": {
            "width": 100, "height": 60, "dpi": 203,
            "elements": [
                {"type": "rect", "x": 5, "y": 5, "width": 790, "height": 470, "strokeWidth": 3},
                {"type": "text", "x": 15, "y": 18, "fontSize": 14, "text": "BO SAT / KIEN SAT"},
                {"type": "line", "x": 5, "y": 60, "width": 790, "height": 2},
                {"type": "text", "x": 15, "y": 80, "fontSize": 9, "text": "Ma vat tu:"},
                {"type": "text", "x": 130, "y": 80, "fontSize": 11, "binding": "material_code", "defaultValue": "SAT-001"},
                {"type": "text", "x": 15, "y": 120, "fontSize": 9, "text": "Lot No:"},
                {"type": "text", "x": 130, "y": 120, "fontSize": 11, "binding": "lot_number", "defaultValue": "LOT-2026-07-A"},
                {"type": "text", "x": 15, "y": 160, "fontSize": 9, "text": "Khoi luong (kg):"},
                {"type": "text", "x": 220, "y": 160, "fontSize": 11, "binding": "weight", "defaultValue": "100.0"},
                {"type": "text", "x": 15, "y": 200, "fontSize": 9, "text": "Ngay sx:"},
                {"type": "text", "x": 130, "y": 200, "fontSize": 9, "binding": "production_date", "defaultValue": "2026-07-09"},
                {"type": "barcode", "x": 15, "y": 240, "height": 100, "symbology": "CODE128", "barWidth": 3, "binding": "serial_number", "defaultValue": "SAT-000001"},
                {"type": "text", "x": 15, "y": 350, "fontSize": 7, "binding": "serial_number", "defaultValue": "SAT-000001"}
            ]
        }
    },
    {
        "template_code": "LBL-TAM-SAT-100x80",
        "name": "Tấm sắt / cuộn sắt",
        "description": "Tem quản lý tấm hoặc cuộn sắt. 100×80mm với Code128 lớn.",
        "note": "Dùng tem PET hoặc thẻ treo vì bề mặt khó dán.",
        "category": "Nguyên vật liệu",
        "dpi": 203,
        "label_width": 100.0,
        "label_height": 80.0,
        "orientation": "PORTRAIT",
        "revision": "A",
        "supported_barcode_types": json.dumps(["CODE128"]),
        "supported_printer_models": json.dumps(["ZT230", "ZT410", "ZT610"]),
        "compatible_station_types": json.dumps(["WAREHOUSE", "MATERIAL_STATION"]),
        "is_default": False,
        "template_json": {
            "width": 100, "height": 80, "dpi": 203,
            "elements": [
                {"type": "text", "x": 15, "y": 15, "fontSize": 14, "text": "TAM SAT / CUON SAT"},
                {"type": "line", "x": 5, "y": 55, "width": 790, "height": 2},
                {"type": "text", "x": 15, "y": 70, "fontSize": 9, "text": "Vat lieu:"},
                {"type": "text", "x": 130, "y": 70, "fontSize": 11, "binding": "material", "defaultValue": "Thep CT3"},
                {"type": "text", "x": 15, "y": 110, "fontSize": 9, "text": "Lot No:"},
                {"type": "text", "x": 130, "y": 110, "fontSize": 11, "binding": "lot_number", "defaultValue": "LOT-2026-07-A"},
                {"type": "text", "x": 15, "y": 150, "fontSize": 9, "text": "Cuon/Tam ID:"},
                {"type": "text", "x": 180, "y": 150, "fontSize": 11, "binding": "serial_number", "defaultValue": "CUON-001"},
                {"type": "text", "x": 15, "y": 190, "fontSize": 9, "text": "Trong luong (kg):"},
                {"type": "text", "x": 230, "y": 190, "fontSize": 11, "binding": "weight", "defaultValue": "500.0"},
                {"type": "text", "x": 15, "y": 230, "fontSize": 9, "text": "Ngay nhap:"},
                {"type": "text", "x": 130, "y": 230, "fontSize": 9, "binding": "manufacture_date", "defaultValue": "2026-07-09"},
                {"type": "barcode", "x": 15, "y": 280, "height": 130, "symbology": "CODE128", "barWidth": 3, "binding": "serial_number", "defaultValue": "CUON-001"},
                {"type": "text", "x": 15, "y": 420, "fontSize": 7, "binding": "lot_number", "defaultValue": "LOT-2026-07-A"}
            ]
        }
    },
    {
        "template_code": "LBL-PALLET-100x150",
        "name": "Pallet hàng",
        "description": "Tem pallet thành phẩm hoặc xuất kho. 100×150mm với QR và Code128 kích thước lớn.",
        "note": "Dùng cho pallet thành phẩm hoặc pallet xuất kho.\nMã phải có khả năng quét ở khoảng cách xa bằng PDA hoặc thiết bị cầm tay.\nCó thể sử dụng QR Code hoặc Code 128 kích thước lớn.",
        "category": "Pallet",
        "dpi": 203,
        "label_width": 100.0,
        "label_height": 150.0,
        "orientation": "PORTRAIT",
        "revision": "A",
        "supported_barcode_types": json.dumps(["CODE128", "QR"]),
        "supported_printer_models": json.dumps(["ZT410", "ZT610", "ZT620"]),
        "compatible_station_types": json.dumps(["WAREHOUSE", "SHIPPING_STATION"]),
        "is_default": False,
        "template_json": {
            "width": 100, "height": 150, "dpi": 203,
            "elements": [
                {"type": "rect", "x": 5, "y": 5, "width": 790, "height": 1190, "strokeWidth": 4},
                {"type": "text", "x": 20, "y": 20, "fontSize": 18, "text": "PALLET HANG"},
                {"type": "line", "x": 5, "y": 75, "width": 790, "height": 3},
                {"type": "qr", "x": 30, "y": 90, "magnification": 8, "payloadTemplate": '{"pallet":"{serial_number}","po":"{production_order}"}'},
                {"type": "text", "x": 430, "y": 90, "fontSize": 8, "text": "Don hang:"},
                {"type": "text", "x": 430, "y": 120, "fontSize": 11, "binding": "production_order", "defaultValue": "PO-2026-001"},
                {"type": "text", "x": 430, "y": 160, "fontSize": 8, "text": "San pham:"},
                {"type": "text", "x": 430, "y": 190, "fontSize": 10, "binding": "product_code", "defaultValue": "SP-001"},
                {"type": "text", "x": 430, "y": 230, "fontSize": 8, "text": "Pallet ID:"},
                {"type": "text", "x": 430, "y": 260, "fontSize": 10, "binding": "serial_number", "defaultValue": "PLT-001"},
                {"type": "text", "x": 430, "y": 300, "fontSize": 8, "text": "So luong:"},
                {"type": "text", "x": 430, "y": 330, "fontSize": 14, "binding": "quantity", "defaultValue": "100"},
                {"type": "text", "x": 430, "y": 380, "fontSize": 8, "text": "Diem den:"},
                {"type": "text", "x": 430, "y": 410, "fontSize": 9, "binding": "destination", "defaultValue": "KHO A"},
                {"type": "line", "x": 5, "y": 490, "width": 790, "height": 3},
                {"type": "text", "x": 20, "y": 510, "fontSize": 8, "text": "Ngay:"},
                {"type": "text", "x": 100, "y": 510, "fontSize": 9, "binding": "manufacture_date", "defaultValue": "2026-07-09"},
                {"type": "barcode", "x": 20, "y": 600, "height": 150, "symbology": "CODE128", "barWidth": 4, "binding": "serial_number", "defaultValue": "PLT-001"},
                {"type": "text", "x": 20, "y": 760, "fontSize": 7, "binding": "serial_number", "defaultValue": "PLT-001"}
            ]
        }
    },
    {
        "template_code": "LBL-SHEET-LARGE-80x50",
        "name": "Tấm cao su lớn",
        "description": "Tem quản lý tấm cao su lớn. 80×50mm với QR.",
        "note": "Quản lý mã tấm cha Parent Sheet ID.",
        "category": "Tấm cao su",
        "dpi": 203,
        "label_width": 80.0,
        "label_height": 50.0,
        "orientation": "LANDSCAPE",
        "revision": "A",
        "supported_barcode_types": json.dumps(["QR"]),
        "supported_printer_models": json.dumps(["GK420t", "ZT230"]),
        "compatible_station_types": json.dumps(["MATERIAL_STATION", "PRINT_STATION"]),
        "is_default": False,
        "template_json": {
            "width": 80, "height": 50, "dpi": 203,
            "elements": [
                {"type": "text", "x": 10, "y": 12, "fontSize": 11, "text": "TAM CAO SU LON"},
                {"type": "line", "x": 5, "y": 45, "width": 530, "height": 2},
                {"type": "text", "x": 10, "y": 60, "fontSize": 9, "text": "Ma tam cha:"},
                {"type": "text", "x": 140, "y": 60, "fontSize": 11, "binding": "serial_number", "defaultValue": "SHEET-P-001"},
                {"type": "text", "x": 10, "y": 100, "fontSize": 9, "text": "Vat lieu:"},
                {"type": "text", "x": 120, "y": 100, "fontSize": 10, "binding": "material", "defaultValue": "NBR-70"},
                {"type": "text", "x": 10, "y": 140, "fontSize": 9, "text": "Lot:"},
                {"type": "text", "x": 80, "y": 140, "fontSize": 9, "binding": "lot_number", "defaultValue": "LOT-2026-07-A"},
                {"type": "text", "x": 10, "y": 180, "fontSize": 9, "text": "Kich thuoc:"},
                {"type": "text", "x": 130, "y": 180, "fontSize": 9, "binding": "sheet_size", "defaultValue": "1200x600mm"},
                {"type": "text", "x": 10, "y": 220, "fontSize": 8, "binding": "manufacture_date", "defaultValue": "2026-07-09"},
                {"type": "qr", "x": 570, "y": 40, "magnification": 6, "payloadTemplate": "{\"sheet\":\"{serial_number}\",\"lot\":\"{lot_number}\"}"}
            ]
        }
    },
    {
        "template_code": "LBL-SHEET-SMALL-50x30",
        "name": "Tấm cao su nhỏ sau khi cắt",
        "description": "Theo dõi tấm cao su con được cắt từ tấm lớn. 50×30mm QR nhỏ gọn.",
        "note": "Mỗi tấm con có mã riêng.",
        "category": "Tấm cao su",
        "dpi": 203,
        "label_width": 50.0,
        "label_height": 30.0,
        "orientation": "LANDSCAPE",
        "revision": "A",
        "supported_barcode_types": json.dumps(["QR"]),
        "supported_printer_models": json.dumps(["GK420t", "ZD420"]),
        "compatible_station_types": json.dumps(["MATERIAL_STATION", "PRINT_STATION"]),
        "is_default": False,
        "template_json": {
            "width": 50, "height": 30, "dpi": 203,
            "elements": [
                {"type": "text", "x": 8, "y": 10, "fontSize": 9, "text": "TAM CAO SU NHO"},
                {"type": "text", "x": 8, "y": 40, "fontSize": 8, "binding": "serial_number", "defaultValue": "SHEET-C-001"},
                {"type": "text", "x": 8, "y": 70, "fontSize": 7, "binding": "lot_number", "defaultValue": "LOT-2026-07-A"},
                {"type": "text", "x": 8, "y": 100, "fontSize": 7, "text": "Tam cha:"},
                {"type": "text", "x": 100, "y": 100, "fontSize": 7, "binding": "parent_id", "defaultValue": "SHEET-P-001"},
                {"type": "text", "x": 8, "y": 130, "fontSize": 7, "binding": "manufacture_date", "defaultValue": "2026-07-09"},
                {"type": "qr", "x": 270, "y": 30, "magnification": 3, "binding": "serial_number", "defaultValue": "SHEET-C-001"}
            ]
        }
    },
    {
        "template_code": "LBL-WIP-60x40",
        "name": "Bán thành phẩm/WIP trong MES",
        "description": "Theo dõi bán thành phẩm trong từng công đoạn sản xuất MES. 60×40mm với QR.",
        "note": "Dùng để theo dõi bán thành phẩm trong từng công đoạn sản xuất.\nMang theo Work Order, Operation và trạng thái sản xuất.\nLà tem chính phục vụ MES trong quá trình sản xuất.",
        "category": "WIP",
        "dpi": 203,
        "label_width": 60.0,
        "label_height": 40.0,
        "orientation": "LANDSCAPE",
        "revision": "A",
        "supported_barcode_types": json.dumps(["QR"]),
        "supported_printer_models": json.dumps(["GK420t", "ZD420", "ZT230"]),
        "compatible_station_types": json.dumps(["PRINT_STATION", "MARK_STATION", "WIP_STATION"]),
        "is_default": False,
        "template_json": {
            "width": 60, "height": 40, "dpi": 203,
            "elements": [
                {"type": "text", "x": 8, "y": 10, "fontSize": 11, "text": "BAN THANH PHAM"},
                {"type": "line", "x": 5, "y": 40, "width": 470, "height": 2},
                {"type": "text", "x": 8, "y": 55, "fontSize": 9, "text": "Serial:"},
                {"type": "text", "x": 95, "y": 55, "fontSize": 10, "binding": "serial_number", "defaultValue": "SN-000001"},
                {"type": "text", "x": 8, "y": 90, "fontSize": 9, "text": "San pham:"},
                {"type": "text", "x": 110, "y": 90, "fontSize": 9, "binding": "product_code", "defaultValue": "SP-001"},
                {"type": "text", "x": 8, "y": 125, "fontSize": 9, "text": "Cong doan:"},
                {"type": "text", "x": 120, "y": 125, "fontSize": 9, "binding": "operation", "defaultValue": "CAT"},
                {"type": "text", "x": 8, "y": 160, "fontSize": 8, "text": "Tram:"},
                {"type": "text", "x": 80, "y": 160, "fontSize": 8, "binding": "station", "defaultValue": "STATION-01"},
                {"type": "text", "x": 8, "y": 190, "fontSize": 7, "binding": "production_date", "defaultValue": "2026-07-09"},
                {"type": "qr", "x": 500, "y": 25, "magnification": 5, "payloadTemplate": "{\"sn\":\"{serial_number}\",\"op\":\"{operation}\"}"}
            ]
        }
    },
    {
        "template_code": "LBL-ISSUE-100x60",
        "name": "Phiếu cấp liệu / phiếu xuất kho",
        "description": "Sử dụng trong quá trình cấp vật tư từ WMS sang MES. 100×60mm với QR và Code128.",
        "note": "Sử dụng trong quá trình cấp vật tư từ WMS sang MES.\nCó thể chứa cả Barcode và QR Code.\nHiển thị vật tư, số lượng, Batch và kho xuất.",
        "category": "WMS",
        "dpi": 203,
        "label_width": 100.0,
        "label_height": 60.0,
        "orientation": "LANDSCAPE",
        "revision": "A",
        "supported_barcode_types": json.dumps(["CODE128", "QR"]),
        "supported_printer_models": json.dumps(["GK420t", "ZT230", "ZT410"]),
        "compatible_station_types": json.dumps(["WAREHOUSE", "MATERIAL_STATION"]),
        "is_default": False,
        "template_json": {
            "width": 100, "height": 60, "dpi": 203,
            "elements": [
                {"type": "text", "x": 15, "y": 15, "fontSize": 14, "text": "PHIEU CAP LIEU / XUAT KHO"},
                {"type": "line", "x": 5, "y": 55, "width": 790, "height": 2},
                {"type": "text", "x": 15, "y": 70, "fontSize": 9, "text": "Vat lieu:"},
                {"type": "text", "x": 130, "y": 70, "fontSize": 11, "binding": "material", "defaultValue": "Cao su NBR-70"},
                {"type": "text", "x": 15, "y": 110, "fontSize": 9, "text": "So phieu:"},
                {"type": "text", "x": 130, "y": 110, "fontSize": 10, "binding": "serial_number", "defaultValue": "ISSUE-001"},
                {"type": "text", "x": 15, "y": 150, "fontSize": 9, "text": "Tu kho:"},
                {"type": "text", "x": 100, "y": 150, "fontSize": 9, "binding": "source_location", "defaultValue": "KHO-A"},
                {"type": "text", "x": 15, "y": 185, "fontSize": 9, "text": "Den:"},
                {"type": "text", "x": 60, "y": 185, "fontSize": 9, "binding": "destination", "defaultValue": "SX-01"},
                {"type": "text", "x": 15, "y": 220, "fontSize": 9, "text": "So luong:"},
                {"type": "text", "x": 120, "y": 220, "fontSize": 11, "binding": "quantity", "defaultValue": "50"},
                {"type": "text", "x": 250, "y": 220, "fontSize": 8, "binding": "manufacture_date", "defaultValue": "2026-07-09"},
                {"type": "barcode", "x": 15, "y": 260, "height": 80, "symbology": "CODE128", "barWidth": 2, "binding": "serial_number", "defaultValue": "ISSUE-001"},
                {"type": "qr", "x": 620, "y": 60, "magnification": 5, "payloadTemplate": '{"issue":"{serial_number}","qty":"{quantity}"}'}
            ]
        }
    }
]

def scale_json_to_35x22(original_json, orig_w, orig_h):
    try:
        import copy
        data = copy.deepcopy(original_json)
        data["width"] = 35
        data["height"] = 22
        
        scale_x = 35.0 / orig_w
        scale_y = 22.0 / orig_h
        
        if "elements" in data:
            for el in data["elements"]:
                el_type = el.get("type", "")
                
                if "x" in el:
                    el["x"] = int(el["x"] * scale_x)
                if "y" in el:
                    el["y"] = int(el["y"] * scale_y)
                    
                if el_type == "text":
                    if "fontSize" in el:
                        el["fontSize"] = max(5, int(el["fontSize"] * min(scale_x, scale_y)))
                elif el_type == "barcode":
                    if "height" in el:
                        el["height"] = max(10, int(el["height"] * scale_y))
                    if "barWidth" in el:
                        el["barWidth"] = max(1, int(el["barWidth"] * scale_x))
                elif el_type == "qr":
                    if "magnification" in el:
                        el["magnification"] = max(1, int(el["magnification"] * min(scale_x, scale_y)))
                elif el_type in ("line", "rect"):
                    if "width" in el:
                        el["width"] = max(1, int(el["width"] * scale_x))
                    if "height" in el:
                        el["height"] = max(1, int(el["height"] * scale_y))
                    if "strokeWidth" in el:
                        el["strokeWidth"] = max(1, int(el["strokeWidth"] * min(scale_x, scale_y)))
        return data
    except Exception:
        return original_json


def duplicate_scaled_json(scaled_single, cols, gap_mm):
    try:
        import copy
        dpi = scaled_single.get("dpi", 203)
        single_w = 35.0
        single_h = 22.0
        
        target_w = single_w * cols + gap_mm * (cols - 1)
        target_h = single_h
        
        new_elements = []
        for c in range(cols):
            offset_dots = int(round(c * (single_w + gap_mm) * (dpi / 25.4)))
            for el in scaled_single.get("elements", []):
                el_copy = copy.deepcopy(el)
                if "x" in el_copy:
                    el_copy["x"] += offset_dots
                new_elements.append(el_copy)
                
        data = copy.deepcopy(scaled_single)
        data["width"] = target_w
        data["height"] = target_h
        data["elements"] = new_elements
        return data
    except Exception:
        return scaled_single


TEMPLATES = []
for bt in BASE_TEMPLATES:
    # 1-Up (original size)
    TEMPLATES.append({
        "template_code": bt["template_code"],
        "name": bt["name"],
        "description": bt["description"],
        "note": bt["note"],
        "category": bt["category"],
        "dpi": bt["dpi"],
        "label_width": float(bt["label_width"]),
        "label_height": float(bt["label_height"]),
        "orientation": bt["orientation"],
        "revision": bt["revision"],
        "supported_barcode_types": bt["supported_barcode_types"],
        "supported_printer_models": bt["supported_printer_models"],
        "compatible_station_types": bt["compatible_station_types"],
        "is_default": bt["is_default"],
        "layout_type": "1UP",
        "sheet_columns": 1,
        "sheet_rows": 1,
        "gap_mm": 0.0,
        "template_json": bt["template_json"]
    })

    # 2-Up (35x22, 2 columns, gap 2.0 => width 72.0)
    scaled_single = scale_json_to_35x22(bt["template_json"], float(bt["label_width"]), float(bt["label_height"]))
    TEMPLATES.append({
        "template_code": bt["template_code"] + "-2UP",
        "name": bt["name"] + " (2-Up)",
        "description": bt["description"],
        "note": bt["note"],
        "category": bt["category"],
        "dpi": bt["dpi"],
        "label_width": 72.0,
        "label_height": 22.0,
        "orientation": bt["orientation"],
        "revision": bt["revision"],
        "supported_barcode_types": bt["supported_barcode_types"],
        "supported_printer_models": bt["supported_printer_models"],
        "compatible_station_types": bt["compatible_station_types"],
        "is_default": False,
        "layout_type": "2UP",
        "sheet_columns": 2,
        "sheet_rows": 1,
        "gap_mm": 2.0,
        "template_json": duplicate_scaled_json(scaled_single, 2, 2.0)
    })

    # 3-Up (35x22, 3 columns, gap 2.0 => width 109.0)
    TEMPLATES.append({
        "template_code": bt["template_code"] + "-3UP",
        "name": bt["name"] + " (3-Up)",
        "description": bt["description"],
        "note": bt["note"],
        "category": bt["category"],
        "dpi": bt["dpi"],
        "label_width": 109.0,
        "label_height": 22.0,
        "orientation": bt["orientation"],
        "revision": bt["revision"],
        "supported_barcode_types": bt["supported_barcode_types"],
        "supported_printer_models": bt["supported_printer_models"],
        "compatible_station_types": bt["compatible_station_types"],
        "is_default": False,
        "layout_type": "3UP",
        "sheet_columns": 3,
        "sheet_rows": 1,
        "gap_mm": 2.0,
        "template_json": duplicate_scaled_json(scaled_single, 3, 2.0)
    })


# ── Database migration + injection ─────────────────────────────────────────────

def migrate_schema(cursor):
    """Ensure label_templates table exists and has all required columns."""

    # Create table if not exists (base schema)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS label_templates (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        dpi INTEGER NOT NULL,
        label_width REAL NOT NULL,
        label_height REAL NOT NULL,
        template_json TEXT NOT NULL,
        version INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'published',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        updated_by TEXT,
        updated_at TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    # Create version history table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS label_template_versions (
        id TEXT NOT NULL PRIMARY KEY,
        template_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        template_json TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # Create printer template assignments table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS printer_template_assignments (
        id TEXT PRIMARY KEY,
        printer_code TEXT NOT NULL UNIQUE,
        template_id TEXT NOT NULL,
        template_name TEXT,
        assigned_by TEXT,
        assigned_at TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    # Add ALL potentially missing columns (idempotent via try/except)
    all_columns = [
        # Base columns missing from early schema versions
        ("status",      "TEXT NOT NULL DEFAULT 'published'"),
        ("is_default",  "INTEGER NOT NULL DEFAULT 0"),
        ("created_by",  "TEXT"),
        ("updated_by",  "TEXT"),
        # Phase 4 metadata columns
        ("template_code",           "TEXT"),
        ("category",                "TEXT"),
        ("orientation",             "TEXT NOT NULL DEFAULT 'PORTRAIT'"),
        ("revision",                "TEXT NOT NULL DEFAULT 'A'"),
        ("supported_barcode_types", "TEXT"),
        ("supported_printer_models","TEXT"),
        ("compatible_station_types","TEXT"),
        ("note",                    "TEXT"),
        # N-Up layout columns
        ("layout_type",             "TEXT NOT NULL DEFAULT '1UP'"),
        ("sheet_columns",           "INTEGER NOT NULL DEFAULT 1"),
        ("sheet_rows",              "INTEGER NOT NULL DEFAULT 1"),
        ("gap_mm",                  "REAL NOT NULL DEFAULT 0.0")
    ]
    for col, col_type in all_columns:
        try:
            cursor.execute(f"ALTER TABLE label_templates ADD COLUMN {col} {col_type};")
            print(f"  ✚ Added column '{col}'")
        except Exception:
            pass  # Column already exists

    # Create unique index on template_code (nullable-safe)
    try:
        cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_label_templates_template_code
            ON label_templates (template_code)
            WHERE template_code IS NOT NULL;
        """)
    except Exception:
        pass


def inject_templates(cursor, templates):
    """Insert or update each template. Keyed on template_code."""
    now = datetime.utcnow().isoformat() + "Z"
    inserted = 0
    updated = 0

    for t in templates:
        json_str = json.dumps(t["template_json"])
        code = t["template_code"]
        is_default = 1 if t.get("is_default") else 0

        # Check existing by template_code
        cursor.execute("SELECT id, version, template_json FROM label_templates WHERE template_code = ?;", (code,))
        row = cursor.fetchone()

        if row:
            # Update existing — snapshot old version first
            existing_id, current_version, old_json = row
            new_version = current_version + 1

            # Snapshot
            cursor.execute("""
            INSERT INTO label_template_versions (id, template_id, version, template_json, created_by, created_at)
            VALUES (?, ?, ?, ?, 'system', ?);
            """, (str(uuid.uuid4()), existing_id, current_version, old_json, now))

            # Clear is_default on all others if this one is being set as default
            if is_default:
                cursor.execute("UPDATE label_templates SET is_default = 0;")

            cursor.execute("""
            UPDATE label_templates SET
                name = ?, description = ?, note = ?, category = ?, orientation = ?, revision = ?,
                supported_barcode_types = ?, supported_printer_models = ?, compatible_station_types = ?,
                dpi = ?, label_width = ?, label_height = ?,
                template_json = ?, version = ?, is_default = ?,
                status = 'published', is_active = 1,
                layout_type = ?, sheet_columns = ?, sheet_rows = ?, gap_mm = ?,
                updated_by = 'system', updated_at = ?
            WHERE template_code = ?;
            """, (
                t["name"], t["description"], t.get("note"), t["category"], t["orientation"], t["revision"],
                t["supported_barcode_types"], t["supported_printer_models"], t["compatible_station_types"],
                t["dpi"], t["label_width"], t["label_height"],
                json_str, new_version, is_default,
                t["layout_type"], t["sheet_columns"], t["sheet_rows"], t["gap_mm"],
                now, code
            ))
            print(f"  ↻ Updated  [{code}] '{t['name']}' → v{new_version}")
            updated += 1

        else:
            # Insert new
            new_id = str(uuid.uuid4())

            if is_default:
                cursor.execute("UPDATE label_templates SET is_default = 0;")

            cursor.execute("""
            INSERT INTO label_templates (
                id, name, description, note, template_code, category,
                dpi, label_width, label_height, orientation, revision,
                supported_barcode_types, supported_printer_models, compatible_station_types,
                template_json, version, is_active, status, is_default,
                layout_type, sheet_columns, sheet_rows, gap_mm,
                created_by, updated_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'published', ?, ?, ?, ?, ?, 'system', 'system', ?, ?);
            """, (
                new_id, t["name"], t["description"], t.get("note"), code, t["category"],
                t["dpi"], t["label_width"], t["label_height"], t["orientation"], t["revision"],
                t["supported_barcode_types"], t["supported_printer_models"], t["compatible_station_types"],
                json_str, 1, is_default,
                t["layout_type"], t["sheet_columns"], t["sheet_rows"], t["gap_mm"],
                now, now
            ))
            print(f"  ✚ Inserted [{code}] '{t['name']}' (is_default={bool(is_default)})")
            inserted += 1

    return inserted, updated


def process_database_local(db_path):
    """Run injection directly against a local SQLite file."""
    print(f"\n{chr(8212)*60}")
    print(f"Database: {db_path}")
    if not os.path.exists(db_path):
        print(f"  warning  File not found -- skipping.")
        return False
    if not os.access(db_path, os.W_OK):
        print(f"  error  No write permission (owned by Docker container user).")
        return False
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        print("  Migrating schema...")
        migrate_schema(cursor)
        print("  Injecting templates...")
        inserted, updated = inject_templates(cursor, TEMPLATES)
        conn.commit()
        conn.close()
        conn2 = sqlite3.connect(db_path)
        row = conn2.execute(
            "SELECT COUNT(*), SUM(is_default) FROM label_templates WHERE status='published' AND is_active=1;"
        ).fetchone()
        conn2.close()
        total, defaults = row[0], (row[1] or 0)
        print(f"\n  ok Done -- {inserted} inserted, {updated} updated")
        print(f"  ok Total published templates in DB: {total}  (default: {defaults})")
        return True
    except sqlite3.OperationalError as e:
        print(f"  error  SQLite error: {e}")
        return False


def find_printer_adapter_container():
    """Return the running printer-adapter container name, or None."""
    try:
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}\t{{.Image}}"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().splitlines():
            parts = line.split("\t")
            name  = parts[0].lower()
            image = parts[1].lower() if len(parts) > 1 else ""
            if "printer" in name and "adapter" in name:
                return parts[0]
            if "printer" in image and "adapter" in image:
                return parts[0]
    except Exception as e:
        print(f"  warning  docker ps error: {e}")
    return None


def find_db_in_container(container):
    """Find the printer.db path inside the container."""
    result = subprocess.run(
        ["docker", "exec", container, "find", "/", "-name", "printer.db", "-not", "-path", "*/proc/*"],
        capture_output=True, text=True, timeout=15
    )
    lines = [l.strip() for l in result.stdout.strip().splitlines() if l.strip()]
    return lines[0] if lines else "/data/printer.db"


def process_database_docker(container):
    """Copy DB out of container, inject locally, copy back in."""
    container_db = find_db_in_container(container)
    tmp_db = f"/tmp/printer_inject_{os.getpid()}.db"

    print(f"\n{chr(8212)*60}")
    print(f"Container:    {container}")
    print(f"Container DB: {container_db}")
    print(f"Tmp copy:     {tmp_db}")

    # 1. Copy DB out
    cp_out = subprocess.run(
        ["docker", "cp", f"{container}:{container_db}", tmp_db],
        capture_output=True, text=True
    )
    if cp_out.returncode != 0:
        print(f"  error  docker cp (out) failed: {cp_out.stderr.strip()}")
        return False
    print(f"  Copied DB out of container ({os.path.getsize(tmp_db):,} bytes)")

    # 2. Run injection locally against the temp copy
    ok = process_database_local(tmp_db)
    if not ok:
        if os.path.exists(tmp_db):
            os.remove(tmp_db)
        return False

    # 3. Copy modified DB back into container
    cp_in = subprocess.run(
        ["docker", "cp", tmp_db, f"{container}:{container_db}"],
        capture_output=True, text=True
    )
    os.remove(tmp_db)
    if cp_in.returncode != 0:
        print(f"  error  docker cp (in) failed: {cp_in.stderr.strip()}")
        return False

    print(f"  ok  DB copied back into container.")

    # 4. Signal the container to reload (graceful restart via SIGTERM → Docker restarts it)
    # Only if the service is configured with restart: always
    print(f"  Restarting container so EF Core picks up schema changes...")
    restart = subprocess.run(
        ["docker", "restart", container],
        capture_output=True, text=True, timeout=30
    )
    if restart.returncode == 0:
        print(f"  ok  Container restarted.")
    else:
        print(f"  warning  Restart failed (manual restart may be needed): {restart.stderr.strip()}")

    return True


# -- Entry point ----------------------------------------------------------------

if __name__ == "__main__":
    args = sys.argv[1:]
    force_docker = "--docker"  in args
    force_local  = "--local"   in args
    dry_run      = "--dry-run" in args

    # --single-db used internally when exec'd inside Docker
    single_db = None
    if "--single-db" in args:
        idx = args.index("--single-db")
        single_db = args[idx + 1] if idx + 1 < len(args) else None

    print(f"Label Template Injector -- {len(TEMPLATES)} templates")

    if dry_run:
        print("\n[DRY RUN] Templates that would be injected:")
        for t in TEMPLATES:
            flag = "  DEFAULT" if t.get("is_default") else ""
            print(f"  [{t['template_code']}] {t['name']}  "
                  f"{t['label_width']}x{t['label_height']}mm  {t['category']}{flag}")
        sys.exit(0)

    if single_db:
        ok = process_database_local(single_db)
        sys.exit(0 if ok else 1)

    if force_docker:
        container = find_printer_adapter_container()
        if not container:
            print("\n  error  No printer-adapter container found.")
            print("     Is it running?  Try: docker ps | grep printer")
            sys.exit(1)
        ok = process_database_docker(container)
        sys.exit(0 if ok else 1)

    # Auto-detect: try local first, fall back to Docker
    any_success = False
    for db_path in DB_PATHS:
        ok = process_database_local(db_path)
        if ok:
            any_success = True
        elif not any_success:
            print(f"\n  -> Local write failed. Trying Docker exec...")
            container = find_printer_adapter_container()
            if container:
                ok2 = process_database_docker(container)
                if ok2:
                    any_success = True
                    break
            else:
                print(f"  warning  No printer-adapter container running.")
                print(f"     Start the stack first, then re-run.")

    print(f"\n{chr(8212)*60}")
    if any_success:
        print("ok  Injection complete.")
    else:
        print("error  No databases were updated.\n")
        print("  Hints:")
        print("   Services running in Docker?  ->  python inject_template.py --docker")
        print("   Preview only?               ->  python inject_template.py --dry-run")
        sys.exit(1)
