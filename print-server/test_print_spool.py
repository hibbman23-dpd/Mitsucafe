# print-server/test_print_spool.py
import os, json, sqlite3, tempfile, threading, time, unittest
from print_spool import PrintSpool

def _order(oid="ORD-20260723-0001", stype="dine_in"):
    return {"order_id": oid, "timestamp": "2026-07-23T08:00:00+07:00",
            "table_id": "03", "customer_name": "", "customer_id": "",
            "metadata": {"short_code": "Q01", "delivery_type": stype, "notes": ""},
            "items": [{"name": "Bac xiu", "qty": 2, "price": 30000, "modifiers": {}}]}

class SpoolBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mktemp(suffix=".db")
        self.conn = sqlite3.connect(self.tmp, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.spool = PrintSpool(self.conn, threading.Lock())
    def tearDown(self):
        self.conn.close()
        if os.path.exists(self.tmp): os.remove(self.tmp)

class TestEnqueue(SpoolBase):
    def test_enqueue_labels_one_row_per_cup(self):
        cups = [{"name": "Bac xiu", "qty": 1, "modifiers": {}},
                {"name": "Bac xiu", "qty": 1, "modifiers": {}}]
        n = self.spool.enqueue_labels(_order(), cups)
        self.assertEqual(n, 2)
        rows = self.conn.execute("SELECT idempotency_key, seq_in_order, total_in_order, printer, kind, status "
                                 "FROM print_spool ORDER BY seq_in_order").fetchall()
        self.assertEqual([r["idempotency_key"] for r in rows],
                         ["ORD-20260723-0001:label:1", "ORD-20260723-0001:label:2"])
        self.assertEqual(rows[0]["total_in_order"], 2)
        self.assertEqual(rows[0]["printer"], "label")
        self.assertEqual(rows[0]["status"], "pending")

    def test_enqueue_labels_dedup_is_noop(self):
        cups = [{"name": "Bac xiu", "qty": 1, "modifiers": {}}]
        self.assertEqual(self.spool.enqueue_labels(_order(), cups), 1)
        self.assertEqual(self.spool.enqueue_labels(_order(), cups), 0)  # same keys → ignored
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM print_spool").fetchone()[0], 1)

    def test_enqueue_receipt_carries_is_cash(self):
        self.assertEqual(self.spool.enqueue_receipt(_order(), is_cash=True), 1)
        row = self.conn.execute("SELECT idempotency_key, printer, kind, payload_json FROM print_spool").fetchone()
        self.assertEqual(row["idempotency_key"], "ORD-20260723-0001:receipt:0")
        self.assertEqual(row["printer"], "receipt")
        self.assertTrue(json.loads(row["payload_json"])["is_cash"])

class TestStateMachine(SpoolBase):
    def _one_label(self):
        self.spool.enqueue_labels(_order(), [{"name": "X", "qty": 1, "modifiers": {}}])

    def test_claim_moves_pending_to_printing_and_returns_none_when_empty(self):
        self._one_label()
        job = self.spool.claim_next("label")
        self.assertEqual(job["status"], "printing")
        self.assertIsNotNone(job["claimed_at"])
        self.assertIsNone(self.spool.claim_next("label"))  # nothing left pending

    def test_mark_printed(self):
        self._one_label()
        job = self.spool.claim_next("label")
        self.spool.mark_printed(job["id"])
        row = self.conn.execute("SELECT status FROM print_spool WHERE id=?", (job["id"],)).fetchone()
        self.assertEqual(row["status"], "printed")

    def test_requeue_then_fail_after_max(self):
        self._one_label()
        job = self.spool.claim_next("label")
        jid = job["id"]
        self.conn.execute("UPDATE print_spool SET max_attempts=2 WHERE id=?", (jid,)); self.conn.commit()
        self.spool.requeue(jid, "boom")   # attempts 1 -> pending
        self.assertEqual(self.conn.execute("SELECT status,attempts FROM print_spool WHERE id=?", (jid,)).fetchone()["status"], "pending")
        job = self.spool.claim_next("label")
        self.spool.requeue(jid, "boom2")  # attempts 2 >= max -> failed
        row = self.conn.execute("SELECT status,attempts,last_error FROM print_spool WHERE id=?", (jid,)).fetchone()
        self.assertEqual(row["status"], "failed")
        self.assertEqual(row["attempts"], 2)
        self.assertIn("boom2", row["last_error"])

    def test_recover_orphans(self):
        self._one_label()
        job = self.spool.claim_next("label")
        # backdate claimed_at to simulate a crashed worker
        self.conn.execute("UPDATE print_spool SET claimed_at=? WHERE id=?",
                          ("2000-01-01T00:00:00+07:00", job["id"])); self.conn.commit()
        recovered = self.spool.recover_orphans("label", older_than_s=30)
        self.assertEqual(recovered, 1)
        self.assertEqual(self.conn.execute("SELECT status FROM print_spool WHERE id=?", (job["id"],)).fetchone()["status"], "pending")

    def test_stats(self):
        self.spool.enqueue_labels(_order(), [{"name":"X","qty":1,"modifiers":{}},
                                             {"name":"Y","qty":1,"modifiers":{}}])
        self.spool.claim_next("label")
        s = self.spool.stats("label")
        self.assertEqual(s, {"pending": 1, "printing": 1, "failed": 0})
