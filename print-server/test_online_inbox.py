import sqlite3, tempfile, threading, unittest
from order_store import OrderStore
from online_inbox import OnlineInbox, InboxActionError


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


def _order(oid="ORD-20260809-4821"):
    return {
        "order_id": oid, "short_code": "M07", "delivery_type": "pickup",
        "table_id": "", "customer_id": "0901234567", "customer_name": "Nguyễn Văn A",
        "items": [{"sku": "DR001", "name": "Cà phê sữa", "qty": 2, "price": 30000}],
        "total": 60000, "payment_status": "PENDING", "notes": "ít đường",
        "created_at": "2026-08-09T02:12:33.000Z", "label_printed_at": "",
    }


class TestOnlineInboxImport(unittest.TestCase):
    def test_import_keeps_gas_order_id_and_short_code(self):
        store = _store()
        OnlineInbox(store, fetch_fn=lambda: [_order()]).poll()
        o = store.get("ORD-20260809-4821")
        self.assertIsNotNone(o)
        self.assertEqual(o["short_code"], "M07")
        self.assertEqual(o["source"], "online")

    def test_import_sets_status_confirmed_locally(self):
        # upsert_create hardcode status="NEW"; thiếu apply_status thì GAS CONFIRMED
        # mà local NEW — hai bên lệch trạng thái.
        store = _store()
        OnlineInbox(store, fetch_fn=lambda: [_order()]).poll()
        self.assertEqual(store.get("ORD-20260809-4821")["status"], "CONFIRMED")

    def test_import_puts_customer_into_bill_meta(self):
        # bảng orders không có cột customer_id/customer_name — thẻ KDS đọc qua bill_meta.
        store = _store()
        OnlineInbox(store, fetch_fn=lambda: [_order()]).poll()
        bm = store.get("ORD-20260809-4821")["bill_meta"]
        self.assertEqual(bm["customer_id"], "0901234567")
        self.assertEqual(bm["customer_name"], "Nguyễn Văn A")

    def test_repoll_same_order_imports_once_and_calls_on_import_once(self):
        store = _store()
        seen = []
        inbox = OnlineInbox(store, fetch_fn=lambda: [_order()], on_import=seen.append)
        inbox.poll(); inbox.poll(); inbox.poll()
        self.assertEqual(seen, ["ORD-20260809-4821"])
        rows = store.list_orders()
        self.assertEqual(len([r for r in rows if r["order_id"] == "ORD-20260809-4821"]), 1)


class TestOnlineInboxSignals(unittest.TestCase):
    def test_transport_failure_flags_offline(self):
        def boom():
            raise ConnectionError("no internet")
        st = OnlineInbox(_store(), fetch_fn=boom).poll()
        self.assertFalse(st["online"])
        self.assertIn("no internet", st["inbox_error"])

    def test_action_failure_keeps_online_true(self):
        # _online nuôi badge cloud trên KDS. Action inbox hỏng mà badge nhảy
        # "Offline (local)" là báo động giả — GAS vẫn thu tiền bình thường.
        def boom():
            raise InboxActionError("unauthorized")
        st = OnlineInbox(_store(), fetch_fn=boom).poll()
        self.assertTrue(st["online"])
        self.assertIn("unauthorized", st["inbox_error"])

    def test_success_clears_previous_error(self):
        feed = {"fail": True}

        def fetch():
            if feed["fail"]:
                raise InboxActionError("unauthorized")
            return []
        inbox = OnlineInbox(_store(), fetch_fn=fetch)
        inbox.poll()
        feed["fail"] = False
        st = inbox.poll()
        self.assertTrue(st["online"])
        self.assertEqual(st["inbox_error"], "")


if __name__ == "__main__":
    unittest.main()
