import sqlite3, tempfile, threading, unittest
from order_store import OrderStore
from online_inbox import OnlineInbox


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


class TestOnlineInbox(unittest.TestCase):
    def test_poll_populates_pending_and_dedupes(self):
        feed = [[{"online_order_id": "OL1", "items": [{"sku": "DR005", "qty": 1}]}]]
        inbox = OnlineInbox(_store(), fetch_fn=lambda: feed[0])
        self.assertEqual(inbox.poll()["pending_count"], 1)
        self.assertEqual(inbox.poll()["pending_count"], 1)  # same id, no dup
        self.assertTrue(inbox.status()["online"])

    def test_poll_offline_on_exception_keeps_pending(self):
        inbox = OnlineInbox(_store(), fetch_fn=lambda: [{"online_order_id": "OL1", "items": []}])
        inbox.poll()

        def boom():
            raise ConnectionError("no internet")
        inbox.fetch_fn = boom
        st = inbox.poll()
        self.assertFalse(st["online"])
        self.assertEqual(st["pending_count"], 1)  # catch-up: pending retained

    def test_accept_is_idempotent(self):
        inbox = OnlineInbox(_store(), fetch_fn=lambda: [{"online_order_id": "OL1", "items": []}])
        inbox.poll()
        self.assertTrue(inbox.accept("OL1", {})["accepted"])
        self.assertFalse(inbox.accept("OL1", {})["accepted"])  # already accepted
        self.assertEqual(inbox.status()["pending_count"], 0)

    def test_accept_then_repoll_same_feed_stays_consumed(self):
        feed = [{"online_order_id": "OL1", "items": []}]
        inbox = OnlineInbox(_store(), fetch_fn=lambda: feed)
        inbox.poll()
        self.assertTrue(inbox.accept("OL1", {})["accepted"])
        inbox.poll()  # mailbox still returns OL1 until GAS marks it consumed
        self.assertEqual(inbox.status()["pending_count"], 0)

    def test_accept_unknown_id_does_not_blacklist_future_delivery(self):
        feed = [{"online_order_id": "OL1", "items": []}]
        inbox = OnlineInbox(_store(), fetch_fn=lambda: feed)
        # stale click / race: accept before the order was ever polled
        self.assertFalse(inbox.accept("OL1", {})["accepted"])
        inbox.poll()  # mailbox now delivers OL1 — it MUST surface, not be dropped
        self.assertEqual(inbox.status()["pending_count"], 1)
