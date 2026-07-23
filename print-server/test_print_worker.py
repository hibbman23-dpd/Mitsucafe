# print-server/test_print_worker.py
import os, sqlite3, tempfile, threading, unittest
from print_spool import PrintSpool
from transport import FakeTransport
from print_worker import PrintWorker

class _OfflineTransport(FakeTransport):
    """Raise a chosen error message on send. fail_times=None → always fail;
    else fail the first N sends, then behave like FakeTransport (succeed)."""
    def __init__(self, msg, fail_times=None):
        super().__init__()
        self._msg = msg
        self._fail_times = fail_times
        self._n = 0
    def send(self, data):
        if self._fail_times is None or self._n < self._fail_times:
            self._n += 1
            raise RuntimeError(self._msg)
        return super().send(data)


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
        w = self._worker(t, setup_preamble=b"PREAMBLE")
        while w.process_one():
            pass
        self.assertEqual(len(t.sent), 4)   # preamble + 3 labels
        statuses = [r["status"] for r in self.conn.execute("SELECT status FROM print_spool").fetchall()]
        self.assertEqual(statuses, ["printed", "printed", "printed"])

    def test_drop_then_replay_prints_only_missing(self):
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(3)]
        self.spool.enqueue_labels(_order(), cups)
        # drop_after=2: preamble send #0 ok, label:1 send #1 ok, label:2 send #2 raises.
        t1 = FakeTransport(drop_after=2)
        w1 = self._worker(t1, setup_preamble=b"PREAMBLE")
        w1.process_one()

        rows = {r["idempotency_key"]: (r["status"], r["attempts"])
                for r in self.conn.execute("SELECT idempotency_key, status, attempts FROM print_spool").fetchall()}
        # label:1 already physically printed — must stay 'printed', never requeued.
        self.assertEqual(rows["ORD-20260723-0001:label:1"][0], "printed")
        # label:2 and label:3 were NOT sent (or failed) — back to pending, attempts bumped.
        self.assertEqual(rows["ORD-20260723-0001:label:2"], ("pending", 1))
        self.assertEqual(rows["ORD-20260723-0001:label:3"], ("pending", 1))

        t2 = FakeTransport()
        w2 = self._worker(t2, setup_preamble=b"PREAMBLE")
        while w2.process_one():
            pass
        # Replay must send label:2 then label:3 data — and NEVER label:1 again.
        label_sends = [d for d in t2.sent if d != b"PREAMBLE"]
        self.assertEqual(label_sends, [
            b"RENDER:ORD-20260723-0001:label:2",
            b"RENDER:ORD-20260723-0001:label:3",
        ])
        statuses = [r["status"] for r in self.conn.execute("SELECT status FROM print_spool").fetchall()]
        self.assertEqual(statuses, ["printed", "printed", "printed"])

    def test_gas_mark_called_only_after_all_printed(self):
        calls = []
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(2)]
        self.spool.enqueue_labels(_order(), cups)
        t = FakeTransport()
        w = self._worker(t, gas_mark=lambda oid, kind: (calls.append((oid, kind)) or True))
        w.process_one()
        self.assertEqual(calls, [("ORD-20260723-0001", "label")])

    def test_alert_on_final_failure(self):
        alerts = []
        self.spool.enqueue_labels(_order(), [{"name": "X", "qty": 1, "modifiers": {}}])
        self.conn.execute("UPDATE print_spool SET max_attempts=1"); self.conn.commit()
        t = FakeTransport(drop_after=0)   # every send raises
        w = self._worker(t, alert=lambda job, err: alerts.append(job["idempotency_key"]))
        w.process_one()
        self.assertEqual(alerts, ["ORD-20260723-0001:label:1"])
        self.assertEqual(self.conn.execute("SELECT status FROM print_spool").fetchone()["status"], "failed")

    def test_gas_mark_raises_keeps_printed_no_duplicate(self):
        def _boom(oid, kind):
            raise RuntimeError("gas down")
        self.spool.enqueue_labels(_order(), [{"name": "X", "qty": 1, "modifiers": {}}])
        t = FakeTransport()
        w = self._worker(t, gas_mark=_boom)
        w.process_one()
        self.assertEqual(len(t.sent), 1)
        self.assertEqual(
            self.conn.execute("SELECT status FROM print_spool").fetchone()["status"], "printed")
        # a fresh worker over the same spool must find nothing left to print (no duplicate)
        t2 = FakeTransport()
        w2 = self._worker(t2, gas_mark=_boom)
        while w2.process_one():
            pass
        self.assertEqual(len(t2.sent), 0)

    def test_confirm_false_requeues_not_printed(self):
        # Labels no longer confirm() (pacing via time.sleep instead) — this now covers
        # the receipt path, which still supports the DLE EOT back-channel confirm.
        self.spool.enqueue_receipt(_order(), is_cash=False)
        t = FakeTransport(status_replies=[])   # never replies -> confirm times out False
        w = PrintWorker("receipt", self.spool, t, {"dle_eot"},
                        render=lambda job: b"RENDER:" + job["idempotency_key"].encode(),
                        pacing_s=0.01)
        w.process_one()
        row = self.conn.execute("SELECT status, attempts FROM print_spool").fetchone()
        self.assertEqual(row["status"], "pending")
        self.assertEqual(row["attempts"], 1)

    def test_receipt_cold_wake_sends_esc_init(self):
        self.spool.enqueue_receipt(_order(), is_cash=False)
        t = FakeTransport()
        w = PrintWorker("receipt", self.spool, t, set(), render=lambda job: b"\x1b@RCPT", pacing_s=0.01)
        w.process_one()
        self.assertIn(b"RCPT", t.sent[0])

    def test_offline_error_never_burns_attempts(self):
        # Máy in rớt USB khi thay cuộn tem (No such device / not found) là sự cố VẬT LÝ,
        # KHÔNG được tính vào max_attempts → đơn không bao giờ failed-terminal vì thay tem.
        self.spool.enqueue_labels(_order(), [{"name": "X", "qty": 1, "modifiers": {}}])
        t = _OfflineTransport("USB printer 0x1fc9:0x2016 not found")
        w = self._worker(t, setup_preamble=b"", offline_backoff_base=0.0)
        for _ in range(12):
            w.process_one()
        row = self.conn.execute("SELECT status, attempts FROM print_spool").fetchone()
        self.assertEqual(row["status"], "pending")
        self.assertEqual(row["attempts"], 0)

    def test_offline_then_recovers_prints_with_zero_attempts(self):
        self.spool.enqueue_labels(_order(), [{"name": "X", "qty": 1, "modifiers": {}}])
        t = _OfflineTransport("[Errno 19] No such device", fail_times=4)
        w = self._worker(t, setup_preamble=b"", offline_backoff_base=0.0)
        for _ in range(12):
            w.process_one()
        row = self.conn.execute("SELECT status, attempts FROM print_spool").fetchone()
        self.assertEqual(row["status"], "printed")
        self.assertEqual(row["attempts"], 0)

    def test_real_print_error_still_counts_and_fails(self):
        # Lỗi in THẬT (không phải offline) vẫn đếm attempts và fail-terminal như cũ.
        self.spool.enqueue_labels(_order(), [{"name": "X", "qty": 1, "modifiers": {}}])
        self.conn.execute("UPDATE print_spool SET max_attempts=2"); self.conn.commit()
        t = _OfflineTransport("garbled data rejected by printer")  # thông điệp KHÔNG offline
        w = self._worker(t, setup_preamble=b"", offline_backoff_base=0.0)
        for _ in range(5):
            w.process_one()
        row = self.conn.execute("SELECT status, attempts FROM print_spool").fetchone()
        self.assertEqual(row["status"], "failed")
        self.assertEqual(row["attempts"], 2)

    def test_label_setup_preamble_sent_once(self):
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(2)]
        self.spool.enqueue_labels(_order(), cups)
        t = FakeTransport()
        w = PrintWorker("label", self.spool, t, set(),
                        render=lambda job: b"RENDER:" + job["idempotency_key"].encode(),
                        setup_preamble=b"PREAMBLE", pacing_s=0.01)
        w.process_one()
        self.assertIn(b"PREAMBLE", t.sent[0])
