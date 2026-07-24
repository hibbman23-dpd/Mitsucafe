import unittest
from printlib import build_receipt, build_label_tspl, build_label_raster

ORDER = {
    "order_id": "ORD-20260722-0001",
    "timestamp": "2026-07-22T08:10:00+07:00",
    "table_id": "03",
    "customer_name": "",
    "customer_id": "",
    "total": 66000,
    "payment": {"method": "cash"},
    "metadata": {"short_code": "Q07", "delivery_type": "dine_in", "notes": "it ngot"},
    "items": [{"name": "Bạc xỉu", "qty": 1, "price": 40000,
               "modifiers": {"sugar": "30%", "ice": "less"}}],
}
ITEM = ORDER["items"][0]

class TestPrintlib(unittest.TestCase):
    def test_receipt_returns_nonempty_bytes(self):
        out = build_receipt(ORDER)
        self.assertIsInstance(out, bytes)
        self.assertGreater(len(out), 0)

    def test_label_tspl_contains_shortcode_and_cut(self):
        out = build_label_tspl(ORDER, ITEM, 1, 2)
        self.assertIn(b"Q07", out)          # short_code có trên tem
        self.assertIn(b"PRINT 1", out)      # TSPL print command

    def test_label_raster_returns_bytes(self):
        out = build_label_raster(ORDER, ITEM, 1, 2)
        self.assertIsInstance(out, bytes)
        self.assertGreater(len(out), 0)

    def test_receipt_raster_wake_padding_precedes_init(self):
        # Cold-start garble fix: máy in nhiệt ngủ giữa các đơn nuốt mất byte đầu.
        # Phải có padding NUL (no-op trong ESC/POS) dẫn đầu để hấp thụ byte mất,
        # ESC @ init thật nằm NGAY SAU padding.
        from printlib import build_receipt_raster
        out = build_receipt_raster(ORDER, is_cash=False)
        self.assertTrue(out.startswith(b"\x00"), "phải dẫn đầu bằng NUL wake-padding")
        nul_len = len(out) - len(out.lstrip(b"\x00"))
        self.assertGreaterEqual(nul_len, 16, "cần đủ NUL để hấp thụ cold-start")
        self.assertEqual(out[nul_len:nul_len + 2], b"\x1b@", "ESC @ ngay sau padding")

    def test_grouped_receipt_raster_returns_bytes(self):
        from printlib import build_receipt_raster
        grouped_order = {
            "order_id": "GRP-TABLE03-12345",
            "timestamp": "2026-07-24T09:00:00+07:00",
            "table_id": "03",
            "customer_name": "Khách Bàn 03",
            "customer_id": "",
            "total": 120000,
            "payment": {"method": "cash"},
            "metadata": {"short_code": "BÀN 03", "delivery_type": "dine_in", "notes": "Gộp 2 đơn (Q01, Q05)"},
            "items": [
                {"name": "Cà phê sữa", "qty": 2, "price": 70000, "modifiers": {"size": "L"}},
                {"name": "Bánh mì patê", "qty": 1, "price": 50000, "modifiers": {}}
            ],
        }
        out = build_receipt_raster(grouped_order, is_cash=True)
        self.assertIsInstance(out, bytes)
        self.assertGreater(len(out), 0)

if __name__ == "__main__":
    unittest.main()
