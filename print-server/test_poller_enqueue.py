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
        with mock.patch.object(print_poller, "_get_json", fake_get_json), \
             mock.patch.object(print_poller, "_post_json", fake_post_json), \
             mock.patch.object(print_poller, "GAS_WEBAPP_URL", "http://gas"):
            print_poller.poll_labels_once()
        self.assertTrue(posted["url"].endswith("/enqueue/labels"))
        self.assertEqual(posted["obj"]["order"]["order_id"], "ORD-20260723-0200")
        self.assertNotIn("mark_called", posted)   # poller must NOT mark GAS anymore

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
        with mock.patch.object(print_poller, "_get_json", fake_get_json), \
             mock.patch.object(print_poller, "_post_json", fake_post_json), \
             mock.patch.object(print_poller, "GAS_WEBAPP_URL", "http://gas"):
            print_poller.poll_once()
        self.assertTrue(posted["url"].endswith("/enqueue/receipt"))
        self.assertEqual(posted["obj"]["order"]["order_id"], "ORD-20260723-0201")
        self.assertTrue(posted["obj"]["is_cash"])
        self.assertNotIn("mark_called", posted)


if __name__ == "__main__":
    unittest.main()
