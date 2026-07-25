import json, os, tempfile, unittest
import print_server

class TestRoutes(unittest.TestCase):
    def setUp(self):
        print_server.app.config["TESTING"] = True
        self.c = print_server.app.test_client()
        self._db = tempfile.mktemp(suffix=".db")
        from gateway import Gateway
        from order_store import OrderStore
        def fake_reserve(dtype, n): return {"letter": "Q", "date": "20260722", "from": 1, "to": n}
        print_server.GATEWAY = Gateway(self._db, "http://gas", "tok",
                                       reserve_fn=fake_reserve, today="20260722")
        # Task 5: STORE binds to GATEWAY._conn at import time (real outbox.db) —
        # rebind it here too, or order_create()'s STORE.upsert_create() would write
        # test orders into the production orders table (confirmed happened once
        # while wiring Task 5; do not remove this line).
        print_server.STORE = OrderStore(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
        self._printed = []
        print_server._print_label_bytes = lambda data: self._printed.append(data) or len(data)
    def tearDown(self):
        if os.path.exists(self._db): os.remove(self._db)

    def test_post_order_prints_and_returns_code(self):
        body = {"channel":"kds","items":[{"name":"Bạc xỉu","qty":2,"modifiers":{}}],
                "metadata":{"delivery_type":"dine_in"},"idempotency_key":"r1"}
        r = self.c.post("/order", json=body)
        d = r.get_json()
        self.assertTrue(d["ok"]); self.assertTrue(d["printed"])
        self.assertEqual(d["short_code"], "Q01")
        self.assertEqual(len(self._printed), 1)

    def test_get_order_by_key(self):
        body = {"items":[{"name":"X","qty":1,"modifiers":{}}],
                "metadata":{"delivery_type":"dine_in"},"idempotency_key":"r2"}
        self.c.post("/order", json=body)
        r = self.c.get("/order?key=r2")
        d = r.get_json()
        self.assertTrue(d["found"]); self.assertTrue(d["order_id"].startswith("ORD-"))

if __name__ == "__main__":
    unittest.main()
