# print-server/test_print_spool.py
import os, json, sqlite3, tempfile, threading, unittest
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
