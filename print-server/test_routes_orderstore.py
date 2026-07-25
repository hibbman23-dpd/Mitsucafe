import os, tempfile, unittest
os.environ["PRINT_ENGINE"] = "noop"  # avoid real printer I/O; see Step 3 note
import print_server
from gateway import Gateway
from order_store import OrderStore
# NOTE: online_inbox.py does not exist yet (it lands in Task 7/Phase 5 of the
# GAS-free backend plan). Task 5 only needs print_server.INBOX to exist as an
# attribute so it can be rebound later — a real OnlineInbox import here would
# raise ModuleNotFoundError. Using a placeholder keeps this test file runnable
# standalone at Task 5 time; Task 8 will restore the real OnlineInbox rebind.


def _fake_reserve(dtype, n):
    return {"letter": "Q", "date": "20260726", "from": 1, "to": n}


class RouteTestBase(unittest.TestCase):
    """Rebind GATEWAY/STORE/INBOX to a throwaway temp DB so route tests never
    touch the production outbox.db (module-level STORE/SPOOL bind at import time
    to the real DB — rebinding GATEWAY alone is not enough)."""
    def setUp(self):
        print_server.app.testing = True
        self.c = print_server.app.test_client()
        self._db = tempfile.mktemp(suffix=".db")
        print_server.GATEWAY = Gateway(self._db, "http://gas", "tok",
                                       reserve_fn=_fake_reserve, today="20260726")
        print_server.STORE = OrderStore(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
        print_server.INBOX = None  # placeholder until Task 8 wires the real OnlineInbox

    def tearDown(self):
        if os.path.exists(self._db):
            os.remove(self._db)


class TestOrderRoutes(RouteTestBase):
    def _create(self, idem="r1", table="B1"):
        return self.c.post("/order", json={
            "idempotency_key": idem,
            "metadata": {"delivery_type": "dine_in"},
            "table_id": table,
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000}],
        })

    def test_create_then_list_includes_order(self):
        self._create("r1")
        r = self.c.get("/orders")
        self.assertTrue(r.get_json()["ok"])
        ids = [o["order_id"] for o in r.get_json()["orders"]]
        self.assertTrue(any(i for i in ids))

    def test_get_single_order(self):
        oid = self._create("r2").get_json()["order_id"]
        r = self.c.get(f"/order/{oid}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["order"]["order_id"], oid)

    def test_get_missing_order_404(self):
        self.assertEqual(self.c.get("/order/NOPE").status_code, 404)

    def test_changes_since_empty_ts_returns_all(self):
        self._create("r3")
        r = self.c.get("/orders/changes?since=2000-01-01T00:00:00")
        self.assertTrue(len(r.get_json()["changes"]) >= 1)


if __name__ == "__main__":
    unittest.main()
