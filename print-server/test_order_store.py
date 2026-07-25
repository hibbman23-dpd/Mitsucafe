import os, sqlite3, tempfile, threading, unittest
from order_store import OrderStore, compute_total, VersionConflict


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


def _order(oid="ORD-20260726-0001", **over):
    o = {
        "order_id": oid,
        "short_code": "Q01",
        "delivery_type": "dine_in",
        "table_id": "B1",
        "source": "staff",
        "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000}],
        "customer_note": "",
        "bill_meta": {},
    }
    o.update(over)
    return o


class TestOrderStoreCreate(unittest.TestCase):
    def test_compute_total_uses_price_times_qty(self):
        items = [{"qty": 2, "price": 30000}, {"qty": 1, "price": 25000}]
        self.assertEqual(compute_total(items), 85000)

    def test_compute_total_prefers_explicit_subtotal(self):
        items = [{"qty": 2, "price": 30000, "subtotal": 55000}]
        self.assertEqual(compute_total(items), 55000)

    def test_upsert_create_persists_row(self):
        s = _store()
        row = s.upsert_create(_order())
        self.assertEqual(row["order_id"], "ORD-20260726-0001")
        self.assertEqual(row["status"], "NEW")
        self.assertEqual(row["version"], 1)
        self.assertEqual(row["total"], 60000)
        self.assertEqual(row["source"], "staff")

    def test_get_returns_none_for_missing(self):
        self.assertIsNone(_store().get("nope"))

    def test_upsert_create_is_idempotent(self):
        s = _store()
        s.upsert_create(_order())
        s.upsert_create(_order(short_code="Q99"))  # same id, ignored
        self.assertEqual(s.get("ORD-20260726-0001")["short_code"], "Q01")


class TestOrderStoreListAndStatus(unittest.TestCase):
    def setUp(self):
        self.s = _store()
        self.s.upsert_create(_order("ORD-20260726-0001"))
        self.s.upsert_create(_order("ORD-20260726-0002", short_code="Q02"))

    def test_list_orders_returns_all(self):
        self.assertEqual(len(self.s.list_orders()), 2)

    def test_changes_since_returns_only_newer(self):
        row = self.s.get("ORD-20260726-0001")
        ts = row["updated_at"]
        # mutate the second order so its updated_at advances past ts
        import time; time.sleep(0.01)
        self.s.set_status("ORD-20260726-0002", "CONFIRMED", expected_version=1)
        changed = self.s.changes_since(ts)
        ids = [c["order_id"] for c in changed]
        self.assertIn("ORD-20260726-0002", ids)

    def test_set_status_bumps_version(self):
        r = self.s.set_status("ORD-20260726-0001", "CONFIRMED", expected_version=1)
        self.assertEqual(r["status"], "CONFIRMED")
        self.assertEqual(r["version"], 2)

    def test_set_status_stale_version_raises(self):
        with self.assertRaises(VersionConflict):
            self.s.set_status("ORD-20260726-0001", "CONFIRMED", expected_version=99)

    def test_set_paid(self):
        r = self.s.set_paid("ORD-20260726-0001", True, expected_version=1)
        self.assertEqual(r["paid"], 1)


if __name__ == "__main__":
    unittest.main()
