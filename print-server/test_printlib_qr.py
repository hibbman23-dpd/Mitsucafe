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


class TestPrepPaidStamp(unittest.TestCase):
    """Phiếu pha chế của đơn ĐÃ THANH TOÁN phải có dấu ĐTT to ở cuối,
    để bếp nhìn là biết khỏi phải hỏi thu ngân."""

    def _prep(self, **over):
        o = {"order_id": "ORD-P-1", "total": 35000,
             "items": [{"sku": "DR001", "name": "CF MITSU", "qty": 1,
                        "price": 35000, "modifiers": {}}],
             "metadata": {"short_code": "QX1"}}
        o.update(over)
        return o

    def _texts(self, order, show_total):
        """Gom mọi chuỗi được vẽ lên phiếu."""
        seen = []
        orig = printlib._img_to_raster_bytes
        printlib._img_to_raster_bytes = orig  # giữ nguyên, chỉ chặn ở tầng draw
        from PIL import ImageDraw
        _od = ImageDraw.ImageDraw.text

        def spy(self, xy, text, *a, **k):
            seen.append(str(text))
            return _od(self, xy, text, *a, **k)

        ImageDraw.ImageDraw.text = spy
        try:
            printlib.build_receipt_raster(order, show_total=show_total)
        finally:
            ImageDraw.ImageDraw.text = _od
        return seen

    def test_prep_of_paid_order_has_dtt(self):
        t = self._texts(self._prep(paid=1), show_total=False)
        self.assertTrue(any("ĐTT" in s for s in t), t)

    def test_prep_of_unpaid_order_has_no_dtt(self):
        t = self._texts(self._prep(paid=0), show_total=False)
        self.assertFalse(any("ĐTT" in s for s in t), t)

    def test_payment_status_paid_also_counts(self):
        t = self._texts(self._prep(payment_status="PAID"), show_total=False)
        self.assertTrue(any("ĐTT" in s for s in t), t)

    def test_bill_never_shows_dtt(self):
        """ĐTT là dấu cho BẾP. Hóa đơn khách đã có dòng 'TT:' riêng."""
        t = self._texts(self._prep(paid=1, payment_method="cash"), show_total=True)
        self.assertFalse(any("ĐTT" in s for s in t), t)
