import os, tempfile, unittest
from gateway import Gateway

class TestSyncer(unittest.TestCase):
    def setUp(self):
        self._db = tempfile.mktemp(suffix=".db")
        def fake_reserve(dtype, n): return {"letter":"Q","date":"20260722","from":1,"to":n}
        self.gw = Gateway(self._db, "http://gas", "tok", reserve_fn=fake_reserve, today="20260722")
        self.sent = []
        self.gw._poster = lambda payload: (self.sent.append(payload) or {"ok": True})
    def tearDown(self):
        if os.path.exists(self._db): os.remove(self._db)

    def test_sync_once_pushes_and_marks(self):
        m = self.gw.mint_order({"items":[{"name":"X","qty":1,"modifiers":{}}],
              "metadata":{"delivery_type":"dine_in"},"idempotency_key":"s1"})
        self.gw.enqueue("ingest_order", m["order_id"], "s1",
                        {"gateway_order_id": m["order_id"]}, m["short_code"], "t")
        n = self.gw.sync_once()
        self.assertEqual(n, 1)
        self.assertEqual(self.gw.unsynced(), [])

if __name__ == "__main__":
    unittest.main()
