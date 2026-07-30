import os, tempfile, unittest
os.environ["PRINT_ENGINE"] = "noop"  # avoid real printer I/O; see Step 3 note
import print_server
from gateway import Gateway
from order_store import OrderStore
from online_inbox import OnlineInbox
from print_spool import PrintSpool
from print_issues import PrintIssues


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
        print_server.SPOOL = PrintSpool(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
        print_server.PRINT_ISSUES = PrintIssues(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
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

    def test_orders_returns_now_cursor(self):
        self._create("nowr")
        d = self.c.get("/orders").get_json()
        self.assertIn("now", d)
        self.assertTrue(d["now"])  # non-empty ISO timestamp so the client seeds its poll cursor


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

    def test_patch_items_removes_two_lines_at_once(self):
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": self._ver(),
            "items": [],
            "reason": "Khách đổi ý"})
        d = r.get_json()
        self.assertEqual(d["order"]["total"], 0)
        self.assertEqual(len(d["cancelled_lines"]), 2)

    def test_patch_items_stale_version_409(self):
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": 999, "items": []})
        self.assertEqual(r.status_code, 409)

    def test_swap_item_replaces_line_and_recomputes_total(self):
        r = self.c.post("/order/swap_item", json={
            "order_id": self.oid, "item_index": 0,
            "new_item": {"sku": "DR099", "name": "Matcha đá xay", "qty": 1, "price": 40000},
            "manager_pin": "1234"})
        self.assertEqual(r.status_code, 200)
        d = r.get_json()
        self.assertTrue(d["ok"])
        items = d["order"]["items"]
        self.assertEqual(items[0]["sku"], "DR099")
        self.assertEqual(items[0]["modifiers"]["swap_from"], "Cà phê muối")
        # old line (Cà phê muối x2 @30000) removed, Trà sữa oolong x1 @25000 untouched
        self.assertEqual(d["order"]["total"], 40000 + 25000)
        self.assertEqual(len(d["cancelled_lines"]), 1)
        self.assertEqual(d["cancelled_lines"][0]["sku"], "DR005")

    def test_swap_item_wrong_pin_400(self):
        r = self.c.post("/order/swap_item", json={
            "order_id": self.oid, "item_index": 0,
            "new_item": {"sku": "DR099", "name": "X", "qty": 1, "price": 1000},
            "manager_pin": "0000"})
        self.assertEqual(r.status_code, 400)

    def test_swap_item_bad_index_400(self):
        r = self.c.post("/order/swap_item", json={
            "order_id": self.oid, "item_index": 99,
            "new_item": {"sku": "DR099", "name": "X", "qty": 1, "price": 1000},
            "manager_pin": "1234"})
        self.assertEqual(r.status_code, 400)

    def test_swap_item_missing_order_404(self):
        r = self.c.post("/order/swap_item", json={
            "order_id": "ORD-NOPE", "item_index": 0,
            "new_item": {"sku": "DR099", "name": "X", "qty": 1, "price": 1000},
            "manager_pin": "1234"})
        self.assertEqual(r.status_code, 404)

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

    def test_mark_paid_mirrors_into_store(self):
        self.c.post("/order/mark_paid", json={"order_id": self.oid})
        self.assertEqual(self.c.get(f"/order/{self.oid}").get_json()["order"]["paid"], 1)

    def test_status_cancel_mirrors_into_store(self):
        self.c.post("/order/status", json={"order_id": self.oid, "status": "CANCELLED"})
        self.assertEqual(self.c.get(f"/order/{self.oid}").get_json()["order"]["status"], "CANCELLED")

    def test_group_print_noop(self):
        # merge this order with a second one, then print the group
        oid2 = self.c.post("/order", json={
            "idempotency_key": "g2", "metadata": {"delivery_type": "dine_in"}, "table_id": "B2",
            "items": [{"sku": "DR028", "name": "Y", "qty": 1, "price": 25000}]}).get_json()["order_id"]
        g = self.c.post("/bill/merge", json={"order_ids": [self.oid, oid2]}).get_json()["group_id"]
        r = self.c.post(f"/bill/group/{g}/print")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(sorted(r.get_json()["order_ids"]), sorted([self.oid, oid2]))

    def test_void_requires_valid_pin(self):
        r = self.c.post(f"/order/{self.oid}/void", json={"reason": "nhầm", "staff": "a", "manager_pin": "0000"})
        self.assertEqual(r.status_code, 403)

    def test_void_ok_with_pin(self):
        r = self.c.post(f"/order/{self.oid}/void", json={"reason": "nhầm", "staff": "a", "manager_pin": "1234"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.c.get(f"/order/{self.oid}").get_json()["order"]["status"], "VOIDED")

    def test_patch_items_on_paid_order_needs_pin(self):
        # mark paid first (mirrors into STORE), then editing must require a PIN
        self.c.post("/order/mark_paid", json={"order_id": self.oid})
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": self.c.get(f"/order/{self.oid}").get_json()["order"]["version"],
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]})
        self.assertEqual(r.status_code, 403)

    def test_patch_items_on_paid_order_ok_with_pin(self):
        self.c.post("/order/mark_paid", json={"order_id": self.oid})
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": self.c.get(f"/order/{self.oid}").get_json()["order"]["version"],
            "manager_pin": "9999",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]})
        self.assertEqual(r.status_code, 200)

    def test_patch_items_on_voided_order_needs_pin(self):
        self.c.post(f"/order/{self.oid}/void", json={"reason": "x", "staff": "a", "manager_pin": "1234"})
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": self.c.get(f"/order/{self.oid}").get_json()["order"]["version"],
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]})
        self.assertEqual(r.status_code, 403)


    def test_custom_label_prints_no_order(self):
        before = len(self.c.get("/orders").get_json()["orders"])
        r = self.c.post("/print/custom_label", json={
            "name": "Trà thử nghiệm", "modifiers": {"size": "L", "ice": "less", "sugar": "50"}, "qty": 2})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])
        # under PRINT_ENGINE=noop the route reports printed False and creates no order
        self.assertEqual(len(self.c.get("/orders").get_json()["orders"]), before)

    def test_custom_label_empty_name_400(self):
        r = self.c.post("/print/custom_label", json={"name": "   "})
        self.assertEqual(r.status_code, 400)

    def test_custom_label_bad_qty_no_500(self):
        r = self.c.post("/print/custom_label", json={"name": "Trà lạ", "qty": "abc"})
        self.assertEqual(r.status_code, 200)  # bad qty defaults to 1, never crashes


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


class TestEodGuard(unittest.TestCase):
    def test_run_eod_sync_skips_while_syncer_active(self):
        import os as _os
        prev = _os.environ.pop("GATEWAY_SYNC", None)  # ensure default (syncer active)
        try:
            res = print_server.run_eod_sync()
            self.assertEqual(res["skipped"], "syncer_active")
            self.assertEqual(res["pushed"], 0)
        finally:
            if prev is not None:
                _os.environ["GATEWAY_SYNC"] = prev


class TestSpoolPath(RouteTestBase):
    def setUp(self):
        super().setUp()
        self.oid = self.c.post("/order", json={
            "idempotency_key": "sp1", "metadata": {"delivery_type": "dine_in"}, "table_id": "B9",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]}).get_json()["order_id"]

    def test_bill_print_spool_writes_to_temp_spool_not_prod(self):
        import os as _os
        prev = _os.environ.get("PRINT_ENGINE")
        _os.environ["PRINT_ENGINE"] = "spool"
        try:
            before = print_server.SPOOL._conn.execute("SELECT count(*) FROM print_spool").fetchone()[0]
            r = self.c.post(f"/bill/{self.oid}/print")
            self.assertTrue(r.get_json()["printed"])
            after = print_server.SPOOL._conn.execute("SELECT count(*) FROM print_spool").fetchone()[0]
            self.assertEqual(after, before + 1)  # enqueued into the TEMP spool
        finally:
            if prev is None:
                _os.environ.pop("PRINT_ENGINE", None)
            else:
                _os.environ["PRINT_ENGINE"] = prev


class TestPrintIssuesRoutes(RouteTestBase):
    def test_flag_then_list_then_resolve(self):
        r = self.c.post("/print/issues/flag", json={"order_id": "ORD-1", "note": "tem không ra"})
        self.assertEqual(r.status_code, 200)
        listed = self.c.get("/print/issues").get_json()["issues"]
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["order_id"], "ORD-1")
        self.assertEqual(listed[0]["issue_type"], "manual_flag")
        issue_id = listed[0]["id"]
        r2 = self.c.post(f"/print/issues/{issue_id}/resolve")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(self.c.get("/print/issues").get_json()["issues"], [])

    def test_flag_missing_order_id_400(self):
        r = self.c.post("/print/issues/flag", json={})
        self.assertEqual(r.status_code, 400)

    def test_resolve_unknown_id_is_noop_200(self):
        r = self.c.post("/print/issues/999999/resolve")
        self.assertEqual(r.status_code, 200)

    def test_auto_log_via_spool_alert(self):
        print_server._spool_alert(
            {"order_id": "ORD-2", "idempotency_key": "k1", "printer": "label", "seq_in_order": 3},
            RuntimeError("usb gone"))
        listed = self.c.get("/print/issues").get_json()["issues"]
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["issue_type"], "auto_failed")
        self.assertEqual(listed[0]["kind"], "label")
        self.assertEqual(listed[0]["cup_index"], 3)


if __name__ == "__main__":
    unittest.main()
