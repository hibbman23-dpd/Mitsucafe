import os, sqlite3, tempfile, threading, unittest
import print_server
from order_store import OrderStore


class BillQrRouteCase(unittest.TestCase):
    """Chặn ở tầng dựng ảnh: không đụng máy in, chỉ xem recp mang gì.

    Chạy với PRINT_ENGINE=legacy chứ KHÔNG phải noop — noop thoát sớm trước khi
    dựng recp nên test sẽ không chứng minh được gì. build_receipt và
    _print_receipt_bytes đều bị thay bằng hàm giả ở setUp.
    """

    def setUp(self):
        print_server.app.config["TESTING"] = True
        self.c = print_server.app.test_client()
        self._db = tempfile.mktemp(suffix=".db")
        conn = sqlite3.connect(self._db, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        print_server.STORE = OrderStore(conn, threading.Lock())

        self.sent = []
        self._orig_build = print_server.build_receipt
        self._orig_print = print_server._print_receipt_bytes
        self._orig_engine = os.environ.get("PRINT_ENGINE")
        os.environ["PRINT_ENGINE"] = "legacy"

        def spy(order, **kw):
            self.sent.append((order, kw))
            return b"FAKE"

        print_server.build_receipt = spy
        print_server._print_receipt_bytes = lambda data, open_drawer=False: len(data)

    def tearDown(self):
        print_server.build_receipt = self._orig_build
        print_server._print_receipt_bytes = self._orig_print
        if self._orig_engine is None:
            os.environ.pop("PRINT_ENGINE", None)
        else:
            os.environ["PRINT_ENGINE"] = self._orig_engine
        if os.path.exists(self._db):
            os.remove(self._db)

    def _order(self, oid="ORD-T-1", **over):
        o = {"order_id": oid, "short_code": "QX1", "delivery_type": "dine_in",
             "table_id": "B1", "source": "staff",
             "items": [{"sku": "DR001", "name": "CF MITSU", "qty": 1, "price": 35000}],
             "customer_note": "", "bill_meta": {}}
        o.update(over)
        print_server.STORE.upsert_create(o)
        return o


class TestBillPrintCarriesPayment(BillQrRouteCase):
    def test_method_from_request_body_reaches_receipt(self):
        self._order()
        self.c.post("/bill/ORD-T-1/print", json={"payment_method": "momo"})
        self.assertEqual(self.sent[0][0]["payment_method"], "momo")

    def test_defaults_to_cash_when_body_omits_method(self):
        """Không gửi gì thì KHÔNG được đoán là momo — mặc định tiền mặt, không in QR."""
        self._order()
        self.c.post("/bill/ORD-T-1/print", json={})
        self.assertEqual(self.sent[0][0].get("payment_method"), "cash")

    def test_defaults_to_cash_when_no_body_at_all(self):
        self._order()
        self.c.post("/bill/ORD-T-1/print")
        self.assertEqual(self.sent[0][0].get("payment_method"), "cash")

    def test_paid_state_passed_through(self):
        self._order()
        print_server.STORE.apply_paid("ORD-T-1", True)
        self.c.post("/bill/ORD-T-1/print", json={"payment_method": "momo"})
        self.assertTrue(self.sent[0][0]["paid"])

    def test_unpaid_order_marked_unpaid(self):
        self._order()
        self.c.post("/bill/ORD-T-1/print", json={"payment_method": "momo"})
        self.assertFalse(self.sent[0][0]["paid"])

    def test_rejects_unknown_method(self):
        """Chuỗi lạ từ client không được lọt vào bill — recp đi thẳng vào hàm
        dựng ảnh và vào spool."""
        self._order()
        r = self.c.post("/bill/ORD-T-1/print", json={"payment_method": "<script>"})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.sent, [])

    def test_total_unchanged(self):
        self._order()
        self.c.post("/bill/ORD-T-1/print", json={"payment_method": "momo"})
        self.assertEqual(self.sent[0][0]["total"], 35000)


class TestGroupBillCarriesPayment(BillQrRouteCase):
    def _group(self):
        self._order("ORD-T-1")
        self._order("ORD-T-2")
        gid = "BG-TEST-1"
        print_server.STORE.set_bill_group(["ORD-T-1", "ORD-T-2"], gid)
        return gid

    def test_group_method_and_total(self):
        gid = self._group()
        self.c.post(f"/bill/group/{gid}/print", json={"payment_method": "momo"})
        recp = self.sent[0][0]
        self.assertEqual(recp["payment_method"], "momo")
        self.assertEqual(recp["total"], 70000)      # tổng CẢ BÀN, không phải 1 đơn

    def test_group_paid_only_when_every_order_paid(self):
        """Một đơn trong bàn đã trả, đơn kia chưa -> bàn CHƯA trả xong, vẫn cần QR."""
        gid = self._group()
        print_server.STORE.apply_paid("ORD-T-1", True)
        self.c.post(f"/bill/group/{gid}/print", json={"payment_method": "momo"})
        self.assertFalse(self.sent[0][0]["paid"])

    def test_group_paid_when_all_paid(self):
        gid = self._group()
        for oid in ("ORD-T-1", "ORD-T-2"):
            print_server.STORE.apply_paid(oid, True)
        self.c.post(f"/bill/group/{gid}/print", json={"payment_method": "momo"})
        self.assertTrue(self.sent[0][0]["paid"])

    def test_group_rejects_unknown_method(self):
        gid = self._group()
        r = self.c.post(f"/bill/group/{gid}/print", json={"payment_method": "abc"})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.sent, [])


if __name__ == "__main__":
    unittest.main()
