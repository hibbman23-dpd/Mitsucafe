"""
test_smart_formatting.py — Unit test suite for smart font wrapping, scaling, and deduplication.
"""

import unittest
import os
import tempfile
import sqlite3
from printlib import (
    build_receipt,
    build_receipt_raster,
    build_receipt_text,
    build_label_tspl,
    build_label_raster,
    build_order_labels_tspl,
    _wrap_text_to_lines,
)
from print_poller import _printed_by_gateway_local


class TestSmartFormatting(unittest.TestCase):
    def setUp(self):
        self.long_order = {
            "order_id": "ORD-20260723-9999",
            "timestamp": "2026-07-23T10:15:00+07:00",
            "table_id": "Bàn 05",
            "customer_name": "Nguyễn Hoàng Thỏ Ngọc Vân Anh",
            "customer_id": "0987654321",
            "metadata": {
                "short_code": "Q99",
                "delivery_type": "dine_in",
                "notes": "Giao gấp trước 10h30 sáng, lấy ly nhựa nắp tim, thêm 2 ống hút bọc màng kiếng",
            },
            "items": [
                {
                    "name": "Trà Sữa Ô Long Nướng Kem Trứng Nướng Sương Sáo",
                    "qty": 2,
                    "price": 45000,
                    "modifiers": {
                        "size": "L",
                        "sugar": "50%",
                        "ice": "less",
                        "toppings": "Trân châu đen, Thạch dừa, Kem cheese",
                    },
                },
                {
                    "name": "Cà Phê Muối Kem Béo Lâm Hà Đặc Biệt Cốt Dừa",
                    "qty": 1,
                    "price": 35000,
                    "modifiers": {
                        "size": "M",
                        "sugar": "30%",
                        "ice": "full",
                    },
                },
            ],
            "total": 125000,
            "payment": {"method": "cash"},
        }

    def test_wrap_text_to_lines(self):
        text = "Trà Sữa Ô Long Nướng Kem Trứng Nướng Sương Sáo"
        lines = _wrap_text_to_lines(text, 15)
        self.assertTrue(len(lines) >= 3)
        for line in lines:
            self.assertTrue(len(line) <= 15)
        recombined = " ".join(lines)
        self.assertEqual(recombined, text)

    def test_receipt_raster_and_text_generation(self):
        raster_bytes = build_receipt_raster(self.long_order)
        self.assertTrue(len(raster_bytes) > 100)
        self.assertTrue(b"\x1dv0" in raster_bytes or b"\x1d" in raster_bytes)

        text_bytes = build_receipt_text(self.long_order)
        self.assertTrue(len(text_bytes) > 50)
        self.assertTrue(b"Mitsu" in text_bytes or b"Cafe" in text_bytes)

        default_bytes = build_receipt(self.long_order)
        self.assertTrue(len(default_bytes) > 100)

    def test_label_tspl_no_truncation(self):
        item = self.long_order["items"][0]
        tspl_bytes = build_label_tspl(self.long_order, item, 1, 2)
        tspl_str = tspl_bytes.decode("ascii", errors="ignore")

        self.assertIn("TRA SUA O LONG", tspl_str)
        self.assertIn("KEM TRUNG", tspl_str)
        self.assertIn("TRAN CHAU DEN", tspl_str)
        self.assertIn("GC:", tspl_str)

    def test_label_raster_generation(self):
        item = self.long_order["items"][0]
        raster_bytes = build_label_raster(self.long_order, item, 1, 2)
        self.assertTrue(len(raster_bytes) > 100)

    def test_printed_by_gateway_local(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
            db_path = tmp.name

        try:
            with sqlite3.connect(db_path) as conn:
                conn.execute(
                    "CREATE TABLE outbox (seq INTEGER PRIMARY KEY, op TEXT, order_id TEXT, idempotency_key TEXT, payload TEXT, short_code TEXT, printed_at TEXT, synced_at TEXT)"
                )
                conn.execute(
                    "INSERT INTO outbox (op, order_id, idempotency_key, payload) VALUES ('ingest_order', 'ORD-20260723-9999', 'key1', '{}')"
                )
                conn.commit()

            os.environ["GATEWAY_DB"] = db_path
            self.assertTrue(_printed_by_gateway_local("ORD-20260723-9999"))
            self.assertFalse(_printed_by_gateway_local("ORD-NONEXISTENT"))
        finally:
            if "GATEWAY_DB" in os.environ:
                del os.environ["GATEWAY_DB"]
            if os.path.exists(db_path):
                os.remove(db_path)


if __name__ == "__main__":
    unittest.main()
