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

if __name__ == "__main__":
    unittest.main()
