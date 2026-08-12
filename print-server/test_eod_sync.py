import os, sqlite3, tempfile, threading, unittest
from order_store import OrderStore
import eod_sync


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


def _finalized(s, oid, status="PAID"):
    s.upsert_create({"order_id": oid, "short_code": "Q01", "delivery_type": "dine_in",
                     "table_id": "B1", "source": "staff",
                     "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}]})
    if status == "PAID":
        s.apply_paid(oid, True)
    else:
        s.apply_status(oid, status)


def _finalized_online(s, oid, status="PAID"):
    """Đơn website nhập vào local store — id/short_code do cloud cấp, đã có sẵn dòng
    trên Sheets, synced_at NULL cho tới khi finalize local."""
    s.upsert_create({"order_id": oid, "short_code": "Q01", "delivery_type": "dine_in",
                     "table_id": "B1", "source": "online",
                     "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}]})
    if status == "PAID":
        s.apply_paid(oid, True)
    else:
        s.apply_status(oid, status)


class TestEodSync(unittest.TestCase):
    def test_unsynced_finalized_excludes_open_orders(self):
        s = _store()
        _finalized(s, "ORD-1", "PAID")
        s.upsert_create({"order_id": "ORD-2", "short_code": "Q02", "delivery_type": "dine_in",
                         "table_id": "B1", "source": "staff", "items": []})  # stays NEW
        ids = [o["order_id"] for o in s.unsynced_finalized()]
        self.assertEqual(ids, ["ORD-1"])

    def test_sync_pushes_and_marks(self):
        s = _store(); _finalized(s, "ORD-1", "PAID")
        pushed = []
        res = eod_sync.sync_finalized(s, post_fn=lambda o: (pushed.append(o["order_id"]) or {"ok": True}))
        self.assertEqual(res["pushed"], 1)
        self.assertEqual(s.unsynced_finalized(), [])  # nothing left
        # re-run is safe: no double push
        res2 = eod_sync.sync_finalized(s, post_fn=lambda o: {"ok": True})
        self.assertEqual(res2["pushed"], 0)

    def test_sync_failure_leaves_unsynced(self):
        s = _store(); _finalized(s, "ORD-1", "PAID")
        res = eod_sync.sync_finalized(s, post_fn=lambda o: {"ok": False})
        self.assertEqual(res["failed"], 1)
        self.assertEqual(len(s.unsynced_finalized()), 1)

    def test_snapshot_copies_file(self):
        s = _store(); _finalized(s, "ORD-1")
        db_path = s.conn.execute("PRAGMA database_list").fetchone()[2]
        outdir = tempfile.mkdtemp()
        path = eod_sync.snapshot_db(db_path, outdir)
        self.assertTrue(os.path.exists(path))


class TestEodPayload(unittest.TestCase):
    def test_build_gas_payload_shape(self):
        order = {"order_id": "ORD-1", "short_code": "Q01", "table_id": "B1",
                 "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}],
                 "total": 30000, "paid": 1, "bill_meta": {"customer_name": "A"},
                 "delivery_type": "dine_in"}
        p = eod_sync.build_gas_payload(order)
        self.assertEqual(p["action"], "ingest_order")
        self.assertEqual(p["order_id"], "ORD-1")
        self.assertTrue(p["receipt_printed_local"])
        self.assertEqual(p["payment_status"], "PAID")
        self.assertEqual(p["total"], 30000)
        self.assertEqual(len(p["items"]), 1)

    def test_build_gas_payload_has_stable_idempotency_key(self):
        p = eod_sync.build_gas_payload({"order_id": "ORD-1", "short_code": "Q01",
                                        "items": [], "total": 0})
        self.assertEqual(p["idempotency_key"], "ORD-1")
        self.assertEqual(p["metadata"]["idempotency_key"], "ORD-1")


class TestTwoOpSync(unittest.TestCase):
    def test_paid_order_sends_ingest_then_mark_paid(self):
        s = _store(); _finalized(s, "ORD-1", "PAID")
        seen = []
        res = eod_sync.sync_finalized_2op(s, post_fn=lambda p: (seen.append(p["action"]) or {"ok": True}))
        self.assertEqual(seen, ["ingest_order", "mark_paid"])
        self.assertEqual(res["pushed"], 1)
        self.assertEqual(s.unsynced_finalized(), [])

    def test_cancelled_order_sends_ingest_then_update_status(self):
        s = _store(); _finalized(s, "ORD-2", "CANCELLED")
        seen = []
        eod_sync.sync_finalized_2op(s, post_fn=lambda p: (seen.append((p["action"], p.get("status"))) or {"ok": True}))
        self.assertEqual(seen, [("ingest_order", None), ("update_status", "CANCELLED")])

    def test_second_op_failure_leaves_unsynced(self):
        s = _store(); _finalized(s, "ORD-3", "PAID")
        def post(p):
            return {"ok": p["action"] == "ingest_order"}  # ingest ok, mark_paid fails
        res = eod_sync.sync_finalized_2op(s, post_fn=post)
        self.assertEqual(res["failed"], 1)
        self.assertEqual(len(s.unsynced_finalized()), 1)

    def test_mark_paid_payload_has_receipt_printed_local(self):
        p = eod_sync.build_mark_paid_payload({"order_id": "ORD-1"})
        self.assertEqual(p["action"], "mark_paid")
        self.assertTrue(p["receipt_printed_local"])


class TestTwoOpSyncOnlineOrders(unittest.TestCase):
    """Đơn online (source='online') đã có sẵn dòng trên Sheets do chính website tạo ra —
    KHÔNG được gửi ingest_order cho chúng ở EOD archive, nếu không idempotency_key lệch
    với dòng gốc, GAS ingestPreMintedOrder() sẽ mint order_id mới -> ra dòng thứ hai trùng
    tiền + trùng tem loyalty (double revenue)."""

    def test_paid_online_order_sends_only_mark_paid(self):
        s = _store(); _finalized_online(s, "ORD-ON-1", "PAID")
        seen = []
        res = eod_sync.sync_finalized_2op(
            s, post_fn=lambda p: (seen.append(p["action"]) or {"ok": True}))
        self.assertEqual(seen, ["mark_paid"])
        self.assertNotIn("ingest_order", seen)
        self.assertEqual(res["pushed"], 1)
        self.assertEqual(s.unsynced_finalized(), [])

    def test_cancelled_online_order_sends_only_status_update(self):
        s = _store(); _finalized_online(s, "ORD-ON-2", "CANCELLED")
        seen = []
        res = eod_sync.sync_finalized_2op(
            s, post_fn=lambda p: (seen.append(p["action"]) or {"ok": True}))
        self.assertEqual(seen, ["update_status"])
        self.assertNotIn("ingest_order", seen)
        self.assertEqual(res["pushed"], 1)
        self.assertEqual(s.unsynced_finalized(), [])

    def test_staff_order_still_sends_both_ops_in_order(self):
        """Guard chống vá quá tay: nếu skip ingest_order bị áp dụng luôn cho source='staff'
        (vd điều kiện != 'online' bị đảo ngược sai), test này phải đỏ."""
        s = _store(); _finalized(s, "ORD-1", "PAID")
        seen = []
        res = eod_sync.sync_finalized_2op(
            s, post_fn=lambda p: (seen.append(p["action"]) or {"ok": True}))
        self.assertEqual(seen, ["ingest_order", "mark_paid"])
        self.assertEqual(res["pushed"], 1)
