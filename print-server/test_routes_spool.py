import json, os, tempfile, unittest
os.environ["PRINT_ENGINE"] = "spool"
os.environ["GATEWAY_DB"] = tempfile.mktemp(suffix=".db")
os.environ.setdefault("GAS_WEBAPP_URL", "http://gas.invalid")
import print_server

class TestEnqueueRoutes(unittest.TestCase):
    def setUp(self):
        self.c = print_server.app.test_client()
    def test_enqueue_labels_route(self):
        order = {"order_id": "ORD-20260723-0100", "timestamp": "2026-07-23T08:00:00+07:00",
                 "metadata": {"short_code": "Q10", "delivery_type": "dine_in", "notes": ""},
                 "items": [{"name": "Bac xiu", "qty": 2, "modifiers": {}}]}
        r = self.c.post("/enqueue/labels", json={"order": order})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["enqueued"], 2)   # qty 2 → 2 cups
        # idempotent
        r2 = self.c.post("/enqueue/labels", json={"order": order})
        self.assertEqual(r2.get_json()["enqueued"], 0)
    def test_enqueue_receipt_route(self):
        order = {"order_id": "ORD-20260723-0101", "timestamp": "2026-07-23T08:00:00+07:00",
                 "metadata": {"short_code": "Q11", "delivery_type": "dine_in", "notes": ""},
                 "items": [{"name": "Bac xiu", "qty": 1, "price": 30000, "modifiers": {}}],
                 "total": 30000, "payment": {"method": "cash"}}
        r = self.c.post("/enqueue/receipt", json={"order": order, "is_cash": True})
        self.assertEqual(r.get_json()["enqueued"], 1)
    def test_health_has_spool_stats(self):
        r = self.c.get("/health")
        self.assertIn("spool", r.get_json())
        self.assertIn("label", r.get_json()["spool"])
    def test_render_job_label_uses_no_header(self):
        job = {"kind": "label", "seq_in_order": 1, "total_in_order": 2,
               "payload_json": json.dumps({"order": {"order_id": "ORD-X",
                   "metadata": {"short_code": "Q1", "delivery_type": "dine_in", "notes": ""},
                   "timestamp": "2026-07-23T08:00:00+07:00"},
                   "item": {"name": "Bac xiu", "qty": 1, "modifiers": {}}, "is_cash": False})}
        data = print_server._render_job(job)
        self.assertNotIn(b"SIZE 50 mm", data)   # header suppressed (preamble sent once by worker)
        self.assertIn(b"PRINT 1,1", data)

if __name__ == "__main__":
    unittest.main()
