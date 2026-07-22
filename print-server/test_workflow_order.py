#!/usr/bin/env python3
"""
Script mô phỏng workflow hoàn chỉnh:
Đặt đơn hàng mới -> Tạo dữ liệu hóa đơn -> Biên dịch byte ESC/POS (kèm mã kích mở két) -> In tới máy in GEZHI_POS_Printer trên Mac mini.
"""

import sys
import os
import time

# Add local path
sys.path.insert(0, os.path.dirname(__file__))

from printlib import build_receipt, build_receipt_raster, build_receipt_text
import subprocess

def simulate_order_workflow():
    print("=" * 60)
    print("🚀 BẮT ĐẦU WORKFLOW MÔ PHỎNG: ĐẶT ĐƠN HÀNG -> IN HÓA ĐƠN -> BẬT KÉT TIỀN")
    print("=" * 60)

    # 1. Giả lập đơn hàng được đặt từ POS / KDS / Mobile App
    sample_order = {
        "order_id": "MITSU-ORDER-" + str(int(time.time()))[-4:],
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S+07:00"),
        "table_id": "Bàn 05",
        "customer_name": "Anh Hoàng (Khách quen)",
        "metadata": {
            "short_code": "05",
            "delivery_type": "dine_in",
            "notes": "Cho ít đường, 1 ly mang về",
            "cashier": "Thu ngân Mitsu"
        },
        "items": [
            {
                "name": "Cf mitsu",
                "qty": 2,
                "price": 25000,
                "modifiers": {"size": "M", "ice": "Ít đá", "sugar": "50% đường"}
            },
            {
                "name": "Trà mitsu",
                "qty": 1,
                "price": 35000,
                "modifiers": {"size": "L", "toppings": "Thạch thêm"}
            }
        ],
        "subtotal": 85000,
        "discount": 0,
        "total": 85000,
        "payment": {
            "method": "cash",
            "amount_paid": 100000,
            "change": 15000
        }
    }

    print(f"📦 Đơn hàng đã được tạo: [{sample_order['order_id']}] - Tổng tiền: {sample_order['total']:,}đ")
    print("⏳ Đang xử lý biên dịch dữ liệu ESC/POS + Nhúng mã mở két tiền...")

    # 2. Biên dịch dữ liệu hóa đơn ESC/POS
    receipt_bytes = build_receipt(sample_order)
    print(f"✅ Đã tạo gói tin ESC/POS: {len(receipt_bytes)} bytes.")

    # 3. Gửi tới máy in bill GEZHI_POS_Printer (kết nối USB Mac mini)
    printer_name = "GEZHI_POS_Printer"
    print(f"🖨️ Đang gửi gói tin tới máy in '{printer_name}'...")

    cmd = ["lpr", "-P", printer_name, "-o", "CashDrawer1Setting=1CashDrawer1BeforePrinting"]
    proc = subprocess.run(cmd, input=receipt_bytes, capture_output=True)

    if proc.returncode == 0:
        print("🎉 [THÀNH CÔNG] Đã phát lệnh in hóa đơn & bật két tiền!")
        print("👉 Hóa đơn đơn hàng đã in ra và Két tiền đã nảy bật ra thành công!")
    else:
        print(f"❌ [LỖI]: {proc.stderr.decode('utf-8')}")

if __name__ == "__main__":
    simulate_order_workflow()
