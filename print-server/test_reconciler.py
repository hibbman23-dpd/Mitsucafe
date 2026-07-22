import os, tempfile, unittest
os.environ.setdefault("GAS_WEBAPP_URL", "http://gas.invalid")
import print_server
from gateway import Gateway
from print_spool import PrintSpool


def _order(oid):
    return {"order_id": oid, "timestamp": "2026-07-23T08:00:00+07:00",
            "metadata": {"short_code": "Q1", "delivery_type": "dine_in", "notes": ""}, "items": []}


class TestReconciler(unittest.TestCase):
    def setUp(self):
        # self-contained + order-independent: rebind SPOOL to a fresh temp DB and
        # save/restore module globals so this file's import order can't affect others.
        self._orig = (print_server.GATEWAY, print_server.SPOOL,
                      print_server._gas_mark, os.environ.get("PRINT_ENGINE"))
        os.environ["PRINT_ENGINE"] = "spool"
        self._db = tempfile.mktemp(suffix=".db")
        def fake_reserve(dtype, n):
            return {"letter": "Q", "date": "20260723", "from": 1, "to": n}
        print_server.GATEWAY = Gateway(self._db, "http://gas", "tok",
                                       reserve_fn=fake_reserve, today="20260723")
        print_server.SPOOL = PrintSpool(print_server.GATEWAY._conn, print_server.GATEWAY._lock)

    def tearDown(self):
        gw, sp, gm, engine = self._orig
        print_server.GATEWAY, print_server.SPOOL, print_server._gas_mark = gw, sp, gm
        if engine is None:
            os.environ.pop("PRINT_ENGINE", None)
        else:
            os.environ["PRINT_ENGINE"] = engine
        if os.path.exists(self._db):
            os.remove(self._db)

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

    def test_reconciler_skips_when_gas_returns_false(self):
        # gas_mark returns False -> stays pending for a later retry (the reconciler's whole point)
        print_server.SPOOL.enqueue_labels(_order("ORD-REC-2"), [{"name": "X", "qty": 1, "modifiers": {}}])
        j = print_server.SPOOL.claim_next("label"); print_server.SPOOL.mark_printed(j["id"])
        print_server._gas_mark = lambda oid, kind: False
        n = print_server._reconcile_gas_marks_once()
        self.assertEqual(n, 0)
        self.assertEqual(print_server.SPOOL.pending_gas_marks(), [{"order_id": "ORD-REC-2", "kind": "label"}])
