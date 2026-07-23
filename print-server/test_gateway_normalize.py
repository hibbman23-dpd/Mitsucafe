import unittest
from gateway import normalize_order_payload


class TestNormalizeOrderPayload(unittest.TestCase):
    def test_missing_sku_unresolved_name_becomes_unknown(self):
        payload = {"items": [{"name": "Món Không Tồn Tại XYZ", "qty": 1}],
                   "order_id": "ORD-20260723-0001"}
        with self.assertLogs("gateway", level="WARNING"):
            out = normalize_order_payload(payload)
        self.assertEqual(out["items"][0]["sku"], "UNKNOWN")

    def test_missing_sku_resolved_name_gets_real_sku(self):
        payload = {"items": [{"name": "Cà Phê Muối", "qty": 1}]}
        out = normalize_order_payload(payload)
        self.assertEqual(out["items"][0]["sku"], "DR005")

    def test_discontinued_sku_not_remapped(self):
        payload = {"items": [{"name": "Old Drink", "sku": "DR090", "qty": 1}]}
        out = normalize_order_payload(payload)
        self.assertEqual(out["items"][0]["sku"], "DR090")

    def test_channel_defaults_to_pos(self):
        payload = {"items": [{"name": "Cà Phê Muối", "qty": 2}]}
        out = normalize_order_payload(payload)
        self.assertEqual(out["channel"], "pos")

    def test_missing_qty_defaults_to_1(self):
        payload = {"items": [{"name": "Cà Phê Muối"}]}
        out = normalize_order_payload(payload)
        self.assertEqual(out["items"][0]["qty"], 1)

    def test_unresolved_sku_logs_warning_with_context(self):
        payload = {"items": [{"name": "Món Lạ Không Có Trong Menu"}],
                   "order_id": "ORD-20260723-0002"}
        with self.assertLogs("gateway", level="WARNING") as cm:
            normalize_order_payload(payload)
        self.assertTrue(any("unresolved sku" in m for m in cm.output))
        self.assertTrue(any("ORD-20260723-0002" in m for m in cm.output))


if __name__ == "__main__":
    unittest.main()
