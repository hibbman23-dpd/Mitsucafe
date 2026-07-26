import os, tempfile, unittest
os.environ["PRINT_ENGINE"] = "noop"  # avoid real printer I/O; see Step 3 note
import print_server
from gateway import Gateway
from order_store import OrderStore
from online_inbox import OnlineInbox


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
        print_server.INBOX = OnlineInbox(print_server.STORE, fetch_fn=lambda: [])

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


class TestEditRoutes(RouteTestBase):
    def setUp(self):
        super().setUp()
        self.oid = self.c.post("/order", json={
            "idempotency_key": "e1", "metadata": {"delivery_type": "dine_in"},
            "table_id": "B2",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000},
                      {"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000}],
        }).get_json()["order_id"]

    def _ver(self):
        return self.c.get(f"/order/{self.oid}").get_json()["order"]["version"]

    def test_patch_items_recomputes_and_returns_cancelled(self):
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": self._ver(),
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]})
        d = r.get_json()
        self.assertEqual(d["order"]["total"], 30000)
        self.assertTrue(len(d["cancelled_lines"]) >= 1)

    def test_patch_items_stale_version_409(self):
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": 999, "items": []})
        self.assertEqual(r.status_code, 409)

    def test_split_route(self):
        r = self.c.post(f"/order/{self.oid}/split", json={
            "version": self._ver(),
            "partitions": [
                [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000}],
                [{"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000}]]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.get_json()["suborders"]), 2)

    def test_split_bad_partition_400(self):
        r = self.c.post(f"/order/{self.oid}/split", json={
            "version": self._ver(),
            "partitions": [[{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]]})
        self.assertEqual(r.status_code, 400)

    def test_merge_missing_order_404(self):
        r = self.c.post("/bill/merge", json={"order_ids": [self.oid, "ORD-NOPE"]})
        self.assertEqual(r.status_code, 404)


class TestInboxRoutes(RouteTestBase):
    def setUp(self):
        super().setUp()
        # seed one pending online order directly into the shared INBOX
        print_server.INBOX._pending["OLX"] = {"online_order_id": "OLX",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]}

    def test_inbox_lists_pending(self):
        r = self.c.get("/inbox")
        ids = [p["online_order_id"] for p in r.get_json()["pending"]]
        self.assertIn("OLX", ids)

    def test_accept_creates_order(self):
        r = self.c.post("/inbox/OLX/accept", json={
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}],
            "table_id": "TAKE", "customer_name": "Anh A"})
        d = r.get_json()
        self.assertTrue(d["ok"])
        self.assertTrue(d["order_id"].startswith("ORD-"))
        self.assertEqual(STORE_source_of(d["order_id"]), "online")

    def test_cloud_status(self):
        self.assertIn("online", self.c.get("/cloud/status").get_json())


def STORE_source_of(order_id):
    return print_server.STORE.get(order_id)["source"]


if __name__ == "__main__":
    unittest.main()
