#!/usr/bin/env python3
"""
Test Workflow đơn hàng mang về (Take-away) Quán Mitsu
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))

from print_poller import build_receipt
import subprocess

def test_takeaway():
    order = {
        "order_id": "MITSU-TAKEAWAY-" + str(int(time.time()))[-4:],
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S+07:00"),
        "table_id": "MANG VỀ",
        "customer_name": "Anh Minh (0987654321)",
        "metadata": {
            "short_code": "128",
            "delivery_type": "take_away",
            "notes": "Giao túi giấy, nhiều đá",
            "cashier": "Thu ngân Mitsu"
        },
        "items": [
            {
                "name": "Cà Phê Muối Mitsu",
                "qty": 2,
                "price": 39000,
                "modifiers": {"ice": "Nhiều đá"}
            },
            {
                "name": "Trà Vải Lài Kem Cheese",
                "qty": 1,
                "price": 49000,
                "modifiers": {"toppings": "Trân châu trắng"}
            }
        ],
        "subtotal": 127000,
        "discount": 0,
        "total": 127000,
        "payment": {
            "method": "cash",
            "amount_paid": 150000,
            "change": 23000
        }
    }
    
    print(f"📦 [MANG VỀ] Đơn hàng #{order['order_id']} - Tổng: {order['total']:,}đ")
    receipt_bytes = build_receipt(order)
    
    printer_name = "GEZHI_POS_Printer"
    cmd = ["lpr", "-P", printer_name, "-o", "CashDrawer1Setting=1CashDrawer1BeforePrinting"]
    proc = subprocess.run(cmd, input=receipt_bytes, capture_output=True)
    
    if proc.returncode == 0:
        print("🎉 [THÀNH CÔNG] Đã in bill mang về và bật két tiền thành công!")
    else:
        print("❌ Lỗi:", proc.stderr.decode('utf-8'))

if __name__ == "__main__":
    test_takeaway()
