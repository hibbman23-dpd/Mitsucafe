"""test_order_spool_e2e.py — end-to-end: /order and /order/mark_paid enqueue into the
spool when PRINT_ENGINE=spool (closes the integration gap flagged in final review).

This also serves as the reference for the on-device rollout test payloads: the exact
JSON bodies here are what the shop runbook POSTs to a live server."""
import os, tempfile, unittest

os.environ.setdefault("GAS_WEBAPP_URL", "http://gas.invalid")
import print_server
from gateway import Gateway
from print_spool import PrintSpool
from order_store import OrderStore


class TestOrderSpoolE2E(unittest.TestCase):
    def setUp(self):
        # save globals so we can restore them (no leakage into other test modules)
        self._orig = (print_server.GATEWAY, print_server.SPOOL, print_server.STORE,
                      print_server._gas_mark, print_server._gas_post,
                      os.environ.get("PRINT_ENGINE"))
        os.environ["PRINT_ENGINE"] = "spool"          # route branch reads this dynamically
        print_server.app.config["TESTING"] = True
        self.c = print_server.app.test_client()
        self._db = tempfile.mktemp(suffix=".db")
        # rebind GATEWAY, SPOOL, and STORE to one temp DB (SPOOL and STORE both bind
        # import-time GATEWAY, so rebinding GATEWAY alone would leave them on the real
        # outbox.db — this is what let /order writes leak into prod, Task 5 fix)
        def fake_reserve(dtype, n):
            return {"letter": "Q", "date": "20260723", "from": 1, "to": n}
        print_server.GATEWAY = Gateway(self._db, "http://gas", "tok",
                                       reserve_fn=fake_reserve, today="20260723")
        print_server.SPOOL = PrintSpool(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
        print_server.STORE = OrderStore(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
        # keep GAS marking off the network
        print_server._gas_mark = lambda oid, kind: True
        print_server._gas_post = lambda payload, timeout=8: {"ok": True}

    def tearDown(self):
        gw, sp, st, gm, gp, engine = self._orig
        print_server.GATEWAY, print_server.SPOOL, print_server.STORE = gw, sp, st
        print_server._gas_mark, print_server._gas_post = gm, gp
        if engine is None:
            os.environ.pop("PRINT_ENGINE", None)
        else:
            os.environ["PRINT_ENGINE"] = engine
        if os.path.exists(self._db):
            os.remove(self._db)

    def _spool_rows(self, printer=None):
        q = "SELECT idempotency_key, printer, kind, seq_in_order, total_in_order, status FROM print_spool"
        args = ()
        if printer:
            q += " WHERE printer=?"; args = (printer,)
        q += " ORDER BY id"
        return print_server.SPOOL._conn.execute(q, args).fetchall()

    # ── Scenario: one 2-cup order enqueues exactly 2 label jobs ──────────────
    def test_order_enqueues_one_label_job_per_cup(self):
        body = {"items": [{"name": "Bac xiu", "qty": 2, "price": 30000,
                           "modifiers": {"size": "M", "sugar": "50%", "ice": "less"}}],
                "metadata": {"delivery_type": "dine_in"}, "table_id": "02",
                "idempotency_key": "e2e-1"}
        r = self.c.post("/order", json=body)
        d = r.get_json()
        self.assertTrue(d["ok"])
        self.assertTrue(d["order_id"].startswith("ORD-"))
        rows = self._spool_rows(printer="label")
        self.assertEqual(len(rows), 2)
        self.assertEqual([x["seq_in_order"] for x in rows], [1, 2])
        self.assertTrue(all(x["total_in_order"] == 2 for x in rows))
        self.assertTrue(all(x["status"] == "pending" for x in rows))
        self.assertTrue(all(x["idempotency_key"].endswith(f":label:{x['seq_in_order']}") for x in rows))

    # ── Scenario: one 10-cup order → exactly 10 label jobs ──────────────────
    def test_ten_cup_order_enqueues_ten_labels(self):
        body = {"items": [{"name": "Tra sua", "qty": 10, "price": 35000,
                           "modifiers": {"size": "L"}}],
                "metadata": {"delivery_type": "dine_in"}, "table_id": "05",
                "idempotency_key": "e2e-10"}
        self.c.post("/order", json=body)
        rows = self._spool_rows(printer="label")
        self.assertEqual(len(rows), 10)
        self.assertEqual([x["seq_in_order"] for x in rows], list(range(1, 11)))

    # ── Scenario: 5 back-to-back orders → each fully enqueued, none dropped ──
    def test_five_orders_none_dropped(self):
        for i in range(1, 6):
            body = {"items": [{"name": "Ca phe sua", "qty": 1, "price": 25000, "modifiers": {}}],
                    "metadata": {"delivery_type": "dine_in"}, "table_id": f"0{i}",
                    "idempotency_key": f"e2e-burst-{i}"}
            r = self.c.post("/order", json=body)
            self.assertTrue(r.get_json()["ok"])
        rows = self._spool_rows(printer="label")
        self.assertEqual(len(rows), 5)   # 5 orders × 1 cup, none lost
        self.assertEqual(len({x["idempotency_key"] for x in rows}), 5)

    # ── Scenario: cash mark_paid enqueues one receipt job carrying is_cash ──
    def test_mark_paid_cash_enqueues_receipt_with_drawer(self):
        import json as _json
        body = {"items": [{"name": "Combo", "qty": 1, "price": 50000, "modifiers": {}}],
                "metadata": {"delivery_type": "dine_in"}, "table_id": "08",
                "idempotency_key": "e2e-pay"}
        oid = self.c.post("/order", json=body).get_json()["order_id"]
        r = self.c.post("/order/mark_paid", json={"order_id": oid, "payment_method": "cash"})
        self.assertTrue(r.get_json()["ok"])
        # Tạo đơn in PHIẾU PHA CHẾ (tag=prep); mark_paid in HÓA ĐƠN (tag=bill) — key riêng, không dedup.
        row = print_server.SPOOL._conn.execute(
            "SELECT idempotency_key, order_id, payload_json FROM print_spool "
            "WHERE printer='receipt' AND idempotency_key LIKE '%:bill:%'").fetchone()
        self.assertEqual(row["idempotency_key"], f"{oid}:bill:0")
        self.assertEqual(row["order_id"], oid)
        self.assertTrue(_json.loads(row["payload_json"])["is_cash"])   # cash → drawer will kick
        # PHIẾU PHA CHẾ vẫn có mặt (in lúc tạo đơn, không mở két)
        prep = print_server.SPOOL._conn.execute(
            "SELECT payload_json FROM print_spool WHERE idempotency_key=?", (f"{oid}:prep:0",)).fetchone()
        self.assertIsNotNone(prep)
        self.assertFalse(_json.loads(prep["payload_json"])["is_cash"])

    def test_mark_paid_vietqr_receipt_no_drawer(self):
        import json as _json
        body = {"items": [{"name": "Combo", "qty": 1, "price": 50000, "modifiers": {}}],
                "metadata": {"delivery_type": "dine_in"}, "table_id": "09",
                "idempotency_key": "e2e-qr"}
        oid = self.c.post("/order", json=body).get_json()["order_id"]
        self.c.post("/order/mark_paid", json={"order_id": oid, "payment_method": "vietqr"})
        payload = _json.loads(print_server.SPOOL._conn.execute(
            "SELECT payload_json FROM print_spool "
            "WHERE printer='receipt' AND idempotency_key=?", (f"{oid}:bill:0",)).fetchone()["payload_json"])
        self.assertFalse(payload["is_cash"])  # non-cash → no drawer kick


if __name__ == "__main__":
    unittest.main()
