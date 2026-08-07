# In mã QR MoMo lên hóa đơn — Implementation Plan

> **For agentic workers:** dùng superpowers:subagent-driven-development hoặc executing-plans. Các bước dùng checkbox `- [ ]`.

**Goal:** Khi in hóa đơn cho đơn thanh toán MoMo, in kèm mã QR đã điền sẵn số tiền, để khách quét là trả đúng số, không phải gõ tay.

**Architecture:** Sinh QR ngay trong `printlib.build_receipt_raster()` bằng thư viện `qrcode` + PIL, chèn vào luồng dựng ảnh sẵn có. Không gọi mạng, không phụ thuộc GAS — máy in phải chạy được cả khi mất internet.

**Đối soát:** Không làm. Quán có loa MoMo báo tiền về; nhân viên nghe rồi bấm **Thu tiền** như hiện tại. Hệ thống **không** tự biết đơn đã trả — đây là quyết định của chủ quán, không phải thiếu sót.

## Global Constraints

- `unittest`, KHÔNG phải pytest (máy này chưa cài). Chạy từ thư mục `print-server/`.
- **Lỗi khi sinh QR TUYỆT ĐỐI không được làm hỏng việc in bill.** Bọc try/except: QR hỏng thì in bill không có QR, không bao giờ ném lỗi lên trên. Mất mã QR là phiền; mất tờ bill là mất khách.
- Cấu hình MoMo đọc từ **biến môi trường tại máy quán**, không đọc CONFIG trên GAS. Đường in là local-first và GAS ở quán có tiền sử 403 theo chu kỳ 7 ngày.
- Không thêm phụ thuộc mới ngoài `qrcode` + `Pillow` (đã cài sẵn nhưng **chưa khai báo** trong `requirements.txt` — task 1 bổ sung).
- **🚫 KHÔNG chạy `python3 -m unittest discover`** — `test_routes_spool.py` đặt `PRINT_ENGINE=legacy` lúc import và `test_routes.py` gọi `lpr` thật; việc này đã hai lần bắn job rác ra máy in của quán, lần gần nhất 47 job.
- **Máy in đang phục vụ khách.** Mọi thử nghiệm dùng `PRINT_ENGINE=noop` hoặc server cổng 5002. Chỉ in thật **một** tờ ở bước cuối cùng, khi mọi thứ đã xanh.

---

## Task 0 — Kiểm định dạng URL MoMo TRƯỚC KHI VIẾT CODE

**Đây là việc của chủ quán, không phải của người code. Không bắt đầu Task 1 khi chưa xong.**

Toàn bộ giá trị của tính năng nằm ở chỗ MoMo có **tự điền số tiền** hay không. Chưa ai kiểm. Sai giả định này thì mọi task sau đều vứt.

- [ ] **Bước 1: Tự tay dựng URL thử**

Thay `<ID>` bằng mã MoMo hoặc số điện thoại ví của quán:

```
https://nhantien.momo.vn/<ID>/35000
```

- [ ] **Bước 2: Mở trên điện thoại và quét**

Mở link trên một máy, dùng máy khác quét mã QR mà trang đó hiện ra (hoặc tạo QR từ URL bằng bất kỳ trang tạo QR nào rồi quét).

- [ ] **Bước 3: Ghi lại kết quả thật**

Trả lời đúng ba câu, ghi vào `docs/system/momo-qr.md`:

1. App MoMo có tự mở màn hình chuyển tiền không?
2. Số tiền có tự điền **35.000đ** không, hay khách vẫn phải gõ?
3. Có chỗ nào mang được nội dung (mã đơn) không? Nếu có thì tham số tên gì?

**Nếu số tiền KHÔNG tự điền:** dừng, báo lại. Khi đó QR động không hơn gì tấm mica đang dán sẵn, và plan này phải viết lại theo hướng khác — đừng xây một nửa tính năng hỏng.

**Nếu mã `3549416` không dùng được trong đường dẫn:** thử lại bằng **số điện thoại ví**. Ghi rõ cái nào chạy.

---

## Task 1 — Sinh mã QR (thuần logic, chưa đụng máy in)

**Files:**
- Modify: `print-server/printlib.py`
- Modify: `print-server/requirements.txt`
- Test: `print-server/test_printlib_qr.py`

**Interfaces:**
- Produces: `build_momo_qr(amount, order_ref) -> PIL.Image | None`, `momo_qr_url(amount, order_ref) -> str | None`

- [ ] **Bước 1: Viết test trượt**

Tạo `print-server/test_printlib_qr.py`:

```python
import os, unittest
import printlib


class TestMomoQrUrl(unittest.TestCase):
    def setUp(self):
        self._saved = {k: os.environ.get(k) for k in
                       ("MOMO_QR_TEMPLATE", "MOMO_RECEIVER_ID")}
        os.environ["MOMO_QR_TEMPLATE"] = "https://nhantien.momo.vn/{id}/{amount}"
        os.environ["MOMO_RECEIVER_ID"] = "0900000000"

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_url_has_amount_and_id(self):
        u = printlib.momo_qr_url(35000, "QX1")
        self.assertEqual(u, "https://nhantien.momo.vn/0900000000/35000")

    def test_amount_is_integer_dong_no_decimals(self):
        """35000.0 phải ra '35000'. '35000.0' trong URL là MoMo từ chối."""
        self.assertIn("/35000", printlib.momo_qr_url(35000.0, "QX1"))
        self.assertNotIn(".", printlib.momo_qr_url(35000.0, "QX1").rsplit("/", 1)[-1])

    def test_no_config_returns_none(self):
        os.environ.pop("MOMO_RECEIVER_ID", None)
        self.assertIsNone(printlib.momo_qr_url(35000, "QX1"))

    def test_zero_or_negative_amount_returns_none(self):
        """Không bao giờ in QR số tiền 0 — khách quét vào màn hình vô nghĩa."""
        self.assertIsNone(printlib.momo_qr_url(0, "QX1"))
        self.assertIsNone(printlib.momo_qr_url(-5000, "QX1"))

    def test_template_supports_ref_placeholder(self):
        os.environ["MOMO_QR_TEMPLATE"] = "https://x.vn/{id}/{amount}?c={ref}"
        self.assertEqual(printlib.momo_qr_url(35000, "QX1"),
                         "https://x.vn/0900000000/35000?c=QX1")

    def test_ref_is_url_encoded(self):
        os.environ["MOMO_QR_TEMPLATE"] = "https://x.vn/{id}/{amount}?c={ref}"
        self.assertIn("c=BG%20A%2F1", printlib.momo_qr_url(35000, "BG A/1"))


class TestMomoQrImage(unittest.TestCase):
    def setUp(self):
        os.environ["MOMO_QR_TEMPLATE"] = "https://nhantien.momo.vn/{id}/{amount}"
        os.environ["MOMO_RECEIVER_ID"] = "0900000000"

    def test_returns_image_sized_for_58mm_paper(self):
        img = printlib.build_momo_qr(35000, "QX1")
        self.assertIsNotNone(img)
        # Giấy 58mm = 384 dot. QR phải lọt trong vùng in và vuông.
        self.assertEqual(img.width, img.height)
        self.assertLessEqual(img.width, printlib._CW)
        self.assertGreaterEqual(img.width, 180)   # nhỏ hơn nữa là điện thoại khó bắt

    def test_image_is_1bit_or_grayscale_for_thermal(self):
        img = printlib.build_momo_qr(35000, "QX1")
        self.assertIn(img.mode, ("1", "L"))

    def test_no_config_returns_none_not_raise(self):
        os.environ.pop("MOMO_RECEIVER_ID", None)
        self.assertIsNone(printlib.build_momo_qr(35000, "QX1"))

    def test_bad_input_returns_none_not_raise(self):
        """Bill phải in được kể cả khi QR hỏng — không bao giờ ném lỗi lên trên."""
        self.assertIsNone(printlib.build_momo_qr(None, "QX1"))
        self.assertIsNone(printlib.build_momo_qr("abc", "QX1"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Bước 2: Chạy cho chắc là trượt**

```
PRINT_ENGINE=noop python3 -m unittest test_printlib_qr -v
```
Kỳ vọng: FAIL — `module 'printlib' has no attribute 'momo_qr_url'`

- [ ] **Bước 3: Viết implementation**

Thêm vào `print-server/printlib.py`, đặt gần `_get_logo` (cùng nhóm hàm dựng ảnh):

```python
# ── Mã QR MoMo ────────────────────────────────────────────────────────────────
# Cấu hình đọc từ BIẾN MÔI TRƯỜNG, không đọc CONFIG trên GAS: đường in phải
# chạy được khi GAS chết (GAS ở quán có tiền sử 403 theo chu kỳ 7 ngày).
#
# MOMO_QR_TEMPLATE để dạng khuôn thay vì hardcode URL, vì định dạng link nhận
# tiền của MoMo chưa được kiểm chứng chắc chắn (xem Task 0). Đổi khuôn là đổi
# biến môi trường, không phải sửa code rồi deploy lại.
MOMO_QR_TEMPLATE = os.getenv("MOMO_QR_TEMPLATE", "https://nhantien.momo.vn/{id}/{amount}")
MOMO_RECEIVER_ID = os.getenv("MOMO_RECEIVER_ID", "")
MOMO_QR_DOTS     = int(os.getenv("MOMO_QR_DOTS", "240"))   # cạnh QR, tính bằng dot


def momo_qr_url(amount, order_ref=""):
    """URL nhận tiền MoMo đã điền sẵn số tiền. None nếu không đủ điều kiện in."""
    import urllib.parse
    if not MOMO_RECEIVER_ID:
        return None
    try:
        amt = int(round(float(amount)))
    except (TypeError, ValueError):
        return None
    if amt <= 0:
        return None          # QR 0đ chỉ làm khách bối rối
    return (MOMO_QR_TEMPLATE
            .replace("{id}", str(MOMO_RECEIVER_ID))
            .replace("{amount}", str(amt))
            .replace("{ref}", urllib.parse.quote(str(order_ref or ""), safe="")))


def build_momo_qr(amount, order_ref=""):
    """Ảnh QR để dán lên bill. None nếu thiếu cấu hình hoặc sinh lỗi.

    KHÔNG BAO GIỜ ném lỗi: mất mã QR là phiền, mất tờ bill là mất khách.
    """
    url = momo_qr_url(amount, order_ref)
    if not url:
        return None
    try:
        import qrcode
        side = max(120, min(int(MOMO_QR_DOTS), _CW))
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,   # chịu được giấy nhiệt mờ
            box_size=1,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white").convert("L")
        # Phóng bằng NEAREST: mọi phép nội suy khác làm nhoè ô vuông, máy in
        # nhiệt 203dpi in ra là điện thoại không bắt được mã.
        from PIL import Image
        modules = img.width
        scale = max(1, side // modules)
        return img.resize((modules * scale, modules * scale), Image.NEAREST)
    except Exception:
        return None
```

Thêm `import os` nếu file chưa có (kiểm tra đầu file — `RASTER_DOTS_WIDTH` đã dùng `os.getenv` nên chắc chắn đã có).

- [ ] **Bước 4: Chạy cho chắc là xanh**

```
PRINT_ENGINE=noop python3 -m unittest test_printlib_qr -v
```
Kỳ vọng: `Ran 11 tests` … `OK`

- [ ] **Bước 5: Khai báo phụ thuộc**

Thêm vào `print-server/requirements.txt`:

```
qrcode>=7.4     # QR MoMo trên bill
Pillow>=10.0    # dựng ảnh bill/tem (printlib) — trước đây dùng mà không khai báo
```

- [ ] **Bước 6: Commit**

```bash
git add print-server/printlib.py print-server/test_printlib_qr.py print-server/requirements.txt
git commit -m "feat(print): sinh mã QR MoMo điền sẵn số tiền, khuôn URL qua env"
```

---

## Task 2 — Chèn QR vào hóa đơn, đúng chỗ và đúng lúc

**Files:**
- Modify: `print-server/printlib.py` (`build_receipt_raster`)
- Test: `print-server/test_printlib_qr.py` (thêm class)

**Interfaces:**
- Consumes: `build_momo_qr` (Task 1)

**Bốn điều kiện phải đúng ĐỦ CẢ BỐN thì mới in QR.** Thiếu một là in sai chỗ:

| Điều kiện | Vì sao |
|---|---|
| `show_total=True` | `show_total=False` là **phiếu pha chế cho bếp** (`print_server.py:1055` gọi `tag="prep"`). In mã thanh toán lên phiếu bếp là vô nghĩa và tốn giấy. |
| Đơn **chưa** thanh toán | Bill đã thu tiền mà mang QR là **mời khách trả lần hai**. |
| `payment_method` là `momo` | Đơn tiền mặt không cần QR. |
| Sinh QR thành công | Thiếu cấu hình thì in bill bình thường, không để ô trống khó hiểu. |

- [ ] **Bước 1: Viết test trượt**

Thêm vào `print-server/test_printlib_qr.py`, **trước** khối `if __name__`:

```python
class TestReceiptQrPlacement(unittest.TestCase):
    """QR chỉ được xuất hiện trên HÓA ĐƠN CHƯA TRẢ của đơn MoMo."""

    def setUp(self):
        os.environ["MOMO_QR_TEMPLATE"] = "https://nhantien.momo.vn/{id}/{amount}"
        os.environ["MOMO_RECEIVER_ID"] = "0900000000"
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
        os.environ.pop("MOMO_RECEIVER_ID", None)
        data = printlib.build_receipt_raster(self._order(), show_total=True)
        self.assertTrue(data)
```

- [ ] **Bước 2: Chạy cho chắc là trượt**

```
PRINT_ENGINE=noop python3 -m unittest test_printlib_qr -v
```
Kỳ vọng: FAIL ở `test_qr_on_unpaid_momo_bill` — `self.calls` rỗng vì chưa ai gọi.

- [ ] **Bước 3: Viết implementation**

Trong `build_receipt_raster`, thêm hàm dựng ngay **sau** `add_logo` (khoảng dòng 357), theo đúng khuôn lệnh sẵn có:

```python
    def add_momo_qr(amount, ref):
        """Chèn QR MoMo. Trả True nếu có in, False nếu bỏ qua.

        Bọc try/except toàn bộ: lỗi ở đây KHÔNG được làm hỏng tờ bill.
        """
        nonlocal y
        try:
            qimg = build_momo_qr(amount, ref)
        except Exception:
            qimg = None
        if qimg is None:
            return False
        qx = max(0, (W - qimg.width) // 2)
        cmds.append(("logo", qx, y, qimg))   # dùng lại lệnh dán ảnh sẵn có
        y += qimg.height
        return True
```

Rồi trong nhánh `if show_total:` (khối in tổng tiền, khoảng dòng 366+), **sau** dòng tổng tiền và **trước** dòng cảm ơn:

```python
        # QR MoMo: chỉ HÓA ĐƠN (show_total), chỉ đơn CHƯA trả, chỉ phương thức momo.
        # - phiếu pha chế: không liên quan thanh toán
        # - đơn đã trả:    in QR lên bill đã thu tiền = mời khách trả lần hai
        _paid = bool(order.get("paid")) or str(order.get("payment_status", "")).upper() == "PAID"
        _method = str(order.get("payment_method") or "").lower()
        if not _paid and _method == "momo":
            _amt = order.get("total")
            _ref = str((order.get("metadata") or {}).get("short_code")
                       or order.get("order_id") or "")
            add_gap(4)
            if add_momo_qr(_amt, _ref):
                # In số tiền bằng chữ cạnh mã: giấy nhiệt mờ hoặc đầu in mòn thì
                # mã khó quét, có số bằng chữ là nhân viên đọc và xử lý tay được.
                add_text("Quét MoMo trả " + _format_amount(_amt), f_norm, "center")
                add_gap(3)
```

Lưu ý: `order.get("total")` ở đây là total của **chính dict đang in**. Với bill gộp bàn, `print_server.py:1227` đã dựng sẵn dict có `total` là tổng cả bàn — nên đúng. Đừng đi tra ngược `STORE` để lấy total của một đơn.

- [ ] **Bước 4: Chạy cho chắc là xanh**

```
PRINT_ENGINE=noop python3 -m unittest test_printlib_qr -v
```
Kỳ vọng: `Ran 19 tests` … `OK`

- [ ] **Bước 5: Chạy các test in sẵn có, chắc không vỡ gì**

```
PRINT_ENGINE=noop python3 -m unittest test_printlib test_printlib_drawer test_bill_engine
```
Kỳ vọng: `OK`

- [ ] **Bước 6: Commit**

```bash
git add print-server/printlib.py print-server/test_printlib_qr.py
git commit -m "feat(print): in QR MoMo lên hóa đơn chưa trả, chặn phiếu bếp và bill đã thu"
```

---

## Task 3 — Nút chọn MoMo trên KDS

**Files:**
- Modify: `web/kds.html`

Hiện KDS chỉ có hai lựa chọn (`kds.html:2592-2593`): **Tiền mặt** và **VietQR**. Không có đường nào đặt `payment_method = 'momo'`, nên toàn bộ Task 2 sẽ không bao giờ chạy nếu thiếu bước này.

- [ ] **Bước 1: Thêm nút**

Cạnh hai nút sẵn có, theo đúng khuôn `mode-btn`:

```html
<div class="mode-btn ${checkoutState.paymentMethod === 'momo' ? 'active' : ''}" onclick="checkoutSetPayMethod('momo')">💗 MoMo</div>
```

- [ ] **Bước 2: Kiểm `checkoutSetPayMethod` nhận giá trị mới**

Đọc hàm đó. Nếu nó so sánh cứng với `'vietqr'`/`'cash'` ở đâu thì sửa cho nhận `'momo'`. Đặc biệt kiểm nhánh trong `finishOrder` (`kds.html:2337`) — `momo` **không** phải tiền mặt nên không được rơi vào nhánh mở két.

- [ ] **Bước 3: Kiểm bằng trình duyệt, cổng 5002, KHÔNG phải 5001**

```bash
cd print-server && PRINT_ENGINE=noop GATEWAY_SYNC=0 SERVER_PORT=5002 \
  GATEWAY_DB=/tmp/momo_ob.db ATTENDANCE_DB=/tmp/momo_att.db \
  ATTENDANCE_STAFF_CACHE=/tmp/momo_staff.json python3 print_server.py
```

Mở `http://localhost:5002/kds.html`, mở màn thanh toán, kiểm: chọn MoMo thì nút sáng, `checkoutState.paymentMethod === 'momo'`, và bấm thu tiền **không** mở két tiền.

- [ ] **Bước 4: Commit**

```bash
git add web/kds.html
git commit -m "feat(kds): thêm phương thức thanh toán MoMo"
```

---

## Task 4 — Cấu hình máy quán và in thử tờ thật

**Files:**
- Modify: `print-server/com.lamha.kissaten.printserver.plist`
- Create: `docs/system/momo-qr.md`

- [ ] **Bước 1: Thêm biến môi trường vào plist**

Trong `EnvironmentVariables` của `com.lamha.kissaten.printserver.plist`:

```xml
<key>MOMO_RECEIVER_ID</key>
<string>ĐIỀN_MÃ_HOẶC_SĐT_ĐÃ_KIỂM_Ở_TASK_0</string>
<key>MOMO_QR_TEMPLATE</key>
<string>KHUÔN_URL_ĐÃ_KIỂM_Ở_TASK_0</string>
```

- [ ] **Bước 2: In thử trên server test, KHÔNG phải máy quán**

Chạy server cổng 5002 như Task 3 nhưng đặt `PRINT_ENGINE=noop`, gọi in bill mẫu, và **lưu ảnh ra file** thay vì in:

```bash
cd print-server && MOMO_RECEIVER_ID=0900000000 python3 -c "
import printlib
from PIL import Image
o = {'order_id':'ORD-TEST','total':35000,'payment_method':'momo','paid':0,
     'items':[{'sku':'DR001','name':'CF MITSU','qty':1,'price':35000,'modifiers':{}}],
     'metadata':{'short_code':'QX1'}}
img = printlib.build_momo_qr(35000,'QX1')
img.save('/tmp/momo_qr_test.png')
print('lưu /tmp/momo_qr_test.png —', img.width,'x',img.height,'dot')
"
```

- [ ] **Bước 3: Quét ảnh trên màn hình bằng điện thoại**

Mở `/tmp/momo_qr_test.png`, phóng to, quét bằng app MoMo. Phải ra đúng **35.000đ**. Đây là lần kiểm cuối trước khi tốn giấy.

- [ ] **Bước 4: Restart máy quán rồi in MỘT tờ thật**

```bash
launchctl kickstart -k gui/$(id -u)/com.lamha.kissaten.printserver
```

Tạo một đơn thật giá nhỏ, chọn MoMo, in bill. Kiểm trên tờ giấy:
- mã QR rõ nét, quét được bằng MoMo, hiện đúng số tiền
- có dòng chữ *"Quét MoMo trả 35.000đ"* dưới mã
- phiếu pha chế của cùng đơn đó **không** có QR

- [ ] **Bước 5: Viết `docs/system/momo-qr.md`**

Ghi lại: kết quả kiểm Task 0 (định dạng nào chạy), hai biến môi trường, bốn điều kiện in QR, và **vì sao không có đối soát tự động** (quán dùng loa MoMo báo tiền, nhân viên nghe rồi bấm Thu tiền — hệ thống không tự biết).

- [ ] **Bước 6: Commit**

```bash
git add print-server/com.lamha.kissaten.printserver.plist docs/system/momo-qr.md
git commit -m "ops(momo): cấu hình QR MoMo trên máy quán + tài liệu vận hành"
```

---

## Ghi chú cho người thực thi

- Task 0 là **cửa chặn**. Chưa có kết quả quét thật thì không viết code.
- Task 1 và 2 chạy được hoàn toàn ngoại tuyến, không cần máy in, không cần mạng.
- Chỉ Task 4 bước 4 mới đụng máy in thật, và chỉ **một** tờ.
- Nếu một test trượt bất ngờ, dừng lại và dùng `superpowers:systematic-debugging` thay vì sửa test cho vừa code.
