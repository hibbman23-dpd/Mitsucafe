"""Đổi món KHÔNG được làm mất số lượng.

Sự cố thật 2026-08-08: đơn 2× SỮA CHUA DÂU SẤY 30k + 1× MATCHA LATTE MUỐI 35k
= 95.000đ. Nhân viên đổi dòng 2 ly sang món khác, KDS gửi món mới với qty cứng
bằng 1, server tính lại tổng theo danh sách món mới -> 30.000 + 35.000 = 65.000đ.
Thu thiếu 30.000đ mà không có cảnh báo gì.

Đổi món = thay SẢN PHẨM của một dòng, KHÔNG phải đổi số lượng. Muốn đổi số lượng
thì dùng PATCH /order/<id>/items.
"""
import os, sqlite3, tempfile, threading, unittest
import print_server
from order_store import OrderStore


class SwapQtyCase(unittest.TestCase):
    def setUp(self):
        print_server.app.config["TESTING"] = True
        self.c = print_server.app.test_client()
        self._db = tempfile.mktemp(suffix=".db")
        conn = sqlite3.connect(self._db, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        print_server.STORE = OrderStore(conn, threading.Lock())
        self._engine = os.environ.get("PRINT_ENGINE")
        os.environ["PRINT_ENGINE"] = "noop"

    def tearDown(self):
        if self._engine is None:
            os.environ.pop("PRINT_ENGINE", None)
        else:
            os.environ["PRINT_ENGINE"] = self._engine
        if os.path.exists(self._db):
            os.remove(self._db)

    def _order(self):
        """Dựng lại đúng đơn đã gây sự cố: tổng 95.000đ."""
        print_server.STORE.upsert_create({
            "order_id": "ORD-SWAP-1", "short_code": "Q18",
            "delivery_type": "dine_in", "table_id": "B1", "source": "staff",
            "items": [
                {"sku": "DR081", "name": "SỮA CHUA DÂU SẤY", "qty": 2,
                 "price": 30000, "subtotal": 60000, "modifiers": {}},
                {"sku": "DR033", "name": "MATCHA LATTE MUỐI", "qty": 1,
                 "price": 35000, "subtotal": 35000, "modifiers": {}},
            ],
            "customer_note": "", "bill_meta": {},
        })

    def _swap(self, new_item):
        return self.c.post("/order/swap_item", json={
            "order_id": "ORD-SWAP-1", "item_index": 0,
            "new_item": new_item, "manager_pin": "1234"})

    def test_baseline_total_is_95k(self):
        self._order()
        self.assertEqual(print_server.STORE.get("ORD-SWAP-1")["total"], 95000)

    def test_swap_keeps_quantity_of_the_line(self):
        """Client gửi qty=1 (bug cũ). Server PHẢI giữ qty=2 của dòng đang đổi."""
        self._order()
        r = self._swap({"sku": "DR001", "name": "CF MITSU", "qty": 1,
                        "price": 30000, "subtotal": 30000, "modifiers": {}})
        self.assertEqual(r.status_code, 200)
        items = print_server.STORE.get("ORD-SWAP-1")["items"]
        self.assertEqual(items[0]["qty"], 2)

    def test_swap_same_price_keeps_total(self):
        """Đổi sang món CÙNG GIÁ thì tổng không đổi. Bug cũ tụt xuống 65.000."""
        self._order()
        self._swap({"sku": "DR001", "name": "CF MITSU", "qty": 1,
                    "price": 30000, "subtotal": 30000, "modifiers": {}})
        self.assertEqual(print_server.STORE.get("ORD-SWAP-1")["total"], 95000)

    def test_swap_dearer_item_charges_full_quantity(self):
        """2 ly đổi sang món 40k -> 2×40k + 35k = 115.000, không phải 75.000."""
        self._order()
        self._swap({"sku": "DR002", "name": "MÓN ĐẮT", "qty": 1,
                    "price": 40000, "subtotal": 40000, "modifiers": {}})
        self.assertEqual(print_server.STORE.get("ORD-SWAP-1")["total"], 115000)

    def test_subtotal_recomputed_for_kept_quantity(self):
        self._order()
        self._swap({"sku": "DR002", "name": "MÓN ĐẮT", "qty": 1,
                    "price": 40000, "subtotal": 40000, "modifiers": {}})
        items = print_server.STORE.get("ORD-SWAP-1")["items"]
        self.assertEqual(items[0]["subtotal"], 80000)

    def test_swapping_single_qty_line_unchanged(self):
        """Dòng 1 ly thì hành vi y như cũ — không được đổi gì."""
        self._order()
        r = self.c.post("/order/swap_item", json={
            "order_id": "ORD-SWAP-1", "item_index": 1,
            "new_item": {"sku": "DR003", "name": "MÓN KHÁC", "qty": 1,
                         "price": 20000, "subtotal": 20000, "modifiers": {}},
            "manager_pin": "1234"})
        self.assertEqual(r.status_code, 200)
        o = print_server.STORE.get("ORD-SWAP-1")
        self.assertEqual(o["items"][1]["qty"], 1)
        self.assertEqual(o["total"], 80000)   # 60.000 + 20.000

    def test_other_lines_untouched(self):
        self._order()
        self._swap({"sku": "DR001", "name": "CF MITSU", "qty": 1,
                    "price": 30000, "subtotal": 30000, "modifiers": {}})
        items = print_server.STORE.get("ORD-SWAP-1")["items"]
        self.assertEqual(items[1]["name"], "MATCHA LATTE MUỐI")
        self.assertEqual(items[1]["qty"], 1)


if __name__ == "__main__":
    unittest.main()
