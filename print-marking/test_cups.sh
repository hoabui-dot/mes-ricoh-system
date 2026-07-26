#!/bin/bash
# Script kiem tra trang thai CUPS tren cong 631 va gui lenh in test

echo "=== 1. Kiem tra ket noi den CUPS (Port 631) ==="
curl -sI http://127.0.0.1:631 | head -n 1

echo ""
echo "=== 2. Danh sach cac may in dang co tren he thong ==="
lpstat -p -d

echo ""
echo "=== 3. Chay file Node.js de in test Barcode 1D ==="
if [ -f "test_print.js" ]; then
    node test_print.js
else
    echo "Khong tim thay file test_print.js. Vui long tao file nay truoc."
fi  