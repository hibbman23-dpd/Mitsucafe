import unittest
import printlib

ESC_KICK_1 = b"\x1b\x70\x00\x19\xfa"   # ESC p 0 25 250
ESC_KICK_2 = b"\x1b\x70\x01\x19\xfa"   # ESC p 1 25 250

def _order(method="cash"):
    return {"order_id": "ORD-20260723-0009", "timestamp": "2026-07-23T08:00:00+07:00",
            "table_id": "03", "metadata": {"short_code": "Q09", "delivery_type": "dine_in", "notes": ""},
            "items": [{"name": "Bac xiu", "qty": 1, "price": 30000, "modifiers": {}}],
            "total": 30000, "payment": {"method": method}}

class TestDrawerGate(unittest.TestCase):
    def test_cash_receipt_has_exactly_one_kick_before_cut(self):
        data = printlib.build_receipt(_order(), is_cash=True)
        cut = data.index(b"\x1dV\x42\x00")            # GS V B 0
        self.assertEqual(data.count(ESC_KICK_1), 1)
        self.assertLess(data.index(ESC_KICK_1), cut)  # kick precedes cut

    def test_non_cash_receipt_has_no_kick(self):
        data = printlib.build_receipt(_order(method="vietqr"), is_cash=False)
        self.assertEqual(data.count(ESC_KICK_1), 0)
        self.assertEqual(data.count(ESC_KICK_2), 0)

    def test_label_setup_preamble_bytes(self):
        self.assertEqual(printlib.label_setup_preamble(),
                         b"\r\n\r\nSIZE 50 mm,30 mm\r\nGAP 3 mm,0\r\nSPEED 4\r\nDENSITY 8\r\nDIRECTION 0\r\n")

    def test_batched_helper_removed(self):
        self.assertFalse(hasattr(printlib, "build_order_labels_tspl_batched"))


if __name__ == "__main__":
    unittest.main()
