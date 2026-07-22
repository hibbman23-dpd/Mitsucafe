import os, tempfile, unittest
os.environ["PRINT_ENGINE"] = "spool"
os.environ["GATEWAY_DB"] = tempfile.mktemp(suffix=".db")
os.environ.setdefault("GAS_WEBAPP_URL", "http://gas.invalid")
import print_server

def _order(oid):
    return {"order_id": oid, "timestamp": "2026-07-23T08:00:00+07:00",
            "metadata": {"short_code": "Q1", "delivery_type": "dine_in", "notes": ""}, "items": []}

class TestReconciler(unittest.TestCase):
    def test_reconciler_marks_when_gas_ok(self):
        # a fully-printed order with gas_marked=0
        print_server.SPOOL.enqueue_labels(_order("ORD-REC-1"), [{"name": "X", "qty": 1, "modifiers": {}}])
        j = print_server.SPOOL.claim_next("label"); print_server.SPOOL.mark_printed(j["id"])
        marked = []
        print_server._gas_mark = lambda oid, kind: marked.append((oid, kind)) or True
        n = print_server._reconcile_gas_marks_once()
        self.assertEqual(n, 1)
        self.assertEqual(marked, [("ORD-REC-1", "label")])
        self.assertEqual(print_server.SPOOL.pending_gas_marks(), [])   # cleared
