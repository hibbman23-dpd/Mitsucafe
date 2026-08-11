# print-server/test_retention.py
"""Retention purge: only touches safely-completed old rows.
print_spool.purge_old  — deletes 'printed' rows older than N days; never pending/printing/failed.
gateway.purge_synced   — deletes synced (non-FAILED) outbox rows older than N days;
                          never synced_at IS NULL (unsynced) or 'FAILED%' (kept for audit).
"""
import os, sqlite3, tempfile, threading, unittest
from datetime import datetime, timedelta, timezone
from print_spool import PrintSpool
from gateway import Gateway

_VN = timezone(timedelta(hours=7))
OLD = "2000-01-01T00:00:00+07:00"


def _recent():
    """1 phút trước 'now' thật — luôn nằm trong cửa sổ 7 ngày bất kể ngày chạy test.
    Hardcode một mốc thời gian cụ thể (vd 2026-07-23) sẽ hết hạn khi đồng hồ hệ thống
    trôi qua, làm purge tưởng nhầm là 'cũ' rồi xoá — false failure, không phải bug thật."""
    return (datetime.now(_VN) - timedelta(minutes=1)).isoformat()


def _order(oid="ORD-20260723-0001"):
    return {"order_id": oid, "timestamp": "2026-07-23T08:00:00+07:00",
            "table_id": "03", "customer_name": "", "customer_id": "",
            "metadata": {"short_code": "Q01", "delivery_type": "dine_in", "notes": ""},
            "items": [{"name": "Bac xiu", "qty": 1, "price": 30000, "modifiers": {}}]}


class TestSpoolPurge(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mktemp(suffix=".db")
        self.conn = sqlite3.connect(self.tmp, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.spool = PrintSpool(self.conn, threading.Lock())

    def tearDown(self):
        self.conn.close()
        if os.path.exists(self.tmp):
            os.remove(self.tmp)

    def _make(self, key, status, updated_at):
        now = "2026-07-23T08:00:00+07:00"
        self.conn.execute(
            "INSERT INTO print_spool(idempotency_key,order_id,printer,kind,seq_in_order,"
            "total_in_order,payload_json,status,created_at,updated_at) "
            "VALUES(?,?,?,?,1,1,'{}',?,?,?)",
            (key, "ORD-20260723-0001", "label", "label", status, now, updated_at))
        self.conn.commit()

    def test_purge_old_deletes_old_printed_row(self):
        self._make("k1", "printed", OLD)
        n = self.spool.purge_old(days=7)
        self.assertEqual(n, 1)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) FROM print_spool").fetchone()[0], 0)

    def test_purge_old_keeps_recent_printed_row(self):
        recent = _recent()  # well within 7 days of "now"
        self._make("k2", "printed", recent)
        n = self.spool.purge_old(days=7)
        self.assertEqual(n, 0)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) FROM print_spool").fetchone()[0], 1)

    def test_purge_old_never_deletes_pending_printing_failed_regardless_of_age(self):
        self._make("k3", "pending", OLD)
        self._make("k4", "printing", OLD)
        self._make("k5", "failed", OLD)
        n = self.spool.purge_old(days=7)
        self.assertEqual(n, 0)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) FROM print_spool").fetchone()[0], 3)

    def test_purge_old_via_real_lifecycle(self):
        # sanity: purge works on a row that actually went through claim/mark_printed
        self.spool.enqueue_labels(_order(), [{"name": "X", "qty": 1, "modifiers": {}}])
        job = self.spool.claim_next("label")
        self.spool.mark_printed(job["id"])
        self.conn.execute("UPDATE print_spool SET updated_at=? WHERE id=?", (OLD, job["id"]))
        self.conn.commit()
        n = self.spool.purge_old(days=7)
        self.assertEqual(n, 1)


def fake_reserve(dtype, n):
    fake_reserve.calls += 1
    start = fake_reserve.next
    fake_reserve.next += n
    return {"letter": "Q", "date": "20260722", "from": start, "to": start + n - 1}
fake_reserve.calls = 0
fake_reserve.next = 1


class TestOutboxPurge(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mktemp(suffix=".db")
        fake_reserve.calls = 0
        fake_reserve.next = 1
        self.gw = Gateway(self.tmp, "http://gas", "tok", reserve_fn=fake_reserve, today="20260722")

    def tearDown(self):
        if os.path.exists(self.tmp):
            os.remove(self.tmp)

    def _make(self, key, order_id, synced_at):
        self.gw._conn.execute(
            "INSERT INTO outbox(op,order_id,idempotency_key,payload,short_code,printed_at,synced_at) "
            "VALUES('ingest_order',?,?, '{}', 'Q01','t',?)",
            (order_id, key, synced_at))
        self.gw._conn.commit()

    def test_purge_synced_deletes_old_synced_row(self):
        self._make("k1", "ORD-1", OLD)
        n = self.gw.purge_synced(days=7)
        self.assertEqual(n, 1)
        self.assertEqual(self.gw._conn.execute(
            "SELECT COUNT(*) FROM outbox").fetchone()[0], 0)

    def test_purge_synced_keeps_unsynced_row_regardless_of_age(self):
        self._make("k2", "ORD-2", None)
        # backdate nothing to compare against — synced_at IS NULL must never match the cutoff
        n = self.gw.purge_synced(days=7)
        self.assertEqual(n, 0)
        self.assertEqual(self.gw._conn.execute(
            "SELECT COUNT(*) FROM outbox").fetchone()[0], 1)

    def test_purge_synced_keeps_failed_row_regardless_of_age(self):
        self._make("k3", "ORD-3", "FAILED: Invalid transition: NEW -> DELIVERED")
        n = self.gw.purge_synced(days=7)
        self.assertEqual(n, 0)
        self.assertEqual(self.gw._conn.execute(
            "SELECT COUNT(*) FROM outbox").fetchone()[0], 1)

    def test_purge_synced_keeps_recent_synced_row(self):
        recent = _recent()
        self._make("k4", "ORD-4", recent)
        n = self.gw.purge_synced(days=7)
        self.assertEqual(n, 0)
        self.assertEqual(self.gw._conn.execute(
            "SELECT COUNT(*) FROM outbox").fetchone()[0], 1)

    def test_purge_synced_via_real_mark_synced(self):
        r = self.gw.mint_order({"channel": "kds", "items": [{"name": "CF", "qty": 1, "modifiers": {}}],
                                "metadata": {"delivery_type": "dine_in"}, "idempotency_key": "real1"})
        row = self.gw._conn.execute(
            "SELECT seq FROM outbox WHERE order_id=?", (r["order_id"],)).fetchone()
        self.gw.mark_synced(row["seq"])
        self.gw._conn.execute("UPDATE outbox SET synced_at=? WHERE seq=?", (OLD, row["seq"]))
        self.gw._conn.commit()
        n = self.gw.purge_synced(days=7)
        self.assertEqual(n, 1)


if __name__ == "__main__":
    unittest.main()
