import os
import unittest

import printlib


class TestReceiptQrPlacement(unittest.TestCase):
    """QR chỉ được xuất hiện trên HÓA ĐƠN CHƯA TRẢ của đơn MoMo."""

    def setUp(self):
        # Mã tĩnh GIẢ theo đúng cấu trúc mã của quán — không đưa mã thật vào repo.
        import emvqr
        base = ("000201010211"
                "26220007vn.momo02079999999"
                "38630010A000000727013300069710250119PMC00000000000000000208QRIBFTTA"
                "53037045802VN6304")
        os.environ["MOMO_STATIC_PAYLOAD"] = base + emvqr.crc16(base)
        printlib.MOMO_STATIC_PAYLOAD = os.environ["MOMO_STATIC_PAYLOAD"]
        self.calls = []
        self._orig = printlib.build_momo_qr

        def spy(amount, ref=""):
            self.calls.append((amount, ref))
            return self._orig(amount, ref)

        printlib.build_momo_qr = spy

    def tearDown(self):
        printlib.build_momo_qr = self._orig

    def _order(self, **over):
        o = {"order_id": "ORD-20260807-0001", "total": 35000,
             "payment_method": "momo", "paid": 0,
             "items": [{"sku": "DR001", "name": "CF MITSU", "qty": 1, "price": 35000,
                        "modifiers": {}}],
             "metadata": {"short_code": "QX1"}}
        o.update(over)
        return o

    def test_qr_on_unpaid_momo_bill(self):
        printlib.build_receipt_raster(self._order(), show_total=True)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][0], 35000)

    def test_no_qr_on_prep_ticket(self):
        """Phiếu pha chế cho bếp — hồi quy: QR từng lọt lên đây."""
        printlib.build_receipt_raster(self._order(), show_total=False)
        self.assertEqual(self.calls, [])

    def test_no_qr_when_already_paid(self):
        printlib.build_receipt_raster(self._order(paid=1), show_total=True)
        self.assertEqual(self.calls, [])

    def test_no_qr_when_payment_status_paid(self):
        printlib.build_receipt_raster(
            self._order(paid=0, payment_status="PAID"), show_total=True)
        self.assertEqual(self.calls, [])

    def test_no_qr_for_cash_order(self):
        printlib.build_receipt_raster(
            self._order(payment_method="cash"), show_total=True, is_cash=True)
        self.assertEqual(self.calls, [])

    def test_group_bill_uses_group_total_not_one_order(self):
        """Bill gộp bàn: print_server dựng dict có total là TỔNG CẢ BÀN và
        order_id là mã nhóm. Lấy nhầm total của một đơn = khách trả thiếu."""
        group = {"order_id": "BG-20260807-77", "total": 145000,
                 "payment_method": "momo", "paid": 0,
                 "items": [{"sku": "DR001", "name": "CF MITSU", "qty": 4,
                            "price": 35000, "modifiers": {}}],
                 "metadata": {"short_code": "BG-20260807-77", "notes": ""}}
        printlib.build_receipt_raster(group, show_total=True)
        self.assertEqual(self.calls[0][0], 145000)

    def test_qr_failure_does_not_break_receipt(self):
        """QR hỏng thì bill vẫn phải in ra."""
        printlib.build_momo_qr = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
        data = printlib.build_receipt_raster(self._order(), show_total=True)
        self.assertTrue(data)
        self.assertGreater(len(data), 100)

    def test_receipt_still_builds_without_config(self):
        printlib.MOMO_STATIC_PAYLOAD = ""
        data = printlib.build_receipt_raster(self._order(), show_total=True)
        self.assertTrue(data)


if __name__ == "__main__":
    unittest.main()
