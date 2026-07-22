# print-server/test_print_worker.py
import os, sqlite3, tempfile, threading, unittest
from print_spool import PrintSpool
from transport import FakeTransport
from print_worker import PrintWorker

def _order(oid="ORD-20260723-0001"):
    return {"order_id": oid, "timestamp": "2026-07-23T08:00:00+07:00", "table_id": "03",
            "metadata": {"short_code": "Q01", "delivery_type": "dine_in", "notes": ""}, "items": []}

class WorkerBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mktemp(suffix=".db")
        self.conn = sqlite3.connect(self.tmp, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.spool = PrintSpool(self.conn, threading.Lock())
    def tearDown(self):
        self.conn.close()
        if os.path.exists(self.tmp): os.remove(self.tmp)
    def _worker(self, transport, **kw):
        return PrintWorker("label", self.spool, transport, set(),
                           render=lambda job: b"RENDER:" + job["idempotency_key"].encode(),
                           pacing_s=0.01, **kw)

class TestWorker(WorkerBase):
    def test_prints_each_cup_once(self):
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(3)]
        self.spool.enqueue_labels(_order(), cups)
        t = FakeTransport()
        w = self._worker(t)
        while w.process_one():
            pass
        self.assertEqual(len(t.sent), 3)
        statuses = [r["status"] for r in self.conn.execute("SELECT status FROM print_spool").fetchall()]
        self.assertEqual(statuses, ["printed", "printed", "printed"])

    def test_drop_then_replay_prints_only_missing(self):
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(3)]
        self.spool.enqueue_labels(_order(), cups)
        t1 = FakeTransport(drop_after=2)   # 3rd send raises
        w1 = self._worker(t1)
        for _ in range(3):
            try: w1.process_one()
            except Exception: pass
        # 2 printed, 1 back to pending (attempts<max)
        printed = self.conn.execute("SELECT COUNT(*) FROM print_spool WHERE status='printed'").fetchone()[0]
        self.assertEqual(printed, 2)
        t2 = FakeTransport()
        w2 = self._worker(t2)
        while w2.process_one():
            pass
        self.assertEqual(len(t2.sent), 1)   # replay printed ONLY the missing cup
        self.assertEqual(t2.sent[0], b"RENDER:ORD-20260723-0001:label:3")

    def test_gas_mark_called_only_after_all_printed(self):
        calls = []
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(2)]
        self.spool.enqueue_labels(_order(), cups)
        t = FakeTransport()
        w = self._worker(t, gas_mark=lambda oid, kind: (calls.append((oid, kind)) or True))
        w.process_one()
        self.assertEqual(calls, [])                     # not after 1st cup
        w.process_one()
        self.assertEqual(calls, [("ORD-20260723-0001", "label")])   # after 2nd (last) cup

    def test_alert_on_final_failure(self):
        alerts = []
        self.spool.enqueue_labels(_order(), [{"name": "X", "qty": 1, "modifiers": {}}])
        self.conn.execute("UPDATE print_spool SET max_attempts=1"); self.conn.commit()
        t = FakeTransport(drop_after=0)   # every send raises
        w = self._worker(t, alert=lambda job, err: alerts.append(job["idempotency_key"]))
        w.process_one()
        self.assertEqual(alerts, ["ORD-20260723-0001:label:1"])
        self.assertEqual(self.conn.execute("SELECT status FROM print_spool").fetchone()["status"], "failed")
