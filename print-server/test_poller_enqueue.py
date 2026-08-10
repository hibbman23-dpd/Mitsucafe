import os
import unittest
from unittest import mock
import print_poller


class TestPollerEnqueue(unittest.TestCase):
    def test_labels_poll_posts_order_json_to_enqueue(self):
        order = {"order_id": "ORD-20260723-0200", "items": [{"name": "X", "qty": 2, "modifiers": {}}],
                 "metadata": {"delivery_type": "dine_in"}}
        posted = {}
        def fake_get_json(url, timeout=25):
            if "pending_labels" in url:
                return {"orders": [order]}
            posted["mark_called"] = True   # any GAS mark call would land here
            return {"ok": True}
        def fake_post_json(url, obj, timeout=25):
            posted["url"] = url; posted["obj"] = obj
            return {"ok": True, "enqueued": 2}
        with mock.patch.dict(os.environ, {"PRINT_ENGINE": "spool"}), \
             mock.patch.object(print_poller, "_get_json", fake_get_json), \
             mock.patch.object(print_poller, "_post_json", fake_post_json), \
             mock.patch.object(print_poller, "GAS_WEBAPP_URL", "http://gas"):
            print_poller.poll_labels_once()
        self.assertTrue(posted["url"].endswith("/enqueue/labels"))
        self.assertEqual(posted["obj"]["order"]["order_id"], "ORD-20260723-0200")
        self.assertNotIn("mark_called", posted)   # spool mode must NOT mark GAS

    def test_receipt_poll_posts_order_json_and_is_cash_to_enqueue(self):
        order = {"order_id": "ORD-20260723-0201",
                  "payment": {"method": "cash"},
                  "metadata": {"delivery_type": "pickup"}}
        posted = {}
        def fake_get_json(url, timeout=25):
            if "pending_print" in url:
                return {"orders": [order]}
            posted["mark_called"] = True
            return {"ok": True}
        def fake_post_json(url, obj, timeout=25):
            posted["url"] = url; posted["obj"] = obj
            return {"ok": True, "enqueued": 1}
        with mock.patch.dict(os.environ, {"PRINT_ENGINE": "spool"}), \
             mock.patch.object(print_poller, "_get_json", fake_get_json), \
             mock.patch.object(print_poller, "_post_json", fake_post_json), \
             mock.patch.object(print_poller, "GAS_WEBAPP_URL", "http://gas"):
            print_poller.poll_once()
        self.assertTrue(posted["url"].endswith("/enqueue/receipt"))
        self.assertEqual(posted["obj"]["order"]["order_id"], "ORD-20260723-0201")
        self.assertTrue(posted["obj"]["is_cash"])
        self.assertNotIn("mark_called", posted)

    def test_legacy_mode_posts_bytes_and_marks_gas(self):
        order = {"order_id": "ORD-20260723-0202",
                  "items": [{"name": "X", "qty": 1, "modifiers": {}}],
                  "metadata": {"delivery_type": "dine_in"}}
        calls = {"marks": []}
        def fake_get_json(url, timeout=25):
            if "pending_labels" in url:
                return {"orders": [order]}
            if "mark_labels_printed" in url:
                calls["marks"].append(url)
                return {"ok": True}
            return {"ok": True}
        def fake_post_bytes(url, data, timeout=25):
            calls["post_bytes_url"] = url
            return {"ok": True, "bytes": 10}
        with mock.patch.object(print_poller, "_engine", lambda: "legacy"), \
             mock.patch.object(print_poller, "_get_json", fake_get_json), \
             mock.patch.object(print_poller, "_post_bytes", fake_post_bytes), \
             mock.patch.object(print_poller, "_printed_by_gateway_local", lambda order_id: False), \
             mock.patch.object(print_poller, "GAS_WEBAPP_URL", "http://gas"):
            print_poller.poll_labels_once()
        self.assertTrue(calls["post_bytes_url"].endswith("/print/label"))
        self.assertEqual(len(calls["marks"]), 1)   # legacy path marks GAS

    def test_spool_mode_no_gas_mark(self):
        order = {"order_id": "ORD-20260723-0203",
                  "items": [{"name": "X", "qty": 1, "modifiers": {}}],
                  "metadata": {"delivery_type": "dine_in"}}
        posted = {}
        def fake_get_json(url, timeout=25):
            if "pending_labels" in url:
                return {"orders": [order]}
            posted["mark_called"] = True
            return {"ok": True}
        def fake_post_json(url, obj, timeout=25):
            posted["url"] = url; posted["obj"] = obj
            return {"ok": True, "enqueued": 1}
        with mock.patch.object(print_poller, "_engine", lambda: "spool"), \
             mock.patch.object(print_poller, "_get_json", fake_get_json), \
             mock.patch.object(print_poller, "_post_json", fake_post_json), \
             mock.patch.object(print_poller, "GAS_WEBAPP_URL", "http://gas"):
            print_poller.poll_labels_once()
        self.assertTrue(posted["url"].endswith("/enqueue/labels"))
        self.assertNotIn("mark_called", posted)

    def test_receipt_poll_tags_bill_so_local_print_dedups(self):
        """Poller PHẢI gửi tag='bill'.

        Máy quán in hoá đơn lúc thanh toán với key '<order_id>:bill:0'. Poller không
        gửi tag thì route mặc định 'receipt' -> key '<order_id>:receipt:0' -> khác key
        -> dedup không bắt -> in thêm tờ thứ hai. Tệ hơn: show_total chỉ bật khi
        tag=='bill', nên tờ thừa ra không có tổng tiền, nhìn y hệt phiếu bếp.
        Đã xảy ra thật 10/08/2026 (ORD-20260810-7319, ORD-20260810-6740).
        """
        order = {"order_id": "ORD-20260723-0205",
                 "payment": {"method": "cash"},
                 "metadata": {"delivery_type": "dine_in"}}
        posted = {}
        def fake_get_json(url, timeout=25):
            if "pending_print" in url:
                return {"orders": [order]}
            return {"ok": True}
        def fake_post_json(url, obj, timeout=25):
            posted["obj"] = obj
            return {"ok": True, "enqueued": 1}
        with mock.patch.object(print_poller, "_engine", lambda: "spool"), \
             mock.patch.object(print_poller, "_get_json", fake_get_json), \
             mock.patch.object(print_poller, "_post_json", fake_post_json), \
             mock.patch.object(print_poller, "GAS_WEBAPP_URL", "http://gas"):
            print_poller.poll_once()
        self.assertEqual(posted["obj"].get("tag"), "bill")

    def test_receipt_non_cash_is_cash_false(self):
        order = {"order_id": "ORD-20260723-0204",
                  "payment": {"method": "vietqr"},
                  "metadata": {"delivery_type": "pickup"}}
        posted = {}
        def fake_get_json(url, timeout=25):
            if "pending_print" in url:
                return {"orders": [order]}
            posted["mark_called"] = True
            return {"ok": True}
        def fake_post_json(url, obj, timeout=25):
            posted["url"] = url; posted["obj"] = obj
            return {"ok": True, "enqueued": 1}
        with mock.patch.object(print_poller, "_engine", lambda: "spool"), \
             mock.patch.object(print_poller, "_get_json", fake_get_json), \
             mock.patch.object(print_poller, "_post_json", fake_post_json), \
             mock.patch.object(print_poller, "GAS_WEBAPP_URL", "http://gas"):
            print_poller.poll_once()
        self.assertTrue(posted["url"].endswith("/enqueue/receipt"))
        self.assertFalse(posted["obj"]["is_cash"])


if __name__ == "__main__":
    unittest.main()
