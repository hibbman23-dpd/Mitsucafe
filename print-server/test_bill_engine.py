import sqlite3, tempfile, threading, unittest
from order_store import OrderStore
import bill_engine


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


def _seed(s):
    s.upsert_create({
        "order_id": "ORD-20260726-0001", "short_code": "Q01",
        "delivery_type": "dine_in", "table_id": "B1", "source": "staff",
        "items": [
            {"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000},
            {"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000},
        ],
    })


class TestBillEngine(unittest.TestCase):
    def test_diff_detects_removed_line(self):
        old = [{"sku": "DR005", "name": "Cà phê muối", "qty": 2}]
        new = []
        d = bill_engine.diff_removed_kitchen_lines(old, new)
        self.assertEqual(d[0]["sku"], "DR005")
        self.assertEqual(d[0]["removed_qty"], 2)

    def test_diff_detects_reduced_qty(self):
        old = [{"sku": "DR005", "name": "Cà phê muối", "qty": 2}]
        new = [{"sku": "DR005", "name": "Cà phê muối", "qty": 1}]
        d = bill_engine.diff_removed_kitchen_lines(old, new)
        self.assertEqual(d[0]["removed_qty"], 1)

    def test_diff_ignores_added_or_unchanged(self):
        old = [{"sku": "DR005", "name": "X", "qty": 1}]
        new = [{"sku": "DR005", "name": "X", "qty": 1}, {"sku": "DR028", "name": "Y", "qty": 3}]
        self.assertEqual(bill_engine.diff_removed_kitchen_lines(old, new), [])

    def test_apply_items_edit_recomputes_total_and_reports_cancels(self):
        s = _store(); _seed(s)
        res = bill_engine.apply_items_edit(
            s, "ORD-20260726-0001",
            new_items=[{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}],
            expected_version=1)
        self.assertEqual(res["order"]["total"], 30000)
        cancelled_skus = {c["sku"] for c in res["cancelled_lines"]}
        self.assertEqual(cancelled_skus, {"DR005", "DR028"})  # DR005 reduced, DR028 removed

    def test_diff_size_swap_reports_old_variant(self):
        old = [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "modifiers": {"size": "L"}}]
        new = [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "modifiers": {"size": "M"}}]
        d = bill_engine.diff_removed_kitchen_lines(old, new)
        self.assertEqual(len(d), 1)
        self.assertEqual(d[0]["removed_qty"], 1)
        self.assertEqual(d[0]["modifiers"], {"size": "L"})

    def test_apply_items_edit_missing_order_raises_keyerror(self):
        s = _store()
        with self.assertRaises(KeyError):
            bill_engine.apply_items_edit(s, "NOPE", new_items=[], expected_version=1)
